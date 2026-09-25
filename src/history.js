'use strict';

const MIN_ITEMS = 10;
const MAX_ITEMS = 15;

function clampLimit(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return MAX_ITEMS;
  return Math.min(MAX_ITEMS, Math.max(MIN_ITEMS, v));
}

let counter = 0;
function newId() {
  counter = (counter + 1) % 1e6;
  return `${Date.now().toString(36)}-${counter.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

// Ordered list of clips, newest first. Pinned clips are kept when the list is
// trimmed; the oldest unpinned clips are dropped once the limit is exceeded.
class History {
  constructor({ limit = MAX_ITEMS, items = [] } = {}) {
    this.limit = clampLimit(limit);
    this.items = items.slice();
    this.trim();
  }

  setLimit(n) {
    this.limit = clampLimit(n);
    return this.trim();
  }

  // Adds a clip (or moves an identical one to the top). Returns the clips that
  // were evicted so the caller can clean up anything stored for them.
  add(clip) {
    const existing = this.items.findIndex((c) => c.key === clip.key);
    if (existing !== -1) {
      const [old] = this.items.splice(existing, 1);
      this.items.unshift({ ...old, createdAt: clip.createdAt || Date.now() });
      return [];
    }
    this.items.unshift({ id: newId(), createdAt: Date.now(), pinned: false, ...clip });
    return this.trim();
  }

  // Moves a clip to the top without changing anything else (used after pasting).
  touch(id) {
    const i = this.items.findIndex((c) => c.id === id);
    if (i <= 0) return;
    const [clip] = this.items.splice(i, 1);
    clip.createdAt = Date.now();
    this.items.unshift(clip);
  }

  get(id) {
    return this.items.find((c) => c.id === id);
  }

  remove(id) {
    const i = this.items.findIndex((c) => c.id === id);
    return i === -1 ? [] : this.items.splice(i, 1);
  }

  togglePin(id) {
    const clip = this.get(id);
    if (clip) clip.pinned = !clip.pinned;
    return this.trim();
  }

  // Removes everything except pinned clips.
  clear() {
    const removed = this.items.filter((c) => !c.pinned);
    this.items = this.items.filter((c) => c.pinned);
    return removed;
  }

  trim() {
    const removed = [];
    // Pinned clips can take up the whole list, but never push it past the limit.
    let pinnedBudget = this.limit;
    const kept = [];
    let unpinnedSlots = this.limit - Math.min(this.items.filter((c) => c.pinned).length, this.limit);
    for (const c of this.items) {
      if (c.pinned && pinnedBudget > 0) { kept.push(c); pinnedBudget--; continue; }
      if (!c.pinned && unpinnedSlots > 0) { kept.push(c); unpinnedSlots--; continue; }
      removed.push(c);
    }
    this.items = kept;
    return removed;
  }
}

module.exports = { History, clampLimit, MIN_ITEMS, MAX_ITEMS };
