import type { PresetKey } from '../../config/cameraPresets';

/**
 * Camera commands the UI can call. CameraRig fills these in when it mounts;
 * until then they are no-ops.
 */
export const cameraApi = {
  goPreset: (_key: PresetKey) => {},
  focusMachine: (_id: string) => {},
  /** Must be called from inside a click handler so pointer lock is allowed. */
  enterWalk: () => {},
  exitWalk: () => {},
};

/** Shared walk-through input state (CameraRig moves, Picker drag-looks). */
export const walkState = {
  yaw: 0,
  pitch: 0,
  keys: {} as Record<string, boolean>,
  locked: false,
  ready: false,
};
