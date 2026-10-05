import * as THREE from 'three';
import { envIntensityFor } from '../machines/kit';

/**
 * Metals get 0.85 of the environment, everything else 0.40. This is what
 * stops the scene looking washed out. Safe to re-run at any time.
 */
export function applyEnvIntensity(root: THREE.Object3D) {
  root.traverse((o) => {
    const mat = (o as THREE.Mesh).material;
    if (!mat) return;
    for (const m of Array.isArray(mat) ? mat : [mat]) {
      if ((m as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
        const s = m as THREE.MeshStandardMaterial;
        s.envMapIntensity = envIntensityFor(s);
      }
    }
  });
}
