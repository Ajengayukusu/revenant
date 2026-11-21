/*
 * REVENANT — score.js
 * Pure logic for the repo analyser: URL parsing, age calculation, and the
 * Resurrection Score. No DOM, no fetch — safe to use in the browser and in
 * Node (node:test). Loaded by app.js in the browser via a classic <script>
 * tag, and by tests/score.test.js in Node via require().
 *
 * Resurrection Score formula (0–100, higher = more alive)
 * --------------------------------------------------------
 *   score = 100 - recencyPenalty - archivedPenalty - backlogPenalty
 *   clamped to the range 0–100 (inclusive).
 *
 *   recencyPenalty  = min(60, floor(monthsSincePush) * 2)
 *                     A repo pushed this month loses 0 points. Each full
 *                     month without a push loses 2 points, up to 60 points
 *                     at 30+ months of silence.
 *   archivedPenalty = 25 if the repo is archived on GitHub, otherwise 0.
 *   backlogPenalty  = min(15, floor(openIssues / 20))
 *                     One point per 20 open issues, up to 15 points.
 *                     A large untouched backlog is a burden on revival;
 *                     a handful of issues costs nothing.
 *
 * Invariants (covered by tests, and intended for property-based tests):
 *   - The result is always an integer between 0 and 100.
 *   - Archiving a repo never raises its score.
 *   - A repo idle for longer never scores higher than the same repo
 *     idle for a shorter time.
 *   - More open issues never raise the score.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.RevenantScore = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30.4375; // average Gregorian month

  /**
   * Parse a GitHub repo reference into { owner, repo } or return null.
   * Accepts:
   *   https://github.com/owner/repo
   *   https://github.com/owner/repo/
   *   https://github.com/owner/repo.git
   *   http://github.com/owner/repo (and extra path segments, ignored)
   *   owner/repo
   */
  function parseRepoUrl(input) {
    if (typeof input !== 'string') return null;
    var trimmed = input.trim();
    if (!trimmed) return null;

    var path = trimmed;
    var urlMatch = trimmed.match(/^https?:\/\/github\.com\/(.+)$/i);
    if (urlMatch) {
      path = urlMatch[1];
    } else if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) || trimmed.indexOf('github.com') !== -1) {
      // Some other host / scheme — not a GitHub repo URL we accept.
      return null;
    }

    var parts = path.split('/').filter(function (p) { return p.length > 0; });
    if (parts.length < 2) return null;

    var owner = parts[0];
    var repo = parts[1].replace(/\.git$/i, '');

    // GitHub owner/repo names: alphanumerics, hyphens, underscores, dots.
    var namePattern = /^[A-Za-z0-9_.-]+$/;
    if (!namePattern.test(owner) || !namePattern.test(repo)) return null;
    if (owner === '.' || owner === '..' || repo === '.' || repo === '..') return null;

    return { owner: owner, repo: repo };
  }

  /**
   * Whole months between an ISO date string (or Date) and `now`.
   * Returns 0 for future dates and for unparseable input.
   */
  function monthsSincePush(pushedAt, now) {
    var then = pushedAt instanceof Date ? pushedAt.getTime() : new Date(pushedAt).getTime();
    var current = now instanceof Date ? now.getTime() : (typeof now === 'number' ? now : Date.now());
    if (isNaN(then) || isNaN(current) || current <= then) return 0;
    return Math.floor((current - then) / MS_PER_MONTH);
  }

  /**
   * Compute the Resurrection Score. See the formula at the top of this file.
   * @param {{monthsSincePush: number, archived: boolean, openIssues: number}} input
   * @returns {number} integer 0–100
   */
  function computeResurrectionScore(input) {
    var months = Math.max(0, Math.floor(Number(input && input.monthsSincePush) || 0));
    var openIssues = Math.max(0, Math.floor(Number(input && input.openIssues) || 0));
    var archived = Boolean(input && input.archived);

    var recencyPenalty = Math.min(60, months * 2);
    var archivedPenalty = archived ? 25 : 0;
    var backlogPenalty = Math.min(15, Math.floor(openIssues / 20));

    var score = 100 - recencyPenalty - archivedPenalty - backlogPenalty;
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Human verdict for a score.
   *   80–100 Alive · 50–79 Fading · 20–49 Dead · 0–19 Fossilised
   */
  function verdictForScore(score) {
    if (score >= 80) return 'Alive';
    if (score >= 50) return 'Fading';
    if (score >= 20) return 'Dead';
    return 'Fossilised';
  }

  return {
    parseRepoUrl: parseRepoUrl,
    monthsSincePush: monthsSincePush,
    computeResurrectionScore: computeResurrectionScore,
    verdictForScore: verdictForScore
  };
});
