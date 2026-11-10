import type { SkySpecification } from 'maplibre-gl';

/**
 * Sky and distance fog. Tuned (from the spike) so that at pitch > 55° the horizon dissolves into a
 * pale, slightly warm haze instead of a hard sky/ground edge, which also hides the coarse far-field
 * terrain tiles.
 */
export function sky(): SkySpecification {
  return {
    'sky-color': '#7fb0e0',
    'horizon-color': '#efeae0',
    'fog-color': '#e8e2d6',
    'fog-ground-blend': 0.6,
    'horizon-fog-blend': 0.75,
    'sky-horizon-blend': 0.65,
    // Atmosphere glow only when zoomed out; none once we're down among the ranges.
    'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 10, 1, 12, 0],
  };
}

/** Map constructor options this style expects (WS5's MapView already sets maxPitch). */
export const MAP_OPTIONS = { maxPitch: 85 } as const;
