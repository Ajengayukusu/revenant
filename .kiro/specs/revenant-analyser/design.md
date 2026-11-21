# Spec: Revenant Analyser — Design

## Architecture

Three browser files, one pure-logic boundary:

```
index.html ──loads──> score.js (pure logic, window.RevenantScore)
           ──loads──> app.js   (DOM + fetch, consumes RevenantScore)
styles.css ── cemetery UI system for both static and dynamic states
```

- `score.js` has no DOM and no network access. It exports
  `parseRepoUrl`, `monthsSincePush`, `computeResurrectionScore`, and
  `verdictForScore` through a UMD-style guard so Node tests can
  `require()` the exact code the browser runs — no duplicated formula.
- `app.js` owns all side effects: the submit handler, the `fetch` call,
  error mapping, and certificate rendering (via `textContent` only).

## Data flow

1. Submit -> `parseRepoUrl(input)`; null means stop with the format error.
2. `fetch('https://api.github.com/repos/' + enc(owner) + '/' + enc(repo))`.
3. Response mapping: 404 -> not-found error; 403 -> rate-limit error;
   other non-OK -> generic HTTP error; rejected promise (TypeError) ->
   network error.
4. On success: `monthsSincePush(repo.pushed_at, now)`, then
   `computeResurrectionScore({monthsSincePush, archived, openIssues})`,
   then `verdictForScore(score)`, then render the certificate.

## Score design

See the formula and invariants in the header of `score.js`. Design
choices worth remembering:

- Penalties are capped individually (60 / 25 / 15) so no single factor
  can zero a repo on its own except extreme combined neglect — a repo
  idle 30+ months, archived, with 300+ open issues scores exactly 0.
- Months are average Gregorian months (30.4375 days) and whole months
  only, so the score does not jitter day to day.
- The backlog penalty is deliberately gentle (1 per 20 issues): open
  issues also signal an audience that still cares.

## UI design

- One page, one form, one result card. The certificate uses a tombstone
  silhouette (large top border-radius), a big score numeral, a verdict
  colour bar (green Alive, amber Fading, orange Dead, red Fossilised),
  and a facts grid. Animation is a single rise/fade, disabled under
  `prefers-reduced-motion`.
- Status uses `aria-live="polite"`; errors use `role="alert"`.

## Testing design

- `tests/score.test.js` (node:test) covers parsing accept/reject cases,
  month counting, each penalty in isolation, the 0 floor and 100
  ceiling, score range/integer invariants, monotonicity (idle time,
  archived, issues), and verdict band boundaries.
- Property-based tests (fast-check) are planned to generalise the
  invariant checks; the hand-written invariant tests here are their
  seed cases.
