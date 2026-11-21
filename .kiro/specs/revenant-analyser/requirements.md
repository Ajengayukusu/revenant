# Spec: Revenant Analyser — Requirements

Feature: paste a GitHub repo URL, get a Death Certificate with a
Resurrection Score. This is the first shipped slice of REVENANT.

## User stories

1. As a developer, I paste a public GitHub repo URL (or `owner/repo`)
   so that I can see how alive that repository is.
2. As a maintainer, I see the facts behind the verdict — last push,
   months idle, open issues, stars, archived status, primary language —
   so that I can judge the score instead of trusting it blindly.
3. As a user with a typo or a private repo, I get a clear error that
   tells me what went wrong, so that I can fix my input and retry.

## Acceptance criteria

### Input & parsing
- [x] Accepts `https://github.com/owner/repo`, the same with a trailing
      slash, a `.git` suffix, extra path segments, and bare `owner/repo`.
- [x] Rejects non-GitHub URLs, GitHub URLs without a repo segment, empty
      input, and non-string input — with an inline error, no API call.

### Data
- [x] Fetches `GET https://api.github.com/repos/{owner}/{repo}` from the
      browser, unauthenticated, with owner/repo URL-encoded.
- [x] Displays: full name, description, last push date, months since
      last push, open issues, stars, archived status, primary language.
- [x] Missing optional fields degrade gracefully (description ->
      "No description provided.", language -> "Unknown").

### Score
- [x] Resurrection Score per the documented formula in `score.js`:
      100 − min(60, monthsIdle × 2) − (archived ? 25 : 0)
      − min(15, floor(openIssues / 20)), clamped to 0–100.
- [x] Verdict bands: 80+ Alive, 50+ Fading, 20+ Dead, below 20 Fossilised.
- [x] Score is always an integer in 0–100; longer idle time, archived
      status, or more open issues never raise it (tested invariants).

### Errors
- [x] Invalid URL: inline error explaining the expected format.
- [x] HTTP 404: "Repository not found" error naming the repo, noting
      that only public repositories are visible.
- [x] HTTP 403: rate-limit error asking the user to wait.
- [x] Other HTTP errors and network failures: distinct, human messages.
- [x] While loading, the button is disabled and a status line is shown;
      both reset on success and on failure.

### Presentation
- [x] Result renders as a Death Certificate card (tombstone styling,
      score bar coloured by verdict, "rising" animation that respects
      `prefers-reduced-motion`).

## Out of scope for this spec
- Dependency analysis (npm/PyPI) — separate spec.
- Resurrection pack generation — separate spec.
- Authenticated GitHub requests / rate-limit raising.
