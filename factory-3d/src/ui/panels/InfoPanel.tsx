import { useMachineStore } from '../../state/machineStore';
import { useViewStore } from '../../state/viewStore';
import { useEnergyNow } from '../../state/energyStore';
import { LAYOUT_BY_ID, LAYOUT, type MachineId } from '../../config/layout';
import { DEFAULT_MESSAGES, STATUS, statusCss } from '../../config/statusStyles';
import { MACHINE_DESCRIPTIONS } from '../../data/mock/machineDescriptions';
import type { MachineData } from '../../data/types';
import { cameraApi } from '../../three/cameras/cameraApi';

const fmtDur = (m: number) => (m < 60 ? `${m} min` : `${m} min (${Math.round(m / 6) / 10} h)`);

function stateText(m: MachineData) {
  if (m.status === 'running') return `Processing the current batch until ${m.end_time}.`;
  if (m.status === 'idle') return `Waiting. The next batch starts at ${m.start_time}.`;
  return m.message || DEFAULT_MESSAGES[m.status] || '';
}

function powerText(m: MachineData) {
  if (m.status === 'running' || m.status === 'warning') return `${m.power_kw} kW`;
  if (m.status === 'idle') return `${Math.round(m.power_kw * 0.1 * 10) / 10} kW standby (${m.power_kw} kW rated)`;
  return `0 kW (${m.power_kw} kW rated)`;
}

/** Machine pop-up: right side on desktop, bottom sheet on phones. Esc closes it. */
export function InfoPanel() {
  const selectedId = useViewStore((s) => s.selectedId);
  const set = useViewStore((s) => s.set);
  const m = useMachineStore((s) => (selectedId ? s.machines[selectedId] : undefined));
  const e = useEnergyNow();
  if (!m) return null;

  const def = LAYOUT_BY_ID[m.machine_id as MachineId];
  const draws = m.status === 'running' || m.status === 'warning';
  const source = !draws
    ? 'Not drawing power'
    : e.solar >= e.load
      ? 'Solar'
      : e.solar <= 0
        ? 'Grid'
        : `Solar and grid (${Math.round((e.used / e.load) * 100)}% solar)`;

  return (
    <aside className="panel info" aria-live="polite" aria-label="Machine details">
      <button className="close" type="button" aria-label="Close machine details" onClick={() => set({ selectedId: null })}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
      <p className="eyebrow">{def ? `Step ${def.index + 1} of ${LAYOUT.length} · ${def.stage}` : 'Machine'}</p>
      <h2>{m.name}</h2>
      <p className="desc">{MACHINE_DESCRIPTIONS[m.machine_id] ?? ''}</p>
      <span className="chip">
        <span className="dot" style={{ background: statusCss(m.status) }} />
        <span>{STATUS[m.status]?.label ?? m.status}</span>
      </span>
      <dl>
        <dt>Machine ID</dt>
        <dd>{m.machine_id}</dd>
        <dt>Power</dt>
        <dd>{powerText(m)}</dd>
        <dt>Production</dt>
        <dd>{fmtDur(m.production_duration_minutes)}</dd>
        <dt>Schedule</dt>
        <dd>
          {m.start_time ?? '–'} to {m.end_time ?? '–'}
        </dd>
        <dt>Energy</dt>
        <dd>{source}</dd>
      </dl>
      <p className="state">{stateText(m)}</p>
      <div className="row">
        <button className="btn primary" type="button" onClick={() => cameraApi.focusMachine(m.machine_id)}>
          Zoom to machine
        </button>
        <button className="btn ghost" type="button" onClick={() => cameraApi.goPreset('overview')}>
          Back to overview
        </button>
      </div>
    </aside>
  );
}
