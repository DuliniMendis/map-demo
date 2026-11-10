import type * as maplibregl from 'maplibre-gl';
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Nation } from '../types/nation';
import { placeCard, type CardPosition, type Insets, type Rect } from './pinPlacement';

/** Keep clear of the map edges, the attribution line and the zoom buttons. */
const INSETS: Insets = { top: 12, right: 56, bottom: 40, left: 12 };
/** Overlays anchored to the top of the map that the card must not cover. */
const OBSTACLES = '.app__top-left, .app__top-right, .app__banner, .tour-panel';

function obstacleRects(container: HTMLElement): Rect[] {
  const origin = container.getBoundingClientRect();
  const main = container.closest('.app__main') ?? container.parentElement;
  if (!main) return [];
  return [...main.querySelectorAll<HTMLElement>(OBSTACLES)]
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.width > 0 && r.height > 0)
    .map((r) => ({ x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height }));
}

export interface PinnedCardProps {
  map: maplibregl.Map;
  nation: Nation;
  children: ReactNode;
}

/**
 * Desktop: shows `children` (the info card) popping up from the selected pin and keeps it attached while
 * the map moves. When the card can't fit next to the pin (or the pin is off screen) it docks bottom-left.
 */
export function PinnedCard({ map, nation, children }: PinnedCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<CardPosition | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const canvas = map.getContainer();
      const pin = map.project([nation.lng, nation.lat]);
      const next = placeCard(
        { x: pin.x, y: pin.y },
        { w: el.offsetWidth, h: el.offsetHeight },
        { w: canvas.clientWidth, h: canvas.clientHeight },
        INSETS,
        obstacleRects(canvas),
      );
      setPos((prev) =>
        prev &&
        next &&
        prev.placement === next.placement &&
        Math.abs(prev.x - next.x) < 0.5 &&
        Math.abs(prev.y - next.y) < 0.5
          ? prev
          : next,
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    map.on('move', schedule);
    map.on('resize', schedule);
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      map.off('move', schedule);
      map.off('resize', schedule);
      ro.disconnect();
    };
  }, [map, nation.lng, nation.lat]);

  const style = pos
    ? ({
        left: `${pos.x}px`,
        top: `${pos.y}px`,
        '--pin-tail': `${pos.tail}px`,
      } as CSSProperties)
    : undefined;

  return (
    <div
      ref={ref}
      className="pin-card"
      // The pop-in animation (app.css) runs when this changes from 'docked' to a placement.
      data-placement={pos?.placement ?? 'docked'}
      style={style}
    >
      {children}
      {pos && <span className="pin-card__tail" aria-hidden="true" />}
    </div>
  );
}
