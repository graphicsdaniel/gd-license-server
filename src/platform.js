'use strict';

// OS-specific helpers: reading/writing copied files and sending the paste
// keystroke to whichever app had focus before the picker opened.

const { execFile, spawn } = require('child_process');
const { fileURLToPath, pathToFileURL } = require('url');

const isWin = process.platform === 'win32';
const isMac = process.platform === 'darwin';

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { windowsHide: true, timeout: 5000, ...opts }, (err, stdout) => {
      if (err) reject(err); else resolve(stdout);
    });
  });
}

// ---- Windows: one long-lived PowerShell so each call is fast ---------------

let ps = null;
let psQueue = [];
let psBuffer = '';
const PS_MARKER = '__GDCLIP_DONE__';

function startPowerShell() {
  ps = spawn('powershell.exe', ['-NoProfile', '-NoLogo', '-NonInteractive', '-Command', '-'], {
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'ignore'],
  });
  ps.stdout.setEncoding('utf8');
  ps.stdout.on('data', (chunk) => {
    psBuffer += chunk;
    let i;
    while ((i = psBuffer.indexOf(PS_MARKER)) !== -1) {
      const out = psBuffer.slice(0, i);
      psBuffer = psBuffer.slice(i + PS_MARKER.length).replace(/^\r?\n/, '');
      const job = psQueue.shift();
      if (job) job.resolve(out);
    }
  });
  const fail = () => {
    ps = null;
    psBuffer = '';
    for (const job of psQueue.splice(0)) job.reject(new Error('PowerShell exited'));
  };
  ps.on('exit', fail);
  ps.on('error', fail);
  ps.stdin.on('error', () => {});
  ps.stdin.write('Add-Type -AssemblyName System.Windows.Forms\n');
}

function powershell(script) {
  if (!ps) startPowerShell();
  return new Promise((resolve, reject) => {
    psQueue.push({ resolve, reject });
    // Everything on one line: PowerShell reads stdin one statement per line.
    ps.stdin.write(`try { ${script} } catch {} ; Write-Output '${PS_MARKER}'\n`);
  });
}

function psQuote(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

// ---- Reading files from the clipboard --------------------------------------

function parseUriList(s) {
  return String(s || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && l.startsWith('file://'))
    .map((l) => { try { return fileURLToPath(l); } catch { return null; } })
    .filter(Boolean);
}

function parsePlistStrings(xml) {
  const out = [];
  const re = /<string>([\s\S]*?)<\/string>/g;
  let m;
  while ((m = re.exec(xml))) {
    out.push(m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&'));
  }
  return out;
}

// Cheap synchronous check used on every poll. Returns the file paths we can see
// right away (on Windows only the first file; see readAllFilesWindows).
function peekFiles(clipboard) {
  const formats = clipboard.availableFormats();
  if (isWin) {
    const buf = clipboard.readBuffer('FileNameW');
    if (buf && buf.length > 2) {
      const first = buf.toString('utf16le').replace(/\0[\s\S]*$/, '');
      if (first) return [first];
    }
    return [];
  }
  if (isMac) {
    const plist = clipboard.read('NSFilenamesPboardType');
    if (plist) {
      const paths = parsePlistStrings(plist);
      if (paths.length) return paths;
    }
    const url = clipboard.read('public.file-url');
    return url ? parseUriList(url) : [];
  }
  if (formats.includes('text/uri-list')) return parseUriList(clipboard.read('text/uri-list'));
  const gnome = clipboard.read('x-special/gnome-copied-files');
  if (gnome) return parseUriList(gnome.split('\n').slice(1).join('\n'));
  return [];
}

// Windows exposes only the first path synchronously; ask PowerShell for all.
async function readAllFilesWindows(fallback) {
  try {
    const out = await powershell('Get-Clipboard -Format FileDropList | ForEach-Object { $_.FullName }');
    const paths = out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    return paths.length ? paths : fallback;
  } catch {
    return fallback;
  }
}

async function readFiles(clipboard) {
  const peek = peekFiles(clipboard);
  if (isWin && peek.length) return readAllFilesWindows(peek);
  return peek;
}

// ---- Writing files back to the clipboard ------------------------------------

function plistFor(paths) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n'
    + '<plist version="1.0"><array>'
    + paths.map((p) => `<string>${esc(p)}</string>`).join('')
    + '</array></plist>';
}

async function writeFiles(clipboard, paths) {
  if (isWin) {
    try {
      await powershell(`Set-Clipboard -Path ${paths.map(psQuote).join(',')}`);
      return;
    } catch { /* fall through to plain text */ }
    clipboard.writeText(paths.join('\r\n'));
    return;
  }
  const uris = paths.map((p) => pathToFileURL(p).href);
  if (isMac) {
    clipboard.writeBuffer('NSFilenamesPboardType', Buffer.from(plistFor(paths)));
    return;
  }
  clipboard.clear();
  clipboard.writeBuffer('text/uri-list', Buffer.from(uris.join('\r\n')));
  clipboard.writeBuffer('x-special/gnome-copied-files', Buffer.from(`copy\n${uris.join('\n')}`));
  clipboard.writeText(paths.join('\n'));
}

// ---- Sending Ctrl/Cmd+V -----------------------------------------------------

async function sendPaste() {
  if (isWin) {
    await powershell("[System.Windows.Forms.SendKeys]::SendWait('^v')");
  } else if (isMac) {
    await run('osascript', ['-e', 'tell application "System Events" to keystroke "v" using command down']);
  } else {
    await run('xdotool', ['key', '--clearmodifiers', 'ctrl+v']);
  }
}

function dispose() {
  if (ps) { try { ps.stdin.end(); ps.kill(); } catch { /* already gone */ } }
  ps = null;
}

module.exports = { peekFiles, readFiles, writeFiles, sendPaste, dispose, parseUriList, parsePlistStrings, isWin, isMac };
