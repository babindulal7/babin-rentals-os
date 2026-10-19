const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  ping: () => 'pong',
  secureStorage: {
    getItem: (key) => ipcRenderer.invoke('secure-storage:getItem', key),
    setItem: (key, value) => ipcRenderer.invoke('secure-storage:setItem', key, value),
    removeItem: (key) => ipcRenderer.invoke('secure-storage:removeItem', key),
  },
});
