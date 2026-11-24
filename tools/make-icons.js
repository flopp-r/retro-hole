// Draws the favicon (pixel art, no installs): a dark hole in a green field with a little red voxel dropping in.
// Run: node tools/make-icons.js   (writes icons/favicon-32.png)
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const N = 32, px = new Uint8Array(N * N * 4);
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255];
const put = (x, y, c) => { if (x < 0 || y < 0 || x >= N || y >= N) return; px.set(c, (y * N + x) * 4); };
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) put(x, y, hex((x >> 2) + (y >> 2) & 1 ? '#67a547' : '#79b952'));
const ell = (cx, cy, rx, ry, c) => { for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) put(x, y, c); };
ell(16, 19, 13, 8.5, hex('#1a1433')); ell(16, 19, 11.6, 7.2, hex('#ffd76a')); ell(16, 19, 10.4, 6.2, hex('#000000')); ell(16, 21, 7, 3.5, hex('#241a3a'));
const box = (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(x + i, y + j, c); };
box(13, 8, 6, 6, hex('#d6443c')); box(13, 8, 6, 2, hex('#ff7a6a')); box(17, 10, 2, 4, hex('#a8322b'));
const crc = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return b => { let c = 0xffffffff; for (const v of b) c = t[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }; })();
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]), c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
const raw = Buffer.alloc((N * 4 + 1) * N);
for (let y = 0; y < N; y++) { raw[y * (N * 4 + 1)] = 0; Buffer.from(px.buffer, y * N * 4, N * 4).copy(raw, y * (N * 4 + 1) + 1); }
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 8; ihdr[9] = 6;
fs.writeFileSync(path.join(__dirname, '..', 'icons', 'favicon-32.png'), Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log('Wrote icons/favicon-32.png');
