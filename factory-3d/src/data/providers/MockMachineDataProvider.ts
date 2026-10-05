import type { MachineData, MachineDataProvider } from '../types';
import { MOCK_MACHINES } from '../mock/mockMachines';

/** Serves the sample plant. Swap for ApiMachineDataProvider to go live; nothing else changes. */
export class MockMachineDataProvider implements MachineDataProvider {
  private machines: MachineData[] = MOCK_MACHINES.map((m) => ({ ...m }));

  getMachines(): Promise<MachineData[]> {
    return Promise.resolve(this.machines.map((m) => ({ ...m })));
  }

  getMachine(id: string): Promise<MachineData | undefined> {
    const m = this.machines.find((x) => x.machine_id === id);
    return Promise.resolve(m ? { ...m } : undefined);
  }
}
