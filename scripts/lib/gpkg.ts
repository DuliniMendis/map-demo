import type { Ring } from './geo.ts';

/**
 * Parses a GeoPackage geometry blob (GP header + WKB) holding a Polygon or MultiPolygon into a
 * flat list of rings of [x, y]. Z/M ordinates are skipped. See OGC 12-128r18 §2.1.3.
 */
export function parseGpkgGeometry(blob: Uint8Array): Ring[] {
  const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
  if (blob[0] !== 0x47 || blob[1] !== 0x50) throw new Error('not a GeoPackage geometry blob');
  const flags = blob[3];
  if (flags & 0b10000) return []; // empty geometry
  const envelopeBytes = [0, 32, 48, 48, 64][(flags >> 1) & 0b111];
  if (envelopeBytes === undefined) throw new Error('bad GeoPackage envelope indicator');
  return parseWkb(view, 8 + envelopeBytes).rings;
}

interface WkbResult {
  rings: Ring[];
  offset: number;
}

function parseWkb(view: DataView, start: number): WkbResult {
  let offset = start;
  const le = view.getUint8(offset) === 1;
  offset += 1;
  const rawType = view.getUint32(offset, le);
  offset += 4;
  // ISO WKB: 1000s = Z, 2000s = M, 3000s = ZM. EWKB high bits: 0x80000000 Z, 0x40000000 M.
  let type = rawType & 0x0fffffff;
  let dims = 2;
  if (rawType & 0x80000000) dims++;
  if (rawType & 0x40000000) dims++;
  if (type > 1000) {
    const iso = Math.floor(type / 1000);
    dims = iso === 3 ? 4 : 3;
    type %= 1000;
  }
  const readPolygon = (rings: Ring[]) => {
    const nRings = view.getUint32(offset, le);
    offset += 4;
    for (let r = 0; r < nRings; r++) {
      const nPts = view.getUint32(offset, le);
      offset += 4;
      const ring: number[][] = new Array(nPts);
      for (let p = 0; p < nPts; p++) {
        ring[p] = [view.getFloat64(offset, le), view.getFloat64(offset + 8, le)];
        offset += 8 * dims;
      }
      rings.push(ring);
    }
  };
  const rings: Ring[] = [];
  if (type === 3) {
    readPolygon(rings);
  } else if (type === 6) {
    const n = view.getUint32(offset, le);
    offset += 4;
    for (let i = 0; i < n; i++) {
      const part = parseWkb(view, offset);
      rings.push(...part.rings);
      offset = part.offset;
    }
  } else {
    throw new Error(`unsupported WKB geometry type ${rawType} (expected Polygon or MultiPolygon)`);
  }
  return { rings, offset };
}

/** Builds a little-endian GeoPackage blob for a polygon/multipolygon (used by tests). */
export function encodeGpkgPolygon(
  polygons: readonly (readonly Ring[])[],
  srsId = 4326,
): Uint8Array {
  const parts: number[] = [];
  const u8 = (n: number) => parts.push(n);
  const u32 = (n: number) => {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, n, true);
    parts.push(...b);
  };
  const f64 = (n: number) => {
    const b = new Uint8Array(8);
    new DataView(b.buffer).setFloat64(0, n, true);
    parts.push(...b);
  };
  // header: magic, version 0, flags (little-endian, no envelope), srs id
  parts.push(0x47, 0x50, 0, 0b1);
  u32(srsId);
  u8(1);
  u32(6);
  u32(polygons.length);
  for (const rings of polygons) {
    u8(1);
    u32(3);
    u32(rings.length);
    for (const ring of rings) {
      u32(ring.length);
      for (const [x, y] of ring) {
        f64(x);
        f64(y);
      }
    }
  }
  return Uint8Array.from(parts);
}
