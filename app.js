/*
 * REVENANT — app.js
 * Browser wiring for the analyser:
 *   form -> GitHub API -> Death Certificate
 *        -> package.json -> npm registry -> Dependency Autopsy
 *        -> Resurrection Pack download
 * All pure logic lives in score.js (window.RevenantScore), deps.js
 * (window.RevenantDeps), and pack.js (window.RevenantPack) so it can be
 * unit- and property-tested in Node. This file owns ALL network access.
 */
(function () {
  'use strict';

  var S = window.RevenantScore;
  var D = window.RevenantDeps;
  var Py = window.RevenantPypi;
  var P = window.RevenantPack;
  var form = document.getElementById('analyse-form');
  var input = document.getElementById('repo-url');
  var button = document.getElementById('analyse-btn');
  var statusEl = document.getElementById('status');
  var errorEl = document.getElementById('error');
  var cert = document.getElementById('certificate');
  var packBtn = document.getElementById('pack-btn');

  var MAX_DEPS_CHECKED = 60; // be kind to the public npm registry
  var lastAnalysis = null;

  function setError(message) {
    if (message) {
      errorEl.textContent = message;
      errorEl.hidden = false;
    } else {
      errorEl.textContent = '';
      errorEl.hidden = true;
    }
  }

  function setStatus(message) {
    statusEl.textContent = message || '';
  }

  function setBusy(busy) {
    button.disabled = busy;
    button.textContent = busy ? 'Digging…' : 'Raise it';
  }

  function fill(id, value) {
    document.getElementById(id).textContent = value;
  }

  function buildAnalysis(repo) {
    var months = S.monthsSincePush(repo.pushed_at, new Date());
    var score = S.computeResurrectionScore({
      monthsSincePush: months,
      archived: repo.archived,
      openIssues: repo.open_issues_count
    });
    return {
      owner: repo.owner && repo.owner.login,
      repo: repo.name,
      fullName: repo.full_name,
      description: repo.description || '',
      score: score,
      verdict: S.verdictForScore(score),
      monthsSincePush: months,
      archived: Boolean(repo.archived),
      openIssues: repo.open_issues_count != null ? repo.open_issues_count : 0,
      language: repo.language || 'Unknown',
      stars: repo.stargazers_count != null ? repo.stargazers_count : 0,
      lastPush: repo.pushed_at ? new Date(repo.pushed_at).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric'
      }) : 'Unknown',
      pushedAt: repo.pushed_at,
      dependencies: null,
      deprecatedDeps: []
    };
  }

  function renderCertificate(repo, analysis) {
    fill('cert-repo-name', repo.full_name);
    fill('cert-description', repo.description || 'No description provided.');
    fill('cert-score', String(analysis.score));
    fill('cert-verdict', analysis.verdict);
    fill('cert-last-push', analysis.lastPush);
    fill('cert-months', String(analysis.monthsSincePush));
    fill('cert-issues', String(analysis.openIssues));
    fill('cert-stars', String(analysis.stars));
    fill('cert-archived', repo.archived ? 'Yes — archived by its owner' : 'No');
    fill('cert-language', analysis.language);

    var bar = document.getElementById('score-bar-fill');
    bar.style.width = analysis.score + '%';
    bar.dataset.verdict = analysis.verdict;

    cert.hidden = false;
    cert.classList.remove('rise');
    // Restart the "rising" animation on each new certificate.
    void cert.offsetWidth;
    cert.classList.add('rise');
  }

  // ---------- Dependency autopsy (network) ----------

  function fetchPackageJsonText(owner, repo, defaultBranch) {
    var rawUrl = 'https://raw.githubusercontent.com/' + encodeURIComponent(owner) +
      '/' + encodeURIComponent(repo) + '/' + encodeURIComponent(defaultBranch || 'HEAD') +
      '/package.json';
    return fetch(rawUrl).then(function (res) {
      if (res.ok) return res.text();
      // Fall back to the contents API (handles odd default branches / renames).
      var apiUrl = 'https://api.github.com/repos/' + encodeURIComponent(owner) +
        '/' + encodeURIComponent(repo) + '/contents/package.json';
      return fetch(apiUrl, { headers: { 'Accept': 'application/vnd.github+json' } })
        .then(function (apiRes) {
          if (!apiRes.ok) return null;
          return apiRes.json();
        })
        .then(function (body) {
          if (!body || !body.content) return null;
          try { return atob(body.content.replace(/\s/g, '')); } catch (e) { return null; }
        });
    }).catch(function () { return null; });
  }

  function fetchRegistryInfo(dep) {
    // One packument fetch yields both dist-tags.latest and the deprecated
    // flag of that exact version; scoped names need %2F for the slash.
    var encoded = encodeURIComponent(dep.name).replace(/%40/g, '@');
    return fetch('https://registry.npmjs.org/' + encoded)
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (packument) {
        if (!packument) throw new Error('no packument');
        var latest = packument['dist-tags'] && packument['dist-tags'].latest;
        var versionMeta = latest && packument.versions ? packument.versions[latest] : null;
        return {
          name: dep.name,
          range: dep.range,
          dev: dep.dev,
          latest: latest || null,
          deprecated: versionMeta && versionMeta.deprecated ? versionMeta.deprecated : '',
          status: D.classifyOutdated(dep.range, latest)
        };
      })
      .catch(function () {
        // Fall back to the lightweight /latest endpoint.
        return fetch('https://registry.npmjs.org/' + encoded + '/latest')
          .then(function (res) { return res.ok ? res.json() : null; })
          .then(function (meta) {
            return {
              name: dep.name,
              range: dep.range,
              dev: dep.dev,
              latest: meta && meta.version ? meta.version : null,
              deprecated: meta && meta.deprecated ? meta.deprecated : '',
              status: D.classifyOutdated(dep.range, meta && meta.version)
            };
          })
          .catch(function () {
            return { name: dep.name, range: dep.range, dev: dep.dev, latest: null, deprecated: '', status: 'unknown' };
          });
      });
  }

  function renderAutopsySkipped(message) {
    fill('autopsy-status', message);
    document.getElementById('autopsy-facts').hidden = true;
    document.getElementById('autopsy-deprecated').hidden = true;
  }

  function renderAutopsy(summary, truncated) {
    fill('autopsy-status', summary.checked + ' of ' + summary.total +
      ' dependencies checked against the npm registry' + (truncated ? ' (first ' + MAX_DEPS_CHECKED + ' only)' : '') + '.');
    fill('autopsy-total', String(summary.total));
    fill('autopsy-outdated', summary.outdated + ' (' + summary.outdatedPct + '% of checked)');
    fill('autopsy-health', summary.health != null ? summary.health + '/100' : '–');
    document.getElementById('autopsy-facts').hidden = false;
    var depEl = document.getElementById('autopsy-deprecated');
    if (summary.deprecatedCount > 0) {
      depEl.textContent = 'Deprecated: ' + summary.deprecated.join(', ');
      depEl.hidden = false;
    } else {
      depEl.hidden = true;
    }
  }

  function runAutopsy(repo, analysis) {
    renderAutopsySkipped('Opening the body — fetching package.json…');
    return fetchPackageJsonText(analysis.owner, analysis.repo, repo.default_branch)
      .then(function (text) {
        var deps = text ? D.parsePackageJson(text) : null;
        if (!deps) {
          renderAutopsySkipped('No package.json found — dependency autopsy skipped.');
          return;
        }
        if (deps.length === 0) {
          renderAutopsySkipped('package.json found, but it declares no dependencies — autopsy complete, nothing to examine.');
          analysis.dependencies = D.summariseDependencies([]);
          return;
        }
        fill('autopsy-status', 'Examining ' + deps.length + ' dependencies against the npm registry…');
        var slice = deps.slice(0, MAX_DEPS_CHECKED);
        return Promise.all(slice.map(fetchRegistryInfo)).then(function (details) {
          var summary = D.summariseDependencies(details);
          analysis.dependencies = summary;
          analysis.deprecatedDeps = summary.deprecated;
          renderAutopsy(summary, deps.length > slice.length);
        });
      })
      .catch(function () {
        renderAutopsySkipped('Dependency autopsy could not be completed (network or registry error) — the certificate above still stands.');
      });
  }

  // ---------- Python dependency autopsy (network) ----------

  var MAX_PYPI_DEPS_CHECKED = 60; // same courtesy cap as npm

  /**
   * Fetch a raw file from a GitHub repo (requirements.txt or pyproject.toml).
   * Tries raw.githubusercontent.com first; falls back to the contents API.
   * Returns the file text or null.
   */
  function fetchRawPythonFile(owner, repo, defaultBranch, filename) {
    var rawUrl = 'https://raw.githubusercontent.com/' + encodeURIComponent(owner) +
      '/' + encodeURIComponent(repo) + '/' + encodeURIComponent(defaultBranch || 'HEAD') +
      '/' + filename;
    return fetch(rawUrl).then(function (res) {
      if (res.ok) return res.text();
      // Fall back to the GitHub contents API.
      var apiUrl = 'https://api.github.com/repos/' + encodeURIComponent(owner) +
        '/' + encodeURIComponent(repo) + '/contents/' + encodeURIComponent(filename);
      return fetch(apiUrl, { headers: { 'Accept': 'application/vnd.github+json' } })
        .then(function (apiRes) {
          if (!apiRes.ok) return null;
          return apiRes.json();
        })
        .then(function (body) {
          if (!body || !body.content) return null;
          try { return atob(body.content.replace(/\s/g, '')); } catch (e) { return null; }
        });
    }).catch(function () { return null; });
  }

  /**
   * Fetch one package's info from PyPI.
   * Returns { name, latestVersion, latestReleaseMonthsAgo } or null on 404/error.
   */
  function fetchPypiInfo(name) {
    var url = 'https://pypi.org/pypi/' + encodeURIComponent(name) + '/json';
    return fetch(url).then(function (res) {
      if (res.status === 404) return null;
      if (!res.ok) return null;
      return res.json();
    }).then(function (data) {
      if (!data) return null;
      var latestVersion = data.info && data.info.version ? data.info.version : null;
      var latestReleaseMonthsAgo = null;
      if (latestVersion && data.releases && data.releases[latestVersion]) {
        var files = data.releases[latestVersion];
        if (files.length > 0) {
          // Use the earliest upload_time_iso_8601 among the files of that version.
          var earliest = files.reduce(function (min, f) {
            if (!f.upload_time_iso_8601) return min;
            return (!min || f.upload_time_iso_8601 < min) ? f.upload_time_iso_8601 : min;
          }, null);
          if (earliest) {
            var then = new Date(earliest).getTime();
            var now = Date.now();
            if (!isNaN(then) && now > then) {
              latestReleaseMonthsAgo = Math.floor((now - then) / (1000 * 60 * 60 * 24 * 30.4375));
            }
          }
        }
      }
      return { latestVersion: latestVersion, latestReleaseMonthsAgo: latestReleaseMonthsAgo };
    }).catch(function () { return null; });
  }

  function renderPypiAutopsySection(show) {
    var section = document.getElementById('pypi-autopsy-section');
    section.hidden = !show;
  }

  function renderPypiAutopsyStatus(message) {
    document.getElementById('pypi-autopsy-status').textContent = message || '';
  }

  function renderPypiAutopsy(deps, summary, truncated) {
    renderPypiAutopsyStatus(
      summary.total + ' dependenc' + (summary.total === 1 ? 'y' : 'ies') + ' found' +
      (truncated ? ' (first ' + MAX_PYPI_DEPS_CHECKED + ' checked against PyPI)' : ', checked against PyPI') + '.'
    );
    document.getElementById('pypi-autopsy-total').textContent = String(summary.total);
    document.getElementById('pypi-autopsy-outdated').textContent =
      summary.outdated + ' (' + summary.outdatedPct + '% of checked)';
    document.getElementById('pypi-autopsy-stale').textContent =
      summary.stale + ' (' + summary.stalePct + '% of total)';
    document.getElementById('pypi-autopsy-health').textContent =
      summary.health != null ? summary.health + '/100' : '–';
    document.getElementById('pypi-autopsy-facts').hidden = false;

    // List stale packages by name.
    var staleNames = deps.filter(function (d) { return d.stale; }).map(function (d) { return d.name; });
    var staleEl = document.getElementById('pypi-autopsy-stale-list');
    if (staleNames.length > 0) {
      staleEl.textContent = 'Stale (>36 months): ' + staleNames.join(', ');
      staleEl.hidden = false;
    } else {
      staleEl.hidden = true;
    }
  }

  function runPypiAutopsy(repo, analysis) {
    // Determine if this might be a Python repo.
    var isPython = analysis.language === 'Python';

    // Try requirements.txt first; if the repo is Python or if the file exists,
    // proceed; fall back to pyproject.toml.
    return fetchRawPythonFile(analysis.owner, analysis.repo, repo.default_branch, 'requirements.txt')
      .then(function (reqText) {
        if (reqText) {
          return { text: reqText, source: 'requirements.txt', parser: Py.parseRequirementsTxt };
        }
        // No requirements.txt — try pyproject.toml.
        return fetchRawPythonFile(analysis.owner, analysis.repo, repo.default_branch, 'pyproject.toml')
          .then(function (pyText) {
            if (pyText) {
              return { text: pyText, source: 'pyproject.toml', parser: Py.parsePyprojectDependencies };
            }
            return null;
          });
      })
      .then(function (found) {
        if (!found) {
          // No Python dependency file found.
          if (isPython) {
            // Python repo but no recognised dependency file.
            renderPypiAutopsySection(true);
            renderPypiAutopsyStatus('Python repository detected, but no requirements.txt or pyproject.toml found at the root — Python dependency autopsy skipped.');
            document.getElementById('pypi-autopsy-facts').hidden = true;
          }
          // Non-Python repo with no Python files: stay hidden.
          return;
        }

        var parsed = found.parser(found.text);
        if (!parsed || parsed.length === 0) {
          renderPypiAutopsySection(true);
          renderPypiAutopsyStatus(found.source + ' found, but no dependencies declared — Python autopsy complete, nothing to examine.');
          document.getElementById('pypi-autopsy-facts').hidden = true;
          return;
        }

        // Show section and status.
        renderPypiAutopsySection(true);
        renderPypiAutopsyStatus('Examining ' + parsed.length + ' Python dependenc' +
          (parsed.length === 1 ? 'y' : 'ies') + ' against PyPI…');
        document.getElementById('pypi-autopsy-facts').hidden = true;

        var slice = parsed.slice(0, MAX_PYPI_DEPS_CHECKED);
        return Promise.all(slice.map(function (dep) {
          return fetchPypiInfo(dep.name).then(function (info) {
            var declaredMin = Py.extractMinVersion(dep.spec);
            var latestVersion = info ? info.latestVersion : null;
            var latestReleaseMonthsAgo = info ? info.latestReleaseMonthsAgo : null;
            return Py.classifyPypiDependency({
              name: dep.name,
              declaredMin: declaredMin,
              latestVersion: latestVersion,
              latestReleaseMonthsAgo: latestReleaseMonthsAgo
            });
          });
        })).then(function (classified) {
          var summary = Py.summarisePypiDependencies(classified);
          renderPypiAutopsy(classified, summary, parsed.length > slice.length);
        });
      })
      .catch(function () {
        // If the section is already visible, show the error; otherwise hide it.
        var section = document.getElementById('pypi-autopsy-section');
        if (!section.hidden) {
          renderPypiAutopsyStatus('Python dependency autopsy could not be completed (network or registry error) — the certificate above still stands.');
        }
      });
  }

  // ---------- Resurrection Pack download ----------

  packBtn.addEventListener('click', function () {
    if (!lastAnalysis) return;
    var pack = P.generateResurrectionPack(lastAnalysis);
    var blob = new Blob([pack.content], { type: 'text/markdown;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = pack.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  });

  // ---------- Main flow ----------

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    setError(null);
    cert.hidden = true;
    packBtn.disabled = true;
    lastAnalysis = null;
    document.getElementById('pypi-autopsy-section').hidden = true;
    document.getElementById('pypi-autopsy-facts').hidden = true;

    var parsed = S.parseRepoUrl(input.value);
    if (!parsed) {
      setStatus('');
      setError('That does not look like a GitHub repository. Paste a URL like https://github.com/owner/repo (or just owner/repo).');
      input.focus();
      return;
    }

    var apiUrl = 'https://api.github.com/repos/' + encodeURIComponent(parsed.owner) + '/' + encodeURIComponent(parsed.repo);
    setBusy(true);
    setStatus('Summoning ' + parsed.owner + '/' + parsed.repo + ' from the GitHub graveyard…');

    fetch(apiUrl, { headers: { 'Accept': 'application/vnd.github+json' } })
      .then(function (response) {
        if (response.status === 404) {
          throw new Error('Repository not found: ' + parsed.owner + '/' + parsed.repo + '. Check the spelling — and note that REVENANT can only see public repositories.');
        }
        if (response.status === 403) {
          throw new Error('GitHub API rate limit reached. Wait a minute and try again.');
        }
        if (!response.ok) {
          throw new Error('GitHub API returned an error (HTTP ' + response.status + '). Try again in a moment.');
        }
        return response.json();
      })
      .then(function (repo) {
        var analysis = buildAnalysis(repo);
        lastAnalysis = analysis;
        setStatus('');
        renderCertificate(repo, analysis);
        packBtn.disabled = false;
        return runAutopsy(repo, analysis).then(function () {
          return runPypiAutopsy(repo, analysis);
        });
      })
      .catch(function (err) {
        setStatus('');
        // fetch() itself rejects on network failure (offline, DNS, CORS).
        if (err instanceof TypeError) {
          setError('Could not reach the GitHub API. Check your connection and try again.');
        } else {
          setError(err.message);
        }
      })
      .finally(function () {
        setBusy(false);
      });
  });
})();
