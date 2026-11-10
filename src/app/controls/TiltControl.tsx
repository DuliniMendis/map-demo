// 2D / 3D switch: tilts the live camera flat (north up) or back into a 3D view of the terrain.
// It follows the camera, so it also shows 3D after a flight lands tilted or the visitor tilts by hand.
import type * as maplibregl from 'maplibre-gl';
import { useCallback, useSyncExternalStore } from 'react';
import { DEFAULT_VIEW } from '../../map/controller/choreography';
import { useAppStore } from '../../store/useAppStore';
import './controls.css';

/** At or below this pitch the view counts as flat (2D). */
export const FLAT_PITCH_MAX = 8;
/** The tilt 3D goes to: the same as a nation's default view. */
export const TILT_3D_PITCH = DEFAULT_VIEW.pitch;
const TILT_MS = 900;

/** The camera move for a mode: 2D is straight down with north up; 3D tilts and keeps the heading. */
export function tiltTarget(mode: '2d' | '3d'): { pitch: number; bearing?: number } {
  return mode === '2d' ? { pitch: 0, bearing: 0 } : { pitch: TILT_3D_PITCH };
}

export function isFlat(pitch: number): boolean {
  return pitch <= FLAT_PITCH_MAX;
}

type TiltMap = Pick<maplibregl.Map, 'getPitch' | 'on' | 'off' | 'easeTo' | 'jumpTo'>;

export function TiltControl({ map }: { map: TiltMap }) {
  const flying = useAppStore((s) => s.cameraState === 'flying');
  const subscribe = useCallback(
    (cb: () => void) => {
      map.on('pitch', cb);
      map.on('moveend', cb);
      return () => {
        map.off('pitch', cb);
        map.off('moveend', cb);
      };
    },
    [map],
  );
  const flat = useSyncExternalStore(subscribe, () => isFlat(map.getPitch()));

  const go = (mode: '2d' | '3d') => {
    const target = tiltTarget(mode);
    if (useAppStore.getState().reducedMotion) map.jumpTo(target);
    else map.easeTo({ ...target, duration: TILT_MS });
  };

  return (
    <div
      className="tilt-control overlay-panel"
      role="group"
      aria-label="Map view"
      data-testid="tilt-control"
    >
      <button
        type="button"
        aria-pressed={flat}
        disabled={flying}
        title="Flat map, north up"
        onClick={() => go('2d')}
        data-testid="tilt-2d"
      >
        2D
      </button>
      <button
        type="button"
        aria-pressed={!flat}
        disabled={flying}
        title="Tilt to see the terrain in 3D"
        onClick={() => go('3d')}
        data-testid="tilt-3d"
      >
        3D
      </button>
    </div>
  );
}
