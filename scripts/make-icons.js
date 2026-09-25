'use strict';

// Draws the app and tray icons (a clipboard with a few lines) as PNGs.
// Run with: node scripts/make-icons.js

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let c;
  let crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function png(width, height, rgba) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Signed distance to a rounded rectangle centred at (cx, cy).
function roundRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - hw + r;
  const qy = Math.abs(py - cy) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

// Draws layers in a 0..1 coordinate space; each layer is [sdf, [r,g,b,a]].
function draw(size, layers) {
  const out = Buffer.alloc(size * size * 4);
  const aa = 1.2 / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;
      let r = 0; let g = 0; let b = 0; let a = 0;
      for (const [sdf, col] of layers) {
        const cov = Math.min(1, Math.max(0, 0.5 - sdf(u, v) / aa)) * (col[3] / 255);
        r = col[0] * cov + r * (1 - cov);
        g = col[1] * cov + g * (1 - cov);
        b = col[2] * cov + b * (1 - cov);
        a = cov + a * (1 - cov);
      }
      const i = (y * size + x) * 4;
      out[i] = a ? Math.min(255, Math.round(r / a)) : 0;
      out[i + 1] = a ? Math.min(255, Math.round(g / a)) : 0;
      out[i + 2] = a ? Math.min(255, Math.round(b / a)) : 0;
      out[i + 3] = Math.round(a * 255);
    }
  }
  return png(size, size, out);
}

const board = (u, v) => roundRect(u, v, 0.5, 0.55, 0.3, 0.38, 0.07);
const clip = (u, v) => roundRect(u, v, 0.5, 0.18, 0.14, 0.07, 0.04);
const line = (y, w) => (u, v) => roundRect(u, v, 0.26 + w / 2, y, w / 2, 0.028, 0.028);
const cut = (f, g) => (u, v) => Math.max(f(u, v), -g(u, v));

const out = path.join(__dirname, '..', 'assets');
fs.mkdirSync(out, { recursive: true });

// Colour app icon.
const bg = (u, v) => roundRect(u, v, 0.5, 0.5, 0.46, 0.46, 0.2);
const colourLayers = [
  [bg, [40, 44, 60, 255]],
  [board, [108, 140, 255, 255]],
  [clip, [233, 234, 238, 255]],
  [line(0.42, 0.42), [255, 255, 255, 230]],
  [line(0.55, 0.32), [255, 255, 255, 230]],
  [line(0.68, 0.38), [255, 255, 255, 230]],
];
fs.writeFileSync(path.join(out, 'icon.png'), draw(512, colourLayers));

// Tray: light glyph for Windows/Linux dark taskbars, black template for macOS.
const glyph = cut(cut(cut(board, line(0.42, 0.42)), line(0.55, 0.32)), line(0.68, 0.38));
const glyphWithClip = (u, v) => Math.min(cut(glyph, (a, b) => clip(a, b) - 0.03)(u, v), clip(u, v));
fs.writeFileSync(path.join(out, 'tray.png'), draw(32, [[glyphWithClip, [236, 238, 244, 255]]]));
fs.writeFileSync(path.join(out, 'trayTemplate.png'), draw(16, [[glyphWithClip, [0, 0, 0, 255]]]));
fs.writeFileSync(path.join(out, 'trayTemplate@2x.png'), draw(32, [[glyphWithClip, [0, 0, 0, 255]]]));
console.log('icons written to', out);
