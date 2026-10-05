import type * as THREE from 'three';
import type { Kit } from '../kit';

export type AnimType = 'rotX' | 'rotY' | 'rotZ' | 'vib' | 'slideX' | 'swing';

export interface Anim {
  obj: THREE.Object3D;
  type: AnimType;
  speed?: number;
  amp?: number;
  /** Filled in after the machine is built. */
  base?: THREE.Vector3;
  rot?: number;
  phase?: number;
}

/**
 * Builds a machine into `g` in local coordinates. The conveyor runs along
 * local X at z = 0; keep |z| < 0.6, y < 1.7 clear unless a part bridges it.
 */
export type MachineBuilder = (g: THREE.Group, k: Kit, anims: Anim[]) => void;
