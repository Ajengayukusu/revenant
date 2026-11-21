'use strict';
/*
 * REVENANT — tests for score.js using node:test (no dependencies).
 * Run:  node --test tests/score.test.js
 * (from the revenant/ directory)
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const S = require('../score.js');

// ---------- parseRepoUrl ----------

test('parseRepoUrl accepts a full GitHub URL', () => {
  assert.deepEqual(S.parseRepoUrl('https://github.com/facebook/react'),
    { owner: 'facebook', repo: 'react' });
});

test('parseRepoUrl accepts trailing slash, .git, extra paths, and owner/repo shorthand', () => {
  assert.deepEqual(S.parseRepoUrl('https://github.com/facebook/react/'),
    { owner: 'facebook', repo: 'react' });
  assert.deepEqual(S.parseRepoUrl('https://github.com/facebook/react.git'),
    { owner: 'facebook', repo: 'react' });
  assert.deepEqual(S.parseRepoUrl('https://github.com/facebook/react/issues'),
    { owner: 'facebook', repo: 'react' });
  assert.deepEqual(S.parseRepoUrl('facebook/react'),
    { owner: 'facebook', repo: 'react' });
});

test('parseRepoUrl rejects non-GitHub and malformed input', () => {
  assert.equal(S.parseRepoUrl('https://gitlab.com/facebook/react'), null);
  assert.equal(S.parseRepoUrl('https://example.com/facebook/react'), null);
  assert.equal(S.parseRepoUrl('not a url'), null);
  assert.equal(S.parseRepoUrl('https://github.com/onlyowner'), null);
  assert.equal(S.parseRepoUrl(''), null);
  assert.equal(S.parseRepoUrl(null), null);
  assert.equal(S.parseRepoUrl(42), null);
});

// ---------- monthsSincePush ----------

test('monthsSincePush counts whole months and never goes negative', () => {
  const now = new Date('2026-11-22T00:00:00Z');
  assert.equal(S.monthsSincePush('2026-11-01T00:00:00Z', now), 0);
  assert.equal(S.monthsSincePush('2026-05-22T00:00:00Z', now), 6);
  assert.equal(S.monthsSincePush('2027-01-01T00:00:00Z', now), 0); // future
  assert.equal(S.monthsSincePush('not-a-date', now), 0);
});

// ---------- computeResurrectionScore ----------

test('a repo pushed this month with no backlog scores 100', () => {
  assert.equal(S.computeResurrectionScore({ monthsSincePush: 0, archived: false, openIssues: 0 }), 100);
});

test('recency penalty is 2 points per idle month, capped at 60', () => {
  assert.equal(S.computeResurrectionScore({ monthsSincePush: 10, archived: false, openIssues: 0 }), 80);
  assert.equal(S.computeResurrectionScore({ monthsSincePush: 30, archived: false, openIssues: 0 }), 40);
  assert.equal(S.computeResurrectionScore({ monthsSincePush: 120, archived: false, openIssues: 0 }), 40);
});

test('archived penalty is 25 and the score floors at 0', () => {
  assert.equal(S.computeResurrectionScore({ monthsSincePush: 0, archived: true, openIssues: 0 }), 75);
  assert.equal(S.computeResurrectionScore({ monthsSincePush: 999, archived: true, openIssues: 99999 }), 0);
});

test('backlog penalty is 1 point per 20 open issues, capped at 15', () => {
  assert.equal(S.computeResurrectionScore({ monthsSincePush: 0, archived: false, openIssues: 19 }), 100);
  assert.equal(S.computeResurrectionScore({ monthsSincePush: 0, archived: false, openIssues: 20 }), 99);
  assert.equal(S.computeResurrectionScore({ monthsSincePush: 0, archived: false, openIssues: 1000 }), 85);
});

test('score is always an integer in 0..100 (spot-checked invariants)', () => {
  for (const months of [0, 1, 7, 29, 30, 31, 500]) {
    for (const archived of [true, false]) {
      for (const openIssues of [0, 1, 20, 300, 100000]) {
        const s = S.computeResurrectionScore({ monthsSincePush: months, archived, openIssues });
        assert.ok(Number.isInteger(s) && s >= 0 && s <= 100, `score ${s} out of range`);
      }
    }
  }
});

test('monotonicity: longer idle / archived / more issues never raise the score', () => {
  const base = { monthsSincePush: 5, archived: false, openIssues: 40 };
  const baseScore = S.computeResurrectionScore(base);
  assert.ok(S.computeResurrectionScore({ ...base, monthsSincePush: 6 }) <= baseScore);
  assert.ok(S.computeResurrectionScore({ ...base, archived: true }) <= baseScore);
  assert.ok(S.computeResurrectionScore({ ...base, openIssues: 41 }) <= baseScore);
});

// ---------- verdictForScore ----------

test('verdict bands', () => {
  assert.equal(S.verdictForScore(100), 'Alive');
  assert.equal(S.verdictForScore(80), 'Alive');
  assert.equal(S.verdictForScore(79), 'Fading');
  assert.equal(S.verdictForScore(50), 'Fading');
  assert.equal(S.verdictForScore(49), 'Dead');
  assert.equal(S.verdictForScore(20), 'Dead');
  assert.equal(S.verdictForScore(19), 'Fossilised');
  assert.equal(S.verdictForScore(0), 'Fossilised');
});
