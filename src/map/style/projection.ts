// Phase 3 (WS9): globe when zoomed out, flat Web Mercator from z 4 in.
//
// MapLibre 6.17 takes a zoom-interpolated projection in the style: any `['interpolate', …, ['zoom'], …]`
// expression between 'vertical-perspective' (the globe) and 'mercator' makes it build a GlobeProjection whose
// globe-ness follows the zoom (projection_factory.ts → GlobeProjection.transitionState). The built-in
// `type: 'globe'` preset does the same but only flattens at z 11–12, which would put every nation view (z 8–13)
// on a curved surface; ours is flat everywhere a nation is in focus.
import type { Map as MlMap, ProjectionSpecification } from 'maplibre-gl';

/** At or below this zoom the map is fully a globe. */
export const GLOBE_FULL_ZOOM = 3;
/** At or above this zoom the map is fully flat (Web Mercator). In between, MapLibre blends the two. */
export const MERCATOR_ZOOM = 4;

const MERCATOR: ProjectionSpecification = { type: 'mercator' };

/** The style's `projection` for `StyleOptions.globe`. `false` → plain mercator (the Phase 2 look). */
export function styleProjection(globe: boolean): ProjectionSpecification {
  if (!globe) return MERCATOR;
  return {
    type: [
      'interpolate',
      ['linear'],
      ['zoom'],
      GLOBE_FULL_ZOOM,
      'vertical-perspective',
      MERCATOR_ZOOM,
      'mercator',
    ],
  };
}

/**
 * How much of a globe the map is at `zoom`, 0 (flat) … 1 (globe): what MapLibre's GlobeProjection derives from
 * the expression above. Pure, for tests and the tour/e2e checks.
 */
export function globeness(zoom: number, globe = true): number {
  if (!globe) return 0;
  if (zoom <= GLOBE_FULL_ZOOM) return 1;
  if (zoom >= MERCATOR_ZOOM) return 0;
  return (MERCATOR_ZOOM - zoom) / (MERCATOR_ZOOM - GLOBE_FULL_ZOOM);
}

/**
 * In place: switch the map's projection to match `globe`, only when it differs (setProjection rebuilds the
 * transform, so it must not run on every store change). Maps without a projection API (test fakes) are left alone.
 */
export function applyProjection(map: MlMap, globe: boolean): void {
  if (typeof map.setProjection !== 'function' || typeof map.getProjection !== 'function') return;
  const want = styleProjection(globe);
  const have = map.getProjection() ?? MERCATOR;
  if (JSON.stringify(have.type ?? 'mercator') === JSON.stringify(want.type)) return;
  map.setProjection(want);
}
