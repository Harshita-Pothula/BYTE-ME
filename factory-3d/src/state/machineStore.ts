import { create } from 'zustand';
import type { MachineData, MachineStatus } from '../data/types';
import { DEFAULT_MESSAGES } from '../config/statusStyles';

interface MachineState {
  machines: Record<string, MachineData>;
  loaded: boolean;
  upsertMachines(list: MachineData[]): void;
  /** Sets a status and the default message for it. */
  setStatus(id: string, status: MachineStatus): void;
}

export const useMachineStore = create<MachineState>()((set) => ({
  machines: {},
  loaded: false,
  upsertMachines: (list) =>
    set((s) => {
      const machines = { ...s.machines };
      for (const m of list) machines[m.machine_id] = { ...machines[m.machine_id], ...m };
      return { machines, loaded: true };
    }),
  setStatus: (id, status) =>
    set((s) => {
      const m = s.machines[id];
      if (!m) return s;
      return { machines: { ...s.machines, [id]: { ...m, status, message: DEFAULT_MESSAGES[status] } } };
    }),
}));
