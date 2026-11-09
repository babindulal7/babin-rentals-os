const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  ping: () => 'pong',
  secureStorage: {
    getItem: (key) => ipcRenderer.invoke('safe-storage-get', key),
    setItem: (key, value) => ipcRenderer.invoke('safe-storage-set', key, value),
    removeItem: (key) => ipcRenderer.invoke('safe-storage-remove', key),
  },
});