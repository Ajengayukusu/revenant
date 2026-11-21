# REVENANT — Custom Agents

Three custom agents mirror the crew inside the product. Each has one job,
one input, and one output. They are used during the build itself, and are
planned to be packaged as a Kiro Crew app in a separate public repo
(Best Kiro Crew App bonus).

## 1. Gravedigger — the scanner
- **Role:** gathers the corpse's facts. Given a GitHub owner/repo, it
  collects repo metadata (last push, archived status, open issues, stars,
  language) and — once dependency analysis lands — the dependency list
  with ages and deprecated flags from npm/PyPI.
- **Input:** a GitHub repo URL or `owner/repo`.
- **Output:** a structured fact sheet (JSON-shaped), no opinions, no
  score. Facts only — scoring is deterministic code, not an agent call.
- **Rules:** never invent a number; a field it cannot fetch is reported
  as missing, not estimated.

## 2. Necromancer — the spec planner
- **Role:** turns a fact sheet into a resurrection plan. It writes the
  Kiro spec pack for reviving the repo: requirements (what "alive"
  means for this repo), design (which dead pieces get replaced with
  what), and tasks (ordered, smallest-first revival steps).
- **Input:** a Gravedigger fact sheet + the target repo's README.
- **Output:** a `.kiro/specs/<repo>-resurrection/` folder draft
  (requirements.md, design.md, tasks.md).
- **Rules:** every task must be verifiable ("tests pass", "app boots"),
  and the plan must start with the smallest change that makes the repo
  run at all — no big-bang rewrites.

## 3. Watcher — the tester
- **Role:** guards the graveyard gates. It owns testing for REVENANT
  itself and for resurrection attempts: unit tests, the score
  invariants, and property-based tests (score always 0–100, archiving
  never raises a score, longer idle never raises a score).
- **Input:** a code change or a resurrection task result.
- **Output:** a pass/fail report naming exactly which invariant or test
  failed and the smallest reproduction.
- **Rules:** a green report requires tests that actually ran — it
  reports the command and its output, and never upgrades "not run"
  to "passed".

## How the crew composes
Gravedigger digs (facts) -> Necromancer plans (spec) -> the developer
(or Kiro) executes -> Watcher verifies (tests). REVENANT's own analyser
is the deterministic core of the Gravedigger step, kept as plain code so
the demo works without any agent or API key.
