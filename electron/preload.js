// Preload script for Honda Service Ticketing Desktop Application
const { contextBridge, ipcRenderer } = require('electron');

// Expose safe desktop integration APIs if needed by frontend
contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  reloadApp: () => ipcRenderer.send('app:reload'),
  toggleDevTools: () => ipcRenderer.send('app:toggle-devtools'),
  showDesktopNotification: (data) => ipcRenderer.send('desktop:notify', data),
  onNotificationOpen: (callback) => {
    ipcRenderer.on('notification:open-ticket', (_event, data) => callback(data));
  }
});
