const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const url = require('url');
const fs = require('fs');
const { exec, execFile, spawn } = require('child_process');

const isDev = !app.isPackaged;

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    titleBarStyle: 'hidden',
    backgroundColor: '#0f0f1a',
  });

  if (isDev) {
    win.loadURL('http://localhost:3000');
  } else {
    win.loadURL(
      url.format({
        pathname: path.join(__dirname, '../build/index.html'),
        protocol: 'file:',
        slashes: true,
      })
    );
  }
}

// ── File type helpers ──────────────────────────────────────────────────────
const IMAGE_EXTS = new Set(['jpg','jpeg','png','gif','bmp','heic','raw','cr2','nef','arw','dng','tiff','tif','webp']);
const VIDEO_EXTS = new Set(['mp4','mov','avi','mkv','wmv','flv','3gp','m4v','mts','m2ts','webm','mpg','mpeg','ts']);
const DOC_EXTS   = new Set(['pdf','doc','docx','xls','xlsx','ppt','pptx','txt','zip','rar','7z']);

function getFileType(ext) {
  if (IMAGE_EXTS.has(ext)) return 'image';
  if (VIDEO_EXTS.has(ext)) return 'video';
  if (DOC_EXTS.has(ext))   return 'document';
  return null;
}

// ── Local file scan ────────────────────────────────────────────────────────
async function scanDir(dirPath, win, results) {
  let entries;
  try { entries = await fs.promises.readdir(dirPath); } catch { return; }

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry);
    let stat;
    try { stat = await fs.promises.stat(fullPath); } catch { continue; }

    if (stat.isDirectory()) {
      await scanDir(fullPath, win, results);
    } else {
      const ext = path.extname(entry).toLowerCase().slice(1);
      const type = getFileType(ext);
      if (type) {
        results.push({ path: fullPath, name: entry, size: stat.size, type, ext, modified: stat.mtime.toISOString() });
        if (results.length % 20 === 0) {
          win.webContents.send('scan-progress', { found: results.length, current: entry });
          await new Promise((r) => setTimeout(r, 0));
        }
      }
    }
  }
}

// ── ADB helpers ────────────────────────────────────────────────────────────
function runAdb(args, opts = {}) {
  return new Promise((resolve, reject) => {
    exec(`adb ${args}`, { maxBuffer: 50 * 1024 * 1024, ...opts }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout.trim());
    });
  });
}

async function adbListFiles(remotePath) {
  // Use `adb shell find` to get file list with sizes
  const out = await runAdb(
    `shell find "${remotePath}" -type f 2>/dev/null`
  );
  if (!out) return [];
  const lines = out.split('\n').filter(Boolean);
  const files = [];

  for (const line of lines) {
    const filePath = line.trim();
    const name = path.posix.basename(filePath);
    const ext = path.extname(name).toLowerCase().slice(1);
    const type = getFileType(ext);
    if (!type) continue;

    // Get file size
    let size = 0;
    try {
      const statOut = await runAdb(`shell stat -c %s "${filePath}" 2>/dev/null`);
      size = parseInt(statOut) || 0;
    } catch {}

    files.push({
      path: filePath,
      name,
      size,
      type,
      ext,
      modified: '',
      source: 'adb',
    });
  }
  return files;
}

// XHide known paths on Infinix (try all of them)
const XHIDE_PATHS = [
  '/sdcard/.xhide',
  '/storage/emulated/0/.xhide',
  '/sdcard/.XHide',
  '/storage/emulated/0/.XHide',
  '/sdcard/.privatespace',
  '/sdcard/Android/.xhide',
];

// ── IPC: ADB ───────────────────────────────────────────────────────────────
ipcMain.handle('adb-check', async () => {
  try {
    await runAdb('version');
    return { installed: true };
  } catch {
    return { installed: false };
  }
});

ipcMain.handle('adb-devices', async () => {
  try {
    const out = await runAdb('devices');
    const lines = out.split('\n').slice(1).filter(Boolean);
    const devices = lines
      .map((l) => {
        const parts = l.split('\t');
        return { serial: parts[0]?.trim(), status: parts[1]?.trim() };
      })
      .filter((d) => d.serial && d.status === 'device');
    return { success: true, devices };
  } catch (e) {
    return { success: false, error: e.message, devices: [] };
  }
});

ipcMain.handle('adb-device-info', async (_, serial) => {
  try {
    const model = await runAdb(`-s ${serial} shell getprop ro.product.model`);
    const brand = await runAdb(`-s ${serial} shell getprop ro.product.brand`);
    const android = await runAdb(`-s ${serial} shell getprop ro.build.version.release`);
    return { model, brand, android };
  } catch {
    return { model: 'Unknown', brand: 'Unknown', android: '' };
  }
});

ipcMain.handle('adb-find-xhide', async (_, serial) => {
  const flag = serial ? `-s ${serial}` : '';
  const found = [];

  for (const p of XHIDE_PATHS) {
    try {
      const out = await runAdb(`${flag} shell ls "${p}" 2>/dev/null`);
      if (out && !out.includes('No such file')) {
        found.push(p);
      }
    } catch {}
  }

  // Also do a broader search for hidden folders that look like vaults
  try {
    const search = await runAdb(
      `${flag} shell find /sdcard -maxdepth 3 -name ".xhide" -o -name ".XHide" -o -name ".privatespace" -o -name ".vault" 2>/dev/null`
    );
    if (search) {
      search.split('\n').filter(Boolean).forEach((p) => {
        if (!found.includes(p)) found.push(p);
      });
    }
  } catch {}

  return found;
});

ipcMain.handle('adb-scan-path', async (event, serial, remotePath) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const flag = serial ? `-s ${serial}` : '';

  win.webContents.send('scan-progress', { found: 0, current: `Scanning ${remotePath}…` });

  try {
    // Get all files recursively
    const out = await runAdb(`${flag} shell find "${remotePath}" -type f 2>/dev/null`);
    if (!out) return [];

    const lines = out.split('\n').filter(Boolean);
    const files = [];

    for (let i = 0; i < lines.length; i++) {
      const filePath = lines[i].trim();
      const name = path.posix.basename(filePath);
      const ext = path.extname(name).toLowerCase().slice(1);
      const type = getFileType(ext);

      // For XHide: include ALL file types (files may be renamed/have no ext)
      if (!remotePath.toLowerCase().includes('xhide') && !remotePath.toLowerCase().includes('hide')) {
        if (!type) continue;
      }

      let size = 0;
      try {
        const s = await runAdb(`${flag} shell stat -c %s "${filePath}" 2>/dev/null`);
        size = parseInt(s) || 0;
      } catch {}

      const detectedType = type || (size > 5000000 ? 'video' : 'image'); // guess for renamed files

      files.push({
        path: filePath,
        name,
        size,
        type: detectedType,
        ext: ext || 'unknown',
        modified: '',
        source: 'adb',
        serial,
        remotePath: filePath,
      });

      if (files.length % 5 === 0) {
        win.webContents.send('scan-progress', { found: files.length, current: name });
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    return files;
  } catch (e) {
    throw new Error('ADB scan failed: ' + e.message);
  }
});

ipcMain.handle('adb-pull-files', async (event, serial, files, destDir) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const flag = serial ? `-s ${serial}` : '';
  let done = 0;

  for (const file of files) {
    let localName = file.name;
    // If file has no meaningful extension, try to detect by pulling and checking magic bytes
    let destPath = path.join(destDir, localName || `recovered_${done}`);

    // Avoid overwrite
    if (fs.existsSync(destPath)) {
      const base = path.basename(localName, path.extname(localName));
      destPath = path.join(destDir, `${base}_${done}${path.extname(localName)}`);
    }

    try {
      await runAdb(`${flag} pull "${file.remotePath}" "${destPath}"`);
    } catch (e) {
      // try escaped path
      try {
        await runAdb(`${flag} pull '${file.remotePath}' "${destPath}"`);
      } catch {}
    }

    done++;
    win.webContents.send('restore-progress', { done, total: files.length });
    await new Promise((r) => setTimeout(r, 0));
  }

  return { success: true, count: done };
});

ipcMain.handle('adb-pull-preview', async (_, serial, remotePath) => {
  const flag = serial ? `-s ${serial}` : '';
  const tmpPath = path.join(app.getPath('temp'), `preview_${Date.now()}_${path.basename(remotePath)}`);
  try {
    await runAdb(`${flag} pull "${remotePath}" "${tmpPath}"`);
    const data = fs.readFileSync(tmpPath);
    fs.unlinkSync(tmpPath);
    return { success: true, data: data.toString('base64'), path: tmpPath };
  } catch (e) {
    return { success: false };
  }
});

// ── IPC: Local file system ─────────────────────────────────────────────────
function getMtpMounts() {
  // Scan gvfs for MTP-mounted phones/devices
  const mounts = [];
  const gvfsBase = `/run/user/${process.getuid ? process.getuid() : 1000}/gvfs`;
  try {
    const entries = fs.readdirSync(gvfsBase);
    for (const entry of entries) {
      if (entry.startsWith('mtp:')) {
        const fullPath = path.join(gvfsBase, entry);
        // Each MTP entry has sub-folders (e.g. "Internal shared storage")
        let subDirs = [];
        try { subDirs = fs.readdirSync(fullPath); } catch {}
        const label = entry.replace('mtp:host=', '').replace(/_/g, ' ');
        if (subDirs.length > 0) {
          for (const sub of subDirs) {
            mounts.push({
              path: path.join(fullPath, sub),
              label: `📱 ${label} — ${sub}`,
              size: '',
              type: 'mtp',
            });
          }
        } else {
          mounts.push({ path: fullPath, label: `📱 ${label}`, size: '', type: 'mtp' });
        }
      }
    }
  } catch {}
  return mounts;
}

function getUsbMounts() {
  // Scan /media/$USER and /run/media/$USER for USB drives
  const drives = [];
  const uid = process.env.USER || process.env.LOGNAME || 'waseen';
  for (const base of [`/media/${uid}`, `/run/media/${uid}`, '/media', '/mnt']) {
    try {
      const entries = fs.readdirSync(base);
      for (const entry of entries) {
        const fullPath = path.join(base, entry);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            drives.push({ path: fullPath, label: `💾 ${entry}`, size: '', type: 'usb' });
          }
        } catch {}
      }
    } catch {}
  }
  return drives;
}

ipcMain.handle('get-drives', async () => {
  return new Promise((resolve) => {
    if (process.platform === 'linux') {
      // Start with MTP (phones) and USB mounts
      const mtp = getMtpMounts();
      const usb = getUsbMounts();

      // Also check lsblk for any additional block devices
      exec('lsblk -J -o NAME,MOUNTPOINT,SIZE,TYPE,LABEL 2>/dev/null', (err, stdout) => {
        const block = [];
        if (!err) {
          try {
            const data = JSON.parse(stdout);
            function parse(b) {
              if (b.mountpoint && b.mountpoint !== '[SWAP]' && b.type !== 'disk' &&
                  !b.mountpoint.startsWith('/snap') && b.mountpoint !== '/' &&
                  !b.mountpoint.startsWith('/boot')) {
                block.push({ path: b.mountpoint, label: `💿 ${b.label || b.name}`, size: b.size, type: 'block' });
              }
              if (b.children) b.children.forEach(parse);
            }
            data.blockdevices.forEach(parse);
          } catch {}
        }

        const all = [...mtp, ...usb, ...block];
        resolve(all.length ? all : [{ path: '/media', label: '📂 Media folder', size: '', type: 'folder' }]);
      });
    } else if (process.platform === 'win32') {
      const drives = [];
      for (const letter of 'DEFGHIJKLMNOPQRSTUVWXYZ') {
        const p = `${letter}:\\`;
        if (fs.existsSync(p)) drives.push({ path: p, label: `💾 Drive ${letter}:`, size: '', type: 'usb' });
      }
      resolve(drives.length ? drives : [{ path: 'C:\\', label: 'Drive C:', size: '', type: 'block' }]);
    } else {
      resolve([{ path: '/Volumes', label: 'Volumes', size: '', type: 'folder' }]);
    }
  });
});

ipcMain.handle('scan-directory', async (event, dirPath) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const results = [];
  await scanDir(dirPath, win, results);
  win.webContents.send('scan-progress', { found: results.length, current: '' });
  return results;
});

ipcMain.handle('select-directory', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  // Use openFile + openDirectory so the dialog always has a clickable "Open" button on Linux GTK.
  // If the user picks a file we use its parent folder; if they pick a folder we use it directly.
  const result = await dialog.showOpenDialog(win, {
    properties: ['openFile', 'openDirectory'],
    title: 'Select Destination Folder — navigate into your folder, then click Open',
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const selected = result.filePaths[0];
  try {
    const stat = fs.statSync(selected);
    return stat.isDirectory() ? selected : path.dirname(selected);
  } catch {
    return selected;
  }
});

ipcMain.handle('restore-files', async (event, files, destDir) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  let done = 0;
  for (const file of files) {
    let destPath = path.join(destDir, file.name);
    if (fs.existsSync(destPath)) {
      const base = path.basename(file.name, path.extname(file.name));
      destPath = path.join(destDir, `${base}_recovered_${Date.now()}${path.extname(file.name)}`);
    }
    try { fs.copyFileSync(file.path, destPath); } catch {}
    done++;
    win.webContents.send('restore-progress', { done, total: files.length });
    await new Promise((r) => setTimeout(r, 0));
  }
  return { success: true, count: done };
});

// ── App lifecycle ──────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
