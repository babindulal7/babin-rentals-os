'use strict';

const path = require('node:path');

// Never interpret a renderer-supplied key as a path, including Windows devices.
const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const WINDOWS_DEVICE = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

function resolveSecureStoragePath(userDataPath, key) {
  if (typeof userDataPath !== 'string' || !userDataPath.trim()) {
    throw new TypeError('Invalid Electron user data directory');
  }
  if (typeof key !== 'string' || !KEY_PATTERN.test(key) || WINDOWS_DEVICE.test(key)) {
    throw new TypeError('Invalid secure-storage key');
  }
  const directory = path.resolve(userDataPath, 'secure-storage');
  const file = path.resolve(directory, key);
  if (path.dirname(file) !== directory) {
    throw new TypeError('Secure-storage key escapes its directory');
  }
  return file;
}

module.exports = { resolveSecureStoragePath };
