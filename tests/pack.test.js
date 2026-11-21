'use strict';
/*
 * REVENANT — tests for pack.js using node:test (no dependencies).
 * Run:  node --test tests/pack.test.js
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const P = require('../pack.js');

const SAMPLE = {
  owner: 'someowner',
  repo: 'dead-lib',
  fullName: 'someowner/dead-lib',
  description: 'A once-loved utility library.',
  score: 23,
  verdict: 'Dead',
  monthsSincePush: 41,
  archived: true,
  openIssues: 87,
  language: 'JavaScript',
  stars: 512,
  lastPush: '3 Jun 2023',
  dependencies: { total: 12, checked: 10, outdatedPct: 60, health: 51, deprecated: ['request', 'node-sass'] },
  deprecatedDeps: ['request', 'node-sass']
};

test('generateResurrectionPack returns a slugged .md filename', () => {
  const pack = P.generateResurrectionPack(SAMPLE);
  assert.equal(pack.filename, 'dead-lib-resurrection-pack.md');
  assert.equal(P.generateResurrectionPack({ repo: 'Weird Name!' }).filename,
    'weird-name-resurrection-pack.md');
});

test('pack content contains repo name, score, and all three spec sections', () => {
  const { content } = P.generateResurrectionPack(SAMPLE);
  assert.ok(content.includes('someowner/dead-lib'), 'repo full name missing');
  assert.ok(content.includes('23/100'), 'score missing');
  assert.ok(content.includes('.kiro/specs/dead-lib-resurrection/requirements.md'));
  assert.ok(content.includes('.kiro/specs/dead-lib-resurrection/design.md'));
  assert.ok(content.includes('.kiro/specs/dead-lib-resurrection/tasks.md'));
});

test('pack is tailored with real data: idle months, deprecated deps, outdated %', () => {
  const { content } = P.generateResurrectionPack(SAMPLE);
  assert.ok(content.includes('41'), 'idle months missing');
  assert.ok(content.includes('request'), 'deprecated dep missing');
  assert.ok(content.includes('node-sass'), 'deprecated dep missing');
  assert.ok(content.includes('60%'), 'outdated percentage missing');
  assert.ok(content.includes('87'), 'open issues missing');
});

test('resurrection steps are ordered smallest-first', () => {
  const steps = P.buildResurrectionSteps(SAMPLE);
  const joined = steps.join('\n');
  const verify = joined.indexOf('Verify the current state');
  const patchMinor = joined.indexOf('patch and minor');
  const replaceDeprecated = joined.indexOf('Replace the deprecated dependency');
  const major = joined.indexOf('major-version dependencies one at a time');
  const triage = joined.indexOf('Triage the');
  assert.ok(verify !== -1 && patchMinor !== -1 && replaceDeprecated !== -1 && major !== -1 && triage !== -1);
  assert.ok(verify < patchMinor, 'verification must come before updates');
  assert.ok(patchMinor < major, 'patch/minor updates must come before major upgrades');
  assert.ok(replaceDeprecated < major, 'deprecated replacements must come before major upgrades');
  assert.ok(major < triage, 'backlog triage comes after dependency work');
});

test('one replacement step is generated per deprecated dependency', () => {
  const steps = P.buildResurrectionSteps(SAMPLE);
  const replacements = steps.filter((s) => s.startsWith('Replace the deprecated dependency'));
  assert.equal(replacements.length, 2);
});

test('pack handles a repo with no dependency data gracefully', () => {
  const { content } = P.generateResurrectionPack({
    fullName: 'a/b', repo: 'b', score: 90, verdict: 'Alive', monthsSincePush: 0
  });
  assert.ok(content.includes('dependency autopsy skipped'));
  assert.ok(content.includes('requirements.md'));
});

test('pack never crashes on an empty or malformed analysis object', () => {
  for (const bad of [{}, null, undefined, { score: 'x' }, { repo: 42 }]) {
    const pack = P.generateResurrectionPack(bad);
    assert.ok(typeof pack.content === 'string' && pack.content.length > 0);
    assert.ok(pack.filename.endsWith('-resurrection-pack.md'));
    assert.ok(pack.content.includes('requirements.md'));
  }
});
