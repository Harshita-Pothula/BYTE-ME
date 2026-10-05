export type Vec3 = [number, number, number];
export type PresetKey = 'reset' | 'overview' | 'close';

export const CAMERA = { fov: 42, near: 0.1, far: 600 } as const;

export const PRESETS: Record<PresetKey, { pos: Vec3; target: Vec3 }> = {
  reset: { pos: [34, 23, 38], target: [1, 0, -1] },
  overview: { pos: [10, 64, 44], target: [10, 0, 3] },
  close: { pos: [-15.5, 5.2, 4.4], target: [4, 1.6, -3.2] },
};

export const ORBIT = {
  dampingFactor: 0.08,
  maxPolarAngle: Math.PI * 0.47,
  minDistance: 3,
  maxDistance: 160,
} as const;

export const FOCUS = { dx: 4.5, y: 5.2, dz: 8.5, targetY: 1.7, duration: 1.2 } as const;

export const WALK = {
  start: { pos: [0, 1.7, 17] as Vec3, target: [0, 1.7, 9] as Vec3, duration: 1.4 },
  eye: 1.7,
  speed: 4.8,
  runSpeed: 9,
  mouseSens: 0.0022,
  dragSens: 0.004,
  pitchLimit: 1.3,
  bounds: { x0: -29.3, x1: 29.3, z0: -21.3, z1: 25.3 },
  pickRange: 14,
} as const;
