// Generates kinpaku lacquer + gold "T" PNGs for the PWA manifest.
// Zero-dependency: builds PNGs with zlib + a minimal CRC32 writer.
// Usage: node scripts/gen-pwa-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

// Kinpaku lacquer bg (#0e0c09, matches index.html theme-color) + gold "T" (#e3b341).
const BG = [14, 12, 9, 255];
const GOLD = [227, 179, 65, 255];

const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function toPNG(size, rgba) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter type 0 (None)
    Buffer.from(rgba.subarray(y * size * 4, (y + 1) * size * 4)).copy(
      raw,
      y * (size * 4 + 1) + 1,
    );
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/**
 * Draw a bold serif-ish "T": top bar + centered stem, inside a rounded
 * lacquer tile. `pad` is the fraction of the tile kept as margin
 * (larger for maskable safe-zone).
 */
function drawT(size, pad) {
  const px = new Uint8Array(size * size * 4);
  const r = Math.round(size * 0.22); // corner radius
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Rounded-rect mask for the tile.
      const cx = Math.min(Math.max(x, r), size - 1 - r);
      const cy = Math.min(Math.max(y, r), size - 1 - r);
      const dx = x - cx;
      const dy = y - cy;
      const inside = dx * dx + dy * dy <= r * r;
      const o = (y * size + x) * 4;
      const c = inside ? BG : [0, 0, 0, 0];
      px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = c[3];
    }
  }
  // "T" geometry within the padded box.
  const x0 = size * pad;
  const x1 = size * (1 - pad);
  const y0 = size * pad;
  const y1 = size * (1 - pad);
  const w = x1 - x0;
  const barH = (y1 - y0) * 0.22;      // top bar thickness
  const stemW = w * 0.26;             // stem width
  const stemX0 = (size - stemW) / 2;
  const stemX1 = (size + stemW) / 2;
  for (let y = Math.round(y0); y < Math.round(y0 + barH); y++) {
    for (let x = Math.round(x0); x < Math.round(x1); x++) {
      const o = (y * size + x) * 4;
      px[o] = GOLD[0]; px[o + 1] = GOLD[1]; px[o + 2] = GOLD[2]; px[o + 3] = GOLD[3];
    }
  }
  for (let y = Math.round(y0); y < Math.round(y1); y++) {
    for (let x = Math.round(stemX0); x < Math.round(stemX1); x++) {
      const o = (y * size + x) * 4;
      px[o] = GOLD[0]; px[o + 1] = GOLD[1]; px[o + 2] = GOLD[2]; px[o + 3] = GOLD[3];
    }
  }
  return px;
}

mkdirSync(root, { recursive: true });
const targets = [
  { name: 'pwa-192.png', size: 192, pad: 0.2 },
  { name: 'pwa-512.png', size: 512, pad: 0.2 },
  { name: 'maskable-512.png', size: 512, pad: 0.32 },
  { name: 'apple-touch-icon.png', size: 180, pad: 0.2 },
];
for (const t of targets) {
  writeFileSync(join(root, t.name), toPNG(t.size, drawT(t.size, t.pad)));
  console.log(`wrote public/${t.name} (${t.size}x${t.size})`);
}
