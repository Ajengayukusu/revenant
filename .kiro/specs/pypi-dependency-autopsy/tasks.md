# Spec: PyPI Dependency Autopsy — Tasks

Build order, smallest first. Do not modify `score.js` or the
Resurrection Score formula. Do not add any external dependency.

- [x] 1. `pypi.js`: UMD skeleton + `parseRequirementsTxt`
      (pins, ranges, bare names, extras, comments, option lines,
      environment markers) with the module header documenting the
      health formula and the report-only rule.
- [x] 2. `pypi.js`: `parsePyprojectDependencies` for the `[project]`
      table's `dependencies` array (documented TOML subset).
- [x] 3. `pypi.js`: declared-minimum extraction +
      `classifyPypiDependency` (current / outdated / unknown,
      36-month stale flag).
- [x] 4. `pypi.js`: `summarisePypiDependencies` (same weights as
      `deps.js`; null health for an empty set).
- [x] 5. `tests/pypi.test.js`: parsing, classification, stale
      boundary (35/36/37 months), summary invariants.
      Run `node --test tests/*.test.js` — whole suite green.
- [x] 6. `app.js` + `index.html`: fetch requirements.txt, then
      pyproject.toml, from the repo root via raw.githubusercontent.com
      (contents-API fallback like the npm path); fetch one PyPI JSON
      per dependency; render the "Python dependency autopsy" section
      only when dependencies were found; load `pypi.js` in
      index.html. `textContent` only for dynamic strings.
- [x] 7. README: add the Python autopsy to the feature list and the
      roadmap; tick these tasks off as they land.
