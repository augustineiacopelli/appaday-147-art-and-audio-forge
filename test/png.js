// Minimal PNG writer for test contact sheets (no dependencies). sheet(cells, opts) lays out RGBA frames on a grid.
'use strict';
const zlib = require('zlib');
const fs = require('fs');
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc(buf) { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
}
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
// cells: [{w, h, rgba}] or null for a gap. opts: {cols, scale, pad, bg: [r, g, b]}
function sheet(file, cells, opts) {
  opts = opts || {};
  const sc = opts.scale || 4, pad = opts.pad || 4, cols = opts.cols || 8, bg = opts.bg || [44, 48, 64];
  const cw = Math.max(...cells.filter(Boolean).map((c) => c.w)) * sc + pad, ch = Math.max(...cells.filter(Boolean).map((c) => c.h)) * sc + pad;
  const rows = Math.ceil(cells.length / cols), W = cols * cw + pad, H = rows * ch + pad, out = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) { const chk = ((i % W) >> 3 ^ Math.floor(i / W) >> 3) & 1; out[i * 4] = bg[0] + chk * 8; out[i * 4 + 1] = bg[1] + chk * 8; out[i * 4 + 2] = bg[2] + chk * 8; out[i * 4 + 3] = 255; }
  cells.forEach((c, n) => {
    if (!c) return;
    const ox = pad + (n % cols) * cw, oy = pad + Math.floor(n / cols) * ch;
    for (let y = 0; y < c.h * sc; y++) for (let x = 0; x < c.w * sc; x++) {
      const s = (Math.floor(y / sc) * c.w + Math.floor(x / sc)) * 4;
      if (!c.rgba[s + 3]) continue;
      const d = ((oy + y) * W + ox + x) * 4;
      out[d] = c.rgba[s]; out[d + 1] = c.rgba[s + 1]; out[d + 2] = c.rgba[s + 2]; out[d + 3] = 255;
    }
  });
  fs.writeFileSync(file, png(W, H, out));
  return { w: W, h: H };
}
module.exports = { png, sheet };
