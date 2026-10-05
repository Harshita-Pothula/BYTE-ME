import { useEnergyNow } from '../../state/energyStore';
import { STATUS, STATUS_ORDER, statusCss } from '../../config/statusStyles';

/** Solar / grid / factory load bars, scaled to the largest value, plus the status legend. */
export function EnergyPanel() {
  const e = useEnergyNow();
  const max = Math.max(e.load, e.solar, 1);
  const rows: [string, number, string][] = [
    ['Solar', e.solar, '#E3A72F'],
    ['Grid', e.grid, '#8A6E58'],
    ['Factory', e.load, 'var(--accent)'],
  ];
  return (
    <section className="panel energy" aria-label="Energy right now">
      <h2>Energy right now</h2>
      {rows.map(([label, kw, color]) => (
        <div className="erow" key={label}>
          <span>{label}</span>
          <div className="ebar">
            <i style={{ background: color, width: `${(kw / max) * 100}%` }} />
          </div>
          <b>{kw} kW</b>
        </div>
      ))}
      <ul className="legend" aria-label="Machine status colours">
        {STATUS_ORDER.map((s) => (
          <li key={s}>
            <span className="dot" style={{ background: statusCss(s) }} />
            {STATUS[s].label}
          </li>
        ))}
      </ul>
    </section>
  );
}
