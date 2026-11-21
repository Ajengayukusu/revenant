/*
 * REVENANT — pack.js
 * Pure logic for the Resurrection Pack generator. Takes the analysis
 * object produced by the analyser (repo facts + score + dependency
 * autopsy) and returns { filename, content }: one Markdown file that
 * contains a complete, ready-to-paste Kiro spec under
 *   .kiro/specs/<repo>-resurrection/
 * split into requirements.md, design.md, and tasks.md sections.
 *
 * No DOM, no Blob, no fetch — app.js wires the download. Browser-global:
 * window.RevenantPack. Node: require()-able (UMD guard, as score.js).
 *
 * Resurrection steps are ordered SMALLEST FIRST: verify and document
 * before touching anything, patch/minor updates before major upgrades,
 * deprecated replacements before backlog triage.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.RevenantPack = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function str(value, fallback) {
    return value != null && String(value).trim() !== '' ? String(value) : fallback;
  }

  function num(value, fallback) {
    var n = Number(value);
    return isFinite(n) ? n : fallback;
  }

  /** Filesystem/markdown-safe slug for a repo name. */
  function slugify(name) {
    var slug = String(name || '').toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return slug || 'unknown-repo';
  }

  /**
   * Normalise the loose analysis object app.js (or a test) hands us.
   * Accepts aliases: fullName/name, monthsIdle/monthsSincePush,
   * dependencies/depsSummary for the autopsy summary, and
   * deprecatedDeps/deprecated for the deprecated package names.
   */
  function normalise(analysis) {
    var a = (analysis && typeof analysis === 'object') ? analysis : {};
    var fullName = str(a.fullName || a.name, null);
    var owner = str(a.owner, null);
    var repo = str(a.repo, null);
    if (!fullName && owner && repo) fullName = owner + '/' + repo;
    if (!fullName) fullName = 'unknown/unknown';
    if (!repo) repo = fullName.split('/').pop();
    if (!owner) owner = fullName.split('/')[0];

    var summary = a.dependencies || a.depsSummary || a.dependencySummary || null;
    var deprecated = [];
    var source = a.deprecatedDeps || a.deprecated ||
      (summary && summary.deprecated) || [];
    if (Array.isArray(source)) {
      deprecated = source.map(function (d) {
        return typeof d === 'string' ? d : str(d && d.name, '(unnamed)');
      });
    }

    return {
      owner: owner,
      repo: repo,
      fullName: fullName,
      description: str(a.description, 'No description provided.'),
      score: Math.max(0, Math.min(100, Math.round(num(a.score, 0)))),
      verdict: str(a.verdict, 'Unknown'),
      monthsIdle: Math.max(0, Math.floor(num(
        a.monthsIdle != null ? a.monthsIdle : a.monthsSincePush, 0))),
      archived: Boolean(a.archived),
      openIssues: Math.max(0, Math.floor(num(a.openIssues, 0))),
      language: str(a.language, 'Unknown'),
      stars: Math.max(0, Math.floor(num(a.stars, 0))),
      lastPush: str(a.lastPush || a.pushedAt, 'Unknown'),
      depTotal: summary ? Math.max(0, Math.floor(num(summary.total, 0))) : 0,
      depChecked: summary ? Math.max(0, Math.floor(num(summary.checked, 0))) : 0,
      depOutdatedPct: summary ? Math.max(0, Math.min(100, Math.round(num(summary.outdatedPct, 0)))) : 0,
      depHealth: summary && summary.health != null ? Math.round(num(summary.health, 0)) : null,
      deprecated: deprecated
    };
  }

  /**
   * Ordered resurrection steps, smallest first. Pure and exported so the
   * ordering promise is testable without parsing markdown.
   * @returns {string[]} human-readable steps, cheapest/safest first
   */
  function buildResurrectionSteps(analysis) {
    var a = normalise(analysis);
    var steps = [];

    steps.push('Verify the current state: clone the repo, follow its own README, ' +
      'and record exactly what breaks today (install, build, tests) before changing anything.');
    steps.push('Pin the toolchain: add/refresh .nvmrc or equivalent and document ' +
      'the Node/runtime versions that get furthest today.');
    if (a.archived) {
      steps.push('Un-archive the repository (or fork it if you are not the owner) ' +
        'so fixes can land; note the archived state in the revival PR description.');
    }
    if (a.depTotal > 0) {
      steps.push('Apply patch and minor dependency updates only (' + a.depOutdatedPct +
        '% of checked dependencies are outdated) and re-run the test suite after each batch.');
    }
    a.deprecated.forEach(function (name) {
      steps.push('Replace the deprecated dependency `' + name + '` with its ' +
        'maintained successor (or remove it) — one replacement per commit.');
    });
    if (a.depTotal > 0) {
      steps.push('Upgrade remaining major-version dependencies one at a time, ' +
        'reading each changelog; never batch two major upgrades in one commit.');
    }
    if (a.monthsIdle >= 12) {
      steps.push('Audit for era rot after ' + a.monthsIdle + ' idle months: dead CI ' +
        'services, expired badges/links, and APIs that no longer exist.');
    }
    if (a.openIssues > 0) {
      steps.push('Triage the ' + a.openIssues + ' open issues: close duplicates and ' +
        'stale reports, label the rest, and fix only what blocks a release.');
    }
    steps.push('Restore CI and re-run the full test suite until green, then cut ' +
      'a tagged resurrection release and update the README with the new setup.');
    return steps;
  }

  /**
   * Generate the Resurrection Pack.
   * @param {object} analysis  analyser output (see normalise for aliases)
   * @returns {{filename: string, content: string}}
   */
  function generateResurrectionPack(analysis) {
    var a = normalise(analysis);
    var slug = slugify(a.repo);
    var specDir = '.kiro/specs/' + slug + '-resurrection';
    var steps = buildResurrectionSteps(a);
    var deprecatedLine = a.deprecated.length > 0
      ? a.deprecated.map(function (n) { return '`' + n + '`'; }).join(', ')
      : 'none found';
    var autopsyLine = a.depTotal > 0
      ? a.depTotal + ' dependencies (' + a.depChecked + ' checked against the registry), ' +
        a.depOutdatedPct + '% outdated, deprecated: ' + deprecatedLine +
        (a.depHealth != null ? '; dependency health ' + a.depHealth + '/100' : '')
      : 'no package.json found — dependency autopsy skipped';

    var lines = [];
    lines.push('# Resurrection Pack — ' + a.fullName);
    lines.push('');
    lines.push('Generated by REVENANT (Kiroween 2026) from a live analysis of `' + a.fullName + '`.');
    lines.push('Copy the three spec files below into `' + specDir + '/` in that repo,');
    lines.push('open it in Kiro, and work the tasks smallest-first.');
    lines.push('');
    lines.push('## Death Certificate (source data)');
    lines.push('');
    lines.push('| Fact | Value |');
    lines.push('| --- | --- |');
    lines.push('| Repository | ' + a.fullName + ' |');
    lines.push('| Description | ' + a.description.replace(/\|/g, '/') + ' |');
    lines.push('| Resurrection Score | ' + a.score + '/100 (' + a.verdict + ') |');
    lines.push('| Months since last push | ' + a.monthsIdle + ' |');
    lines.push('| Last push | ' + a.lastPush + ' |');
    lines.push('| Archived | ' + (a.archived ? 'yes' : 'no') + ' |');
    lines.push('| Open issues | ' + a.openIssues + ' |');
    lines.push('| Stars | ' + a.stars + ' |');
    lines.push('| Primary language | ' + a.language + ' |');
    lines.push('| Dependency autopsy | ' + autopsyLine + ' |');
    lines.push('');

    // ---- requirements.md ----
    lines.push('---');
    lines.push('');
    lines.push('## File: `' + specDir + '/requirements.md`');
    lines.push('');
    lines.push('```markdown');
    lines.push('# Requirements — Resurrect ' + a.fullName);
    lines.push('');
    lines.push('## Problem');
    lines.push('`' + a.fullName + '` scores ' + a.score + '/100 on the REVENANT Resurrection');
    lines.push('Score after ' + a.monthsIdle + ' month(s) without a push. ' + a.description);
    lines.push('');
    lines.push('## Requirements');
    lines.push('1. The project MUST install and run from a clean clone by following its README.');
    lines.push('2. Deprecated dependencies (' + deprecatedLine + ') MUST be replaced or removed.');
    lines.push('3. Outdated dependencies MUST be upgraded — patch/minor first, majors one at a time.');
    lines.push('4. The existing test suite MUST pass; new behaviour MUST be covered by tests.');
    lines.push('5. The revival MUST NOT change the public API without a documented migration note.');
    lines.push('6. CI MUST run the test suite on every push again.');
    lines.push('```');
    lines.push('');

    // ---- design.md ----
    lines.push('---');
    lines.push('');
    lines.push('## File: `' + specDir + '/design.md`');
    lines.push('');
    lines.push('```markdown');
    lines.push('# Design — Resurrect ' + a.fullName);
    lines.push('');
    lines.push('## Approach');
    lines.push('Smallest-first, one concern per commit, tests green at every step.');
    lines.push('Nothing is upgraded in a batch; every change is reversible.');
    lines.push('');
    lines.push('## Source data');
    lines.push('- Resurrection Score: ' + a.score + '/100 (' + a.verdict + ')');
    lines.push('- Idle time: ' + a.monthsIdle + ' month(s); archived: ' + (a.archived ? 'yes' : 'no'));
    lines.push('- Backlog: ' + a.openIssues + ' open issue(s); primary language: ' + a.language);
    lines.push('- Dependency autopsy: ' + autopsyLine);
    lines.push('');
    lines.push('## Order of work');
    steps.forEach(function (step, i) { lines.push((i + 1) + '. ' + step); });
    lines.push('');
    lines.push('## Risks');
    lines.push('- A deprecated dependency may have no drop-in successor; budget a small adapter.');
    lines.push('- Major upgrades can change behaviour silently; rely on the test suite, not hope.');
    lines.push('```');
    lines.push('');

    // ---- tasks.md ----
    lines.push('---');
    lines.push('');
    lines.push('## File: `' + specDir + '/tasks.md`');
    lines.push('');
    lines.push('```markdown');
    lines.push('# Tasks — Resurrect ' + a.fullName);
    lines.push('');
    lines.push('Work top to bottom: smallest, safest steps first.');
    lines.push('');
    steps.forEach(function (step) { lines.push('- [ ] ' + step); });
    lines.push('```');
    lines.push('');

    return {
      filename: slug + '-resurrection-pack.md',
      content: lines.join('\n')
    };
  }

  return {
    slugify: slugify,
    normalise: normalise,
    buildResurrectionSteps: buildResurrectionSteps,
    generateResurrectionPack: generateResurrectionPack
  };
});
