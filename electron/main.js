// Electron Main Process for Honda Service Ticketing Desktop Application
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { startServer, stopServer } = require('../server/server');
const { buildAppMenu } = require('./menu');

let mainWindow = null;
let serverInstance = null;
let activePort = process.env.PORT || 3000;

// ============================================================================
// DEVELOPER MODE TOGGLE
// ============================================================================
// Change this boolean to toggle Dev Mode on or off:
// - true:  Enables hot reloading (public/ & server/ watchers), F12 DevTools shortcut, dev logging
// - false: Production mode (hot reload disabled, DevTools shortcut disabled)
// - null:  Auto-detect based on --dev flag, NODE_ENV, or unpacked state
const DEV_MODE_OVERRIDE = null; // Set to true to force ON, false to force OFF, or null for auto

// Evaluated dev mode flag
const isDev = DEV_MODE_OVERRIDE !== null
  ? Boolean(DEV_MODE_OVERRIDE)
  : (process.argv.includes('--dev') || process.env.NODE_ENV === 'development' || !app.isPackaged);


/**
 * Check if a local server is responding on given port
 */
function checkPortAvailable(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}/api/health`, (res) => {
      resolve(true); // Server is answering
    });
    req.on('error', () => {
      resolve(false);
    });
    req.setTimeout(800, () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * Start or connect to Express backend server
 */
async function initializeServer() {
  const preferredPort = parseInt(process.env.PORT || '3000', 10);

  try {
    console.log(`[Electron] Starting embedded Honda Service backend on port ${preferredPort}...`);
    const res = await startServer(preferredPort);
    serverInstance = res.server;
    activePort = res.port;
    console.log(`[Electron] Backend server listening on port ${activePort}`);
    return activePort;
  } catch (err) {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[Electron] Port ${preferredPort} is already in use.`);
      const isResponding = await checkPortAvailable(preferredPort);
      if (isResponding) {
        console.log(`[Electron] Connecting to already running Honda backend on port ${preferredPort}`);
        activePort = preferredPort;
        return activePort;
      }

      // Try fallback port 3001
      try {
        console.log(`[Electron] Attempting fallback port 3001...`);
        const res = await startServer(3001);
        serverInstance = res.server;
        activePort = res.port;
        console.log(`[Electron] Backend listening on fallback port ${activePort}`);
        return activePort;
      } catch (fallbackErr) {
        console.error('[Electron] Failed to start server on fallback port:', fallbackErr);
        throw fallbackErr;
      }
    } else {
      console.error('[Electron] Error starting server:', err);
      throw err;
    }
  }
}

/**
 * Create Desktop Application Window
 */
function createWindow(port) {
  const iconPath = path.join(__dirname, 'icon.png');

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 720,
    title: 'Johns Honda Tickets',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    backgroundColor: '#0f172a',
    autoHideMenuBar: true,
    show: false, // Wait until ready-to-show for seamless appearance
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  });

  // Turn off window and application menu
  mainWindow.setMenu(null);
  buildAppMenu(mainWindow);

  // Maintain essential developer hotkeys (F12 for DevTools, Ctrl+R for reload)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' && input.type === 'keyDown') {
      if (isDev) {
        mainWindow.webContents.toggleDevTools();
      }
      event.preventDefault();
    } else if ((input.control || input.meta) && input.key.toLowerCase() === 'r' && input.type === 'keyDown') {
      if (input.shift) {
        mainWindow.webContents.reloadIgnoringCache();
      } else {
        mainWindow.webContents.reload();
      }
      event.preventDefault();
    }
  });

  const appUrl = `http://localhost:${port}`;
  console.log(`[Electron] Loading desktop interface from ${appUrl}`);
  mainWindow.loadURL(appUrl);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev) {
      console.log('[Electron] Development mode enabled. Hot reloading active.');
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

/**
 * Setup Hot Reload file watchers for rapid development & testing
 */
function setupHotReload() {
  if (!isDev) return;

  const publicDir = path.join(__dirname, '..', 'public');
  const serverDir = path.join(__dirname, '..', 'server');

  let reloadTimeout = null;
  let restartTimeout = null;

  // 1. Watch frontend files in /public -> Instant window reload without app restart
  if (fs.existsSync(publicDir)) {
    console.log(`[Hot Reload] Watching frontend files at ${publicDir}`);
    fs.watch(publicDir, { recursive: true }, (eventType, filename) => {
      if (!filename) return;
      // Only reload on actual web asset changes
      if (!/\.(html|css|js|json|png|svg|jpg)$/i.test(filename)) return;

      clearTimeout(reloadTimeout);
      reloadTimeout = setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          console.log(`[Hot Reload] Frontend change: ${filename} (${eventType}). Reloading window...`);
          mainWindow.webContents.reloadIgnoringCache();
        }
      }, 150);
    });
  }

  // 2. Watch backend files in /server -> Relaunch Electron app
  if (fs.existsSync(serverDir)) {
    console.log(`[Hot Reload] Watching backend files at ${serverDir}`);
    fs.watch(serverDir, { recursive: true }, (eventType, filename) => {
      if (!filename) return;
      // Only relaunch on javascript/json backend code changes
      if (!/\.(js|json)$/i.test(filename)) return;

      clearTimeout(restartTimeout);
      restartTimeout = setTimeout(() => {
        console.log(`[Hot Reload] Backend change: ${filename} (${eventType}). Restarting application...`);
        app.relaunch();
        app.exit(0);
      }, 300);
    });
  }
}

// IPC Handlers
ipcMain.on('app:reload', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.reloadIgnoringCache();
  }
});

ipcMain.on('app:toggle-devtools', () => {
  if (mainWindow && !mainWindow.isDestroyed() && isDev) {
    mainWindow.webContents.toggleDevTools();
  }
});

// App Lifecycle
app.whenReady().then(async () => {
  try {
    const port = await initializeServer();
    createWindow(port);
    setupHotReload();
  } catch (err) {
    console.error('[Electron] Initialization failed:', err);
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(activePort);
    }
  });
});

app.on('window-all-closed', async () => {
  console.log('[Electron] All windows closed. Terminating background server...');
  if (stopServer) {
    try {
      await stopServer();
    } catch (e) {
      console.warn('[Electron] Error stopping server:', e.message);
    }
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
