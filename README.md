# REVENANT — The Repo Resurrection Crew

> Dead repos rise again. Paste a GitHub URL, a crew of Kiro agents issues its
> Death Certificate, writes its resurrection spec, and proves the cure.

REVENANT is a [Kiroween 2026](https://kiroween.devpost.com/) entry in the
**Resurrection** category, built by Ajeng Ayu Kusuma Wardani.

Thousands of useful open-source repositories are abandoned every year —
unmaintained dependencies, years of silence, a backlog nobody will ever
triage. REVENANT diagnoses any public GitHub repository live, scores how
dead it really is, and (in the full version) generates a ready-to-use Kiro
resurrection spec so a developer can actually bring it back.

## What it does today

1. Paste a public GitHub repo URL (or `owner/repo`).
2. REVENANT fetches live data from the GitHub API
   (`https://api.github.com/repos/{owner}/{repo}` — no token, no backend).
3. It issues a **Death Certificate** showing: repo name, description, last
   push date, months since last push, open issues, stars, archived status,
   primary language — and a **Resurrection Score**.
4. **Dependency Autopsy** — it then fetches the repo's `package.json`
   (raw URL, falling back to the GitHub contents API) and checks each
   dependency against the npm registry: latest version, outdated status,
   and deprecated flags. The certificate gains an Autopsy section with
   total dependencies, % outdated, the deprecated packages by name, and a
   dependency health figure. Repos without a `package.json` are handled
   gracefully ("dependency autopsy skipped"). The autopsy is a separate
   report — **it does not change the Resurrection Score** (see below).
5. **Resurrection Pack** — the "Download Resurrection Pack" button
   generates, entirely client-side, one Markdown file containing a
   ready-to-paste Kiro spec (`.kiro/specs/<repo>-resurrection/` with
   requirements, design, and tasks) tailored with the repo's real data,
   with resurrection steps ordered smallest-first.

### Resurrection Score (0–100, higher = more alive)

```
score = 100 − recency penalty − archived penalty − backlog penalty   (clamped 0–100)
  recency penalty  = 2 points per full month since last push, max 60
  archived penalty = 25 if the repo is archived
  backlog penalty  = 1 point per 20 open issues, max 15
```

Verdicts: 80–100 **Alive** · 50–79 **Fading** · 20–49 **Dead** · 0–19 **Fossilised**.
The formula lives in `score.js` and is covered by tests in `tests/`.
Dependency health (in `deps.js`) is reported separately in the Autopsy
section and deliberately does **not** feed this score — the formula above
is a documented promise and has not changed.

## How to run

No build step, no dependencies. Serve the folder statically and open it:

```bash
cd revenant
python3 -m http.server 8000
# then open http://localhost:8000
```

(Any static server works, e.g. `npx serve .`. Opening `index.html` via
`file://` also works in most browsers, but a static server is the
supported route because the GitHub API is fetched over HTTPS.)

## Run the tests

Requires Node.js (uses the built-in `node:test` runner — nothing to install):

```bash
node --test tests/*.test.js
```

That runs all four suites (32 tests): `score.test.js` (score formula),
`deps.test.js` (dependency logic), `pack.test.js` (pack generator), and
`property.test.js` (property-based tests — a dependency-free seeded PRNG
harness, 250 generated cases per property: score always an integer
0–100, more idle time / archiving never raises the score, deprecated
dependencies never improve dependency health, and the generated pack
always contains the repo name, the score, and all three spec sections).

## Project structure

```
index.html      The single page: analyser form + Death Certificate card
                (with Dependency Autopsy section + pack download button)
app.js          Browser wiring + ALL network access: GitHub API,
                package.json fetch, npm registry checks, pack download
score.js        Pure logic (URL parsing, repo age, Resurrection Score).
                Browser-global in the page, require()-able in Node tests.
deps.js         Pure dependency logic (version compare, outdated
                classification, package.json parsing, health summary)
pack.js         Pure Resurrection Pack generator ({filename, content})
styles.css      Cemetery UI: dark, tombstone-styled certificate, accessible
tests/          node:test suites for score.js, deps.js, pack.js, plus
                dependency-free property-based tests
.kiro/          Kiro specs, steering, hooks, and custom agent definitions
                (REQUIRED by the Kiroween rules — never gitignore this)
```

## How Kiro was used (draft — expand as the build progresses)

REVENANT is built spec-first with Kiro:

- **Spec-driven development** — the analyser was specified before it was
  coded; see `.kiro/specs/revenant-analyser/` (requirements, design, tasks).
- **Steering docs** — `.kiro/steering/` holds the product, tech, and
  structure rules Kiro follows on every change.
- **Custom agents** — three agents mirror the product's crew:
  Gravedigger (scanner), Necromancer (spec planner), Watcher (tester).
  See `.kiro/agents/README.md`.
- **Agent hooks** — planned on-save test runs and a commit-message check;
  see `.kiro/hooks/README.md`.
- **MCP** — GitHub MCP used during development to inspect reference repos.
- **Property-based testing** — implemented without external libraries
  (the app carries zero npm dependencies): `tests/property.test.js` uses
  a small seeded PRNG harness over 250 generated cases per property —
  score always 0–100, archiving never raises a score, more idle time
  never raises a score, deprecated deps never improve dependency health,
  and the pack generator's output is always complete.

## Roadmap / TODO

- [x] Dependency analysis via the npm registry (outdated %, deprecated list)
- [x] Downloadable resurrection pack (`.kiro/specs/<repo>-resurrection/`)
- [x] Property-based tests for score, dependency logic, and the pack generator
- [ ] Dependency analysis via PyPI for Python repos
- [x] One real proof resurrection, documented before/after —
  [cferdinandi/gulp-boilerplate](proof/gulp-boilerplate-resurrection.md)
  (REVENANT score 15/100; `npm install` failed on node-sass, after the fix the
  full gulp build passes and `dist/` is produced; 2 hand-edited files, 3 lines)
- [x] Kiro Crew app in a separate public repo (Best Kiro Crew App bonus) —
  [Ajengayukusu/revenant-crew](https://github.com/Ajengayukusu/revenant-crew)
- [ ] Demo video (< 3 min, YouTube public), blog post, social post

**Live app:** https://ajengayukusu.github.io/revenant/

## License

MIT — see [LICENSE](LICENSE). Copyright (c) 2026 Ajeng Ayu Kusuma Wardani.
