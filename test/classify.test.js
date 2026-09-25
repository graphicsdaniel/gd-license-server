'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { classifyText, fileGroup, dominantFileGroup, baseName } = require('../src/classify');
const { parseUriList, parsePlistStrings } = require('../src/platform');

test('plain sentences are text', () => {
  assert.strictEqual(classifyText('Hello there, see you at 5pm tomorrow.'), 'text');
  assert.strictEqual(classifyText('Invoice #1042 - total $250 (paid).'), 'text');
});

test('urls are links', () => {
  assert.strictEqual(classifyText('https://gumroad.com/l/abc?x=1'), 'link');
  assert.strictEqual(classifyText('www.example.com'), 'link');
  assert.strictEqual(classifyText('https://a.com\nhttps://b.com'), 'link');
  assert.strictEqual(classifyText('check https://a.com out'), 'text');
});

test('colours are detected', () => {
  for (const c of ['#fff', '#6C8CFF', '#6c8cff80', 'rgb(10, 20, 30)', 'rgba(10,20,30,0.5)', 'hsl(210, 50%, 40%)']) {
    assert.strictEqual(classifyText(c), 'color', c);
  }
  assert.strictEqual(classifyText('#hashtag'), 'text');
});

test('code is detected', () => {
  assert.strictEqual(classifyText('const x = require("fs");\nmodule.exports = { x };'), 'code');
  assert.strictEqual(classifyText('def add(a, b):\n    return a + b'), 'code');
  assert.strictEqual(classifyText('{"name": "gd", "version": 1}'), 'code');
  assert.strictEqual(classifyText('<div class="a"><span>hi</span></div>'), 'code');
  assert.strictEqual(classifyText('SELECT * FROM users WHERE id = 3;'), 'code');
});

test('file groups by extension', () => {
  assert.strictEqual(fileGroup('C:\\Work\\logo.PSD'), 'design');
  assert.strictEqual(fileGroup('/Users/d/Invoice.pdf'), 'document');
  assert.strictEqual(fileGroup('/tmp/clip.mov'), 'video');
  assert.strictEqual(fileGroup('/tmp/photo.jpeg'), 'image');
  assert.strictEqual(fileGroup('/tmp/Makefile'), 'other');
  assert.strictEqual(fileGroup('/tmp/Projects', () => true), 'folder');
  assert.strictEqual(dominantFileGroup(['a.pdf', 'b.png', 'c.jpg']), 'image');
  assert.strictEqual(dominantFileGroup(['logo.psd', 'photo.png']), 'design');
  assert.strictEqual(baseName('C:\\Work\\logo.psd'), 'logo.psd');
  assert.strictEqual(baseName('/Users/d/Folder/'), 'Folder');
});

test('uri-list and plist parsing', () => {
  if (process.platform !== 'win32') {
    assert.deepStrictEqual(parseUriList('# comment\nfile:///tmp/a%20b.png\r\nfile:///tmp/c.pdf\n'), ['/tmp/a b.png', '/tmp/c.pdf']);
  }
  assert.deepStrictEqual(parsePlistStrings('<array><string>/a/b &amp; c.psd</string><string>/d.pdf</string></array>'), ['/a/b & c.psd', '/d.pdf']);
});
