const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Local
  getDrives: () => ipcRenderer.invoke('get-drives'),
  scanDirectory: (path) => ipcRenderer.invoke('scan-directory', path),
  restoreFiles: (files, dest) => ipcRenderer.invoke('restore-files', files, dest),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),

  // ADB / Phone
  adbCheck: () => ipcRenderer.invoke('adb-check'),
  adbDevices: () => ipcRenderer.invoke('adb-devices'),
  adbDeviceInfo: (serial) => ipcRenderer.invoke('adb-device-info', serial),
  adbFindXhide: (serial) => ipcRenderer.invoke('adb-find-xhide', serial),
  adbScanPath: (serial, path) => ipcRenderer.invoke('adb-scan-path', serial, path),
  adbPullFiles: (serial, files, dest) => ipcRenderer.invoke('adb-pull-files', serial, files, dest),
  adbPullPreview: (serial, path) => ipcRenderer.invoke('adb-pull-preview', serial, path),

  // Events
  onScanProgress: (cb) => ipcRenderer.on('scan-progress', (_, d) => cb(d)),
  onRestoreProgress: (cb) => ipcRenderer.on('restore-progress', (_, d) => cb(d)),
  removeListeners: (ch) => ipcRenderer.removeAllListeners(ch),
});
