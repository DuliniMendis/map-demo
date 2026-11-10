// Info-card illustration prompts (scripts/lib/nation-images.ts, docs/images.md). No network.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Nation, NationsFile } from '../../src/types/nation.ts';
import {
  buildImagePrompt,
  featureOf,
  pricePerImage,
  regionOf,
  seedFor,
} from '../../scripts/lib/nation-images.ts';

const nations = (JSON.parse(readFileSync('public/data/nations.json', 'utf8')) as NationsFile)
  .nations;
const at = (lat: number, lng: number, stateCode: Nation['modern']['stateCode']) => ({
  lat,
  lng,
  modern: { locality: '', state: '', stateCode },
});

describe('regionOf', () => {
  it('places well-known areas in a sensible landscape', () => {
    expect(regionOf(at(-12.6, 132.8, 'NT')).key).toBe('tropical-savanna'); // Kakadu
    expect(regionOf(at(-16.9, 145.7, 'QLD')).key).toBe('wet-tropics'); // Cairns
    expect(regionOf(at(-25.3, 131.0, 'NT')).key).toBe('arid-interior'); // Uluru
    expect(regionOf(at(-22.3, 118.6, 'WA')).key).toBe('pilbara'); // Karijini
    expect(regionOf(at(-34.4, 116.0, 'WA')).key).toBe('south-west'); // Pemberton
    expect(regionOf(at(-33.7, 150.3, 'NSW')).key).toBe('east-coast'); // Blue Mountains
    expect(regionOf(at(-37.3, 142.5, 'VIC')).key).toBe('temperate-south'); // Grampians
    expect(regionOf(at(-32.0, 145.0, 'NSW')).key).toBe('semi-arid'); // Cobar
    expect(regionOf(at(-31.5, 129.0, 'WA')).key).toBe('nullarbor');
    expect(regionOf(at(-42.0, 146.0, 'TAS')).key).toBe('tasmania');
  });
});

describe('buildImagePrompt', () => {
  it('drafts a prompt and alt text for every nation', () => {
    for (const n of nations) {
      const { prompt, alt } = buildImagePrompt(n);
      expect(prompt.length, n.id).toBeGreaterThan(100);
      expect(alt, n.id).toMatch(/^Pencil sketch of [^,]+\. An impression of the region/);
    }
  });

  it('never names the place, the nation or the landmark', () => {
    for (const n of nations) {
      const { prompt, alt } = buildImagePrompt(n);
      const names = [n.name, n.modern.locality, n.nearby?.landmark?.name, n.nearby?.town?.name];
      for (const name of names.filter((x): x is string => !!x && x.length > 3)) {
        expect(prompt, `${n.id} prompt names "${name}"`).not.toContain(name);
        expect(alt, `${n.id} alt names "${name}"`).not.toContain(name);
      }
    }
  });

  it('does not mention people or Aboriginal art styles, which would steer the model toward them', () => {
    for (const n of nations.slice(0, 50)) {
      const { prompt } = buildImagePrompt(n, 'flat');
      expect(prompt).toMatch(/^Flat 2D illustration/);
      expect(prompt).not.toMatch(/aboriginal|torres|dot painting|rock art|ceremon|figure/i);
    }
  });

  it('describes the nearby landmark generically', () => {
    expect(featureOf({ name: 'X', kind: 'river', distanceKm: 3, bearing: 'N' })).toBe(
      'a river winding across it',
    );
    expect(featureOf({ name: 'X', kind: 'town', distanceKm: 3, bearing: 'N' })).toBeNull();
    expect(featureOf(undefined)).toBeNull();
  });
});

describe('seedFor and pricePerImage', () => {
  it('gives a stable seed per id', () => {
    expect(seedFor('N92')).toBe(seedFor('N92'));
    expect(seedFor('N92')).not.toBe(seedFor('N93'));
  });

  it('reads per-picture prices from the AI Gateway model list', () => {
    const tiered = {
      id: 'x/a',
      type: 'image',
      pricing: {
        image: '0.048',
        image_dimension_quality_pricing: [
          { size: '768x768', cost: '0.041' },
          { size: '1024x1024', cost: '0.05' },
        ],
      },
    };
    expect(pricePerImage(tiered)).toBe(0.05);
    expect(pricePerImage(tiered, '768x768')).toBe(0.041);
    expect(pricePerImage(tiered, '2048x2048')).toBe(0.048);
    expect(pricePerImage({ id: 'x/b', pricing: { image: '0.02' } })).toBe(0.02);
    expect(pricePerImage({ id: 'x/c', pricing: {} })).toBeNull();
  });
});
