import Card from '../../components/Card/Card'
import EnergyChart from '../../components/EnergyChart/EnergyChart'
import Legend from '../../components/Legend/Legend'
import PageHeader from '../../components/PageHeader/PageHeader'
import ProgressBar from '../../components/ProgressBar/ProgressBar'
import StatTile from '../../components/StatTile/StatTile'
import { useFactory } from '../../context/useFactory'
import type { EnergyTariff } from '../../data/types'
import styles from './EnergyPage.module.css'

const TARIFF_BANDS: {
  key: EnergyTariff
  label: string
  color: string
}[] = [
  { key: 'peak', label: 'Peak', color: 'var(--terracotta)' },
  { key: 'mid', label: 'Mid', color: 'var(--tariff-mid)' },
  { key: 'off', label: 'Off-peak', color: 'var(--tariff-off)' },
]

const formatEnergy = (value: number) =>
  `${value.toLocaleString('en-IN', { maximumFractionDigits: 1 })} kWh`

const formatCurrency = (value: number) =>
  `₹ ${Math.round(value).toLocaleString('en-IN')}`

export default function EnergyPage() {
  const { factory } = useFactory()
  const solar = factory.energyByHour.reduce((sum, hour) => sum + hour.solarKwh, 0)
  const grid = factory.energyByHour.reduce((sum, hour) => sum + hour.gridKwh, 0)
  const total = solar + grid
  const energyCost = factory.compare.find((metric) =>
    metric.label.toLowerCase().includes('cost'),
  )?.optimized
  const totalCost = Number(energyCost?.replace(/[^\d.]/g, '') ?? 0)
  const tariffTotals = TARIFF_BANDS.map((band) => ({
    ...band,
    kwh: factory.energyByHour
      .filter((hour) => hour.tariff === band.key)
      .reduce((sum, hour) => sum + hour.solarKwh + hour.gridKwh, 0),
  }))

  return (
    <div className={styles.page}>
      <PageHeader eyebrow={factory.name} title="Energy analysis" />

      <div className={styles.stats}>
        <StatTile label="Total energy" value={formatEnergy(total)} />
        <StatTile label="Solar used" value={formatEnergy(solar)} />
        <StatTile label="Grid used" value={formatEnergy(grid)} />
        <StatTile label="Energy cost" value={formatCurrency(totalCost)} />
      </div>

      <Card title="Hourly energy use">
        <Legend
          items={[
            { label: 'Solar', color: 'var(--sun)', shape: 'square' },
            { label: 'Grid', color: 'var(--grid-brown)', shape: 'square' },
          ]}
        />
        <EnergyChart energyByHour={factory.energyByHour} height={260} />
      </Card>

      <Card title="Cost by tariff band">
        <div className={styles.tariffList}>
          {tariffTotals.map((band) => {
            const allocation = total > 0 ? (band.kwh / total) * totalCost : 0
            return (
              <div className={styles.tariffRow} key={band.key}>
                <div className={styles.tariffHeading}>
                  <strong>{band.label}</strong>
                  <span>{formatEnergy(band.kwh)}</span>
                  <strong>{formatCurrency(allocation)}</strong>
                </div>
                <ProgressBar
                  value={total > 0 ? (band.kwh / total) * 100 : 0}
                  color={band.color}
                  ariaLabel={`${band.label} tariff energy share`}
                />
              </div>
            )
          })}
        </div>
        <p className={styles.allocationNote}>
          Tariff-band cost is allocated proportionally by energy use; the
          factory data does not include tariff-specific rates.
        </p>
      </Card>
    </div>
  )
}
