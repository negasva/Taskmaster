const { contextBridge, ipcRenderer } = require('electron');

// Expose safe IPC bridge to the pomodoro popup renderer
contextBridge.exposeInMainWorld('electronAPI', {
    onInitTasks:   (cb) => ipcRenderer.on('init-tasks',   (_, tasks) => cb(tasks)),
    onUpdateTasks: (cb) => ipcRenderer.on('update-tasks', (_, tasks) => cb(tasks)),
    taskDone:    (id) => ipcRenderer.send('task-done', id),
    sessionDone: ()   => ipcRenderer.send('session-complete'),
});
