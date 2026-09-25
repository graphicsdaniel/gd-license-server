'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { History, clampLimit } = require('../src/history');

const clip = (n) => ({ key: `t:${n}`, type: 'text', text: String(n) });

test('limit is kept between 10 and 15', () => {
  assert.strictEqual(clampLimit(3), 10);
  assert.strictEqual(clampLimit(12), 12);
  assert.strictEqual(clampLimit(99), 15);
  assert.strictEqual(clampLimit('x'), 15);
});

test('keeps only the newest items up to the limit', () => {
  const h = new History({ limit: 10 });
  const evicted = [];
  for (let i = 1; i <= 13; i++) evicted.push(...h.add(clip(i)));
  assert.strictEqual(h.items.length, 10);
  assert.strictEqual(h.items[0].text, '13');
  assert.deepStrictEqual(evicted.map((c) => c.text), ['1', '2', '3']);
});

test('copying the same thing again moves it to the top', () => {
  const h = new History();
  h.add(clip('a'));
  h.add(clip('b'));
  h.add(clip('a'));
  assert.deepStrictEqual(h.items.map((c) => c.text), ['a', 'b']);
});

test('pinned items survive trimming and clearing', () => {
  const h = new History({ limit: 10 });
  h.add(clip('keep'));
  h.togglePin(h.items[0].id);
  for (let i = 0; i < 20; i++) h.add(clip(i));
  assert.strictEqual(h.items.length, 10);
  assert.ok(h.items.some((c) => c.text === 'keep'));
  h.clear();
  assert.deepStrictEqual(h.items.map((c) => c.text), ['keep']);
});

test('shrinking the limit evicts the oldest', () => {
  const h = new History({ limit: 15 });
  for (let i = 0; i < 15; i++) h.add(clip(i));
  const removed = h.setLimit(10);
  assert.strictEqual(removed.length, 5);
  assert.strictEqual(h.items.length, 10);
});
