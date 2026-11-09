// DEV ONLY — never import from app code. Builds a long list from the 10 mock nations so the dev page
// can exercise virtualisation (> 100 rows). Synthetic rows are clearly labelled "(dev copy n)".
import mock from '../../data/mock-nations.json';
import type { Nation } from '../../types/nation';

export const mockNations = mock.nations as Nation[];

export function synthesiseNations(count: number): Nation[] {
  if (count <= mockNations.length) return mockNations.slice(0, count);
  const out: Nation[] = mockNations.slice();
  for (let k = 1; out.length < count; k++) {
    for (const n of mockNations) {
      if (out.length >= count) break;
      // Nudge the point so copies aren't stacked exactly (still dev-only, still meaningless).
      out.push({
        ...n,
        id: `${n.id}-dev${k}`,
        name: `${n.name} (dev copy ${k})`,
        peopleName: n.peopleName ? `${n.peopleName} (dev copy ${k})` : undefined,
        lng: n.lng + ((k % 7) - 3) * 0.05,
        lat: n.lat + ((k % 5) - 2) * 0.05,
      });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'en-AU'));
}
