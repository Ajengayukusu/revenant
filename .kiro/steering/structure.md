# REVENANT — Structure Steering

## Repo layout
```
index.html                 Single page: analyser form + Death Certificate
app.js                     Browser wiring (DOM + fetch) — no pure logic here
score.js                   Pure logic: parseRepoUrl, monthsSincePush,
                           computeResurrectionScore, verdictForScore
styles.css                 All styling (cemetery UI system)
tests/score.test.js        node:test tests for score.js
.kiro/
  steering/                product.md, tech.md, structure.md (this file)
  specs/<feature>/         requirements.md, design.md, tasks.md per feature
  hooks/                   Hook definitions and notes (see hooks/README.md)
  agents/                  Custom agent definitions (see agents/README.md)
```

## Where new things go
- New feature: spec first in `.kiro/specs/<feature-name>/`, then code.
- New pure logic: a new top-level `*.js` module with the same UMD export
  guard as `score.js`, plus a matching file in `tests/`.
- New styling: `styles.css` only — no inline styles, no per-page CSS files.
- New agent or hook: document it in `.kiro/agents/` or `.kiro/hooks/`
  in the same change that introduces it.

## Naming
- Files: lowercase, hyphenated where needed (`score.js`, `score.test.js`).
- Spec folders: the feature's short name, lowercase hyphenated
  (`revenant-analyser`, later e.g. `dependency-analysis`).
- Functions: camelCase, verb-first for actions (`computeResurrectionScore`).
