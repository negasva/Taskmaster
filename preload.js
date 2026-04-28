const { contextBridge, ipcRenderer } = require('electron');

// Expose safe IPC bridge to the main window renderer
contextBridge.exposeInMainWorld('electronAPI', {
    openPomodoro: (tasks) => ipcRenderer.send('open-pomodoro', tasks),
    onTaskDone: (cb) => ipcRenderer.on('task-done', (_, id) => cb(id)),
    onSessionComplete: (cb) => ipcRenderer.on('session-complete', () => cb()),
    onPomodoroClose: (cb) => ipcRenderer.on('pomodoro-closed', () => cb()),
    minimize: () => ipcRenderer.send('win-minimize'),
    maximize: () => ipcRenderer.send('win-maximize'),
    close: () => ipcRenderer.send('win-hide'),
    loadData: () => ipcRenderer.invoke('load-data'),
    saveData: (data) => ipcRenderer.send('save-data', data),
    getGroqApiKey: () => ipcRenderer.invoke('get-groq-key'),

    // App blocker
    loadAllowedApps: () => ipcRenderer.invoke('load-allowed-apps'),
    saveAllowedApps: (config) => ipcRenderer.send('save-allowed-apps', config),
    onBlockedAppAlert: (cb) => ipcRenderer.on('blocked-app-alert', (_, data) => cb(data)),
    getRunningProcesses: () => ipcRenderer.invoke('get-running-processes'),

    // Web blocker (Extension sync)
    loadBlockedSites: () => ipcRenderer.invoke('load-blocked-sites'),
    saveBlockedSites: (config) => ipcRenderer.send('save-blocked-sites', config),
    onBlockedSitesUpdated: (cb) => ipcRenderer.on('blocked-sites-updated', (_, config) => cb(config)),
});
