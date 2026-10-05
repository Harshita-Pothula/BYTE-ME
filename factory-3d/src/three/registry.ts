import * as THREE from 'three';

/**
 * Runtime objects shared between 3D components and the overlay UI
 * (bounding boxes, speed factors, the camera). This is scene geometry,
 * not app state: machine data and selection live in the zustand stores.
 */
export interface MachineRuntime {
  id: string;
  flip: boolean;
  index: number;
  box: THREE.Box3;
  center: THREE.Vector3;
  anchor: THREE.Vector3;
  /** Eased animation speed factor (0..1). */
  f: number;
  meshes: THREE.Mesh[];
}

export const registry = {
  machines: {} as Record<string, MachineRuntime>,
  /** Walk-through colliders (machines + support areas). */
  colliders: new Set<THREE.Box3>(),
  camera: null as THREE.PerspectiveCamera | null,
  tweening: false,
  stats: { fps: 0, calls: 0, cam: '' },
  /** Machine/infra label elements, keyed by machine id or infra key. */
  labels: new Map<string, { el: HTMLElement; machineId: string | null; pos: THREE.Vector3; visible: boolean }>(),
};

export function speedOf(id: string) {
  return registry.machines[id]?.f ?? 0;
}
