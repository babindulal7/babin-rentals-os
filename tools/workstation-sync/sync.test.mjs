import test from 'node:test';
import assert from 'node:assert/strict';
import { isExpectedOrigin, latestCiRunSucceeded } from './sync.mjs';

const sha = 'a'.repeat(40);
const good = (changes = {}) => ({
  head_sha: sha, head_branch: 'main', event: 'push', name: 'CI',
  path: '.github/workflows/ci.yml', status: 'completed', conclusion: 'success',
  created_at: '2026-11-09T10:00:00Z', run_attempt: 1, ...changes,
});

test('only the intended GitHub origin is accepted', () => {
  for (const remote of [
    'https://github.com/babindulal7/babin-rentals-os.git',
    'git@github.com:babindulal7/babin-rentals-os.git',
    'ssh://git@github.com/babindulal7/babin-rentals-os',
  ]) assert.equal(isExpectedOrigin(remote), true);
  for (const remote of [
    'https://github.com/other/repo.git',
    'https://example.com/babindulal7/babin-rentals-os.git', '',
  ]) assert.equal(isExpectedOrigin(remote), false);
});
test('require exact SHA, main, push, workflow and completed success', () => {
  assert.equal(latestCiRunSucceeded({ workflow_runs: [good()] }, sha), true);
  for (const changes of [
    { head_sha: 'b'.repeat(40) }, { head_branch: 'test' }, { event: 'pull_request' },
    { name: 'other' }, { path: '.github/workflows/untrusted.yml' },
    { conclusion: 'failure' }, { status: 'in_progress' },
  ]) assert.equal(latestCiRunSucceeded({ workflow_runs: [good(changes)] }, sha), false);
  assert.equal(latestCiRunSucceeded({ workflow_runs: [] }, sha), false);
  assert.equal(latestCiRunSucceeded(null, sha), false);
});
test('a stale green attempt cannot override newer failure', () => {
  assert.equal(latestCiRunSucceeded({ workflow_runs: [
    good(), good({ run_attempt: 2, conclusion: 'failure' }),
  ] }, sha), false);
});
