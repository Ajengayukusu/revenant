'use strict';
/*
 * REVENANT — tests for deps.js using node:test (no dependencies).
 * Run:  node --test tests/deps.test.js
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const D = require('../deps.js');

// ---------- parseVersion ----------

test('parseVersion extracts semver from plain versions and ranges', () => {
  assert.deepEqual(D.parseVersion('1.2.3'), { major: 1, minor: 2, patch: 3 });
  assert.deepEqual(D.parseVersion('^1.2.3'), { major: 1, minor: 2, patch: 3 });
  assert.deepEqual(D.parseVersion('~2.0'), { major: 2, minor: 0, patch: 0 });
  assert.deepEqual(D.parseVersion('>=3.1.4 <4'), { major: 3, minor: 1, patch: 4 });
  assert.deepEqual(D.parseVersion('5'), { major: 5, minor: 0, patch: 0 });
});

test('parseVersion returns null for non-registry references', () => {
  for (const v of ['*', 'latest', '', 'file:../x', 'git+https://github.com/a/b', 'https://x/y.tgz', null, 42]) {
    assert.equal(D.parseVersion(v), null, `expected null for ${String(v)}`);
  }
});

// ---------- compareVersions ----------

test('compareVersions orders by major, then minor, then patch', () => {
  assert.equal(D.compareVersions('1.2.3', '1.2.3'), 0);
  assert.equal(D.compareVersions('1.2.3', '2.0.0'), -1);
  assert.equal(D.compareVersions('2.0.0', '1.9.9'), 1);
  assert.equal(D.compareVersions('1.3.0', '1.2.9'), 1);
  assert.equal(D.compareVersions('1.2.4', '1.2.3'), 1);
  assert.equal(D.compareVersions('*', '1.0.0'), null);
});

// ---------- classifyOutdated ----------

test('classifyOutdated distinguishes current, minor-behind, major-behind, unknown', () => {
  assert.equal(D.classifyOutdated('^1.2.3', '1.2.3'), 'current');
  assert.equal(D.classifyOutdated('^3.0.0', '2.0.0'), 'current'); // ahead of latest
  assert.equal(D.classifyOutdated('^1.2.3', '1.4.0'), 'minor-behind');
  assert.equal(D.classifyOutdated('^1.2.3', '1.2.9'), 'minor-behind');
  assert.equal(D.classifyOutdated('^1.2.3', '2.0.0'), 'major-behind');
  assert.equal(D.classifyOutdated('*', '2.0.0'), 'unknown');
  assert.equal(D.classifyOutdated('^1.2.3', null), 'unknown');
});

// ---------- extractDependencies / parsePackageJson ----------

test('extractDependencies flattens dependencies and devDependencies with dev flags', () => {
  const pkg = {
    dependencies: { react: '^18.2.0', lodash: '^4.17.21' },
    devDependencies: { jest: '^29.0.0' }
  };
  assert.deepEqual(D.extractDependencies(pkg), [
    { name: 'react', range: '^18.2.0', dev: false },
    { name: 'lodash', range: '^4.17.21', dev: false },
    { name: 'jest', range: '^29.0.0', dev: true }
  ]);
  assert.deepEqual(D.extractDependencies(null), []);
  assert.deepEqual(D.extractDependencies({}), []);
});

test('parsePackageJson parses valid JSON and rejects invalid input', () => {
  const list = D.parsePackageJson('{"dependencies":{"a":"^1.0.0"}}');
  assert.deepEqual(list, [{ name: 'a', range: '^1.0.0', dev: false }]);
  assert.equal(D.parsePackageJson('{not json'), null);
  assert.equal(D.parsePackageJson('42'), null);
  assert.equal(D.parsePackageJson(null), null);
});

// ---------- summariseDependencies ----------

test('summariseDependencies counts totals, outdated %, and deprecated names', () => {
  const s = D.summariseDependencies([
    { name: 'a', range: '^1.0.0', latest: '1.0.0', deprecated: '' },
    { name: 'b', range: '^1.0.0', latest: '2.0.0', deprecated: '' },
    { name: 'c', range: '^1.0.0', latest: '1.1.0', deprecated: 'use d instead' },
    { name: 'e', range: '*', latest: null, deprecated: '' }
  ]);
  assert.equal(s.total, 4);
  assert.equal(s.checked, 3);
  assert.equal(s.outdated, 2);
  assert.equal(s.outdatedPct, 67);
  assert.equal(s.majorBehind, 1);
  assert.equal(s.minorBehind, 1);
  assert.deepEqual(s.deprecated, ['c']);
  assert.equal(s.deprecatedCount, 1);
  assert.ok(Number.isInteger(s.health) && s.health >= 0 && s.health <= 100);
});

test('summariseDependencies: empty set has null health, all-current set has health 100', () => {
  const empty = D.summariseDependencies([]);
  assert.equal(empty.total, 0);
  assert.equal(empty.health, null);
  const fresh = D.summariseDependencies([
    { name: 'a', range: '^1.0.0', latest: '1.0.0', deprecated: '' }
  ]);
  assert.equal(fresh.health, 100);
  assert.equal(fresh.outdatedPct, 0);
});

test('summariseDependencies derives status from range+latest when status is absent, and honours a given status', () => {
  const derived = D.summariseDependencies([{ name: 'a', range: '^1.0.0', latest: '3.0.0' }]);
  assert.equal(derived.outdated, 1);
  const given = D.summariseDependencies([{ name: 'a', status: 'current', latest: null }]);
  assert.equal(given.checked, 1);
  assert.equal(given.outdated, 0);
});
