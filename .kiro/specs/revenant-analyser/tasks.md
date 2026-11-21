# Spec: Revenant Analyser — Tasks

## Done in this scaffold
- [x] Create repo structure (README, MIT LICENSE, .gitignore that
      explicitly protects /.kiro from being ignored)
- [x] `score.js`: parseRepoUrl, monthsSincePush,
      computeResurrectionScore, verdictForScore (UMD export guard)
- [x] `tests/score.test.js`: node:test coverage for parsing, months,
      each score penalty, invariants, monotonicity, verdict bands
- [x] `index.html`: analyser form + Death Certificate card markup
- [x] `app.js`: GitHub API fetch, error mapping (invalid URL, 404,
      403, other HTTP, network), certificate rendering
- [x] `styles.css`: cemetery UI, verdict colours, reduced-motion support
- [x] Steering docs (product / tech / structure)
- [x] Hooks and agents documented (`.kiro/hooks/`, `.kiro/agents/`)

## Done in Phase 2 (22 Nov 2026)
- [x] Dependency analysis (npm registry): `deps.js` pure module
      (parseVersion, compareVersions, classifyOutdated,
      extractDependencies / parsePackageJson, summariseDependencies);
      app.js fetches package.json (raw URL, contents-API fallback) and
      one packument per dependency for latest version + deprecated flag.
      Certificate shows an Autopsy section (total, % outdated,
      deprecated names, dependency health). No package.json is handled
      gracefully. The Resurrection Score formula is UNCHANGED — the
      autopsy is a separate report, by design.
- [x] Resurrection pack download: `pack.js` pure generator returning
      { filename, content } — one Markdown file with a ready-to-paste
      `.kiro/specs/<repo>-resurrection/` spec (requirements / design /
      tasks), tailored with real repo data, steps smallest-first;
      app.js wires the Blob download button.
- [x] Property-based tests WITHOUT external deps (zero-dependency rule
      beats fast-check): `tests/property.test.js`, seeded mulberry32
      harness, 250 generated cases per property (score range, idle and
      archived monotonicity, deprecated-never-improves-health, pack
      completeness). Plus unit suites `tests/deps.test.js` and
      `tests/pack.test.js`. Total: 32 tests, all passing
      (`node --test tests/*.test.js`).

## Next
- [ ] Verify the page against the live GitHub API in a real browser
      (demo repos: one Alive, one Dead, one archived, one 404)
- [ ] Dependency analysis for Python repos via PyPI
- [ ] Turn the two documented hooks into live Kiro hook files
- [ ] Package Gravedigger / Necromancer / Watcher as a Kiro Crew app
      in a separate public repo
