import type { HourEnergy } from '../../data/types'
import styles from './EnergyChart.module.css'

interface EnergyChartProps {
  energyByHour: HourEnergy[]
  height?: number
  showNote?: boolean
}

export default function EnergyChart({
  energyByHour,
  height = 180,
  showNote = false,
}: EnergyChartProps) {
  const maxEnergy = Math.max(
    1,
    ...energyByHour.map((hour) => hour.solarKwh + hour.gridKwh),
  )

  return (
    <div className={styles.energyChart}>
      <div
        className={styles.chartScroller}
        role="img"
        aria-label="Hourly solar and grid energy use"
      >
        <div className={styles.chartInner}>
          <div className={styles.chartBars} style={{ height }}>
            {energyByHour.map((hour) => (
              <div
                className={styles.chartColumn}
                key={hour.hour}
                title={`${String(hour.hour).padStart(2, '0')}:00 — solar ${hour.solarKwh} kWh, grid ${hour.gridKwh} kWh`}
                aria-hidden="true"
              >
                <div
                  className={styles.solarBar}
                  style={{ height: `${(hour.solarKwh / maxEnergy) * height}px` }}
                />
                <div
                  className={`${styles.gridBar}${hour.solarKwh === 0 ? ` ${styles.gridBarTop}` : ''}`}
                  style={{ height: `${(hour.gridKwh / maxEnergy) * height}px` }}
                />
              </div>
            ))}
          </div>
          <div className={styles.tariffStrip} aria-hidden="true">
            {energyByHour.map((hour) => (
              <div
                className={`${styles.tariffBar} ${styles[`tariff-${hour.tariff}`]}`}
                key={hour.hour}
                title={`${String(hour.hour).padStart(2, '0')}:00 · ${hour.tariff} tariff`}
              />
            ))}
          </div>
          <div className={styles.hourLabels} aria-hidden="true">
            {energyByHour.map((hour) => (
              <span key={hour.hour}>
                {hour.hour % 3 === 0 ? String(hour.hour).padStart(2, '0') : ''}
              </span>
            ))}
          </div>
        </div>
      </div>
      {showNote && (
        <p className={styles.chartNote}>
          Heavy processes were moved into the 10:00–15:00 solar window and out
          of the 18:00–22:00 peak price band.
        </p>
      )}
    </div>
  )
}
