// Generates the tiny fallback tiles in tests/fixtures/tiles/fallback/. They answer every tile request
// that has no committed fixture (higher zooms, other places), so tests never reach a live tile host.
// Output is deterministic; re-run only if you change a colour or size:
//   node tests/fixtures/tiles/make-fallbacks.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const OUT = new URL('./fallback/', import.meta.url);

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Solid-colour PNG. `rgba` has 3 (RGB) or 4 (RGBA) channels. */
function solidPng(size: number, rgba: number[]): Buffer {
  const channels = rgba.length;
  const row = Buffer.alloc(1 + size * channels);
  for (let x = 0; x < size; x++) row.set(rgba, 1 + x * channels);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = channels === 4 ? 6 : 2; // colour type RGBA / RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
// Terrarium encoding: elevation = R*256 + G + B/256 - 32768, so (128, 0, 0) is a flat 0 m tile.
writeFileSync(new URL('dem-512.png', OUT), solidPng(512, [128, 0, 0]));
writeFileSync(new URL('dem-256.png', OUT), solidPng(256, [128, 0, 0]));
// Muted earth tone for imagery so markers and labels stay visible on it in screenshots.
writeFileSync(new URL('imagery-256.png', OUT), solidPng(256, [107, 90, 69]));
// Sprite sheets: one transparent pixel (the sprite index JSON is served inline as `{}`).
writeFileSync(new URL('transparent-1.png', OUT), solidPng(1, [0, 0, 0, 0]));
// An empty protobuf is a valid vector tile / glyph range with no content.
writeFileSync(new URL('empty.pbf', OUT), Buffer.alloc(0));
console.log('wrote', OUT.pathname);
