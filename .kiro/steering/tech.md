# REVENANT — Tech Steering

## Stack (locked for the hackathon build)
- Pure vanilla HTML, CSS, and JavaScript. No framework, no build step,
  no bundler, no npm dependencies for the app itself.
- Runs from any static server (and is GitHub Pages compatible).
- Data source: GitHub REST API, unauthenticated, from the browser
  (`https://api.github.com/repos/{owner}/{repo}`). npm/PyPI registry
  APIs are planned for dependency analysis — also browser-side.

## Code rules
- Pure logic goes in `score.js` (or a sibling pure module) with a
  UMD-style export guard: `module.exports` in Node, a `window.*` global
  in the browser. DOM and `fetch` code goes in `app.js` only.
- No pure-logic module may touch `document`, `window` (beyond the export
  guard), or `fetch` — it must stay testable with `node:test`.
- Tests use Node's built-in `node:test` + `node:assert` only. Run with
  `node --test tests/score.test.js`. Do not add a test framework dependency.
- All user-facing errors are handled explicitly: invalid URL, 404,
  403 rate limit, other HTTP errors, and network failure each get their
  own message.
- Escape/encode user-derived values that go into API URLs
  (`encodeURIComponent`). Repo data is rendered with `textContent`,
  never `innerHTML`.

## Constraints
- GitHub's unauthenticated rate limit is 60 requests/hour per IP.
  Do not add polling or multi-request fan-out to the analyser without
  a caching story.
- The `/.kiro` directory is part of the product. It is never added to
  `.gitignore` (Kiroween rules — that could disqualify the submission).
