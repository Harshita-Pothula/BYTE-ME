import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { disposeTree } from '../machines/helpers';

/**
 * Build scene objects once (imperatively, from the helpers) and dispose them on unmount.
 * Return either an Object3D or an object with a `root` Object3D.
 */
export function useBuilt<T extends THREE.Object3D | { root: THREE.Object3D }>(build: () => T, deps: unknown[] = []): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const obj = useMemo(build, deps);
  useEffect(() => () => disposeTree(obj instanceof THREE.Object3D ? obj : obj.root), [obj]);
  return obj;
}
