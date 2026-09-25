'use strict';

const TYPE_LABELS = { text: 'Text', link: 'Link', code: 'Code', color: 'Color', image: 'Image', file: 'Files' };

let state = null;
let tab = 'all';
let query = '';
let selected = 0;
let visible = [];

const $ = (id) => document.getElementById(id);
const listEl = $('list');
const tabsEl = $('tabs');
const searchEl = $('search');

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function timeAgo(ts) {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

function searchText(c) {
  if (c.type === 'file') return c.files.map((f) => f.path).join('\n');
  if (c.type === 'image') return `image ${c.width}x${c.height}`;
  return c.text || '';
}

function matches(c) {
  if (tab !== 'all' && c.type !== tab) return false;
  if (!query) return true;
  return searchText(c).toLowerCase().includes(query.toLowerCase());
}

// Pinned first, then newest first.
function sorted(items) {
  return items.slice().sort((a, b) => (b.pinned - a.pinned) || (b.createdAt - a.createdAt));
}

function renderTabs() {
  tabsEl.textContent = '';
  for (const s of state.sections) {
    const n = s.id === 'all' ? state.items.length : state.items.filter((c) => c.type === s.id).length;
    const b = el('button', `tab${s.id === tab ? ' active' : ''}${n === 0 ? ' empty' : ''}`, s.label);
    b.setAttribute('role', 'tab');
    b.appendChild(el('span', 'n', String(n)));
    b.onclick = () => { setTab(s.id); searchEl.focus(); };
    tabsEl.appendChild(b);
  }
}

function renderPreview(c) {
  if (c.type === 'image') {
    const wrap = el('div');
    const img = el('img', 'thumb');
    img.src = c.thumb;
    img.alt = 'Copied image';
    wrap.appendChild(img);
    return wrap;
  }
  if (c.type === 'color') {
    const row = el('div', 'color-row');
    const sw = el('span', 'swatch');
    const fill = el('i');
    fill.style.background = c.text.trim();
    sw.appendChild(fill);
    row.appendChild(sw);
    row.appendChild(el('span', 'preview code', c.text.trim()));
    return row;
  }
  if (c.type === 'file') {
    const ul = el('ul', 'files');
    const shown = c.files.slice(0, 3);
    for (const f of shown) {
      const li = el('li');
      li.title = f.path;
      const ext = f.dir ? 'folder' : (f.name.includes('.') ? f.name.split('.').pop() : 'file');
      li.appendChild(el('span', 'ext', ext));
      li.appendChild(document.createTextNode(f.name));
      ul.appendChild(li);
    }
    if (c.files.length > shown.length) ul.appendChild(el('li', 'more', `+ ${c.files.length - shown.length} more`));
    return ul;
  }
  const text = c.text.length > 600 ? `${c.text.slice(0, 600)}…` : c.text;
  return el('div', `preview ${c.type}`, c.type === 'code' ? text : text.trim());
}

function renderItem(c, index) {
  const row = el('div', `item${index === selected ? ' selected' : ''}`);
  row.setAttribute('role', 'option');
  row.dataset.index = index;

  row.appendChild(el('span', 'key', index < 10 ? String((index + 1) % 10) : ''));

  const body = el('div', 'body');
  const meta = el('div', 'meta');
  meta.appendChild(el('span', `badge ${c.type}`, c.type === 'file' ? `Files · ${state.fileGroupLabels[c.fileGroup] || 'Other'}` : TYPE_LABELS[c.type]));
  if (c.type === 'image') meta.appendChild(el('span', null, `${c.width}×${c.height}`));
  if (c.type === 'file' && c.files.length > 1) meta.appendChild(el('span', null, `${c.files.length} items`));
  if (c.type === 'text' || c.type === 'code') meta.appendChild(el('span', null, `${c.text.length.toLocaleString()} chars`));
  meta.appendChild(el('span', null, `· ${timeAgo(c.createdAt)}`));
  if (c.pinned) meta.appendChild(el('span', 'pin-mark', '● pinned'));
  body.appendChild(meta);
  body.appendChild(renderPreview(c));
  row.appendChild(body);

  const actions = el('div', 'actions');
  const pin = el('button', null, c.pinned ? 'Unpin' : 'Pin');
  pin.title = 'Pinned items are never pushed out (Ctrl+P)';
  pin.onclick = (e) => { e.stopPropagation(); window.clip.pin(c.id); };
  const del = el('button', 'del', 'Delete');
  del.title = 'Remove from history (Delete)';
  del.onclick = (e) => { e.stopPropagation(); window.clip.remove(c.id); };
  actions.append(pin, del);
  row.appendChild(actions);

  row.onmouseenter = () => { selected = index; markSelected(false); };
  row.onclick = () => paste(c);
  return row;
}

function render() {
  if (!state) return;
  $('count').textContent = `${state.items.length} / ${state.limit} saved${state.paused ? ' · paused' : ''}`;
  renderTabs();

  const items = sorted(state.items.filter(matches));
  listEl.textContent = '';

  if (!items.length) {
    const empty = el('div', 'empty-state');
    if (!state.items.length) {
      empty.appendChild(el('b', null, 'Nothing copied yet'));
      empty.appendChild(el('span', null, `Copy things as usual. Press ${state.shortcut} any time to pick one to paste.`));
    } else {
      empty.appendChild(el('b', null, query ? 'No matches' : 'Nothing in this section'));
    }
    listEl.appendChild(empty);
    visible = [];
    selected = 0;
    return;
  }

  // The Files section is split up by kind of file (Design, Documents, ...).
  visible = tab === 'file'
    ? state.fileGroupOrder.flatMap((g) => items.filter((c) => c.fileGroup === g))
    : items;
  selected = Math.min(selected, visible.length - 1);

  let group = null;
  visible.forEach((c, i) => {
    if (tab === 'file' && c.fileGroup !== group) {
      group = c.fileGroup;
      listEl.appendChild(el('div', 'group-label', state.fileGroupLabels[group]));
    }
    listEl.appendChild(renderItem(c, i));
  });
  markSelected(true);
}

function markSelected(scroll) {
  for (const row of listEl.querySelectorAll('.item')) {
    const on = Number(row.dataset.index) === selected;
    row.classList.toggle('selected', on);
    if (on && scroll) row.scrollIntoView({ block: 'nearest' });
  }
}

function setTab(id) {
  tab = id;
  selected = 0;
  render();
}

function cycleTab(dir) {
  const ids = state.sections.map((s) => s.id);
  setTab(ids[(ids.indexOf(tab) + dir + ids.length) % ids.length]);
}

function paste(c, opts) {
  if (c) window.clip.paste(c.id, opts);
}

function renderHint() {
  const hint = $('hint');
  hint.textContent = '';
  const add = (keys, label) => {
    const span = el('span');
    for (const k of keys) span.appendChild(el('kbd', null, k));
    span.appendChild(document.createTextNode(` ${label}`));
    hint.appendChild(span);
  };
  const mod = state && state.platform === 'darwin' ? 'Cmd' : 'Ctrl';
  add(['↑', '↓'], 'choose');
  add(['Enter'], state && state.autoPaste ? 'paste' : 'copy');
  add(['1-9'], 'quick paste');
  add(['Tab'], 'section');
  add([`${mod}+P`], 'pin');
  add(['Del'], 'remove');
}

document.addEventListener('keydown', (e) => {
  if (!state) return;
  const mod = e.ctrlKey || e.metaKey;
  const current = visible[selected];

  if (e.key === 'Escape') {
    e.preventDefault();
    if (query) { searchEl.value = ''; query = ''; render(); } else window.clip.hide();
    return;
  }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (!visible.length) return;
    selected = (selected + (e.key === 'ArrowDown' ? 1 : -1) + visible.length) % visible.length;
    markSelected(true);
    return;
  }
  if (e.key === 'Tab') {
    e.preventDefault();
    cycleTab(e.shiftKey ? -1 : 1);
    return;
  }
  if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !query) {
    e.preventDefault();
    cycleTab(e.key === 'ArrowLeft' ? -1 : 1);
    return;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    // Shift+Enter: paste as plain text (files become their paths). Ctrl+Enter: copy only.
    paste(current, { plain: e.shiftKey, copyOnly: mod });
    return;
  }
  if (mod && e.key.toLowerCase() === 'p') {
    e.preventDefault();
    if (current) window.clip.pin(current.id);
    return;
  }
  if (e.key === 'Delete' && (!query || mod)) {
    e.preventDefault();
    if (current) window.clip.remove(current.id);
    return;
  }
  // Number keys paste straight away while the search box is empty.
  if (!query && !mod && !e.altKey && /^[0-9]$/.test(e.key)) {
    e.preventDefault();
    const i = e.key === '0' ? 9 : Number(e.key) - 1;
    paste(visible[i]);
  }
});

searchEl.addEventListener('input', () => {
  query = searchEl.value;
  selected = 0;
  render();
});

$('close').onclick = () => window.clip.hide();
$('clear').onclick = () => window.clip.clear();

window.clip.onState((s) => { state = s; render(); renderHint(); });
window.clip.onShown(() => {
  searchEl.value = '';
  query = '';
  selected = 0;
  tab = 'all';
  render();
  searchEl.focus();
});

window.clip.getState().then((s) => { state = s; render(); renderHint(); searchEl.focus(); });
