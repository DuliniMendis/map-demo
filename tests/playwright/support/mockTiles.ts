import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { BrowserContext, Route } from '@playwright/test';
import { resolveTileRequest, type TileHost } from './tileRoutes.ts';

export const FIXTURE_ROOT = fileURLToPath(new URL('../../fixtures/tiles/', import.meta.url));

export interface TileLog {
  /** Every tile request answered from fixtures, in order. */
  served: { url: string; host: TileHost; kind: 'fixture' | 'fallback' | 'inline' }[];
  /** Requests answered with an injected failure (see `failHosts`). */
  failed: { url: string; host: TileHost }[];
  /** External requests that matched no fixture rule; they are aborted so nothing reaches the network. */
  blocked: string[];
}

export interface MockTilesOptions {
  /** Hosts whose tile requests get HTTP `failStatus` instead of a fixture (tile-fallback tests). */
  failHosts?: TileHost[];
  failStatus?: number;
}

const fileCache = new Map<string, Buffer>();
function readFixture(rel: string): Buffer {
  let buf = fileCache.get(rel);
  if (!buf) {
    buf = readFileSync(FIXTURE_ROOT + rel);
    fileCache.set(rel, buf);
  }
  return buf;
}
const exists = (rel: string) => fileCache.has(rel) || existsSync(FIXTURE_ROOT + rel);

function isLocal(url: URL): boolean {
  return (
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.hostname === '[::1]' ||
    url.hostname.endsWith('.localhost')
  );
}

/**
 * Intercepts every non-local http(s) request in `context`: known tile endpoints are served from
 * tests/fixtures/tiles/, everything else external is aborted and recorded in `log.blocked`.
 * Context-level routing also covers requests made from MapLibre's web worker (see
 * tests/playwright/tile-fixtures.spec.ts, which proves that on the current runner).
 */
export async function mockTiles(
  context: BrowserContext,
  opts: MockTilesOptions = {},
): Promise<TileLog> {
  const log: TileLog = { served: [], failed: [], blocked: [] };
  const failHosts = new Set(opts.failHosts ?? []);

  await context.route(
    (url) => (url.protocol === 'http:' || url.protocol === 'https:') && !isLocal(url),
    async (route: Route) => {
      const url = route.request().url();
      const answer = resolveTileRequest(url, exists);
      if (!answer) {
        log.blocked.push(url);
        await route.abort('blockedbyclient');
        return;
      }
      const headers = {
        'access-control-allow-origin': '*',
        'cache-control': 'no-store',
      };
      if (failHosts.has(answer.host)) {
        log.failed.push({ url, host: answer.host });
        await route.fulfill({ status: opts.failStatus ?? 500, headers, body: 'injected failure' });
        return;
      }
      log.served.push({ url, host: answer.host, kind: answer.kind });
      await route.fulfill({
        status: 200,
        headers,
        contentType: answer.contentType,
        body: answer.kind === 'inline' ? answer.body : readFixture(answer.file!),
      });
    },
  );
  return log;
}
