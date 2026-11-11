#!/usr/bin/env node
/**
 * Safe multi-workstation sync for Babin Rentals OS.
 * Default is fetch-only. --apply fast-forwards clean main only after the exact
 * main SHA is green in the original GitHub Actions CI workflow.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const REPO = 'babindulal7/babin-rentals-os';
const WORKFLOW = '.github/workflows/ci.yml';

export function isExpectedOrigin(value) {
  return /^(?:https:\/\/github\.com\/|ssh:\/\/git@github\.com\/|git@github\.com:|git:\/\/github\.com\/)(?:babindulal7\/babin-rentals-os)(?:\.git)?\/?$/i.test(value.trim());
}

export function latestCiRunSucceeded(payload, sha) {
  const runs = Array.isArray(payload?.workflow_runs) ? payload.workflow_runs : [];
  const matched = runs.filter((run) => {
    const workflowPath = String(run.path || '').split('@')[0];
    return run.head_sha === sha && run.head_branch === 'main' &&
      run.event === 'push' && run.name === 'CI' &&
      (workflowPath === WORKFLOW || workflowPath.endsWith('/' + WORKFLOW));
  });
  matched.sort((a, b) => {
    const aDate = Date.parse(a.created_at || '') || 0;
    const bDate = Date.parse(b.created_at || '') || 0;
    return bDate - aDate || Number(b.run_attempt || 0) - Number(a.run_attempt || 0);
  });
  return matched.length > 0 && matched[0].status === 'completed' && matched[0].conclusion === 'success';
}

function command(bin, args) {
  return execFileSync(bin, args, {
    cwd: process.cwd(), encoding: 'utf8', timeout: 120_000,
    maxBuffer: 5_000_000, stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}
function git(...args) { return command('git', args); }
function report(status, reason) {
  process.stdout.write('[' + new Date().toISOString() + '] ' + status + ': ' + reason + '\n');
}
function isAncestor(localSha, remoteSha) {
  const result = spawnSync('git', ['merge-base', '--is-ancestor', localSha, remoteSha], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 20_000,
  });
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  throw new Error('Could not verify ancestry: ' + (result.stderr || result.error?.message || 'unknown'));
}
export function run(options = process.argv.slice(2)) {
  if (options.includes('--help')) {
    console.log('Usage: node tools/workstation-sync/sync.mjs [--apply]\nDefault: fetch only. --apply: clean main + successful CI + fast-forward only.');
    return;
  }
  if (options.some((a) => a !== '--apply')) throw new Error('Unexpected argument; use --apply or --help.');
  const apply = options.includes('--apply');
  // Read the configured origin, not an insteadOf-expanded URL.
  const origin = git('config', '--get', 'remote.origin.url');
  if (!isExpectedOrigin(origin)) throw new Error('STOP: origin is not the expected Babin Rentals OS GitHub repository.');

  git('fetch', '--no-tags', 'origin', 'main');
  const target = git('rev-parse', '--verify', 'refs/remotes/origin/main');
  const current = git('rev-parse', '--verify', 'HEAD');
  const branch = git('branch', '--show-current');
  if (!apply) return report('FETCHED', 'origin/main=' + target.slice(0, 12) + '; no working files changed');
  if (process.env.CI || process.env.GITHUB_ACTIONS || process.env.TF_BUILD) {
    return report('SKIPPED', 'CI/runner environment: will not update job workspace');
  }
  if (branch !== 'main') return report('SKIPPED', 'checkout is on ' + (branch || 'detached HEAD'));
  if (current === target) return report('CURRENT', 'local main already at ' + current.slice(0, 12));
  if (git('status', '--porcelain=v1', '--untracked-files=normal')) {
    return report('SKIPPED', 'working tree has local changes or untracked files');
  }
  if (!isAncestor(current, target)) return report('SKIPPED', 'local main has unique commits or has diverged');

  let checks;
  try {
    // Private repo auth comes from this computer's gh login; never store tokens.
    const raw = command('gh', ['api', 'repos/' + REPO + '/actions/runs?branch=main&head_sha=' + target + '&event=push&per_page=30']);
    checks = JSON.parse(raw);
  } catch {
    return report('SKIPPED', 'unable to verify private GitHub CI (gh login, API or network unavailable)');
  }
  if (!latestCiRunSucceeded(checks, target)) {
    return report('SKIPPED', 'no completed successful main CI for SHA ' + target.slice(0, 12));
  }
  if (git('rev-parse', 'HEAD') !== current || git('branch', '--show-current') !== 'main' ||
      git('status', '--porcelain=v1', '--untracked-files=normal')) {
    return report('SKIPPED', 'checkout changed while checking CI');
  }
  git('merge', '--ff-only', target);
  report('UPDATED', current.slice(0, 12) + ' -> ' + target.slice(0, 12) + ' (green CI; fast-forward only)');
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { run(); } catch (error) {
    report('ERROR', error.message || String(error));
    process.exitCode = 1;
  }
}
