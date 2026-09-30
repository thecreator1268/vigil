// Generates the PWA PNG icons with no image dependencies (raw PNG via zlib).
// Motif: an ice "watchful" ring with a centre dot on navy — calm, not an eye
// that stares. Run: pnpm --filter @vigil/pwa icons
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
mkdirSync(out, { recursive: true });

const NAVY = [15, 31, 61];
const ICE = [188, 220, 238];
const PAPER = [251, 250, 247];

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function icon(size, { maskable }) {
  const safe = maskable ? 0.8 : 1; // maskable icons keep content in the inner 80%
  const cx = size / 2;
  const rOuter = size * 0.3 * safe;
  const stroke = size * 0.07 * safe;
  const rDot = size * 0.085 * safe;
  const corner = maskable ? 0 : size * 0.22;
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = [0]; // filter: none
    for (let x = 0; x < size; x++) {
      // rounded-square tile (full bleed when maskable)
      const dx = Math.max(corner - x, 0, x - (size - 1 - corner));
      const dy = Math.max(corner - y, 0, y - (size - 1 - corner));
      const inTile = corner === 0 || dx * dx + dy * dy <= corner * corner;
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cx);
      let rgb = PAPER;
      let a = 0;
      if (inTile) {
        rgb = NAVY;
        a = 255;
        if (Math.abs(d - rOuter) <= stroke / 2 || d <= rDot) rgb = ICE;
      }
      row.push(...rgb, a);
    }
    rows.push(Buffer.from(row));
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const [name, size, maskable] of [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true],
]) {
  writeFileSync(join(out, name), icon(size, { maskable }));
  console.log(`wrote public/icons/${name}`);
}
