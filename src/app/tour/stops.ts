// Guided tour stops (WS9). Twelve nations from public/data/nations.json, one loop around the continent.
//
// Narration guardrail (PLAN.md §8, WS9 brief): the text is built only from facts in our data — the AUSTLANG name,
// the people name, and "Country today" (ABS locality and state) — plus one short, neutral sentence about the
// landscape at that point. No cultural claims, history, stories or language words. Every `landscape` line is a
// DRAFT awaiting the owner's review; all twelve narrations are listed in docs/tour.md.
import type { Nation } from '../../types/nation';

export interface TourStop {
  /** `Nation.id` (AUSTLANG code). */
  id: string;
  /** One neutral sentence about the physical landscape around the point. Draft — see docs/tour.md. */
  landscape: string;
}

/** How long the tour lingers at a stop after the camera has landed, before flying on. */
export const TOUR_DWELL_MS = 8000;

/**
 * North → west → south → east. Covers every state and the NT, and desert, rainforest, coast, islands (the
 * Torres Strait side of Cape York, the Gulf islands), alpine country and rivers. Several stops have a
 * curated `view` override in data/overrides.json (WS3), which is why they were picked.
 */
export const TOUR_STOPS: readonly TourStop[] = [
  {
    id: 'Y6', // Djagaraga — Somerset (Qld), QLD
    landscape:
      'The northern tip of Cape York: low open woodland, mangroves and beaches facing the islands of the Torres Strait.',
  },
  {
    id: 'Y106', // Djabugay / Tjapukai — Mona Mona, QLD
    landscape:
      'Rainforest-covered ranges on a tableland above the coastal plain, cut by river valleys.',
  },
  {
    id: 'N153', // Yanyuwa — Pellew Islands, NT
    landscape:
      'Low islands, mangrove shores and river mouths on the southern edge of the Gulf of Carpentaria.',
  },
  {
    id: 'N42.1', // Bugurnidja — Kakadu, NT
    landscape: 'Wide seasonal floodplains and wetlands below a sandstone escarpment.',
  },
  {
    id: 'K1', // Yawuru — Roebuck, WA
    landscape:
      'A coast of red sandy cliffs, white beaches and broad tidal flats around a large bay.',
  },
  {
    id: 'A43', // Ngaatjatjarra — Ngaanyatjarra-Giles, WA
    landscape: 'Desert country of red sand plains and dunes, broken by rocky ranges.',
  },
  {
    id: 'A9', // Mirning — Forrest (WA), WA
    landscape: 'A flat, almost treeless limestone plain that runs to the horizon.',
  },
  {
    id: 'S11', // Tanganekald — Coorong, SA
    landscape:
      'A long, narrow coastal lagoon behind high sand dunes, near where the Murray River reaches the sea.',
  },
  {
    id: 'S44', // Dhudhuroa — Nariel Valley, VIC
    landscape: 'Steep forested valleys in the high country, with alpine ranges above them.',
  },
  {
    id: 'T10', // South-western Tasmanian — Southwest, TAS
    landscape: 'Rugged mountains, wet forest and wild rivers in the far south-west of Tasmania.',
  },
  {
    id: 'D10', // Wiradjuri — Wyalong, NSW
    landscape: 'Broad inland plains and low hills, drained by long, slow inland rivers.',
  },
  {
    id: 'S64', // Dharug / Darug — Jenolan, NSW
    landscape: 'Forested ridges and deep, steep-sided valleys in the Blue Mountains.',
  },
];

/** A stop resolved against the loaded nations. */
export interface ResolvedStop extends TourStop {
  nation: Nation;
}

/** The stops whose nation is in `nations`, in tour order (a stop missing from the data is skipped). */
export function resolveStops(
  nations: readonly Nation[],
  stops: readonly TourStop[] = TOUR_STOPS,
): ResolvedStop[] {
  const byId = new Map(nations.map((n) => [n.id, n]));
  return stops.flatMap((s) => {
    const nation = byId.get(s.id);
    return nation ? [{ ...s, nation }] : [];
  });
}

/**
 * The spoken/printed narration for a stop. Everything except `landscape` comes straight from the data:
 * "{name} language group ({peopleName}). Country today: {locality}, {state}. {landscape}"
 */
export function narration(stop: ResolvedStop): string {
  const n = stop.nation;
  const who = n.peopleName
    ? `${n.name} language group (${n.peopleName}).`
    : `${n.name} language group.`;
  return `${who} Country today: ${n.modern.locality}, ${n.modern.state}. ${stop.landscape}`;
}
