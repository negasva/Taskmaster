const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('alertAPI', {
    onShowBlockedApp: (cb) => ipcRenderer.on('show-blocked-app', (_, name) => cb(name)),
    onUpdateBlockedApp: (cb) => ipcRenderer.on('update-blocked-app', (_, name) => cb(name)),
    closeAlert: () => ipcRenderer.send('close-alert-window'),
    allowApp: (name) => ipcRenderer.send('allow-app', name),
});
