import type { StateCode } from '../../src/types/nation.ts';

/**
 * Known-good lookups, enforced by scripts/validate.ts (and so by CI via the unit test).
 * The brief's own checks (Pitjantjatjara C6 → Petermann NT; Gadigal → Sydney NSW) cannot be met:
 * neither language is in TLCMap layer 81. These are the 10 mock entries, whose SALs were checked
 * by hand in Phase 0 and again by this pipeline.
 */
export const SPOT_CHECKS: readonly {
  id: string;
  name: string;
  locality: string;
  stateCode: StateCode;
}[] = [
  { id: 'A43', name: 'Ngaatjatjarra', locality: 'Ngaanyatjarra-Giles', stateCode: 'WA' },
  { id: 'W9', name: 'Wajuk', locality: 'Hacketts Gully', stateCode: 'WA' },
  { id: 'S64', name: 'Dharug / Darug', locality: 'Jenolan', stateCode: 'NSW' },
  { id: 'D3', name: 'Ngunawal / Ngunnawal', locality: 'Nanima', stateCode: 'NSW' },
  {
    id: 'D62',
    name: 'Canberra language',
    locality: 'ACT Remainder - Paddys River',
    stateCode: 'ACT',
  },
  { id: 'L3', name: 'Kaurna', locality: 'Calomba', stateCode: 'SA' },
  { id: 'S31.1', name: 'Dja Dja Wurrung', locality: 'Goldsborough (Vic.)', stateCode: 'VIC' },
  { id: 'T2', name: 'Oyster Bay Tasmanian', locality: 'Buckland (Tas.)', stateCode: 'TAS' },
  { id: 'N198', name: 'Dhuwal', locality: 'East Arnhem', stateCode: 'NT' },
  { id: 'E29', name: 'Gubbi Gubbi', locality: 'Anderleigh', stateCode: 'QLD' },
  { id: 'Y6', name: 'Djagaraga', locality: 'Somerset (Qld)', stateCode: 'QLD' },
];
