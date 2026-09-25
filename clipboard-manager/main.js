'use strict';

const { app, BrowserWindow, Tray, Menu, globalShortcut, clipboard, nativeImage, ipcMain, screen, Notification } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { SECTIONS, FILE_GROUP_ORDER, FILE_GROUP_LABELS, classifyText, dominantFileGroup, baseName } = require('./src/classify');
const { History, MIN_ITEMS, MAX_ITEMS } = require('./src/history');
const platform = require('./src/platform');

const POLL_MS = 500;
const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const SHORTCUTS = [
  { accel: 'CommandOrControl+Shift+V', label: platform.isMac ? 'Cmd+Shift+V' : 'Ctrl+Shift+V' },
  { accel: 'CommandOrControl+Alt+V', label: platform.isMac ? 'Cmd+Option+V' : 'Ctrl+Alt+V' },
  { accel: 'Alt+V', label: platform.isMac ? 'Option+V' : 'Alt+V' },
  { accel: 'CommandOrControl+`', label: platform.isMac ? 'Cmd+`' : 'Ctrl+`' },
];

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

let win = null;
let tray = null;
let history = null;
let settings = null;
let lastSignature = null;
let busy = false;
let pasteWarningShown = false;

// ---- Storage ----------------------------------------------------------------

const dataDir = () => app.getPath('userData');
const imagesDir = () => path.join(dataDir(), 'images');
const historyFile = () => path.join(dataDir(), 'history.json');
const settingsFile = () => path.join(dataDir(), 'settings.json');

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function loadSettings() {
  settings = {
    limit: MAX_ITEMS,
    autoPaste: true,
    shortcut: SHORTCUTS[0].accel,
    paused: false,
    ...readJson(settingsFile(), {}),
  };
}

function saveSettings() {
  fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2));
}

let saveTimer = null;
function saveHistory() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { fs.writeFileSync(historyFile(), JSON.stringify(history.items)); } catch (e) { console.error(e); }
  }, 300);
}

function deleteStored(clips) {
  for (const c of clips) {
    if (c.imageFile) fs.rm(path.join(imagesDir(), c.imageFile), { force: true }, () => {});
  }
}

// ---- Clipboard watching -----------------------------------------------------

// Hashes a spread-out sample of the bitmap so polling large images stays cheap.
function imageFingerprint(img) {
  const { width, height } = img.getSize();
  const bmp = img.toBitmap();
  const hash = crypto.createHash('sha1');
  const step = Math.max(4, Math.floor(bmp.length / 8192) & ~3);
  for (let i = 0; i < bmp.length; i += step) hash.update(bmp.subarray(i, i + 4));
  return `${width}x${height}:${hash.digest('hex')}`;
}

// Looks at the clipboard and describes what is on it, without saving anything.
function snapshot() {
  const files = platform.peekFiles(clipboard);
  if (files.length) return { kind: 'file', signature: `f:${files.join('|')}`, files };

  const text = clipboard.readText();
  if (text && text.trim()) return { kind: 'text', signature: `t:${text}`, text };

  if (clipboard.availableFormats().some((f) => f.startsWith('image/'))) {
    const img = clipboard.readImage();
    if (!img.isEmpty()) return { kind: 'image', signature: `i:${imageFingerprint(img)}`, img };
  }
  return { kind: 'empty', signature: 'empty' };
}

async function captureClip(snap) {
  if (snap.kind === 'text') {
    if (Buffer.byteLength(snap.text) > MAX_TEXT_BYTES) return null;
    return { key: snap.signature, type: classifyText(snap.text), text: snap.text };
  }

  if (snap.kind === 'image') {
    const key = snap.signature;
    if (history.items.some((c) => c.key === key)) return { key };
    const id = crypto.randomUUID();
    const imageFile = `${id}.png`;
    fs.mkdirSync(imagesDir(), { recursive: true });
    fs.writeFileSync(path.join(imagesDir(), imageFile), snap.img.toPNG());
    const { width, height } = snap.img.getSize();
    const thumb = width > 360 ? snap.img.resize({ width: 360, quality: 'good' }) : snap.img;
    return { id, key, type: 'image', imageFile, width, height, thumb: thumb.toDataURL() };
  }

  if (snap.kind === 'file') {
    const files = await platform.readFiles(clipboard);
    if (!files.length) return null;
    const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
    const entries = files.map((p) => ({ path: p, name: baseName(p), dir: isDir(p) }));
    const dirs = new Set(entries.filter((e) => e.dir).map((e) => e.path));
    return {
      key: `files:${files.join('|')}`,
      type: 'file',
      fileGroup: dominantFileGroup(files, (p) => dirs.has(p)),
      files: entries,
    };
  }
  return null;
}

async function poll() {
  if (busy || settings.paused) return;
  busy = true;
  try {
    const snap = snapshot();
    if (snap.signature === lastSignature) return;
    lastSignature = snap.signature;
    if (snap.kind === 'empty') return;
    const clip = await captureClip(snap);
    if (!clip) return;
    deleteStored(history.add(clip));
    saveHistory();
    pushState();
  } catch (e) {
    console.error('clipboard poll failed', e);
  } finally {
    busy = false;
  }
}

// ---- Putting a clip back on the clipboard -----------------------------------

async function writeClip(clip, { plain = false } = {}) {
  if (clip.type === 'image') {
    const img = nativeImage.createFromPath(path.join(imagesDir(), clip.imageFile));
    if (img.isEmpty()) throw new Error('Image is no longer available');
    clipboard.writeImage(img);
  } else if (clip.type === 'file') {
    const paths = clip.files.map((f) => f.path);
    if (plain) clipboard.writeText(paths.join(platform.isWin ? '\r\n' : '\n'));
    else await platform.writeFiles(clipboard, paths);
  } else {
    clipboard.writeText(clip.text);
  }
  // Don't record our own write as a new copy.
  lastSignature = snapshot().signature;
}

async function pasteClip(id, opts = {}) {
  const clip = history.get(id);
  if (!clip) return;
  busy = true;
  try {
    await writeClip(clip, opts);
  } finally {
    busy = false;
  }
  history.touch(id);
  saveHistory();
  hideWindow();
  if (!settings.autoPaste || opts.copyOnly) return;
  setTimeout(() => {
    platform.sendPaste().catch(() => warnPasteUnavailable());
  }, platform.isMac ? 250 : 120);
}

function warnPasteUnavailable() {
  if (pasteWarningShown) return;
  pasteWarningShown = true;
  const body = platform.isMac
    ? 'Allow GD Clipboard under System Settings > Privacy & Security > Accessibility to paste automatically. The item is on your clipboard - press Cmd+V.'
    : platform.isWin
      ? 'Could not paste automatically. The item is on your clipboard - press Ctrl+V.'
      : 'Install "xdotool" to paste automatically. The item is on your clipboard - press Ctrl+V.';
  if (Notification.isSupported()) new Notification({ title: 'GD Clipboard', body }).show();
}

// ---- Window -----------------------------------------------------------------

function createWindow() {
  win = new BrowserWindow({
    width: 440,
    height: 600,
    show: false,
    frame: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: '#1b1c20',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('blur', () => {
    if (!win.webContents.isDevToolsOpened()) hideWindow();
  });
}

function showWindow() {
  const cursor = screen.getCursorScreenPoint();
  const { workArea } = screen.getDisplayNearestPoint(cursor);
  const [w, h] = win.getSize();
  const x = Math.min(Math.max(cursor.x - Math.round(w / 2), workArea.x + 8), workArea.x + workArea.width - w - 8);
  const y = Math.min(Math.max(cursor.y + 12, workArea.y + 8), workArea.y + workArea.height - h - 8);
  win.setPosition(x, y);
  pushState();
  win.webContents.send('shown');
  win.show();
  win.focus();
}

function hideWindow() {
  if (!win || !win.isVisible()) return;
  win.hide();
  // On macOS focus only goes back to the previous app if we hide the app itself.
  if (platform.isMac) app.hide();
}

function toggleWindow() {
  if (win.isVisible()) hideWindow(); else showWindow();
}

function state() {
  return {
    items: history.items,
    limit: history.limit,
    sections: SECTIONS,
    fileGroupOrder: FILE_GROUP_ORDER,
    fileGroupLabels: FILE_GROUP_LABELS,
    shortcut: (SHORTCUTS.find((s) => s.accel === settings.shortcut) || { label: settings.shortcut }).label,
    paused: settings.paused,
    autoPaste: settings.autoPaste,
    platform: process.platform,
  };
}

function pushState() {
  if (win && !win.isDestroyed()) win.webContents.send('state', state());
  updateTrayMenu();
}

// ---- Shortcut & tray ----------------------------------------------------------

function registerShortcut(accel) {
  globalShortcut.unregisterAll();
  if (globalShortcut.register(accel, toggleWindow)) return true;
  if (Notification.isSupported()) {
    new Notification({ title: 'GD Clipboard', body: `The shortcut ${accel} is used by another app. Pick another one from the tray menu.` }).show();
  }
  return false;
}

function setSetting(key, value) {
  settings[key] = value;
  saveSettings();
  pushState();
}

function trayIcon() {
  const file = platform.isMac ? 'trayTemplate.png' : 'tray.png';
  const img = nativeImage.createFromPath(path.join(__dirname, 'assets', file));
  if (platform.isMac) img.setTemplateImage(true);
  return img;
}

function updateTrayMenu() {
  if (!tray) return;
  const shortcutLabel = state().shortcut;
  tray.setToolTip(`GD Clipboard - ${history.items.length} item(s) - ${shortcutLabel} to open`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `Open clipboard (${shortcutLabel})`, click: showWindow },
    { type: 'separator' },
    {
      label: 'Keep how many items',
      submenu: Array.from({ length: MAX_ITEMS - MIN_ITEMS + 1 }, (_, i) => MIN_ITEMS + i).map((n) => ({
        label: String(n),
        type: 'radio',
        checked: history.limit === n,
        click: () => { deleteStored(history.setLimit(n)); saveHistory(); setSetting('limit', n); },
      })),
    },
    {
      label: 'Shortcut',
      submenu: SHORTCUTS.map((s) => ({
        label: s.label,
        type: 'radio',
        checked: settings.shortcut === s.accel,
        click: () => { if (registerShortcut(s.accel)) setSetting('shortcut', s.accel); else registerShortcut(settings.shortcut); },
      })),
    },
    { label: 'Paste automatically after choosing', type: 'checkbox', checked: settings.autoPaste, click: (m) => setSetting('autoPaste', m.checked) },
    { label: 'Pause saving copies', type: 'checkbox', checked: settings.paused, click: (m) => { lastSignature = snapshot().signature; setSetting('paused', m.checked); } },
    {
      label: 'Start when computer starts',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (m) => app.setLoginItemSettings({ openAtLogin: m.checked }),
    },
    { type: 'separator' },
    { label: 'Clear history (keeps pinned)', click: () => { deleteStored(history.clear()); saveHistory(); pushState(); } },
    { label: 'Quit', click: () => app.quit() },
  ]));
}

// ---- IPC ----------------------------------------------------------------------

ipcMain.handle('get-state', () => state());
ipcMain.handle('paste', (_e, id, opts) => pasteClip(id, opts || {}));
ipcMain.handle('remove', (_e, id) => { deleteStored(history.remove(id)); saveHistory(); pushState(); });
ipcMain.handle('pin', (_e, id) => { deleteStored(history.togglePin(id)); saveHistory(); pushState(); });
ipcMain.handle('clear', () => { deleteStored(history.clear()); saveHistory(); pushState(); });
ipcMain.handle('hide', () => hideWindow());

// ---- Startup ------------------------------------------------------------------

app.on('second-instance', () => { if (win) showWindow(); });

app.whenReady().then(() => {
  if (!gotLock) return;
  if (platform.isMac && app.dock) app.dock.hide();
  fs.mkdirSync(imagesDir(), { recursive: true });
  loadSettings();
  history = new History({ limit: settings.limit, items: readJson(historyFile(), []) });

  // Don't re-add whatever was already on the clipboard when we start.
  lastSignature = snapshot().signature;

  createWindow();
  tray = new Tray(trayIcon());
  tray.on('click', toggleWindow);
  updateTrayMenu();
  if (!registerShortcut(settings.shortcut)) registerShortcut(SHORTCUTS[1].accel);
  setInterval(poll, POLL_MS);
});

app.on('window-all-closed', (e) => e.preventDefault());
app.on('will-quit', () => {
  if (!history) return;
  globalShortcut.unregisterAll();
  platform.dispose();
  clearTimeout(saveTimer);
  try { fs.writeFileSync(historyFile(), JSON.stringify(history.items)); } catch { /* ignore */ }
});
