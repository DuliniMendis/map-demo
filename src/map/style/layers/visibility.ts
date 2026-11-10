export type Visibility = 'visible' | 'none';

export const visibility = (on: boolean): Visibility => (on ? 'visible' : 'none');

/**
 * For paint properties that `applyStyleOptions` changes at runtime. With terrain on, MapLibre drapes
 * layers through cached render-to-texture tiles that are refreshed when the style changes but not on
 * every frame of a paint transition, so a transitioned value freezes at its starting point (seen in
 * 6.17: relief stuck at 0.25 opacity after switching imagery off). Changing instantly avoids that.
 */
export const NO_TRANSITION = { duration: 0, delay: 0 } as const;
