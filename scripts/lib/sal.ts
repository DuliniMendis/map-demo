import type { StateCode } from '../../src/types/nation.ts';
import { STATE_NAMES } from '../../src/types/nation.ts';

/** One ABS ASGS 2021 Suburb/Locality (SAL) match. */
export interface SalHit {
  salCode: string;
  locality: string;
  state: string;
  stateCode: StateCode;
}

/** Contents of data/cache/sal/<id>.json. */
export interface SalCacheRecord {
  id: string;
  lng: number;
  lat: number;
  source: 'abs-arcgis' | 'gpkg';
  retrieved: string;
  /** SAL polygon containing the point, or null if none (point in the sea). */
  within: SalHit | null;
  /** Nearest SAL within NEAREST_KM; undefined = not looked up yet, null = none in range. */
  nearest?: (SalHit & { distanceKm: number }) | null;
  /** State for an offshore point; undefined = not looked up yet. */
  offshoreState?: { state: string; stateCode: StateCode; method: string } | null;
}

export const NEAREST_KM = 25;
export const OFFSHORE_LOCALITY = 'Offshore';

const CODE_BY_NAME = new Map(
  (Object.entries(STATE_NAMES) as [StateCode, string][]).map(([code, name]) => [name, code]),
);

export function stateCodeFor(stateName: string): StateCode {
  const code = CODE_BY_NAME.get(stateName.trim());
  if (!code) throw new Error(`unknown ABS state name "${stateName}"`);
  return code;
}

export type LookupMethod = 'within' | 'nearest' | 'offshore';

export interface Resolution {
  method: LookupMethod;
  locality: string;
  state: string;
  stateCode: StateCode;
  distanceKm?: number;
}

/** Turns a cache record into the `modern` fields; null if the record lacks a needed lookup. */
export function resolveSal(rec: SalCacheRecord, useNearest: boolean): Resolution | null {
  if (rec.within) {
    const { locality, state, stateCode } = rec.within;
    return { method: 'within', locality, state, stateCode };
  }
  if (useNearest) {
    if (rec.nearest === undefined) return null;
    if (rec.nearest) {
      const { locality, state, stateCode, distanceKm } = rec.nearest;
      return { method: 'nearest', locality, state, stateCode, distanceKm };
    }
  }
  if (!rec.offshoreState) return null;
  const { state, stateCode } = rec.offshoreState;
  return { method: 'offshore', locality: OFFSHORE_LOCALITY, state, stateCode };
}

/** Whether a cached record still answers the question for this point and mode. */
export function cacheUsable(
  rec: SalCacheRecord | null,
  lng: number,
  lat: number,
  useNearest: boolean,
): rec is SalCacheRecord {
  return rec !== null && rec.lng === lng && rec.lat === lat && resolveSal(rec, useNearest) !== null;
}
