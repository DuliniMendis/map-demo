import { describe, expect, it } from 'vitest';
import mock from '../../data/mock-nations.json';
import type { Nation } from '../../types/nation';
import {
  DEFAULT_VIEW,
  FLIGHT_MAX_MS,
  FLIGHT_MIN_MS,
  FLY_CURVE,
  FLY_SPEED,
  NEAR_DISTANCE_KM,
  NEAR_EASE_MAX_MS,
  NEAR_EASE_MIN_MS,
  OVERVIEW_MAX_MS,
  OVERVIEW_MIN_MS,
  OVERVIEW_POSE,
  REDUCED_MOTION_FADE_MS,
  RISE_DURATION_MS,
  flyToDurationMs,
  greatCircleKm,
  normalizeBearing,
  planFlight,
  planOverview,
  plannedDurationMs,
  targetPose,
  type CameraPose,
  type EaseToStep,
  type FlyToStep,
} from './choreography';

const nations = (mock as unknown as { nations: Nation[] }).nations;
const byId = (id: string) => {
  const n = nations.find((x) => x.id === id);
  if (!n) throw new Error(`no mock nation ${id}`);
  return n;
};

const wajuk = byId('W9'); // Perth hills
const oysterBay = byId('T2'); // east Tasmania
const djaDja = byId('S31.1'); // central Victoria

/** Camera parked on a nation at the default view, as after a completed flight. */
const parkedAt = (n: Nation, over: Partial<CameraPose> = {}): CameraPose => ({
  center: [n.lng, n.lat],
  zoom: DEFAULT_VIEW.zoom,
  pitch: DEFAULT_VIEW.pitch,
  bearing: DEFAULT_VIEW.bearing,
  ...over,
});

const withView = (n: Nation, view: Nation['view']): Nation => ({ ...n, view });

/** A synthetic nation `km` east of `n` (mock data has no pair closer than ~200 km). */
const offsetEast = (n: Nation, km: number): Nation => ({
  ...n,
  id: `${n.id}-east`,
  lng: n.lng + km / (111.32 * Math.cos((n.lat * Math.PI) / 180)),
});

describe('helpers', () => {
  it('greatCircleKm: Perth hills → east Tasmania is ~2,900 km', () => {
    const km = greatCircleKm([wajuk.lng, wajuk.lat], [oysterBay.lng, oysterBay.lat]);
    expect(km).toBeGreaterThan(2800);
    expect(km).toBeLessThan(3100);
  });

  it('normalizeBearing wraps into (−180, 180]', () => {
    expect(normalizeBearing(-18)).toBe(-18);
    expect(normalizeBearing(342)).toBe(-18);
    expect(normalizeBearing(-180)).toBe(180);
    expect(normalizeBearing(540)).toBe(180);
    expect(normalizeBearing(-361)).toBe(-1);
  });

  it('flyToDurationMs: pure zoom matches |Δz|·ln2 / ρ / V', () => {
    const c: [number, number] = [134, -26];
    const ms = flyToDurationMs({ center: c, zoom: 4 }, { center: c, zoom: 10 });
    expect(ms).toBeCloseTo((1000 * (6 * Math.LN2)) / FLY_CURVE / FLY_SPEED, 6);
  });

  it('flyToDurationMs grows with distance and with a smaller viewport', () => {
    const a = { center: [116, -32] as [number, number], zoom: 5.5 };
    const near = flyToDurationMs(a, { center: [120, -32], zoom: 10.5 });
    const far = flyToDurationMs(a, { center: [147, -42], zoom: 10.5 });
    expect(far).toBeGreaterThan(near);
    const small = flyToDurationMs(
      a,
      { center: [147, -42], zoom: 10.5 },
      { width: 400, height: 300 },
    );
    expect(small).toBeGreaterThan(far);
  });
});

describe('targetPose', () => {
  it('uses the defaults when the nation has no view', () => {
    expect(targetPose(wajuk)).toEqual({
      center: [wajuk.lng, wajuk.lat],
      zoom: 10.5,
      pitch: 62,
      bearing: -18,
    });
  });

  it('applies view overrides', () => {
    const t = targetPose(withView(wajuk, { zoom: 9.5, pitch: 55, bearing: 120 }));
    expect(t).toMatchObject({ zoom: 9.5, pitch: 55, bearing: 120 });
  });

  it('applies a partial override and keeps the other defaults', () => {
    expect(targetPose(withView(wajuk, { zoom: 9.5 }))).toMatchObject({
      zoom: 9.5,
      pitch: 62,
      bearing: -18,
    });
  });

  it('clamps zoom to 8–13 and pitch to 0–75', () => {
    expect(targetPose(withView(wajuk, { zoom: 3, pitch: -10 }))).toMatchObject({
      zoom: 8,
      pitch: 0,
    });
    expect(targetPose(withView(wajuk, { zoom: 18, pitch: 89 }))).toMatchObject({
      zoom: 13,
      pitch: 75,
    });
  });

  it('ignores non-finite overrides and normalises bearing', () => {
    const t = targetPose(withView(wajuk, { zoom: Number.NaN, pitch: Infinity, bearing: 270 }));
    expect(t).toMatchObject({ zoom: 10.5, pitch: 62, bearing: -90 });
  });
});

describe('planFlight', () => {
  it('reduced motion → a single jumpTo with a ≤ 400 ms fade, from anywhere', () => {
    for (const from of [null, parkedAt(wajuk), parkedAt(oysterBay)]) {
      const steps = planFlight(from, oysterBay, true);
      expect(steps).toEqual([
        {
          type: 'jumpTo',
          center: [oysterBay.lng, oysterBay.lat],
          zoom: 10.5,
          pitch: 62,
          bearing: -18,
          fadeMs: REDUCED_MOTION_FADE_MS,
        },
      ]);
      expect(REDUCED_MOTION_FADE_MS).toBeLessThanOrEqual(400);
    }
  });

  it('from the overview (null) → a single flyTo with speed 0.6 / curve 1.42', () => {
    const steps = planFlight(null, byId('Y6'), false);
    expect(steps).toHaveLength(1);
    const [fly] = steps as [FlyToStep];
    expect(fly).toMatchObject({
      type: 'flyTo',
      center: [byId('Y6').lng, byId('Y6').lat],
      zoom: 10.5,
      pitch: 62,
      bearing: -18,
      speed: 0.6,
      curve: 1.42,
      essential: true,
    });
    expect(fly.duration).toBeGreaterThanOrEqual(FLIGHT_MIN_MS);
    expect(fly.duration).toBeLessThanOrEqual(FLIGHT_MAX_MS);
  });

  it('from a far nation → rise easeTo then flyTo', () => {
    const steps = planFlight(parkedAt(wajuk), oysterBay, false);
    expect(steps.map((s) => s.type)).toEqual(['easeTo', 'flyTo']);
    const [rise, fly] = steps as [EaseToStep, FlyToStep];
    expect(rise).toEqual({
      type: 'easeTo',
      zoom: 5.5, // max(4.2, 10.5 − 5)
      pitch: 0,
      bearing: 0,
      duration: RISE_DURATION_MS,
    });
    expect(rise.center).toBeUndefined(); // rises in place
    expect(fly).toMatchObject({
      type: 'flyTo',
      center: [oysterBay.lng, oysterBay.lat],
      zoom: 10.5,
      pitch: 62,
      bearing: -18,
      speed: FLY_SPEED,
      curve: FLY_CURVE,
    });
  });

  it('rise zoom never goes below 4.2', () => {
    const [rise] = planFlight(parkedAt(wajuk, { zoom: 8 }), oysterBay, false) as [EaseToStep];
    expect(rise.zoom).toBe(4.2);
  });

  it('rise never zooms in when the camera is already above 4.2 but pitched', () => {
    const [rise] = planFlight(parkedAt(wajuk, { zoom: 4, pitch: 40 }), oysterBay, false) as [
      EaseToStep,
    ];
    expect(rise).toMatchObject({ type: 'easeTo', zoom: 4, pitch: 0 });
  });

  it('skips the rise when the camera is already zoomed out and flat', () => {
    const steps = planFlight(parkedAt(wajuk, { zoom: 4.5, pitch: 0 }), oysterBay, false);
    expect(steps.map((s) => s.type)).toEqual(['flyTo']);
    expect((steps[0] as FlyToStep).duration).toBeGreaterThanOrEqual(FLIGHT_MIN_MS);
  });

  it('keeps every far flight inside the 2.5–4.5 s budget', () => {
    for (const a of nations) {
      for (const b of nations) {
        if (a === b) continue;
        for (const viewport of [
          { width: 1440, height: 900 },
          { width: 390, height: 844 },
        ]) {
          const steps = planFlight(parkedAt(a), b, false, { viewport });
          const total = plannedDurationMs(steps);
          expect(total).toBeGreaterThanOrEqual(2500);
          expect(total).toBeLessThanOrEqual(4500);
        }
      }
    }
  });

  it('uses the natural speed-0.6 duration when it fits the budget', () => {
    // Already up (no rise), small zoom change, modest distance → natural duration is inside the clamp.
    const from = parkedAt(wajuk, { zoom: 4.6, pitch: 0 });
    const to = withView(offsetEast(wajuk, 300), { zoom: 8 });
    const steps = planFlight(from, to, false);
    expect(steps.map((s) => s.type)).toEqual(['flyTo']);
    const natural = flyToDurationMs(from, { center: [to.lng, to.lat], zoom: 8 });
    expect(natural).toBeGreaterThan(FLIGHT_MIN_MS);
    expect(natural).toBeLessThan(FLIGHT_MAX_MS);
    expect((steps[0] as FlyToStep).duration).toBe(Math.round(natural));
  });

  it('caps a long flight at the budget instead of using speed 0.6 verbatim', () => {
    const steps = planFlight(parkedAt(wajuk), oysterBay, false);
    const natural = flyToDurationMs(
      { center: [wajuk.lng, wajuk.lat], zoom: 5.5 },
      { center: [oysterBay.lng, oysterBay.lat], zoom: 10.5 },
    );
    expect(natural).toBeGreaterThan(FLIGHT_MAX_MS);
    expect(plannedDurationMs(steps)).toBe(FLIGHT_MAX_MS);
  });

  it('near (< 150 km) → a single easeTo that keeps the current pitch', () => {
    const to = offsetEast(djaDja, 80);
    const from = parkedAt(djaDja, { pitch: 48 });
    const steps = planFlight(from, to, false);
    expect(steps).toHaveLength(1);
    const [glide] = steps as [EaseToStep];
    expect(glide).toMatchObject({
      type: 'easeTo',
      center: [to.lng, to.lat],
      zoom: 10.5,
      pitch: 48, // kept, not the target's 62
      bearing: -18,
    });
    // Linear in distance (~80 km here).
    const expected = NEAR_EASE_MIN_MS + (NEAR_EASE_MAX_MS - NEAR_EASE_MIN_MS) * (80 / 150);
    expect(Math.abs(glide.duration - expected)).toBeLessThan(5);
    expect(glide.duration).toBeLessThanOrEqual(4500);
  });

  it('near-zero distance (~1 km, as in the real data) → a short glide, no rise', () => {
    const to = offsetEast(djaDja, 1);
    const steps = planFlight(parkedAt(djaDja, { pitch: 55 }), to, false);
    expect(steps).toHaveLength(1);
    const [glide] = steps as [EaseToStep];
    expect(glide).toMatchObject({
      type: 'easeTo',
      center: [to.lng, to.lat],
      zoom: 10.5,
      pitch: 55,
    });
    expect(glide.duration).toBeGreaterThanOrEqual(NEAR_EASE_MIN_MS);
    expect(glide.duration).toBeLessThan(NEAR_EASE_MIN_MS + 50);
  });

  it('a different nation at the exact same point as the camera → no steps (just the pulse)', () => {
    expect(planFlight(parkedAt(djaDja), { ...djaDja, id: 'TWIN' }, false)).toEqual([]);
  });

  it('near easeTo takes target zoom/bearing overrides but still keeps pitch', () => {
    const to = withView(offsetEast(djaDja, 20), { zoom: 9.5, pitch: 30, bearing: 45 });
    const [glide] = planFlight(parkedAt(djaDja, { pitch: 70 }), to, false) as [EaseToStep];
    expect(glide).toMatchObject({ type: 'easeTo', zoom: 9.5, pitch: 70, bearing: 45 });
  });

  it('near easeTo clamps a kept pitch above 75', () => {
    const [glide] = planFlight(parkedAt(djaDja, { pitch: 84 }), offsetEast(djaDja, 20), false) as [
      EaseToStep,
    ];
    expect(glide.pitch).toBe(75);
  });

  it('the near/far threshold is 150 km', () => {
    const just = planFlight(parkedAt(djaDja), offsetEast(djaDja, NEAR_DISTANCE_KM - 1), false);
    const over = planFlight(parkedAt(djaDja), offsetEast(djaDja, NEAR_DISTANCE_KM + 1), false);
    expect(just.map((s) => s.type)).toEqual(['easeTo']);
    expect(over.map((s) => s.type)).toEqual(['easeTo', 'flyTo']);
    expect((over[0] as EaseToStep).pitch).toBe(0);
  });

  it('re-selecting the nation you are parked on → no steps', () => {
    expect(planFlight(parkedAt(wajuk), wajuk, false)).toEqual([]);
    expect(planFlight(parkedAt(wajuk, { pitch: 30 }), wajuk, false)).toEqual([]);
  });

  it('re-selecting after rotating or zooming → an in-place easeTo back to the view', () => {
    const steps = planFlight(parkedAt(wajuk, { bearing: 90, zoom: 12 }), wajuk, false);
    expect(steps).toMatchObject([
      { type: 'easeTo', center: [wajuk.lng, wajuk.lat], zoom: 10.5, bearing: -18 },
    ]);
  });
});

describe('planOverview', () => {
  it('flies back to OVERVIEW_CAMERA within its budget', () => {
    const steps = planOverview(parkedAt(oysterBay), false);
    expect(steps).toHaveLength(1);
    const [fly] = steps as [FlyToStep];
    expect(fly).toMatchObject({
      type: 'flyTo',
      center: OVERVIEW_POSE.center,
      zoom: OVERVIEW_POSE.zoom,
      pitch: 0,
      bearing: 0,
    });
    expect(fly.duration).toBeGreaterThanOrEqual(OVERVIEW_MIN_MS);
    expect(fly.duration).toBeLessThanOrEqual(OVERVIEW_MAX_MS);
  });

  it('reduced motion → jumpTo', () => {
    expect(planOverview(parkedAt(oysterBay), true)).toEqual([
      { type: 'jumpTo', ...OVERVIEW_POSE, fadeMs: REDUCED_MOTION_FADE_MS },
    ]);
  });
});
