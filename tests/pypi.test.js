'use strict';
/*
 * REVENANT — tests for pypi.js using node:test (no dependencies).
 * Run:  node --test tests/pypi.test.js
 * (from the revenant/ directory)
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Py = require('../pypi.js');

// -----------------------------------------------------------------------
// parseRequirementsTxt
// -----------------------------------------------------------------------

test('parseRequirementsTxt: plain package names', () => {
  const result = Py.parseRequirementsTxt('requests\nflask\n');
  assert.deepEqual(result, [
    { name: 'requests', spec: null },
    { name: 'flask', spec: null }
  ]);
});

test('parseRequirementsTxt: pinned versions (==)', () => {
  const result = Py.parseRequirementsTxt('requests==2.28.0\nflask==2.3.1');
  assert.deepEqual(result, [
    { name: 'requests', spec: '==2.28.0' },
    { name: 'flask', spec: '==2.3.1' }
  ]);
});

test('parseRequirementsTxt: range specifiers', () => {
  const result = Py.parseRequirementsTxt('django>=3.2,<5.0');
  assert.deepEqual(result, [
    { name: 'django', spec: '>=3.2,<5.0' }
  ]);
});

test('parseRequirementsTxt: compatible release (~=)', () => {
  const result = Py.parseRequirementsTxt('numpy~=1.24.0');
  assert.deepEqual(result, [
    { name: 'numpy', spec: '~=1.24.0' }
  ]);
});

test('parseRequirementsTxt: skips blank lines and full-line comments', () => {
  const text = `
# This is a comment
requests==2.28.0

# Another comment
flask
`;
  const result = Py.parseRequirementsTxt(text);
  assert.deepEqual(result, [
    { name: 'requests', spec: '==2.28.0' },
    { name: 'flask', spec: null }
  ]);
});

test('parseRequirementsTxt: strips trailing comments', () => {
  const result = Py.parseRequirementsTxt('requests==2.28.0 # HTTP library\nflask # web framework');
  assert.deepEqual(result, [
    { name: 'requests', spec: '==2.28.0' },
    { name: 'flask', spec: null }
  ]);
});

test('parseRequirementsTxt: skips option lines (-r, -c, -i, --index-url, -e)', () => {
  const text = `-r base.txt
-c constraints.txt
-i https://pypi.org/simple/
--index-url https://pypi.org/simple/
-e .
-e git+https://github.com/owner/repo.git#egg=pkg
requests==2.28.0
`;
  const result = Py.parseRequirementsTxt(text);
  assert.deepEqual(result, [
    { name: 'requests', spec: '==2.28.0' }
  ]);
});

test('parseRequirementsTxt: drops environment markers (after ;)', () => {
  const result = Py.parseRequirementsTxt('requests>=2.0; python_version>="3.6"\nwin-inet-pton; sys_platform=="win32"');
  assert.equal(result[0].name, 'requests');
  assert.equal(result[0].spec, '>=2.0');
  assert.equal(result[1].name, 'win-inet-pton');
  assert.equal(result[1].spec, null);
});

test('parseRequirementsTxt: strips extras from package names', () => {
  const result = Py.parseRequirementsTxt('Pillow[jpeg,webp]>=9.0\nrequests[security]');
  assert.equal(result[0].name, 'Pillow');
  assert.equal(result[0].spec, '>=9.0');
  assert.equal(result[1].name, 'requests');
  assert.equal(result[1].spec, null);
});

test('parseRequirementsTxt: handles continuation lines', () => {
  const text = 'requests>=2.0,\\\n<3.0';
  const result = Py.parseRequirementsTxt(text);
  assert.equal(result.length, 1);
  assert.equal(result[0].name, 'requests');
});

test('parseRequirementsTxt: returns empty array for empty or non-string input', () => {
  assert.deepEqual(Py.parseRequirementsTxt(''), []);
  assert.deepEqual(Py.parseRequirementsTxt(null), []);
  assert.deepEqual(Py.parseRequirementsTxt(42), []);
  assert.deepEqual(Py.parseRequirementsTxt('   \n   \n'), []);
});

// -----------------------------------------------------------------------
// parsePyprojectDependencies
// -----------------------------------------------------------------------

test('parsePyprojectDependencies: extracts [project] dependencies array', () => {
  const text = `
[build-system]
requires = ["hatchling"]

[project]
name = "myapp"
version = "1.0.0"
dependencies = [
    "requests>=2.28.0",
    "flask==2.3.1",
    "numpy",
]

[project.optional-dependencies]
dev = ["pytest"]
`;
  const result = Py.parsePyprojectDependencies(text);
  assert.deepEqual(result, [
    { name: 'requests', spec: '>=2.28.0' },
    { name: 'flask', spec: '==2.3.1' },
    { name: 'numpy', spec: null }
  ]);
});

test('parsePyprojectDependencies: inline array on a single line', () => {
  const text = `
[project]
name = "myapp"
dependencies = ["requests>=2.0", "flask"]
`;
  const result = Py.parsePyprojectDependencies(text);
  assert.deepEqual(result, [
    { name: 'requests', spec: '>=2.0' },
    { name: 'flask', spec: null }
  ]);
});

test('parsePyprojectDependencies: ignores dependencies outside [project]', () => {
  const text = `
[tool.poetry.dependencies]
requests = "^2.28.0"

[project]
name = "myapp"
dependencies = ["flask==2.3.1"]
`;
  const result = Py.parsePyprojectDependencies(text);
  assert.deepEqual(result, [
    { name: 'flask', spec: '==2.3.1' }
  ]);
});

test('parsePyprojectDependencies: empty dependencies array', () => {
  const text = `
[project]
name = "myapp"
dependencies = []
`;
  assert.deepEqual(Py.parsePyprojectDependencies(text), []);
});

test('parsePyprojectDependencies: no [project] section returns empty', () => {
  const text = `
[build-system]
requires = ["setuptools"]
`;
  assert.deepEqual(Py.parsePyprojectDependencies(text), []);
});

test('parsePyprojectDependencies: returns empty for non-string input', () => {
  assert.deepEqual(Py.parsePyprojectDependencies(null), []);
  assert.deepEqual(Py.parsePyprojectDependencies(42), []);
});

test('parsePyprojectDependencies: handles extras and environment markers', () => {
  const text = `
[project]
dependencies = [
    "Pillow[jpeg]>=9.0",
    "requests[security]>=2.0; python_version>='3.8'",
]
`;
  const result = Py.parsePyprojectDependencies(text);
  assert.equal(result[0].name, 'Pillow');
  assert.equal(result[0].spec, '>=9.0');
  assert.equal(result[1].name, 'requests');
  assert.equal(result[1].spec, '>=2.0');
});

// -----------------------------------------------------------------------
// classifyPypiDependency
// -----------------------------------------------------------------------

test('classifyPypiDependency: current when declaredMin >= latestVersion', () => {
  const result = Py.classifyPypiDependency({
    name: 'requests', declaredMin: '2.28.0', latestVersion: '2.28.0',
    latestReleaseMonthsAgo: 10
  });
  assert.equal(result.status, 'current');
  assert.equal(result.stale, false);
});

test('classifyPypiDependency: current when declaredMin ahead of latest', () => {
  const result = Py.classifyPypiDependency({
    name: 'mylib', declaredMin: '3.0.0', latestVersion: '2.9.0',
    latestReleaseMonthsAgo: 5
  });
  assert.equal(result.status, 'current');
});

test('classifyPypiDependency: outdated when declaredMin < latestVersion', () => {
  const result = Py.classifyPypiDependency({
    name: 'django', declaredMin: '3.2.0', latestVersion: '4.2.0',
    latestReleaseMonthsAgo: 2
  });
  assert.equal(result.status, 'outdated');
  assert.equal(result.stale, false);
});

test('classifyPypiDependency: unknown when declaredMin is null', () => {
  const result = Py.classifyPypiDependency({
    name: 'somelib', declaredMin: null, latestVersion: '1.0.0',
    latestReleaseMonthsAgo: 5
  });
  assert.equal(result.status, 'unknown');
});

test('classifyPypiDependency: unknown when latestVersion is null (package not on PyPI / 404)', () => {
  const result = Py.classifyPypiDependency({
    name: 'private-pkg', declaredMin: '1.0.0', latestVersion: null,
    latestReleaseMonthsAgo: null
  });
  assert.equal(result.status, 'unknown');
});

test('classifyPypiDependency: stale boundary — exactly 36 months is NOT stale', () => {
  const result = Py.classifyPypiDependency({
    name: 'oldlib', declaredMin: '1.0.0', latestVersion: '1.0.0',
    latestReleaseMonthsAgo: 36
  });
  assert.equal(result.stale, false);
});

test('classifyPypiDependency: stale boundary — 37 months IS stale', () => {
  const result = Py.classifyPypiDependency({
    name: 'oldlib', declaredMin: '1.0.0', latestVersion: '1.0.0',
    latestReleaseMonthsAgo: 37
  });
  assert.equal(result.stale, true);
});

test('classifyPypiDependency: stale boundary — 35 months is NOT stale', () => {
  const result = Py.classifyPypiDependency({
    name: 'oldlib', declaredMin: '1.0.0', latestVersion: '1.0.0',
    latestReleaseMonthsAgo: 35
  });
  assert.equal(result.stale, false);
});

test('classifyPypiDependency: stale=true can coexist with status=outdated', () => {
  const result = Py.classifyPypiDependency({
    name: 'zombie', declaredMin: '0.1.0', latestVersion: '0.2.0',
    latestReleaseMonthsAgo: 50
  });
  assert.equal(result.status, 'outdated');
  assert.equal(result.stale, true);
});

test('classifyPypiDependency: stale=true with status=unknown (no declared version, old package)', () => {
  const result = Py.classifyPypiDependency({
    name: 'ghostlib', declaredMin: null, latestVersion: '0.1.0',
    latestReleaseMonthsAgo: 100
  });
  assert.equal(result.status, 'unknown');
  assert.equal(result.stale, true);
});

// -----------------------------------------------------------------------
// summarisePypiDependencies
// -----------------------------------------------------------------------

test('summarisePypiDependencies: empty array yields null health', () => {
  const s = Py.summarisePypiDependencies([]);
  assert.equal(s.health, null);
  assert.equal(s.total, 0);
  assert.equal(s.known, 0);
  assert.equal(s.outdated, 0);
  assert.equal(s.stale, 0);
});

test('summarisePypiDependencies: all current, none stale — health 100', () => {
  const s = Py.summarisePypiDependencies([
    { name: 'a', status: 'current', stale: false },
    { name: 'b', status: 'current', stale: false }
  ]);
  assert.equal(s.health, 100);
  assert.equal(s.total, 2);
  assert.equal(s.known, 2);
  assert.equal(s.outdated, 0);
  assert.equal(s.stale, 0);
});

test('summarisePypiDependencies: mixed results compute health correctly', () => {
  // 4 total: a=current, b=outdated, c=unknown, d=current+stale
  // known = 3 (a, b, d — c is unknown so excluded from denominator)
  // outdated = 1 (b)
  // stale = 1 (d)
  // outdatedPct = round(1/3 * 100) = 33
  // stalePct    = round(1/4 * 100) = 25
  // health      = round(100 - 33*0.7 - 25*0.3) = round(100 - 23.1 - 7.5) = round(69.4) = 69
  const s = Py.summarisePypiDependencies([
    { name: 'a', status: 'current', stale: false },
    { name: 'b', status: 'outdated', stale: false },
    { name: 'c', status: 'unknown', stale: false },
    { name: 'd', status: 'current', stale: true }
  ]);
  assert.equal(s.total, 4);
  assert.equal(s.known, 3);
  assert.equal(s.outdated, 1);
  assert.equal(s.stale, 1);
  assert.ok(Number.isInteger(s.health));
  assert.ok(s.health >= 0 && s.health <= 100);
  assert.equal(s.health, 69);
});

test('summarisePypiDependencies: health is always in 0–100', () => {
  // Worst case: everything outdated and stale
  const worst = Py.summarisePypiDependencies([
    { name: 'a', status: 'outdated', stale: true },
    { name: 'b', status: 'outdated', stale: true },
    { name: 'c', status: 'outdated', stale: true }
  ]);
  assert.ok(worst.health >= 0 && worst.health <= 100);
  assert.equal(worst.health, 0);
});

test('summarisePypiDependencies: flagging a dep stale never raises health (invariant)', () => {
  // Start with a baseline set
  const baseline = [
    { name: 'a', status: 'current', stale: false },
    { name: 'b', status: 'current', stale: false },
    { name: 'c', status: 'outdated', stale: false }
  ];
  const baseHealth = Py.summarisePypiDependencies(baseline).health;

  // Flip one dep to stale — health should not increase
  const withStale = [
    { name: 'a', status: 'current', stale: true },
    { name: 'b', status: 'current', stale: false },
    { name: 'c', status: 'outdated', stale: false }
  ];
  const staleHealth = Py.summarisePypiDependencies(withStale).health;
  assert.ok(staleHealth <= baseHealth,
    'Making a dep stale raised health from ' + baseHealth + ' to ' + staleHealth);

  // Flip another dep to stale — still should not increase
  const withMoreStale = [
    { name: 'a', status: 'current', stale: true },
    { name: 'b', status: 'current', stale: true },
    { name: 'c', status: 'outdated', stale: false }
  ];
  const moreStaleHealth = Py.summarisePypiDependencies(withMoreStale).health;
  assert.ok(moreStaleHealth <= staleHealth,
    'Adding another stale dep raised health from ' + staleHealth + ' to ' + moreStaleHealth);
});

test('summarisePypiDependencies: outdated count and percentage respect known-only denominator', () => {
  // 1 outdated out of 2 known (1 unknown ignored in denominator)
  const s = Py.summarisePypiDependencies([
    { name: 'a', status: 'outdated', stale: false },
    { name: 'b', status: 'current', stale: false },
    { name: 'c', status: 'unknown', stale: false }
  ]);
  assert.equal(s.known, 2);
  assert.equal(s.outdated, 1);
  assert.equal(s.outdatedPct, 50);
});

// -----------------------------------------------------------------------
// extractMinVersion (internal, exposed for testing)
// -----------------------------------------------------------------------

test('extractMinVersion: pinned spec', () => {
  assert.equal(Py.extractMinVersion('==1.2.3'), '1.2.3');
});

test('extractMinVersion: range picks smallest', () => {
  assert.equal(Py.extractMinVersion('>=1.0,<2'), '1.0');
});

test('extractMinVersion: compatible release', () => {
  assert.equal(Py.extractMinVersion('~=2.1.0'), '2.1.0');
});

test('extractMinVersion: null for no version', () => {
  assert.equal(Py.extractMinVersion(null), null);
  assert.equal(Py.extractMinVersion(''), null);
  assert.equal(Py.extractMinVersion('*'), null);
});
