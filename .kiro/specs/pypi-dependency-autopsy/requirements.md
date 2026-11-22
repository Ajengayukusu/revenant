# Spec: PyPI Dependency Autopsy — Requirements

Feature: extend REVENANT's dependency autopsy beyond npm. When the
analysed repository is a Python project, read its declared dependencies
and report their registry health from PyPI — the same style of report
the npm autopsy already produces, as a separate section that does NOT
change the Resurrection Score.

## User stories

1. As a developer analysing a dead Python repo, I see which of its
   dependencies are outdated or abandoned on PyPI, so that I know what
   a resurrection must replace first.
2. As a maintainer, I see the facts behind the report — declared
   requirement, latest PyPI version, months since the latest release —
   so that I can judge it instead of trusting a single number.
3. As a user analysing a repo with no Python dependency files, I get
   no Python section at all (silence, not an error), so that the
   certificate stays relevant to the repo in front of me.

## Acceptance criteria

### Detection & data
- [ ] A repo counts as Python when its primary language is "Python"
      OR a `requirements.txt` / `pyproject.toml` exists at its root.
- [ ] Dependencies are read from `requirements.txt` first (plain
      `name`, `name==1.2.3`, `name>=1.0,<2` lines; comments, blank
      lines, `-r` includes and option lines are skipped), falling back
      to `pyproject.toml` `[project] dependencies` when there is no
      `requirements.txt`.
- [ ] Registry data comes from `GET https://pypi.org/pypi/{name}/json`
      (name URL-encoded): latest version is `info.version`, latest
      release time is the earliest `upload_time_iso_8601` among the
      files of that version in `releases`.
- [ ] A package that PyPI does not know (HTTP 404) is reported as
      "unknown", never as an error that fails the whole autopsy.

### Report
- [ ] Each dependency is classified: `current` (declared minimum
      version >= latest), `outdated` (declared minimum version below
      latest), `unknown` (no parseable declared version, or package
      unknown to PyPI).
- [ ] A dependency whose latest release is more than 36 months old is
      flagged `stale` (abandoned-looking) in addition to its class.
- [ ] The Python autopsy summary mirrors the npm summary shape:
      total, known, outdated count, stale count, and a health figure
      0–100 computed with the SAME documented weights as `deps.js`
      (0.7 outdated share, 0.3 stale share in place of deprecated).
- [ ] The Resurrection Score in `score.js` is NOT modified. The Python
      autopsy is a report only, exactly like the npm autopsy.

### Code shape
- [ ] Pure logic lives in a new `pypi.js` module: no DOM, no fetch,
      UMD export guard (`window.RevenantPypi` in the browser,
      `require()`-able in Node), same pattern as `score.js`/`deps.js`.
- [ ] `pypi.js` exports at least: `parseRequirementsTxt`,
      `parsePyprojectDependencies`, `classifyPypiDependency`,
      `summarisePypiDependencies`.
- [ ] All network access stays in `app.js`: it fetches the raw
      dependency files from GitHub and one PyPI JSON per dependency,
      then feeds plain data into `pypi.js`.
- [ ] `index.html` loads `pypi.js`; the certificate gains a "Python
      dependency autopsy" section rendered only when Python
      dependencies were found, using `textContent` only.

### Tests
- [ ] `tests/pypi.test.js` (node:test, zero external dependencies)
      covers: requirements.txt parsing (pins, ranges, comments,
      options, editable installs), pyproject dependency extraction,
      classification (current / outdated / unknown), the 36-month
      stale flag boundary, and summary health invariants (health in
      0–100 or null; marking a dependency stale never raises health).
- [ ] The full suite still passes: `node --test tests/*.test.js`.
