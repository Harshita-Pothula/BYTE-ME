import { create } from 'zustand';

export type ViewMode = 'orbit' | 'walk';
export type ViewButton = 'overview' | 'close' | 'walk' | null;

interface ViewState {
  selectedId: string | null;
  hoveredId: string | null;
  mode: ViewMode;
  showLabels: boolean;
  showEnergy: boolean;
  showIds: boolean;
  live: boolean;
  showDebug: boolean;
  /** Which segmented view button is pressed. Any manual orbit drag clears it. */
  activeView: ViewButton;
  /** Pointer lock unavailable: walk-through uses drag-to-look. */
  walkFallback: boolean;
  dark: boolean;
  ready: boolean;
  toast: { msg: string; n: number } | null;
  set(patch: Partial<Omit<ViewState, 'set' | 'showToast'>>): void;
  showToast(msg: string): void;
}

export const useViewStore = create<ViewState>()((set) => ({
  selectedId: null,
  hoveredId: null,
  mode: 'orbit',
  showLabels: true,
  showEnergy: true,
  showIds: false,
  live: true,
  showDebug: false,
  activeView: null,
  walkFallback: false,
  dark: false,
  ready: false,
  toast: null,
  set: (patch) => set(patch),
  showToast: (msg) => set((s) => ({ toast: { msg, n: (s.toast?.n ?? 0) + 1 } })),
}));
