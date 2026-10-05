export type MachineStatus = 'running' | 'idle' | 'maintenance' | 'offline' | 'warning';

export interface MachineData {
  machine_id: string;
  name: string;
  status: MachineStatus;
  power_kw: number;
  production_duration_minutes: number;
  start_time?: string;
  end_time?: string;
  message?: string;
}

export interface MachineDataProvider {
  getMachines(): Promise<MachineData[]>;
  getMachine(id: string): Promise<MachineData | undefined>;
  /** Optional push updates. Returns an unsubscribe function. */
  subscribe?(cb: (machines: MachineData[]) => void): () => void;
}
