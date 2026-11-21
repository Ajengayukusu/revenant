# REVENANT — Agent Hooks (planned)

Two hooks are planned for the Kiro build. They are documented here first
(spec-first, like everything else in this repo); turning each into a live
Kiro hook file is a tracked task in
`.kiro/specs/revenant-analyser/tasks.md`.

## 1. On-save tests
- **Trigger:** file save of any `*.js` file in the repo root or `tests/`.
- **Action:** run `node --test tests/score.test.js` and surface pass/fail in Kiro
  without blocking the editor.
- **Why:** the Resurrection Score is a product promise. A formula change
  that breaks an invariant (score outside 0–100, archived raising a
  score) should be caught at save time, not at submission time.
- **Failure behaviour:** report the failing test names; never auto-edit
  code to make tests pass.

## 2. Commit message check
- **Trigger:** before a commit is created (manual prompt / pre-commit
  step run by the agent).
- **Action:** check the draft message against three rules:
  1. First line is imperative and ≤ 72 characters.
  2. If the change touches `score.js`, the message (or the change itself)
     must also touch `tests/` and `README.md` — the formula, its tests,
     and its documentation move together (see steering/product.md).
  3. The message never claims verification that did not happen
     (e.g. no "tested in browser" if only node tests were run).
- **Why:** this project is judged partly on how Kiro was used; a clean,
  honest history is evidence of the workflow.
- **Failure behaviour:** explain which rule failed and propose a fixed
  message; do not commit until the author accepts.
