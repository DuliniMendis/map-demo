import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface Header {
  key: string;
  value: string;
}
interface VercelConfig {
  framework: string;
  outputDirectory: string;
  cleanUrls: boolean;
  headers: { source: string; headers: Header[] }[];
}

const root = new URL('../../', import.meta.url);
const config = JSON.parse(readFileSync(new URL('vercel.json', root), 'utf8')) as VercelConfig;

/** Vercel `source` patterns are path-to-regexp; ours only use `(.*)` and `\.`, which match as RegExp. */
function headersFor(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rule of config.headers) {
    const re = new RegExp(`^${rule.source}$`);
    if (re.test(path)) for (const h of rule.headers) out[h.key.toLowerCase()] = h.value;
  }
  return out;
}

describe('vercel.json', () => {
  it('is a static Vite deploy of dist/ with clean URLs', () => {
    expect(config.framework).toBe('vite');
    expect(config.outputDirectory).toBe('dist');
    expect(config.cleanUrls).toBe(true);
  });

  it('caches hashed assets forever', () => {
    expect(headersFor('/assets/index-DVHCzxj8.js')['cache-control']).toBe(
      'public, max-age=31536000, immutable',
    );
  });

  it('caches data JSON at the edge for a day with stale-while-revalidate', () => {
    const cc = headersFor('/data/nations.json')['cache-control'];
    expect(cc).toContain('s-maxage=86400');
    expect(cc).toContain('stale-while-revalidate');
    expect(cc).toContain('max-age=0');
  });

  it('does not give the HTML entry point a long cache', () => {
    expect(headersFor('/')['cache-control']).toBeUndefined();
    expect(headersFor('/index.html')['cache-control']).toBeUndefined();
  });

  it('ships a 404 page and robots.txt (no SPA catch-all rewrite that would mask missing files)', () => {
    expect(existsSync(new URL('public/404.html', root))).toBe(true);
    expect(existsSync(new URL('public/robots.txt', root))).toBe(true);
    expect(config).not.toHaveProperty('rewrites');
  });
});
