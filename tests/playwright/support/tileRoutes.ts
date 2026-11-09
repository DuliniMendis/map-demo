// Pure URL -> fixture mapping for the third-party tile hosts the map uses (docs/research.md).
// No Playwright imports here so it can be unit-tested with vitest (tests/unit/tileRoutes.test.ts).
// mockTiles.ts turns these answers into `route.fulfill()` calls.

export type TileHost = 'mapterhorn' | 'aws' | 'eox' | 'openfreemap';

export interface TileAnswer {
  host: TileHost;
  /** 'fixture' = a committed real tile; 'fallback' = generated stand-in; 'inline' = body below. */
  kind: 'fixture' | 'fallback' | 'inline';
  /** Path relative to tests/fixtures/tiles/ (for 'fixture' and 'fallback'). */
  file?: string;
  /** Response body for 'inline'. */
  body?: string;
  contentType: string;
}

/** Hostnames treated as tile hosts. Anything else external is unmatched (and blocked by mockTiles). */
export const TILE_HOSTNAMES: Record<string, TileHost> = {
  'tiles.mapterhorn.com': 'mapterhorn',
  's3.amazonaws.com': 'aws',
  'tiles.maps.eox.at': 'eox',
  'tiles.openfreemap.org': 'openfreemap',
};

const PNG = 'image/png';
const PBF = 'application/x-protobuf';
const JSON_TYPE = 'application/json';

/**
 * Maps a request URL to a fixture answer, or `null` when the URL is not a known tile endpoint.
 * `exists(relPath)` reports whether a committed fixture file is present (injected for testability).
 */
export function resolveTileRequest(
  rawUrl: string,
  exists: (relPath: string) => boolean,
): TileAnswer | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  const host = TILE_HOSTNAMES[url.hostname];
  if (!host) return null;
  const path = decodeURIComponent(url.pathname);
  const pick = (file: string, fallback: string, type: string, fixtureType = type): TileAnswer =>
    exists(file)
      ? { host, kind: 'fixture', file, contentType: fixtureType }
      : { host, kind: 'fallback', file: fallback, contentType: type };

  switch (host) {
    case 'mapterhorn': {
      if (path === '/tilejson.json') {
        return {
          host,
          kind: 'inline',
          contentType: JSON_TYPE,
          body: JSON.stringify({
            tilejson: '3.0.0',
            tiles: ['https://tiles.mapterhorn.com/{z}/{x}/{y}.webp'],
            encoding: 'terrarium',
            tileSize: 512,
            minzoom: 0,
            maxzoom: 17,
          }),
        };
      }
      const m = /^\/(\d+)\/(\d+)\/(\d+)\.webp$/.exec(path);
      if (!m) return null;
      const [, z, x, y] = m;
      return pick(`mapterhorn/${z}/${x}/${y}.webp`, 'fallback/dem-512.png', PNG, 'image/webp');
    }
    case 'aws': {
      const m = /^\/elevation-tiles-prod\/terrarium\/(\d+)\/(\d+)\/(\d+)\.png$/.exec(path);
      if (!m) return null;
      const [, z, x, y] = m;
      return pick(`aws/${z}/${x}/${y}.png`, 'fallback/dem-256.png', PNG);
    }
    case 'eox': {
      // WMTS REST: /wmts/1.0.0/<layer>/default/<matrixset>/{z}/{y}/{x}.jpg  (note y before x)
      const m = /^\/wmts\/1\.0\.0\/[^/]+\/default\/[^/]+\/(\d+)\/(\d+)\/(\d+)\.(jpe?g|png)$/.exec(
        path,
      );
      if (!m) return null;
      const [, z, y, x] = m;
      return pick(`eox/${z}/${x}/${y}.jpg`, 'fallback/imagery-256.png', PNG, 'image/jpeg');
    }
    case 'openfreemap': {
      if (path === '/planet' || path === '/planet/') {
        return {
          host,
          kind: 'fixture',
          file: 'openfreemap/planet.tilejson',
          contentType: JSON_TYPE,
        };
      }
      let m = /^\/planet\/[^/]+\/(\d+)\/(\d+)\/(\d+)\.pbf$/.exec(path);
      if (m) {
        const [, z, x, y] = m;
        return pick(`openfreemap/planet/${z}/${x}/${y}.pbf`, 'fallback/empty.pbf', PBF);
      }
      m = /^\/fonts\/([^/]+)\/(\d+-\d+)\.pbf$/.exec(path);
      if (m) {
        const [, stack, range] = m;
        return pick(`openfreemap/fonts/${stack}/${range}.pbf`, 'fallback/empty.pbf', PBF);
      }
      if (/^\/sprites\/.+\.json$/.test(path)) {
        return { host, kind: 'inline', contentType: JSON_TYPE, body: '{}' };
      }
      if (/^\/sprites\/.+\.png$/.test(path)) {
        return { host, kind: 'fallback', file: 'fallback/transparent-1.png', contentType: PNG };
      }
      return null;
    }
  }
}
