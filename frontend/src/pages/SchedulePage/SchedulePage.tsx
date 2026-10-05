import { useMemo, useState } from 'react'
import Button from '../../components/Button/Button'
import Card from '../../components/Card/Card'
import GanttRow from '../../components/GanttRow/GanttRow'
import Legend from '../../components/Legend/Legend'
import PageHeader from '../../components/PageHeader/PageHeader'
import SegmentedToggle from '../../components/SegmentedToggle/SegmentedToggle'
import StatTile from '../../components/StatTile/StatTile'
import StatusChip from '../../components/StatusChip/StatusChip'
import { useFactory } from '../../context/useFactory'
import type { Factory, HourEnergy, Machine, ShiftedProcess } from '../../data/types'
import styles from './SchedulePage.module.css'

const VERSION_OPTIONS = [
  { value: 'baseline', label: 'Baseline' },
  { value: 'optimized', label: 'Optimized' },
]

function getMetric(factory: Factory, label: string, version: 'baseline' | 'optimized') {
  const metric = factory.compare.find((item) => item.label === label)
  return version === 'baseline' ? metric?.baseline : metric?.optimized
}

function getSolarShare(factory: Factory, version: 'baseline' | 'optimized') {
  const solarKpi = factory.kpis.find((item) => item.label === 'Solar share')
  const optimized = Number(solarKpi?.value.match(/\d+(?:\.\d+)?/)?.[0] ?? 0)

  if (version === 'optimized') return `${optimized}%`

  const change = Number(solarKpi?.delta.match(/\d+(?:\.\d+)?/)?.[0] ?? 0)
  return `${Math.max(0, optimized - change)}%`
}

function getProcessCount(factory: Factory, version: 'baseline' | 'optimized') {
  if (version === 'baseline') return '0'
  return String(factory.shifted.length)
}

function getSummary(factory: Factory, version: 'baseline' | 'optimized') {
  return [
    { label: 'Makespan', value: getMetric(factory, 'Makespan', version) ?? '—' },
    { label: 'Energy cost', value: getMetric(factory, 'Energy cost', version) ?? '—' },
    { label: 'Solar share', value: getSolarShare(factory, version) },
    { label: 'Processes shifted', value: getProcessCount(factory, version) },
  ]
}

function TariffRow({ energyByHour }: { energyByHour: HourEnergy[] }) {
  return (
    <div className={styles.tariffRow}>
      <strong>Energy price</strong>
      <div className={styles.tariffBars}>
        {energyByHour.map((hour) => (
          <span
            className={`${styles.tariffBar} ${styles[`tariff-${hour.tariff}`]}`}
            key={hour.hour}
            title={`${String(hour.hour).padStart(2, '0')}:00 · ${hour.tariff[0].toUpperCase()}${hour.tariff.slice(1)}`}
          />
        ))}
      </div>
    </div>
  )
}

function TimeRuler() {
  return (
    <div className={styles.ruler} aria-hidden="true">
      {['00:00', '03:00', '06:00', '09:00', '12:00', '15:00', '18:00', '21:00'].map(
        (time) => <span key={time}>{time}</span>,
      )}
    </div>
  )
}

function ShiftReasonChip({ reason }: { reason: ShiftedProcess['reason'] }) {
  const status = reason === 'Use solar' ? 'Solar' : reason === 'Avoid peak' ? 'Peak' : 'Saved'
  return <StatusChip status={status}>{reason}</StatusChip>
}

function ShiftedProcessesTable({ processes }: { processes: ShiftedProcess[] }) {
  return (
    <div className={styles.tableScroller}>
      <table className={styles.shiftTable}>
        <thead>
          <tr>
            <th scope="col">Process</th>
            <th scope="col">Machine</th>
            <th scope="col">Was</th>
            <th scope="col">Now</th>
            <th scope="col">Reason</th>
            <th scope="col">Saved</th>
          </tr>
        </thead>
        <tbody>
          {processes.map((process) => (
            <tr key={`${process.process}-${process.machine}`}>
              <th scope="row">{process.process}</th>
              <td>{process.machine}</td>
              <td className={styles.was}>{process.was}</td>
              <td className={styles.now}>{process.now}</td>
              <td><ShiftReasonChip reason={process.reason} /></td>
              <td className={styles.saved}>{process.saved}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Timeline({
  machines,
  energyByHour,
  blocks,
}: {
  machines: Machine[]
  energyByHour: HourEnergy[]
  blocks: Factory['optimizedSchedule']
}) {
  const blocksByMachine = useMemo(() => {
    const grouped = new Map<string, typeof blocks>()
    blocks.forEach((block) => {
      const machineBlocks = grouped.get(block.machineId) ?? []
      machineBlocks.push(block)
      grouped.set(block.machineId, machineBlocks)
    })
    return grouped
  }, [blocks])

  return (
    <div className={styles.timelineScroller}>
      <div className={styles.timelineInner}>
        <TariffRow energyByHour={energyByHour} />
        <TimeRuler />
        <div className={styles.machineRows}>
          {machines.map((machine) => (
            <GanttRow
              key={machine.id}
              label={machine.name}
              sublabel={`${machine.ratedKw} kW`}
              blocks={blocksByMachine.get(machine.id) ?? []}
              height={44}
              trackStyle={{
                background:
                  'linear-gradient(90deg, #F3EADC 0 41.6%, #FBEFCB 41.6% 66.6%, #F3EADC 66.6% 75%, #F6E0D7 75% 91.6%, #F3EADC 91.6%)',
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

export default function SchedulePage() {
  const {
    factory,
    runOptimization,
    optimizing,
    optimizationError,
  } = useFactory()
  const [version, setVersion] = useState('optimized')
  const isOptimized = version === 'optimized'
  const selectedBlocks = isOptimized ? factory.optimizedSchedule : factory.baselineSchedule
  const summary = getSummary(factory, isOptimized ? 'optimized' : 'baseline')
  const machines = factory.stages.flatMap((stage) => stage.machines)
  const title = isOptimized ? 'Optimized timeline' : 'Baseline timeline'

  return (
    <>
      <PageHeader
        eyebrow={factory.name}
        title="Production schedule"
        actions={
          <SegmentedToggle
            options={VERSION_OPTIONS}
            value={version}
            onChange={setVersion}
            ariaLabel="Schedule version"
          />
        }
      />

      <section className={styles.summaryGrid} aria-label={`${isOptimized ? 'Optimized' : 'Baseline'} schedule summary`}>
        {summary.map((item) => (
          <StatTile key={item.label} label={item.label} value={item.value} />
        ))}
      </section>

      <Card title={title}>
        {selectedBlocks.length === 0 ? (
          <div className={styles.emptySchedule}>
            <p>No schedule yet – run the optimizer.</p>
            <Button
              variant="primary"
              isLoading={optimizing}
              onClick={() => void runOptimization()}
            >
              Run optimization
            </Button>
          </div>
        ) : (
          <>
            <Legend
              items={[
                { label: 'Solar window', color: 'var(--sun-soft)', shape: 'square' },
                { label: 'Peak price', color: 'var(--terracotta)', shape: 'square' },
                { label: 'Shifted by optimizer', color: 'var(--espresso)', shape: 'dashed' },
              ]}
            />
            <Timeline
              machines={machines}
              energyByHour={factory.energyByHour}
              blocks={selectedBlocks}
            />
          </>
        )}
      </Card>

      {optimizationError && (
        <Card title="Optimization failed">
          <p className={styles.optimizationError}>{optimizationError}</p>
          <Button
            variant="primary"
            isLoading={optimizing}
            onClick={() => void runOptimization()}
          >
            Try again
          </Button>
        </Card>
      )}

      <Card title="Shifted processes">
        <ShiftedProcessesTable processes={factory.shifted} />
      </Card>
    </>
  )
}
