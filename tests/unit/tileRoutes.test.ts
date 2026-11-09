import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { resolveTileRequest } from '../playwright/support/tileRoutes.ts';

const ROOT = fileURLToPath(new URL('../fixtures/tiles/', import.meta.url));
const exists = (rel: string) => existsSync(ROOT + rel);

describe('resolveTileRequest', () => {
  it('serves committed Mapterhorn tiles and falls back to a flat 512 px DEM tile', () => {
    expect(resolveTileRequest('https://tiles.mapterhorn.com/3/7/5.webp', exists)).toMatchObject({
      host: 'mapterhorn',
      kind: 'fixture',
      file: 'mapterhorn/3/7/5.webp',
      contentType: 'image/webp',
    });
    expect(
      resolveTileRequest('https://tiles.mapterhorn.com/13/7000/4700.webp', exists),
    ).toMatchObject({ kind: 'fallback', file: 'fallback/dem-512.png' });
  });

  it('maps AWS terrarium tiles, with a 256 px DEM fallback', () => {
    expect(
      resolveTileRequest(
        'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/3/6/4.png',
        exists,
      ),
    ).toMatchObject({ host: 'aws', kind: 'fixture', file: 'aws/3/6/4.png' });
    expect(
      resolveTileRequest(
        'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/9/1/1.png',
        exists,
      ),
    ).toMatchObject({ kind: 'fallback', file: 'fallback/dem-256.png' });
    expect(
      resolveTileRequest('https://s3.amazonaws.com/some-other-bucket/x.png', exists),
    ).toBeNull();
  });

  it('swaps EOX {z}/{y}/{x} into the fixture z/x/y layout', () => {
    const url = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/5/18/28.jpg';
    expect(resolveTileRequest(url, exists)).toMatchObject({
      host: 'eox',
      kind: 'fixture',
      file: 'eox/5/28/18.jpg',
      contentType: 'image/jpeg',
    });
  });

  it('handles OpenFreeMap TileJSON, any tileset version, glyphs and sprites', () => {
    expect(resolveTileRequest('https://tiles.openfreemap.org/planet', exists)).toMatchObject({
      kind: 'fixture',
      file: 'openfreemap/planet.tilejson',
    });
    expect(
      resolveTileRequest(
        'https://tiles.openfreemap.org/planet/20990101_000000_pt/3/6/4.pbf',
        exists,
      ),
    ).toMatchObject({ kind: 'fixture', file: 'openfreemap/planet/3/6/4.pbf' });
    expect(
      resolveTileRequest('https://tiles.openfreemap.org/planet/x/14/1/1.pbf', exists),
    ).toMatchObject({ kind: 'fallback', file: 'fallback/empty.pbf' });
    expect(
      resolveTileRequest(
        'https://tiles.openfreemap.org/fonts/Noto%20Sans%20Regular/0-255.pbf',
        exists,
      ),
    ).toMatchObject({ kind: 'fixture', file: 'openfreemap/fonts/Noto Sans Regular/0-255.pbf' });
    expect(
      resolveTileRequest('https://tiles.openfreemap.org/sprites/ofm_f384/ofm.json', exists),
    ).toMatchObject({ kind: 'inline', body: '{}' });
  });

  it('returns null for unknown hosts and unknown paths, so mockTiles blocks them', () => {
    expect(resolveTileRequest('https://example.com/1/2/3.png', exists)).toBeNull();
    expect(resolveTileRequest('https://tiles.openfreemap.org/styles/liberty', exists)).toBeNull();
    expect(resolveTileRequest('not a url', exists)).toBeNull();
  });

  it('every committed fixture file referenced by the resolver exists', () => {
    for (const f of [
      'fallback/dem-512.png',
      'fallback/dem-256.png',
      'fallback/imagery-256.png',
      'fallback/transparent-1.png',
      'fallback/empty.pbf',
      'openfreemap/planet.tilejson',
    ]) {
      expect(exists(f), f).toBe(true);
    }
  });
});
