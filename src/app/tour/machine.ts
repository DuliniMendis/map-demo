// Pure tour state machine (WS9). The store holds `tour: { status, index }`; this decides how it changes.
import { TOUR_OFF, type TourState } from '../../store/useAppStore';

export type TourEvent =
  /** The Tour button. Reduced motion starts paused (no auto-advance). */
  | { type: 'start' }
  | { type: 'next' }
  | { type: 'prev' }
  /** The play/pause button. Playing again from the end of the tour starts over at stop 1. */
  | { type: 'toggle' }
  /** The camera landed at the stop and the dwell time has passed. */
  | { type: 'dwellDone' }
  /** The user took over (picked another nation, dragged the map, Esc, About, reduced motion turned on). */
  | { type: 'interrupt' }
  | { type: 'stop' };

export interface TourContext {
  /** Number of stops. */
  count: number;
  reducedMotion: boolean;
}

/** Events after which the tour's current stop should be (re)selected. */
export function selectsStop(event: TourEvent): boolean {
  return event.type !== 'interrupt' && event.type !== 'stop';
}

export function isAtEnd(t: TourState, count: number): boolean {
  return t.index >= count - 1;
}

export function tourTransition(t: TourState, event: TourEvent, ctx: TourContext): TourState {
  const last = Math.max(0, ctx.count - 1);
  if (ctx.count === 0) return TOUR_OFF;
  if (event.type === 'start') {
    return { status: ctx.reducedMotion ? 'paused' : 'playing', index: 0 };
  }
  if (t.status === 'off') return t;

  switch (event.type) {
    case 'next':
      return { ...t, index: Math.min(t.index + 1, last) };
    case 'prev':
      return { ...t, index: Math.max(t.index - 1, 0) };
    case 'toggle':
      if (t.status === 'playing') return { ...t, status: 'paused' };
      if (ctx.reducedMotion) return t; // no auto-advance with reduced motion
      return t.index >= last ? { status: 'playing', index: 0 } : { ...t, status: 'playing' };
    case 'dwellDone':
      if (t.status !== 'playing') return t;
      return t.index >= last ? { ...t, status: 'paused' } : { ...t, index: t.index + 1 };
    case 'interrupt':
      return t.status === 'playing' ? { ...t, status: 'paused' } : t;
    case 'stop':
      return TOUR_OFF;
  }
}
