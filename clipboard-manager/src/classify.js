'use strict';

// Sections shown in the picker, in display order.
const SECTIONS = [
  { id: 'all', label: 'All' },
  { id: 'text', label: 'Text' },
  { id: 'link', label: 'Links' },
  { id: 'code', label: 'Code' },
  { id: 'color', label: 'Colors' },
  { id: 'image', label: 'Images' },
  { id: 'file', label: 'Files' },
];

// File groups used inside the Files section.
const FILE_GROUPS = {
  image: { label: 'Images', ext: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'tif', 'tiff', 'heic', 'ico', 'svg', 'raw', 'cr2', 'nef'] },
  design: { label: 'Design', ext: ['psd', 'psb', 'ai', 'eps', 'indd', 'idml', 'xd', 'fig', 'sketch', 'afdesign', 'afphoto', 'cdr', 'aep', 'prproj', 'blend', 'c4d', 'obj', 'fbx', 'stl'] },
  document: { label: 'Documents', ext: ['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt', 'md', 'pages', 'xls', 'xlsx', 'csv', 'ods', 'numbers', 'ppt', 'pptx', 'key', 'odp'] },
  video: { label: 'Video', ext: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'wmv', 'm4v', 'flv'] },
  audio: { label: 'Audio', ext: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma', 'aiff'] },
  archive: { label: 'Archives', ext: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'dmg', 'iso'] },
  font: { label: 'Fonts', ext: ['ttf', 'otf', 'woff', 'woff2'] },
  code: { label: 'Code', ext: ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'c', 'cpp', 'h', 'cs', 'go', 'rs', 'rb', 'php', 'html', 'css', 'scss', 'json', 'xml', 'yml', 'yaml', 'sh', 'bat', 'ps1', 'sql'] },
  app: { label: 'Programs', ext: ['exe', 'msi', 'app', 'apk', 'deb', 'rpm', 'appimage', 'lnk'] },
};
const FILE_GROUP_ORDER = ['folder', ...Object.keys(FILE_GROUPS), 'other'];
const FILE_GROUP_LABELS = { folder: 'Folders', other: 'Other files' };
for (const [id, g] of Object.entries(FILE_GROUPS)) FILE_GROUP_LABELS[id] = g.label;

const EXT_TO_GROUP = {};
for (const [id, g] of Object.entries(FILE_GROUPS)) for (const e of g.ext) EXT_TO_GROUP[e] = id;

function baseName(p) {
  return String(p).replace(/[\\/]+$/, '').split(/[\\/]/).pop() || String(p);
}

function extOf(p) {
  const name = baseName(p);
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1).toLowerCase() : '';
}

// isDir is optional: a function(path) -> boolean supplied by the caller.
function fileGroup(p, isDir) {
  if (isDir && isDir(p)) return 'folder';
  return EXT_TO_GROUP[extOf(p)] || 'other';
}

// When several files are copied at once, the item goes in the most common
// group (ties go to the first file's group).
function dominantFileGroup(paths, isDir) {
  const groups = paths.map((p) => fileGroup(p, isDir));
  const counts = {};
  for (const g of groups) counts[g] = (counts[g] || 0) + 1;
  let best = groups[0] || 'other';
  for (const g of groups) if (counts[g] > counts[best]) best = g;
  return best;
}

const URL_RE = /^(https?:\/\/|ftp:\/\/|mailto:|www\.)\S+$/i;
const COLOR_RES = [
  /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i,
  /^rgba?\(\s*[\d.]+%?\s*,?\s*[\d.]+%?\s*,?\s*[\d.]+%?\s*(?:[,/]\s*[\d.]+%?\s*)?\)$/i,
  /^hsla?\(\s*[\d.]+(?:deg)?\s*,?\s*[\d.]+%\s*,?\s*[\d.]+%\s*(?:[,/]\s*[\d.]+%?\s*)?\)$/i,
];

function isColor(s) {
  return COLOR_RES.some((re) => re.test(s));
}

function isLink(s) {
  const lines = s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return lines.length > 0 && lines.length <= 20 && lines.every((l) => URL_RE.test(l));
}

function looksLikeCode(s) {
  const lines = s.split(/\r?\n/);
  let score = 0;
  if (/^\s*[{[]/.test(s) && /[}\]]\s*$/.test(s)) {
    try { JSON.parse(s); return true; } catch { /* not JSON */ }
  }
  if (/^\s*<([a-z][\w-]*)[\s>][\s\S]*<\/\1>\s*$/i.test(s)) score += 2;
  if (/\b(function|const|let|var|return|import|export|class|def|elif|public|private|static|void|#include|SELECT|FROM|WHERE|=>)\b/.test(s)) score += 2;
  if (/[;{}]\s*$/m.test(s)) score += 1;
  if (/^\s{2,}\S/m.test(s) && lines.length > 1) score += 1;
  if (/[a-zA-Z_$][\w$]*\([^)]*\)\s*[;{]/.test(s)) score += 1;
  if (/(===|!==|&&|\|\||::|->|\+=|-=)/.test(s)) score += 1;
  if (/^\s*(\/\/|#!|\/\*|<!--)/m.test(s)) score += 1;
  // Plain prose rarely has these symbols in this density.
  const symbols = (s.match(/[{}()[\];=<>]/g) || []).length;
  if (symbols / Math.max(s.length, 1) > 0.05) score += 1;
  return score >= 3;
}

// Returns the section id for a clip: 'text' | 'link' | 'code' | 'color' | 'image' | 'file'.
function classifyText(text) {
  const s = String(text).trim();
  if (!s) return 'text';
  if (s.length <= 64 && isColor(s)) return 'color';
  if (isLink(s)) return 'link';
  if (looksLikeCode(s)) return 'code';
  return 'text';
}

module.exports = {
  SECTIONS,
  FILE_GROUP_ORDER,
  FILE_GROUP_LABELS,
  baseName,
  extOf,
  fileGroup,
  dominantFileGroup,
  classifyText,
  isColor,
  isLink,
  looksLikeCode,
};
