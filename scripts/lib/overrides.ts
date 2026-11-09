import type { NationView } from '../../src/types/nation.ts';

/** data/overrides.json: `{ "<id>": { view?, name?, _why? } }`, merged last. Keys starting "_" are notes. */
export interface Override {
  view?: NationView;
  /** Display-name override. Use sparingly: AUSTLANG spellings are not to be renamed. */
  name?: string;
  _why?: string;
}
export type Overrides = Record<string, Override>;

/** Limits match WS2's clamp in choreography.ts (zoom 8–13, pitch 0–75). */
export const VIEW_LIMITS = { zoom: [8, 13], pitch: [0, 75], bearing: [-180, 360] } as const;

export function overrideErrors(
  raw: Record<string, unknown>,
  knownIds: ReadonlySet<string>,
): string[] {
  const errors: string[] = [];
  for (const [id, value] of Object.entries(raw)) {
    if (id.startsWith('_')) continue;
    if (!knownIds.has(id)) errors.push(`overrides: unknown nation id "${id}"`);
    if (typeof value !== 'object' || value === null) {
      errors.push(`overrides.${id}: not an object`);
      continue;
    }
    for (const [k, v] of Object.entries(value)) {
      if (k === '_why') continue;
      if (k === 'name') {
        if (typeof v !== 'string' || !v.trim()) errors.push(`overrides.${id}.name: empty`);
      } else if (k === 'view') {
        for (const [vk, vv] of Object.entries(v as Record<string, unknown>)) {
          const lim = VIEW_LIMITS[vk as keyof typeof VIEW_LIMITS];
          if (!lim) errors.push(`overrides.${id}.view.${vk}: unknown key`);
          else if (typeof vv !== 'number' || vv < lim[0] || vv > lim[1]) {
            errors.push(`overrides.${id}.view.${vk}: ${String(vv)} outside ${lim[0]}–${lim[1]}`);
          }
        }
      } else errors.push(`overrides.${id}.${k}: unknown key`);
    }
  }
  return errors;
}

/** Strips note keys, returning only what is merged into the nation. */
export function overrideFields(o: Override): { view?: NationView; name?: string } {
  return { ...(o.view ? { view: o.view } : {}), ...(o.name ? { name: o.name } : {}) };
}
