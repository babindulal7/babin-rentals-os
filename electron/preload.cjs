const { contextBridge, ipcRenderer } = require('electron');

// Allowed key pattern matching main process security boundary
const ALLOWED_KEY_REGEX = /^(sb-[a-zA-Z0-9_\-\.]+-(?:auth-token|token)|supabase\.auth\.[a-zA-Z0-9_\-\.]+|app\.[a-zA-Z0-9_\-\.]+|br\.[a-zA-Z0-9_\-\.]+)$/;

function isAuthorizedStorageKey(key) {
  if (typeof key !== 'string') return false;
  if (key.length === 0 || key.length > 256) return false;
  if (key.startsWith('__') || key.includes('..') || key.includes('/') || key.includes('\\')) {
    return false;
  }
  return ALLOWED_KEY_REGEX.test(key);
}

const secureStorageApi = {
  getItem: (key) => {
    if (!isAuthorizedStorageKey(key)) {
      return Promise.reject(new Error(`[SecureStorage] Access to unauthorized key denied: ${key}`));
    }
    return ipcRenderer.invoke('safe-storage-get', key);
  },
  setItem: (key, value) => {
    if (!isAuthorizedStorageKey(key)) {
      return Promise.reject(new Error(`[SecureStorage] Access to unauthorized key denied: ${key}`));
    }
    return ipcRenderer.invoke('safe-storage-set', key, value);
  },
  removeItem: (key) => {
    if (!isAuthorizedStorageKey(key)) {
      return Promise.reject(new Error(`[SecureStorage] Access to unauthorized key denied: ${key}`));
    }
    return ipcRenderer.invoke('safe-storage-remove', key);
  },
};

const electronBridge = {
  isElectron: true,
  platform: process.platform,
  ping: () => 'pong',
  secureStorage: secureStorageApi,
};

contextBridge.exposeInMainWorld('electronAPI', electronBridge);
contextBridge.exposeInMainWorld('electron', electronBridge);
