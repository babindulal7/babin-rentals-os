import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { resolveSecureStoragePath } = require('../electron/secure-storage-path.cjs');

test('keys resolve to one file inside the Electron userData storage folder', () => {
  const userData = path.join(root, 'example-user-data');
  for (const key of ['sb-abc123-auth-token', 'auth.v2', 'app_session_1']) {
    assert.equal(resolveSecureStoragePath(userData, key),
      path.join(userData, 'secure-storage', key));
  }
});

test('reject traversal, invalid strings and Windows special device filenames', () => {
  const userData = path.join(root, 'example-user-data');
  for (const bad of [
    '', '.', '..', '../outside', 'dir/child', 'dir\\child', '/tmp/out',
    'C:\\Windows\\Temp\\out', 'auth\0token', ' auth ', 'äuth', 'a'.repeat(129),
    'CON', 'NUL.txt', 'COM1', 'LPT9.log', null, 5, {}, [],
  ]) {
    assert.throws(() => resolveSecureStoragePath(userData, bad), { name: 'TypeError' });
  }
  assert.throws(() => resolveSecureStoragePath('', 'session'), { name: 'TypeError' });
});

test('Electron main wires a validated key and has no phantom electron-store dependency', () => {
  const source = readFileSync(path.join(root, 'electron', 'main.cjs'), 'utf8');
  assert.doesNotMatch(source, /require\(['"]electron-store['"]\)/);
  assert.match(source, /resolveSecureStoragePath\(app\.getPath\('userData'\), key\)/);
  assert.match(source, /isTrustedStorageSender\(event\)/);
});
