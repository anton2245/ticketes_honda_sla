// Desktop Application Menu Configuration
const { Menu } = require('electron');

/**
 * Disables the default Electron menu bar for a clean, full-screen desktop experience
 */
function buildAppMenu(mainWindow) {
  Menu.setApplicationMenu(null);
  if (mainWindow && typeof mainWindow.setMenu === 'function') {
    mainWindow.setMenu(null);
  }
}

module.exports = { buildAppMenu };
