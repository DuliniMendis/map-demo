import { describe, expect, it } from 'vitest';
import { OBSTACLE_GAP, PIN_GAP, TAIL_INSET, placeCard } from './pinPlacement';

const area = { w: 920, h: 800 };
const insets = { top: 56, right: 12, bottom: 36, left: 12 };
const card = { w: 360, h: 300 };

describe('placeCard', () => {
  it('puts the card above the pin when it fits, centred, with the tail at the pin', () => {
    const p = placeCard({ x: 460, y: 500 }, card, area, insets);
    expect(p).toEqual({ placement: 'above', x: 280, y: 500 - PIN_GAP - 300, tail: 180 });
  });

  it('slides the card sideways near an edge but keeps the tail over the pin', () => {
    const p = placeCard({ x: 120, y: 500 }, card, area, insets)!;
    expect(p.placement).toBe('above');
    expect(p.x).toBe(insets.left);
    expect(p.tail).toBe(120 - insets.left);
  });

  it('goes beside the pin when a tall card does not fit above (the usual landing view)', () => {
    const tall = { w: 360, h: 480 };
    const p = placeCard({ x: 460, y: 400 }, tall, area, insets)!;
    expect(p.placement).toBe('right');
    expect(p.x).toBe(460 + PIN_GAP);
    expect(p.y + p.tail).toBe(400);
  });

  it('flips to the left when there is no room on the right', () => {
    const tall = { w: 360, h: 480 };
    const p = placeCard({ x: 700, y: 400 }, tall, area, insets)!;
    expect(p.placement).toBe('left');
    expect(p.x + tall.w + PIN_GAP).toBe(700);
  });

  it('falls back to below the pin', () => {
    const wide = { w: 600, h: 200 };
    const p = placeCard({ x: 460, y: 120 }, wide, area, insets)!;
    expect(p.placement).toBe('below');
    expect(p.y).toBe(120 + PIN_GAP);
  });

  it('returns null (dock the card) when nothing fits or the pin is off the map', () => {
    expect(
      placeCard({ x: 300, y: 400 }, { w: 360, h: 760 }, { w: 640, h: 800 }, insets),
    ).toBeNull();
    expect(placeCard({ x: -5, y: 400 }, card, area, insets)).toBeNull();
    expect(placeCard({ x: 460, y: 30 }, card, area, insets)).toBeNull();
  });

  it('never lets the tail sit in a corner', () => {
    // Pin right at the left inset: centring above would put the tail 0 px from the corner.
    const p = placeCard({ x: insets.left + 2, y: 500 }, card, area, insets);
    expect(p?.placement).not.toBe('above');
    if (p) expect(p.tail).toBeGreaterThanOrEqual(TAIL_INSET);
  });

  describe('with overlays at the top of the map', () => {
    const tall = { w: 360, h: 480 };
    const layers = { x: 712, y: 12, w: 196, h: 420 }; // layer panel, top-right
    const banner = { x: 28, y: 60, w: 662, h: 58 }; // disclaimer banner

    it('slides a side card down below an overlay in its columns', () => {
      // Centred on the pin the card would start at y = 10, inside the banner; it slides down instead.
      const p = placeCard({ x: 300, y: 250 }, tall, area, insets, [banner])!;
      expect(p.placement).toBe('right');
      expect(p.y).toBe(banner.y + banner.h + OBSTACLE_GAP);
      expect(p.y + p.tail).toBe(250);
    });

    it('switches sides rather than cover the layer panel', () => {
      const p = placeCard({ x: 460, y: 400 }, tall, area, insets, [layers])!;
      expect(p.placement).toBe('left');
    });

    it('rejects an above/below card that would touch an overlay', () => {
      const short = { w: 360, h: 200 };
      const p = placeCard({ x: 360, y: 300 }, short, area, insets, [banner])!;
      expect(p.placement).not.toBe('above');
    });

    it('docks when every side is blocked', () => {
      const wall = { x: 0, y: 0, w: 920, h: 420 };
      expect(placeCard({ x: 460, y: 500 }, tall, area, insets, [wall])).toBeNull();
    });
  });
});
