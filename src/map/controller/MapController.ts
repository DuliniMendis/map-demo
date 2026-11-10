// Executes the camera choreography (choreography.ts) on a MapLibre map and owns the nation markers.
// WS5 wires it to the store through the constructor callbacks; it never reads the store itself.

import type * as maplibregl from 'maplibre-gl';
import type { Nation } from '../../types/nation';
import { MarkersLayer, type MarkerLayerOptions } from '../markers/markersLayer';
import {
  OVERVIEW_POSE,
  planFlight,
  planOverview,
  type CameraPose,
  type FlightStep,
  type Viewport,
} from './choreography';

export type CameraState = 'idle' | 'flying';

/** Debug/measurement hook: one event when a step starts and one when it ends. */
export interface FlightStepEvent {
  flight: number;
  /** 'nation:<id>' or 'overview'. */
  target: string;
  index: number;
  steps: readonly FlightStep[];
  phase: 'start' | 'end';
  /** End only: false when the step was interrupted (new selection, user gesture, destroy). */
  completed?: boolean;
  /** performance.now() */
  at: number;
}

export interface MapControllerOptions {
  /** Read at the start of every flight. */
  reducedMotion: () => boolean;
  /** Called on every change: 'flying' when a flight starts, 'idle' when the last one ends or is interrupted. */
  onCameraState: (s: CameraState) => void;
  markers?: MarkerLayerOptions;
  /** How long a flight waits for terrain when the style has none yet (default 2000 ms). */
  terrainWaitMs?: number;
  onStep?: (e: FlightStepEvent) => void;
}

/** Tag carried on every camera event a flight step fires, so its `moveend` can be told apart. */
interface FlightEventData {
  ws2Flight: number;
}

/** A step that ended this much before its duration was interrupted, not finished. */
const FINISH_SLACK_MS = 25;

/** "At the overview": `flyToNation(n, null)` plans from the overview only when the camera really is there. */
const NEAR_OVERVIEW_ZOOM = OVERVIEW_POSE.zoom + 1;
const NEAR_OVERVIEW_PITCH = 10;

export class MapController {
  private readonly map: maplibregl.Map;
  private readonly opts: MapControllerOptions;
  private readonly markers: MarkersLayer;
  private flightId = 0;
  private state: CameraState = 'idle';
  /** Resolvers of steps in progress, so `destroy()` can settle them. */
  private readonly pending = new Set<(completed: boolean) => void>();
  private destroyed = false;

  constructor(map: maplibregl.Map, opts: MapControllerOptions) {
    this.map = map;
    this.opts = opts;
    this.markers = new MarkersLayer(map, opts.markers);
  }

  /** (Re)builds the `nations` GeoJSON source. */
  setNations(nations: Nation[]): void {
    this.markers.setNations(nations);
  }

  /**
   * PLAN.md §6: cancel any flight, rise, travel, descend. Marks `n` selected immediately and pulses its marker on
   * arrival. `from` null means "first selection from the overview" (no rise) — honoured only if the camera is near
   * the overview; otherwise the current camera is the start. Resolves when the camera arrives, or early (without
   * throwing) if the flight is superseded or interrupted by a user gesture.
   */
  async flyToNation(n: Nation, from: Nation | null): Promise<void> {
    const token = this.beginFlight();
    this.markers.setSelected(n.id);
    await this.waitForTerrain();
    if (token !== this.flightId) return;

    const pose = this.currentPose();
    const start = from === null && isNearOverview(pose) ? null : pose;
    const steps = planFlight(start, n, this.opts.reducedMotion(), { viewport: this.viewport() });
    const arrived = await this.runSteps(token, `nation:${n.id}`, steps);
    if (token !== this.flightId) return;
    this.setState('idle');
    if (arrived) this.markers.pulse();
  }

  /** Back to OVERVIEW_CAMERA. Selection is left alone (call `setSelected(null)` to clear it). */
  async flyToOverview(): Promise<void> {
    const token = this.beginFlight();
    const steps = planOverview(this.currentPose(), this.opts.reducedMotion(), {
      viewport: this.viewport(),
    });
    await this.runSteps(token, 'overview', steps);
    if (token !== this.flightId) return;
    this.setState('idle');
  }

  /** Feature-state `selected` (+ the ring). Unknown ids are ignored. */
  setSelected(id: string | null): void {
    this.markers.setSelected(id);
  }

  /** Feature-state `hover`. */
  setHovered(id: string | null): void {
    this.markers.setHovered(id);
  }

  onMarkerClick(cb: (id: string) => void): () => void {
    return this.markers.onClick(cb);
  }

  /** Not in docs/contracts.md yet (proposed): pointer hover over markers, null on leave. */
  onMarkerHover(cb: (id: string | null) => void): () => void {
    return this.markers.onHover(cb);
  }

  get cameraState(): CameraState {
    return this.state;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.flightId++;
    for (const resolve of [...this.pending]) resolve(false);
    this.pending.clear();
    try {
      this.map.stop();
    } catch {
      // map already removed
    }
    try {
      this.markers.destroy();
    } catch {
      // map already removed
    }
  }

  // --- internals ---------------------------------------------------------------------------------

  private beginFlight(): number {
    const token = ++this.flightId;
    // Settle the old flight's step (also clears a reduced-motion fade), then end its camera animation.
    for (const settle of [...this.pending]) settle(false);
    this.map.stop();
    this.setState('flying');
    return token;
  }

  private setState(s: CameraState): void {
    if (this.destroyed || s === this.state) return;
    this.state = s;
    this.opts.onCameraState(s);
  }

  private currentPose(): CameraPose {
    const c = this.map.getCenter();
    return {
      center: [c.lng, c.lat],
      zoom: this.map.getZoom(),
      pitch: this.map.getPitch(),
      bearing: this.map.getBearing(),
    };
  }

  private viewport(): Viewport {
    const el = this.map.getContainer();
    return { width: el.clientWidth || 1280, height: el.clientHeight || 800 };
  }

  /** Brief: if terrain isn't on the map yet, give it one `idle` (bounded) before flying. */
  private async waitForTerrain(): Promise<void> {
    if (this.map.getTerrain()) return;
    const ms = this.opts.terrainWaitMs ?? 2000;
    await Promise.race([this.map.once('idle'), new Promise((r) => setTimeout(r, ms))]);
  }

  /** Runs steps in order. True if all finished; false as soon as one is interrupted or superseded. */
  private async runSteps(token: number, target: string, steps: FlightStep[]): Promise<boolean> {
    for (const [index, step] of steps.entries()) {
      if (token !== this.flightId) return false;
      const base = { flight: token, target, index, steps };
      this.opts.onStep?.({ ...base, phase: 'start', at: performance.now() });
      const completed = await this.runStep(token, step);
      this.opts.onStep?.({ ...base, phase: 'end', completed, at: performance.now() });
      if (!completed || token !== this.flightId) return false;
    }
    return true;
  }

  private runStep(token: number, step: FlightStep): Promise<boolean> {
    if (step.type === 'jumpTo') return this.runJump(token, step);

    const map = this.map;
    const eventData: FlightEventData = { ws2Flight: token };
    return new Promise<boolean>((resolve) => {
      const started = performance.now();
      const settle = (completed: boolean) => {
        map.off('moveend', onMoveEnd);
        this.pending.delete(settle);
        resolve(completed && token === this.flightId);
      };
      const onMoveEnd = (e: maplibregl.MapLibreEvent & Partial<FlightEventData>) => {
        if (e.ws2Flight !== token) return;
        // Finished segments end at or after their duration; map.stop() and user gestures end them early.
        settle(performance.now() - started >= step.duration - FINISH_SLACK_MS);
      };
      this.pending.add(settle);
      map.on('moveend', onMoveEnd);

      if (step.type === 'easeTo') {
        map.easeTo(
          {
            ...(step.center ? { center: step.center } : {}),
            zoom: step.zoom,
            pitch: step.pitch,
            bearing: step.bearing,
            duration: step.duration,
            easing: easeInOutSine,
            essential: true,
          },
          eventData,
        );
      } else {
        map.flyTo(
          {
            center: step.center,
            zoom: step.zoom,
            pitch: step.pitch,
            bearing: step.bearing,
            speed: step.speed,
            curve: step.curve,
            duration: step.duration,
            essential: true,
          },
          eventData,
        );
      }
    });
  }

  /** Reduced motion: fade the canvas out, cut, fade back in. */
  private runJump(token: number, step: Extract<FlightStep, { type: 'jumpTo' }>): Promise<boolean> {
    const canvas = this.map.getCanvas();
    const half = Math.round(step.fadeMs / 2);
    return new Promise<boolean>((resolve) => {
      const timers: ReturnType<typeof setTimeout>[] = [];
      const settle = (completed: boolean) => {
        timers.forEach(clearTimeout);
        canvas.style.opacity = '';
        canvas.style.transition = '';
        this.pending.delete(settle);
        resolve(completed && token === this.flightId);
      };
      this.pending.add(settle);
      canvas.style.transition = `opacity ${half}ms ease-in-out`;
      canvas.style.opacity = '0';
      timers.push(
        setTimeout(() => {
          if (token !== this.flightId) return settle(false);
          this.map.jumpTo(
            { center: step.center, zoom: step.zoom, pitch: step.pitch, bearing: step.bearing },
            { ws2Flight: token } satisfies FlightEventData,
          );
          canvas.style.opacity = '1';
          timers.push(setTimeout(() => settle(true), half));
        }, half),
      );
    });
  }
}

function isNearOverview(p: CameraPose): boolean {
  return p.zoom <= NEAR_OVERVIEW_ZOOM && Math.abs(p.pitch) < NEAR_OVERVIEW_PITCH;
}

function easeInOutSine(t: number): number {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}
