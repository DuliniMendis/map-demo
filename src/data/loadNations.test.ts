import { describe, expect, it } from 'vitest';
import type { NationsFile } from '../types/nation';
import { STATE_CODES } from '../types/nation';
import { loadNations, NationsFileError, parseNationsFile } from './loadNations';
import mock from './mock-nations.json';

describe('mock-nations.json', () => {
  const file = parseNationsFile(mock);

  it('has 10 valid entries with unique ids', () => {
    expect(file.count).toBe(10);
    expect(new Set(file.nations.map((n) => n.id)).size).toBe(10);
  });

  it('covers every state and territory except OT', () => {
    const states = new Set(file.nations.map((n) => n.modern.stateCode));
    for (const code of STATE_CODES.filter((c) => c !== 'OT')) expect(states).toContain(code);
  });

  it('is sorted by name (en-AU)', () => {
    const names = file.nations.map((n) => n.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en-AU')));
  });

  it('has coordinates inside Australia', () => {
    for (const n of file.nations) {
      expect(n.lng).toBeGreaterThan(112);
      expect(n.lng).toBeLessThan(155);
      expect(n.lat).toBeGreaterThan(-45);
      expect(n.lat).toBeLessThan(-9);
    }
  });
});

describe('parseNationsFile', () => {
  const ok: NationsFile = { generatedAt: '2026-11-09', count: 0, nations: [] };

  it('accepts a well-formed file', () => {
    expect(parseNationsFile(ok)).toEqual(ok);
  });

  it('rejects a count mismatch', () => {
    expect(() => parseNationsFile({ ...ok, count: 3 })).toThrow(NationsFileError);
  });

  it('rejects non-objects and malformed entries', () => {
    expect(() => parseNationsFile(null)).toThrow(NationsFileError);
    expect(() => parseNationsFile({ ...ok, count: 1, nations: [{ id: 'X1' }] })).toThrow(
      /nations\[0\]/,
    );
  });
});

describe('loadNations', () => {
  it('falls back to the mock in dev when the server returns HTML', async () => {
    const fakeFetch = (async () =>
      new Response('<!doctype html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      })) as typeof fetch;
    const file = await loadNations(fakeFetch);
    expect(file.count).toBe(10);
  });

  it('uses the real file when it is served as JSON', async () => {
    const real: NationsFile = { generatedAt: '2026-11-10', count: 0, nations: [] };
    const fakeFetch = (async () =>
      new Response(JSON.stringify(real), {
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch;
    expect(await loadNations(fakeFetch)).toEqual(real);
  });
});
