require('dotenv').config();
const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { execSync } = require('child_process');

// Disable GPU Cache to avoid "Access Denied" errors on Windows
app.commandLine.appendSwitch('disable-gpu-cache');
app.commandLine.appendSwitch('disable-http-cache');

let mainWindow = null;
let pomodoroWindow = null;
let alertWindow = null;
let tray = null;
let isQuitting = false;
let blockerInterval = null;

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        // Someone tried to run a second instance, we should focus our window.
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
        }
    });
}

// ===== Auto-start on boot =====
function setupAutoStart() {
    app.setLoginItemSettings({
        openAtLogin: true,
        path: process.execPath,
        args: ['--startup'],
    });
}

// ===== Allowed apps config =====
const ALLOWED_APPS_FILE = () => path.join(app.getPath('userData'), 'allowed_apps.json');
const BLOCKED_SITES_FILE = () => path.join(app.getPath('userData'), 'blocked_sites.json');

// Default system processes that are always allowed (never block these)
const SYSTEM_APPS = [
    'explorer', 'svchost', 'csrss', 'wininit', 'winlogon', 'lsass', 'services',
    'smss', 'system', 'idle', 'dwm', 'taskhostw', 'runtimebroker',
    'shellexperiencehost', 'startmenuexperiencehost', 'searchhost', 'searchui',
    'sihost', 'fontdrvhost', 'ctfmon', 'conhost', 'dllhost', 'msiexec',
    'spoolsv', 'securityhealthsystray', 'securityhealthservice', 'msedgewebview2',
    'applicationframehost', 'textinputhost', 'widgetservice', 'widgets',
    'comppkgsrv', 'registry', 'lsaiso', 'memory compression', 'audiodg',
    'searchindexer', 'searchprotocolhost', 'searchfilterhost', 'wmiprvse',
    'taskmgr', 'cmd', 'powershell', 'pwsh', 'windowsterminal', 'wt',
    'electron', 'taskmaster', 'node', 'npm', 'npx',
    'nvidia share', 'nvcontainer', 'nvidia web helper', 'nvspcaps64',
    'nvdisplay.container', 'nvtelemetrycontainer',
    'msmpeng', 'nissrv', 'sgrmbroker',
    'crashpad_handler', 'gpu-process', 'utility', 'broker',
    'lockapp', 'logonui', 'consent', 'credential', 'wudfhost',
    'dashost', 'uhssvc', 'gameinputsvc', 'wlanext',
];

function loadAllowedApps() {
    try {
        const filePath = ALLOWED_APPS_FILE();
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
    } catch (e) { console.error('Error loading allowed apps:', e); }
    // Default allowed apps
    return {
        enabled: true,
        startHour: 8,
        endHour: 17,
        apps: [
            { name: 'chrome', displayName: 'Google Chrome' },
            { name: 'msedge', displayName: 'Microsoft Edge' },
            { name: 'firefox', displayName: 'Firefox' },
            { name: 'code', displayName: 'Visual Studio Code' },
            { name: 'devenv', displayName: 'Visual Studio' },
            { name: 'winword', displayName: 'Microsoft Word' },
            { name: 'excel', displayName: 'Microsoft Excel' },
            { name: 'powerpnt', displayName: 'Microsoft PowerPoint' },
            { name: 'outlook', displayName: 'Microsoft Outlook' },
            { name: 'teams', displayName: 'Microsoft Teams' },
            { name: 'slack', displayName: 'Slack' },
            { name: 'notepad', displayName: 'Notepad' },
            { name: 'notepad++', displayName: 'Notepad++' },
            { name: 'windowsterminal', displayName: 'Windows Terminal' },
        ]
    };
}

function saveAllowedApps(config) {
    try {
        fs.writeFileSync(ALLOWED_APPS_FILE(), JSON.stringify(config, null, 2));
    } catch (e) { console.error('Error saving allowed apps:', e); }
}

function loadBlockedSites() {
    try {
        const filePath = BLOCKED_SITES_FILE();
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
    } catch (e) { }
    return null; // El extension tiene sus propios defaults
}

function saveBlockedSites(config) {
    try {
        fs.writeFileSync(BLOCKED_SITES_FILE(), JSON.stringify(config, null, 2));
    } catch (e) { console.error('Error saving blocked sites:', e); }
}

// ===== API Server for Extension =====
let apiServer = null;

function startApiServer() {
    apiServer = http.createServer((req, res) => {
        // CORS
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        if (req.url === '/api/status' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ running: true, hour: new Date().getHours() }));
        }
        else if (req.url === '/api/blocked-sites' && req.method === 'GET') {
            const config = loadBlockedSites();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(config));
        }
        else if (req.url === '/api/blocked-sites' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk.toString(); });
            req.on('end', () => {
                try {
                    const config = JSON.parse(body);
                    saveBlockedSites(config);
                    // Notificar a la ventana principal si está abierta
                    mainWindow?.webContents.send('blocked-sites-updated', config);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true }));
                } catch (e) {
                    res.writeHead(400);
                    res.end();
                }
            });
        }
        else {
            res.writeHead(404);
            res.end();
        }
    });

    apiServer.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.log('API Server port 47700 already in use, skipping...');
        } else {
            console.error('API Server error:', err);
        }
    });

    apiServer.listen(47700, 'localhost', () => {
        console.log('API Server para extensión activo en http://localhost:47700');
    });
}

// ===== Process monitoring =====
const { spawn } = require('child_process');
let activeWindowProcess = '';
let psMonitor = null;

function startForegroundMonitor() {
    if (psMonitor) return;

    // Improved monitor loop with safer escaping
    const monitorLoop = () => {
        try {
            const cmd = `powershell -NoProfile -Command "Get-Process | Where-Object {$_.MainWindowHandle -eq (Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class W {[DllImport(\\"user32.dll\\")] public static extern IntPtr GetForegroundWindow();}' -PassThru)::GetForegroundWindow()} | Select-Object -ExpandProperty ProcessName"`;
            const out = execSync(cmd, { encoding: 'utf8', windowsHide: true }).trim();
            if (out) {
                activeWindowProcess = out.toLowerCase();
                checkBlockedApps();
            }
        } catch (e) { }
    };

    setInterval(monitorLoop, 1500);
}

function checkBlockedApps() {
    const config = loadAllowedApps();
    if (!config.enabled) return;

    const now = new Date();
    const hour = now.getHours();
    if (hour < config.startHour || hour >= config.endHour) return;

    const proc = activeWindowProcess;
    if (!proc || proc === 'electron' || proc === 'taskmaster') return;

    const allowedNames = config.apps.map(a => a.name.toLowerCase());
    const allAllowed = [...SYSTEM_APPS, ...allowedNames];

    // Si el nombre exacto está permitido, no hacer nada
    if (allAllowed.includes(proc)) return;

    // Lógica avanzada: Solo bloquear si es una ventana real con título.
    // Muchos "subtasks" o servicios (como Cpumetricsserver) no tienen título de ventana principal.
    try {
        const checkCmd = `powershell -NoProfile -Command "(Get-Process -Name '${proc}' -ErrorAction SilentlyContinue | Where-Object {$_.MainWindowTitle -ne ''}).Count"`;
        const hasWindowTitle = execSync(checkCmd, { encoding: 'utf8', windowsHide: true }).trim();

        if (hasWindowTitle === "" || hasWindowTitle === "0") {
            // Es un proceso sin ventana visible (background/subtask), lo permitimos
            return;
        }
    } catch (e) {
        // Si hay error en el check, por seguridad no bloqueamos
        return;
    }

    console.log('--- APP BLOQUEADA DETECTADA:', proc);
    showBlockedAlert(proc);
}

function showBlockedAlert(processName) {
    if (alertWindow && !alertWindow.isDestroyed()) {
        alertWindow.webContents.send('update-blocked-app', processName);
        if (!alertWindow.isVisible()) alertWindow.show();
        alertWindow.focus();
        return;
    }

    alertWindow = new BrowserWindow({
        width: 520,
        height: 520,
        alwaysOnTop: true,
        frame: false,
        transparent: true,
        center: true,
        icon: path.join(__dirname, 'logo-icono.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload-alert.js'),
            contextIsolation: true,
        },
    });

    alertWindow.loadFile('alert.html');
    alertWindow.once('ready-to-show', () => {
        alertWindow.show();
        alertWindow.webContents.send('show-blocked-app', processName);
    });
}

function startBlockerMonitor() {
    startForegroundMonitor();
}

// Build a 16x16 blue circle tray icon from raw RGBA bytes
function makeTrayIcon() {
    try {
        const iconPath = path.join(__dirname, 'logo-icono.png');
        if (fs.existsSync(iconPath)) {
            return nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
        }
    } catch (e) {
        console.error('Error loading tray icon:', e);
    }
    // Fallback: draw a blue circle if image fails
    const size = 16;
    const buf = Buffer.alloc(size * size * 4);
    for (let i = 0; i < size * size; i++) {
        const x = i % size, y = Math.floor(i / size);
        const inside = Math.hypot(x - 7.5, y - 7.5) <= 6.5;
        buf[i * 4] = inside ? 37 : 0;   // R
        buf[i * 4 + 1] = inside ? 99 : 0;   // G
        buf[i * 4 + 2] = inside ? 235 : 0;   // B
        buf[i * 4 + 3] = inside ? 255 : 0;   // A
    }
    return nativeImage.createFromBuffer(buf, { width: size, height: size });
}

function createMain() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 820,
        minWidth: 780,
        minHeight: 560,
        frame: false,               // custom titlebar
        backgroundColor: '#F7F8FA',
        icon: path.join(__dirname, 'logo-icono.png'),
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    mainWindow.loadFile('index.html');
    mainWindow.maximize();
    mainWindow.once('ready-to-show', () => mainWindow.show());

    // Close button hides to tray instead of quitting
    mainWindow.on('close', (e) => {
        if (!isQuitting) {
            e.preventDefault();
            mainWindow.hide();
        }
    });
}

function createTray() {
    try {
        tray = new Tray(makeTrayIcon());
    } catch (_) {
        tray = new Tray(nativeImage.createEmpty());
    }

    tray.setToolTip('Taskmaster');

    tray.setContextMenu(Menu.buildFromTemplate([
        {
            label: 'Open Taskmaster',
            click: () => { mainWindow.show(); mainWindow.focus(); },
        },
        { type: 'separator' },
        {
            label: 'Quit',
            click: () => { isQuitting = true; app.quit(); },
        },
    ]));

    // Single click to show/focus
    tray.on('click', () => {
        if (mainWindow.isVisible()) {
            mainWindow.focus();
        } else {
            mainWindow.show();
        }
    });
}

function openPomodoro(tasks) {
    // If already open, just refresh tasks and bring to front
    if (pomodoroWindow && !pomodoroWindow.isDestroyed()) {
        pomodoroWindow.webContents.send('update-tasks', tasks);
        pomodoroWindow.show();
        pomodoroWindow.focus();
        return;
    }

    pomodoroWindow = new BrowserWindow({
        width: 360,
        height: 540,
        resizable: false,
        alwaysOnTop: true,
        frame: false,
        icon: path.join(__dirname, 'logo-icono.png'),
        backgroundColor: '#FFFFFF',
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload-pomodoro.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    pomodoroWindow.loadFile('pomodoro.html');

    pomodoroWindow.once('ready-to-show', () => {
        pomodoroWindow.show();
        pomodoroWindow.webContents.send('init-tasks', tasks);
    });

    pomodoroWindow.on('closed', () => {
        pomodoroWindow = null;
        mainWindow?.webContents.send('pomodoro-closed');
    });
}

// IPC from renderer -> main
ipcMain.on('open-pomodoro', (_, tasks) => openPomodoro(tasks));
ipcMain.on('task-done', (_, id) => mainWindow?.webContents.send('task-done', id));
ipcMain.on('session-complete', () => {
    mainWindow?.webContents.send('session-complete');
    pomodoroWindow?.close();
});
ipcMain.on('win-minimize', () => mainWindow?.minimize());
ipcMain.on('win-maximize', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize());
ipcMain.on('win-hide', () => mainWindow?.hide());

ipcMain.handle('load-data', () => {
    const dataPath = path.join(app.getPath('userData'), 'taskmaster_data.json');
    try {
        if (fs.existsSync(dataPath)) {
            return JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        }
    } catch (e) { console.error(e); }
    return {};
});

ipcMain.on('save-data', (_, data) => {
    const dataPath = path.join(app.getPath('userData'), 'taskmaster_data.json');
    try {
        fs.writeFileSync(dataPath, JSON.stringify(data));
    } catch (e) { console.error(e); }
});

// ===== Blocker IPC =====
ipcMain.handle('load-allowed-apps', () => {
    return loadAllowedApps();
});

ipcMain.on('save-allowed-apps', (_, config) => {
    saveAllowedApps(config);
});

ipcMain.handle('load-blocked-sites', () => {
    return loadBlockedSites();
});

ipcMain.on('save-blocked-sites', (_, config) => {
    saveBlockedSites(config);
});

ipcMain.on('close-alert-window', () => {
    if (alertWindow && !alertWindow.isDestroyed()) {
        alertWindow.close();
    }
});

ipcMain.on('allow-app', (_, appName) => {
    const config = loadAllowedApps();
    const normalized = appName.toLowerCase();
    // Don't add duplicates
    if (!config.apps.some(a => a.name.toLowerCase() === normalized)) {
        config.apps.push({ name: normalized, displayName: appName });
        saveAllowedApps(config);
        console.log('App permitida añadida:', appName);
    }
    // Close the alert
    if (alertWindow && !alertWindow.isDestroyed()) {
        alertWindow.close();
    }
});

ipcMain.handle('get-running-processes', () => {
    return getRunningProcesses();
});

app.whenReady().then(() => {
    // Auto-start on boot
    setupAutoStart();

    createMain();
    createTray();

    // Start the app blocker monitor
    startBlockerMonitor();

    // Start API Server for Extension
    startApiServer();
});

// Keep process alive in tray
app.on('window-all-closed', () => { });
app.on('before-quit', () => {
    isQuitting = true;
    if (apiServer) apiServer.close();
    if (psMonitor) {
        try {
            psMonitor.kill();
        } catch (e) { }
    }
});
