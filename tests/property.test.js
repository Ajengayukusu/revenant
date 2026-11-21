'use strict';
/*
 * REVENANT — property-based tests, dependency-free.
 *
 * No fast-check (the app carries zero npm dependencies), so this file
 * ships a tiny seeded PRNG harness (mulberry32): every property runs
 * over at least 200 generated cases, and a failure reproduces exactly
 * from the printed seed + case index.
 *
 * Run:  node --test tests/property.test.js
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const S = require('../score.js');
const D = require('../deps.js');
const P = require('../pack.js');

const CASES = 250; // >= 200 generated cases per property

// ---------- seeded PRNG harness ----------

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRandom(seed) {
  const next = mulberry32(seed);
  return {
    float: () => next(),
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    bool: () => next() < 0.5,
    pick: (arr) => arr[Math.floor(next() * arr.length)]
  };
}

function check(seed, label, generate, property) {
  const rand = makeRandom(seed);
  for (let i = 0; i < CASES; i++) {
    const input = generate(rand);
    assert.ok(property(input),
      `${label} failed for seed=${seed} case=${i} input=${JSON.stringify(input)}`);
  }
}

// ---------- generators ----------

function genScoreInput(rand) {
  return {
    // Deliberately hostile ranges: negatives, floats, huge values.
    monthsSincePush: rand.float() < 0.2 ? -rand.int(0, 50) : rand.int(0, 1200) + rand.float(),
    archived: rand.bool(),
    openIssues: rand.float() < 0.2 ? -rand.int(0, 50) : rand.int(0, 200000)
  };
}

function genDepList(rand) {
  const n = rand.int(0, 12);
  const list = [];
  for (let i = 0; i < n; i++) {
    list.push({
      name: 'pkg-' + i,
      range: '^' + rand.int(0, 5) + '.' + rand.int(0, 9) + '.' + rand.int(0, 9),
      latest: rand.int(0, 6) + '.' + rand.int(0, 9) + '.' + rand.int(0, 9),
      deprecated: rand.bool() ? 'deprecated upstream' : ''
    });
  }
  return list;
}

const NAME_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789-';
function genWord(rand, maxLen) {
  const len = rand.int(1, maxLen);
  let out = '';
  for (let i = 0; i < len; i++) out += NAME_CHARS[Math.floor(rand.float() * NAME_CHARS.length)];
  return out.replace(/^-+|-+$/g, '') || 'repo';
}

function genAnalysis(rand) {
  const owner = genWord(rand, 10);
  const repo = genWord(rand, 12);
  const depCount = rand.int(0, 6);
  const deprecated = [];
  for (let i = 0; i < depCount; i++) deprecated.push('old-' + genWord(rand, 6));
  const score = rand.int(0, 100);
  return {
    owner,
    repo,
    fullName: owner + '/' + repo,
    description: 'Generated repo ' + genWord(rand, 8),
    score,
    verdict: S.verdictForScore(score),
    monthsSincePush: rand.int(0, 120),
    archived: rand.bool(),
    openIssues: rand.int(0, 500),
    language: rand.pick(['JavaScript', 'Python', 'Rust', 'Unknown']),
    stars: rand.int(0, 10000),
    deprecatedDeps: deprecated,
    dependencies: {
      total: depCount + rand.int(0, 5),
      checked: depCount,
      outdatedPct: rand.int(0, 100),
      health: rand.int(0, 100),
      deprecated
    }
  };
}

// ---------- properties: Resurrection Score ----------

test('property: score is always an integer in 0..100 for any inputs', () => {
  check(20261122, 'score range', genScoreInput,
    (input) => {
      const s = S.computeResurrectionScore(input);
      return Number.isInteger(s) && s >= 0 && s <= 100;
    });
});

test('property: adding idle months never raises the score', () => {
  check(424242, 'idle monotonicity', genScoreInput,
    (input) => {
      const before = S.computeResurrectionScore(input);
      const after = S.computeResurrectionScore({
        ...input,
        monthsSincePush: Math.max(0, Math.floor(input.monthsSincePush)) + 13
      });
      return after <= before;
    });
});

test('property: marking a repo archived never raises its score', () => {
  check(777001, 'archived monotonicity', genScoreInput,
    (input) => {
      const before = S.computeResurrectionScore({ ...input, archived: false });
      const after = S.computeResurrectionScore({ ...input, archived: true });
      return after <= before;
    });
});

// ---------- property: dependency health ----------

test('property: deprecated deps never improve the dependency health summary', () => {
  check(31337, 'deprecated monotonicity', genDepList,
    (list) => {
      if (list.length === 0) return true;
      const before = D.summariseDependencies(list);
      // Mark the first not-yet-deprecated dep deprecated (or re-mark all).
      const idx = list.findIndex((d) => !D.isDeprecated(d.deprecated));
      const mutated = list.map((d, i) => (i === idx ? { ...d, deprecated: 'now deprecated' } : d));
      const after = D.summariseDependencies(mutated);
      if (before.health === null || after.health === null) return true;
      return after.health <= before.health && after.deprecatedCount >= before.deprecatedCount;
    });
});

// ---------- property: resurrection pack ----------

test('property: pack output always contains repo name, score, and all three spec sections', () => {
  check(90210, 'pack completeness', genAnalysis,
    (analysis) => {
      const pack = P.generateResurrectionPack(analysis);
      return pack.content.includes(analysis.fullName) &&
        pack.content.includes(String(analysis.score) + '/100') &&
        pack.content.includes('requirements.md') &&
        pack.content.includes('design.md') &&
        pack.content.includes('tasks.md') &&
        pack.filename === analysis.repo + '-resurrection-pack.md';
    });
});
