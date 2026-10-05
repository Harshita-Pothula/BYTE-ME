import { create } from 'zustand';
import type { MachineData } from '../data/types';
import { useMachineStore } from './machineStore';

interface EnergyState {
  solarKw: number;
  setSolar(kw: number): void;
}

export const useEnergyStore = create<EnergyState>()((set) => ({
  solarKw: 95,
  setSolar: (kw) => set({ solarKw: Math.max(0, Math.min(120, Math.round(kw))) }),
}));

export interface EnergyNow {
  load: number;
  solar: number;
  grid: number;
  used: number;
}

/** load = running/warning kW + 10% of idle kW (rounded); grid covers what solar can't. */
export function computeEnergy(machines: Record<string, MachineData>, solar: number): EnergyNow {
  let load = 0;
  for (const id in machines) {
    const m = machines[id];
    if (m.status === 'running' || m.status === 'warning') load += m.power_kw;
    else if (m.status === 'idle') load += m.power_kw * 0.1;
  }
  load = Math.round(load);
  return { load, solar, grid: Math.max(0, load - solar), used: Math.min(solar, load) };
}

/** Non-reactive snapshot, safe inside useFrame. */
export function energyNow(): EnergyNow {
  return computeEnergy(useMachineStore.getState().machines, useEnergyStore.getState().solarKw);
}

/** Reactive version for UI panels. */
export function useEnergyNow(): EnergyNow {
  const machines = useMachineStore((s) => s.machines);
  const solar = useEnergyStore((s) => s.solarKw);
  return computeEnergy(machines, solar);
}
