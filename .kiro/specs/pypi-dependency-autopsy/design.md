# Spec: PyPI Dependency Autopsy — Design

## Architecture

One new pure-logic file, mirroring the npm autopsy's boundary:

```
index.html ──loads──> pypi.js (pure logic, window.RevenantPypi)
app.js     ──fetches──> raw requirements.txt / pyproject.toml (GitHub)
           ──fetches──> https://pypi.org/pypi/<name>/json per dependency
           ──feeds plain data into──> pypi.js classify + summarise
           ──renders──> "Python dependency autopsy" certificate section
```

- `pypi.js` never fetches and never touches the DOM. Registry responses
  reach it as plain objects, exactly like `deps.js`.
- Version comparison reuses the semantics of `deps.js`'
  `parseVersion`/`compareVersions` (PEP 440 versions in the wild are
  mostly plain `x.y.z`; pre-release suffixes are stripped for the
  comparison, which is documented in the module header).

## Parsing design

- `parseRequirementsTxt(text)` returns `[{ name, spec }]` where `spec`
  is the raw version specifier string (`"==1.2.3"`, `">=1.0,<2"`) or
  `null` for a bare name. Lines are trimmed; `#` comments (full-line
  and trailing), blank lines, and lines starting with `-` (options,
  includes, editable installs) are skipped. Environment markers after
  `;` are dropped. Extras (`name[extra]`) keep the bare package name.
- `parsePyprojectDependencies(text)` extracts the string array of the
  `dependencies` key inside the `[project]` table only — a small,
  deliberate TOML subset (the array may span lines; entries are quoted
  strings). It returns the same `[{ name, spec }]` shape by splitting
  each entry at the first version-specifier character
  (`=<>~!` or whitespace). It is NOT a general TOML parser and says so.
- The declared minimum version of a spec is the smallest plain version
  mentioned in it (`==1.2.3` -> 1.2.3, `>=1.0,<2` -> 1.0); a spec with
  no plain version yields `null` -> classification `unknown`.

## Classification design

`classifyPypiDependency({ name, declaredMin, latestVersion,
latestReleaseMonthsAgo })` returns `{ name, status, stale }`:

- `status`: `unknown` when `declaredMin` or `latestVersion` is null;
  `outdated` when declaredMin < latestVersion; otherwise `current`.
- `stale`: true when `latestReleaseMonthsAgo` > 36 (strictly greater;
  exactly 36 is not stale — the boundary is unit-tested).

## Summary design

`summarisePypiDependencies(classified)` mirrors
`summariseDependencies` in `deps.js`:

```
health = clamp(round(100 − 0.7 × outdatedPct − 0.3 × stalePct))
  outdatedPct = outdated / known-status dependencies
  stalePct    = stale / all dependencies
health is null when there are no dependencies at all.
```

Invariant (unit-tested): flagging one more dependency stale never
raises the health of the same set.

## UI design

- The Python section reuses the npm autopsy section's markup and
  classes, with its own heading, and renders only when at least one
  Python dependency was found.
- All dynamic strings are inserted with `textContent` only (the
  existing XSS rule for the whole app).

## Testing design

- `tests/pypi.test.js` with node:test only (zero-dependency rule).
  Fixtures are inline strings/objects; no network in tests.
- The 36-month stale boundary is tested at 35, 36, and 37 months.
