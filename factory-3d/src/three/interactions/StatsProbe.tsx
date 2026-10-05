import { useEffect, useMemo } from 'react';
import { addAfterEffect, useFrame, useThree } from '@react-three/fiber';
import { useViewStore } from '../../state/viewStore';
import { registry } from '../registry';

/**
 * Samples FPS, draw calls and camera position for the debug panel, and flags
 * the first frames as ready. R3F resets gl.info before frame callbacks, so
 * draw calls are read in an after-render effect.
 */
export function StatsProbe() {
  const gl = useThree((s) => s.gl);
  const get = useThree((s) => s.get);
  const acc = useMemo(() => ({ n: 0, t0: performance.now(), frames: 0, calls: 0 }), []);

  useEffect(() => addAfterEffect(() => void (acc.calls = gl.info.render.calls)), [gl, acc]);

  useFrame(({ camera }) => {
    acc.n++;
    if (++acc.frames === 3) {
      useViewStore.getState().set({ ready: true });
      if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__bytemeR3F = get;
    }
    const now = performance.now();
    if (now - acc.t0 > 500) {
      const p = camera.position;
      registry.stats = {
        fps: Math.round((acc.n * 1000) / (now - acc.t0)),
        calls: acc.calls,
        cam: `${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}`,
      };
      acc.n = 0;
      acc.t0 = now;
    }
  });
  return null;
}
