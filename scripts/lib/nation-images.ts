/**
 * Pure helpers for scripts/nation-images.ts: a landscape prompt and alt text for each nation's info-card
 * illustration, and a cost estimate from AI Gateway's model list. See docs/images.md for the rules the
 * prompts follow (landscape only, no people, no imitation of Aboriginal or Torres Strait Islander art).
 */
import type { Nation, NearbyFeature } from '../../src/types/nation.ts';

export type ImageStyle = 'pencil' | 'flat';

export interface ImagePrompt {
  prompt: string;
  alt: string;
}

/** data/image-prompts.json: nation id → prompt and alt text. Edit freely; `draft` keeps edited entries. */
export type PromptFile = Record<string, ImagePrompt | string>;

/** data/images.json: nation id → alt text and credit. Keys starting with _ are notes. */
export type ImageManifest = Record<string, { alt: string; credit: string } | string>;

export interface Region {
  key: string;
  /** Short phrase for alt text, e.g. "tropical savanna". */
  short: string;
  /** What the region looks like, for the prompt. */
  detail: string;
}

const R = {
  wetTropics: {
    key: 'wet-tropics',
    short: 'tropical rainforest',
    detail: 'dense tropical rainforest on steep green ranges running down to the coast',
  },
  savanna: {
    key: 'tropical-savanna',
    short: 'tropical savanna',
    detail:
      'tropical savanna: open eucalypt woodland, tall grass, pandanus, termite mounds and sandstone escarpments',
  },
  pilbara: {
    key: 'pilbara',
    short: 'red rocky ranges',
    detail: 'red rocky ranges and gorges with spinifex and white-trunked snappy gums',
  },
  southwest: {
    key: 'south-west',
    short: 'south-west forest and heath',
    detail: 'tall jarrah and karri forest, banksia heath and smooth granite outcrops',
  },
  tasmania: {
    key: 'tasmania',
    short: 'cool temperate forest and mountains',
    detail: 'cool temperate rainforest, buttongrass plains and rugged dolerite peaks',
  },
  eastForest: {
    key: 'east-coast',
    short: 'eucalypt forest and valleys',
    detail: 'tall eucalypt forest, rolling hills and green coastal valleys',
  },
  temperate: {
    key: 'temperate-south',
    short: 'grassy woodland',
    detail: 'temperate grassy woodland with river red gums, rolling plains and low hills',
  },
  nullarbor: {
    key: 'nullarbor',
    short: 'a flat treeless plain',
    detail: 'a vast flat treeless plain of saltbush and bluebush under a wide sky',
  },
  semiArid: {
    key: 'semi-arid',
    short: 'semi-arid plains',
    detail:
      'semi-arid plains of saltbush and mulga, with black box and river red gums along dry creeks',
  },
  desert: {
    key: 'arid-interior',
    short: 'desert country',
    detail:
      'arid desert: red sand plains and dunes, spinifex, desert oaks, mulga and low rocky ranges',
  },
} satisfies Record<string, Region>;

/**
 * Coarse landscape region from the point and state. Deliberately rough: it picks plausible vegetation and
 * terrain for an illustration, nothing more. Edit a prompt in data/image-prompts.json where it is wrong.
 */
export function regionOf(n: Pick<Nation, 'lat' | 'lng' | 'modern'>): Region {
  const { lat, lng } = n;
  const state = n.modern.stateCode;
  if (state === 'TAS') return R.tasmania;
  if (lat > -19.5 && lat < -15.5 && lng > 145) return R.wetTropics;
  if (lat > -19) return R.savanna;
  if (state === 'WA' && lat > -23.5) return R.pilbara;
  if (state === 'WA' && lat < -30 && lng < 119.5) return R.southwest;
  if (lat < -30 && lng > 125 && lng < 133.5) return R.nullarbor;
  if (lng > 147.5 && lat < -24) return R.eastForest;
  if (lat < -34 && lng > 138) return R.temperate;
  if ((lat < -26 && lng > 141) || (lat < -31 && lng > 133.5)) return R.semiArid;
  return R.desert;
}

/** The nearby landmark as a generic feature. Never its name: a named place may be a sacred site. */
export function featureOf(f: NearbyFeature | undefined): string | null {
  if (!f) return null;
  switch (f.kind) {
    case 'river':
      return 'a river winding across it';
    case 'lake':
      return 'a still lake or waterhole';
    case 'peak':
      return 'a rocky hill rising in the middle distance';
    case 'range':
      return 'a line of rugged hills on the horizon';
    default:
      return null;
  }
}

const STYLE: Record<ImageStyle, { lead: string; noun: string }> = {
  pencil: {
    lead: 'Graphite pencil sketch on cream paper, soft shading, loose hand-drawn lines, in the manner of a naturalist field sketch.',
    noun: 'Pencil sketch',
  },
  flat: {
    lead: 'Flat 2D illustration with a limited palette of muted earth tones, simple shapes and soft paper texture.',
    noun: 'Flat illustration',
  },
};

/**
 * Image models such as FLUX have no negative prompt and tend to draw what a prompt names, even after "no".
 * So the prompt only names what the picture should show, plus a short "empty landscape" line; art styles
 * to avoid are not mentioned. Every picture is still reviewed by a person (docs/images.md).
 */
const CLOSING = 'An empty, quiet landscape with no people, buildings or writing.';

export function buildImagePrompt(n: Nation, style: ImageStyle = 'pencil'): ImagePrompt {
  const region = regionOf(n);
  const feature = featureOf(n.nearby?.landmark);
  const scene = `A wide view of ${region.detail}${feature ? `, with ${feature}` : ''}.`;
  const alt =
    `${STYLE[style].noun} of ${region.short}${feature ? ` with ${feature}` : ''}. ` +
    'An impression of the region, not a particular place.';
  return { prompt: `${STYLE[style].lead} ${scene} ${CLOSING}`, alt };
}

/** Stable per-nation seed so a re-run of one id gives a similar picture where the model supports seeds. */
export function seedFor(id: string): number {
  let h = 2166136261;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0) % 2147483647;
}

/** One entry of https://ai-gateway.vercel.sh/v1/models (the fields we read). */
export interface GatewayModel {
  id: string;
  type?: string;
  pricing?: {
    image?: string;
    image_dimension_quality_pricing?: { size?: string; quality?: string; cost: string }[];
  };
}

/** US$ per picture for the given size, or null when the model is priced per token (or unpriced). */
export function pricePerImage(model: GatewayModel, size = '1024x1024'): number | null {
  const tiers = model.pricing?.image_dimension_quality_pricing ?? [];
  const exact = tiers.find((t) => t.size === size && !t.quality);
  const raw = exact?.cost ?? model.pricing?.image;
  const n = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(n) ? n : null;
}
