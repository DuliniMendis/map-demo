// Where to put the info card so it pops up from the selected pin (desktop). Pure, so it is unit-tested;
// PinnedCard.tsx feeds it the pin's screen position and the card's measured size on every map move.

export type Placement = 'above' | 'right' | 'left' | 'below';

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  w: number;
  h: number;
}

/** Room the card must leave free around the map's edges (the top row of buttons, the attribution line). */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** An overlay anchored to the top of the map (buttons, layer panel, banner, tour panel), map-area pixels. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CardPosition {
  placement: Placement;
  /** Card's top-left corner, in the map area's pixels. */
  x: number;
  y: number;
  /** Where the tail meets the card edge, measured along that edge from the card's left (above/below) or top. */
  tail: number;
}

/** Distance from the pin centre to the card edge; the tail fills it. */
export const PIN_GAP = 16;
/** The tail never sits closer than this to a card corner. */
export const TAIL_INSET = 18;
/** Tried in this order: "over the pin" first, then beside it, then under it. */
export const PLACEMENT_ORDER: readonly Placement[] = ['above', 'right', 'left', 'below'];

/** Space kept between the card and an overlay it slides under. */
export const OBSTACLE_GAP = 8;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/**
 * First placement in PLACEMENT_ORDER where the whole card fits inside `area` minus `insets`, clear of
 * `obstacles`, and the tail can still point at the pin; null when none fits (the caller docks the card) or the
 * pin is outside the area. Obstacles are top-anchored overlays: a card beside the pin slides down below any
 * obstacle it would otherwise overlap; a card above or below the pin must simply not touch one.
 */
export function placeCard(
  pin: Point,
  card: Size,
  area: Size,
  insets: Insets,
  obstacles: readonly Rect[] = [],
): CardPosition | null {
  const minX = insets.left;
  const maxX = area.w - insets.right;
  const minY = insets.top;
  const maxY = area.h - insets.bottom;
  if (pin.x < minX || pin.x > maxX || pin.y < minY || pin.y > maxY) return null;

  for (const placement of PLACEMENT_ORDER) {
    const vertical = placement === 'above' || placement === 'below';
    if (vertical) {
      const y = placement === 'above' ? pin.y - PIN_GAP - card.h : pin.y + PIN_GAP;
      if (y < minY || y + card.h > maxY || card.w > maxX - minX) continue;
      const x = clamp(pin.x - card.w / 2, minX, maxX - card.w);
      const tail = pin.x - x;
      if (tail < TAIL_INSET || tail > card.w - TAIL_INSET) continue;
      if (obstacles.some((o) => overlaps(o, { x, y, w: card.w, h: card.h }))) continue;
      return { placement, x, y, tail };
    }
    const x = placement === 'right' ? pin.x + PIN_GAP : pin.x - PIN_GAP - card.w;
    if (x < minX || x + card.w > maxX) continue;
    // Below every top overlay that shares the card's columns.
    const top = obstacles
      .filter((o) => o.x < x + card.w && o.x + o.w > x)
      .reduce((t, o) => Math.max(t, o.y + o.h + OBSTACLE_GAP), minY);
    if (card.h > maxY - top) continue;
    const y = clamp(pin.y - card.h / 2, top, maxY - card.h);
    const tail = pin.y - y;
    if (tail < TAIL_INSET || tail > card.h - TAIL_INSET) continue;
    return { placement, x, y, tail };
  }
  return null;
}
