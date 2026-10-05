import type { MachineData, MachineDataProvider, MachineStatus } from '../types';

/**
 * Stub for the ByteMe backend. Maps backend JSON onto MachineData.
 * Adjust `mapMachine` once the optimizer's response shape is final.
 */
export interface ApiMachineDataProviderOptions {
  /** Base URL, e.g. "/api". Machines are read from `${baseUrl}/machines`. */
  baseUrl: string;
  /** Poll interval for subscribe(); 0 disables polling. Default 10 s. */
  pollMs?: number;
  fetchImpl?: typeof fetch;
  headers?: Record<string, string>;
}

const STATUSES: MachineStatus[] = ['running', 'idle', 'maintenance', 'offline', 'warning'];

type Json = Record<string, unknown>;

const str = (v: unknown) => (v == null ? undefined : String(v));
const num = (v: unknown, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
/** Accepts "HH:MM", ISO timestamps or undefined; returns "HH:MM". */
const hhmm = (v: unknown) => {
  const s = str(v);
  if (!s) return undefined;
  if (/^\d{1,2}:\d{2}$/.test(s)) return s.padStart(5, '0');
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toTimeString().slice(0, 5);
};

export function mapMachine(raw: Json): MachineData {
  const statusRaw = String(raw.status ?? raw.state ?? 'offline').toLowerCase();
  const status = (STATUSES as string[]).includes(statusRaw) ? (statusRaw as MachineStatus) : 'offline';
  return {
    machine_id: String(raw.machine_id ?? raw.id ?? ''),
    name: String(raw.name ?? raw.machine_name ?? raw.machine_id ?? raw.id ?? 'Machine'),
    status,
    power_kw: num(raw.power_kw ?? raw.power ?? raw.powerKw),
    production_duration_minutes: num(raw.production_duration_minutes ?? raw.duration_minutes ?? raw.duration),
    start_time: hhmm(raw.start_time ?? raw.start),
    end_time: hhmm(raw.end_time ?? raw.end),
    message: str(raw.message ?? raw.note),
  };
}

export class ApiMachineDataProvider implements MachineDataProvider {
  private opts: Required<Omit<ApiMachineDataProviderOptions, 'headers'>> & { headers?: Record<string, string> };

  constructor(opts: ApiMachineDataProviderOptions) {
    this.opts = { pollMs: 10000, fetchImpl: fetch.bind(globalThis), ...opts };
  }

  async getMachines(): Promise<MachineData[]> {
    const res = await this.opts.fetchImpl(`${this.opts.baseUrl}/machines`, { headers: this.opts.headers });
    if (!res.ok) throw new Error(`Machines request failed: ${res.status}`);
    const body = (await res.json()) as unknown;
    const list = Array.isArray(body) ? body : ((body as Json).machines as unknown[]) ?? [];
    return (list as Json[]).map(mapMachine).filter((m) => m.machine_id);
  }

  async getMachine(id: string): Promise<MachineData | undefined> {
    return (await this.getMachines()).find((m) => m.machine_id === id);
  }

  subscribe(cb: (machines: MachineData[]) => void): () => void {
    if (!this.opts.pollMs) return () => {};
    const t = setInterval(() => {
      this.getMachines().then(cb, () => {});
    }, this.opts.pollMs);
    return () => clearInterval(t);
  }
}
