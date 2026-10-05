import { useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../../components/Button/Button'
import Card from '../../components/Card/Card'
import PageHeader from '../../components/PageHeader/PageHeader'
import ProgressBar from '../../components/ProgressBar/ProgressBar'
import SegmentedToggle from '../../components/SegmentedToggle/SegmentedToggle'
import StatTile from '../../components/StatTile/StatTile'
import StatusChip from '../../components/StatusChip/StatusChip'
import { useFactory } from '../../context/useFactory'
import type { Factory, Machine, MachineStatus, Stage } from '../../data/types'
import styles from './FactoryViewPage.module.css'

type ViewType = '2d' | '3d'

function allMachines(factory: Factory) {
  return factory.stages.flatMap((stage) =>
    stage.machines.map((machine) => ({ machine, stage })),
  )
}

function getInitialMachineId(factory: Factory) {
  return (
    allMachines(factory).find(({ machine }) => machine.status === 'Running')
      ?.machine.id ?? ''
  )
}

function getSolarShare(factory: Factory) {
  const totalEnergy = factory.solarNowKw + factory.gridNowKw
  return totalEnergy > 0
    ? Math.round((factory.solarNowKw / totalEnergy) * 100)
    : 0
}

function formatTime(hour: number) {
  const normalized = Math.floor(hour) % 24
  return `${String(normalized).padStart(2, '0')}:${String(
    Math.round((hour - Math.floor(hour)) * 60),
  ).padStart(2, '0')}`
}

function MachineGlyph({ type }: { type: Machine['type'] }) {
  return (
    <svg
      className={styles.machineGlyph}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      {type === 'conveyor' ? (
        <>
          <path d="M4 20h24M7 24h18M9 10h14v8H9z" />
          <circle cx="9" cy="23" r="2" />
          <circle cx="23" cy="23" r="2" />
        </>
      ) : type === 'oven' ? (
        <>
          <path d="M7 5h18v22H7zM11 10h10v8H11zM11 22h2M17 22h4" />
          <path d="M14 15c-2-2 2-3 0-5M18 15c-2-2 2-3 0-5" />
        </>
      ) : type === 'tank' || type === 'mixer' ? (
        <>
          <path d="M8 8h16v16H8zM6 8h20M11 24v3m10-3v3M16 3v10m-4-3 4 3 4-3" />
          {type === 'mixer' && <path d="M12 18h8" />}
        </>
      ) : (
        <>
          <path d="M6 8h20v16H6zM10 12h12M10 16h12M10 20h8" />
          <circle cx="24" cy="24" r="3" />
        </>
      )}
    </svg>
  )
}

function MachineTile({
  machine,
  selected,
  onSelect,
}: {
  machine: Machine
  selected: boolean
  onSelect: () => void
}) {
  const statusClass: Record<MachineStatus, string> = {
    Running: styles.running,
    Idle: styles.idle,
    Maintenance: styles.maintenance,
  }

  return (
    <button
      type="button"
      className={`${styles.machineTile} ${statusClass[machine.status]}${
        selected ? ` ${styles.selectedMachine}` : ''
      }`}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className={styles.machineTileTop}>
        <MachineGlyph type={machine.type} />
        <span className={styles.machineStatusDot} aria-hidden="true" />
      </span>
      <span className={styles.machineName}>{machine.name}</span>
      <span className={styles.machinePower}>{machine.ratedKw} kW</span>
      <span className={styles.machineStatusText}>{machine.status}</span>
      {machine.onSolar && (
        <span className={styles.solarMark} aria-label="On solar">
          ☀
        </span>
      )}
    </button>
  )
}

function ThreeDSlot({
  factory,
  onShowFloorPlan,
}: {
  factory: Factory
  onShowFloorPlan: () => void
}) {
  return (
    <section className={styles.threeDSlot} aria-label="3D factory model">
      <div className={styles.threeDContent}>
        <svg className={styles.modelIcon} viewBox="0 0 72 72" fill="none" aria-hidden="true">
          <path
            d="m36 7 25 14v30L36 65 11 51V21L36 7Z"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinejoin="round"
          />
          <path
            d="m11 21 25 15 25-15M36 36v29m0-29L21 27m15 9 15-9"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinejoin="round"
          />
        </svg>
        <h2>{factory.name} · 3D model</h2>
        <p>
          The detailed 3D scene loads here. Drag to rotate, scroll to zoom, and
          click a machine to see its details.
        </p>
        <Button variant="secondary" onClick={onShowFloorPlan}>
          Show 2D floor plan instead
        </Button>
      </div>
      {/* TODO: Mount the teammate's Three.js factory scene in this slot. */}
    </section>
  )
}

function FactoryStats({ factory }: { factory: Factory }) {
  const machines = allMachines(factory)

  return (
    <div className={styles.stats} aria-label="Factory summary">
      <StatTile label="Stages" value={factory.stages.length} />
      <StatTile label="Machines" value={machines.length} />
      <StatTile
        label="Running now"
        value={`${machines.filter(({ machine }) => machine.status === 'Running').length} of ${machines.length}`}
      />
      <StatTile label="Solar share" value={`${getSolarShare(factory)}%`} />
    </div>
  )
}

export interface FactoryFloorPlanProps {
  factory: Factory
  selectedMachineId?: string
  onSelectMachine?: (machineId: string) => void
}

export function FactoryFloorPlan({
  factory,
  selectedMachineId: controlledMachineId,
  onSelectMachine,
}: FactoryFloorPlanProps) {
  const [internalMachineId, setInternalMachineId] = useState(() =>
    getInitialMachineId(factory),
  )
  const machines = allMachines(factory)
  const selectedMachineId =
    (controlledMachineId &&
    machines.some(({ machine }) => machine.id === controlledMachineId)
      ? controlledMachineId
      : machines.some(({ machine }) => machine.id === internalMachineId)
        ? internalMachineId
        : getInitialMachineId(factory))
  const selectMachine = onSelectMachine ?? setInternalMachineId
  const selected = machines.find(
    ({ machine }) => machine.id === selectedMachineId,
  )
  const selectedSlot = selected
    ? factory.optimizedSchedule.find(
        (block) => block.machineId === selected.machine.id,
      )
    : undefined
  return (
    <>
      <div className={styles.energySummary}>
        <div className={styles.solarEnergy}>
          <div className={styles.energyHeading}>
            <span>Roof solar</span>
            <strong>{factory.solarNowKw} kW</strong>
          </div>
          <ProgressBar
            value={
              factory.solarCapacityKw > 0
                ? (factory.solarNowKw / factory.solarCapacityKw) * 100
                : 0
            }
            color="var(--sun)"
            ariaLabel="Roof solar share"
          />
        </div>
        <div className={styles.gridEnergy}>
          <div className={styles.energyHeading}>
            <span>Grid supply</span>
            <strong>{factory.gridNowKw} kW</strong>
          </div>
          <ProgressBar
            value={
              factory.gridMaxKw > 0
                ? (factory.gridNowKw / factory.gridMaxKw) * 100
                : 0
            }
            color="var(--grid-brown)"
            ariaLabel="Grid supply against maximum"
          />
        </div>
      </div>

      <div className={styles.floorLayout}>
        <Card title="Floor plan · production flow">
          <div
            className={styles.floorScroller}
            tabIndex={0}
            aria-label={`${factory.name} production floor, horizontally scrollable`}
          >
            <div className={styles.floorFlow}>
              {factory.stages.map((stage, index) => (
                <div className={styles.stageGroup} key={stage.id}>
                  <StageZone
                    stage={stage}
                    number={index + 1}
                    selectedMachineId={selectedMachineId}
                    onSelect={selectMachine}
                  />
                  {index < factory.stages.length - 1 && (
                    <span className={styles.stageArrow} aria-hidden="true">
                      →
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className={styles.legend} aria-label="Floor plan legend">
            {(['Running', 'Idle', 'Maintenance'] as const).map((status) => (
              <span className={styles.legendItem} key={status}>
                <span className={`${styles.legendDot} ${styles[status.toLowerCase()]}`} />
                {status}
              </span>
            ))}
            <span className={styles.legendItem}>
              <span className={`${styles.legendDot} ${styles.solarLegend}`} />
              On solar
            </span>
          </div>
        </Card>

        <Card title="Machine details" className={styles.detailsCard}>
          {selected ? (
            <MachineDetails
              machine={selected.machine}
              stage={selected.stage}
              nextSlot={selectedSlot}
            />
          ) : (
            <p className={styles.emptySelection}>
              No machines are available to display. Add machines in Factory
              Builder.
            </p>
          )}
        </Card>
      </div>
    </>
  )
}

function StageZone({
  stage,
  number,
  selectedMachineId,
  onSelect,
}: {
  stage: Stage
  number: number
  selectedMachineId: string
  onSelect: (machineId: string) => void
}) {
  return (
    <section className={styles.stageZone} aria-label={`Stage ${number}: ${stage.name}`}>
      <div className={styles.zoneHeader}>
        <span className={styles.zoneNumber}>{number}</span>
        <h3>{stage.name}</h3>
      </div>
      <div className={styles.zoneMachines}>
        {stage.machines.map((machine) => (
          <MachineTile
            key={machine.id}
            machine={machine}
            selected={machine.id === selectedMachineId}
            onSelect={() => onSelect(machine.id)}
          />
        ))}
        {stage.machines.length === 0 && (
          <p className={styles.emptyStage}>No machines in this stage</p>
        )}
      </div>
    </section>
  )
}

function MachineDetails({
  machine,
  stage,
  nextSlot,
}: {
  machine: Machine
  stage: Stage
  nextSlot?: Factory['optimizedSchedule'][number]
}) {
  const energySource = machine.onSolar ? 'Solar' : 'Grid'

  return (
    <>
      <p className={styles.selectedMachineName}>{machine.name}</p>
      <div className={styles.machineStatusRow}>
        <StatusChip status={machine.status} />
        {machine.onSolar && <StatusChip status="Solar" />}
      </div>
      <dl className={styles.machineFacts}>
        <div>
          <dt>Stage</dt>
          <dd>{stage.name}</dd>
        </div>
        <div>
          <dt>Rated power</dt>
          <dd>{machine.ratedKw} kW</dd>
        </div>
        <div>
          <dt>Energy source</dt>
          <dd>{energySource}</dd>
        </div>
        <div>
          <dt>Next slot</dt>
          <dd>
            {nextSlot
              ? `${formatTime(nextSlot.start)}–${formatTime(nextSlot.end)}`
              : 'No scheduled slot'}
          </dd>
        </div>
      </dl>
      <div className={styles.utilization}>
        <div className={styles.utilizationHeading}>
          <span>Utilization today</span>
          <strong>{machine.utilization}%</strong>
        </div>
        <ProgressBar
          value={machine.utilization}
          ariaLabel={`${machine.name} utilization`}
        />
      </div>
      <Link className={styles.scheduleLink} to="/schedule">
        See in schedule <span aria-hidden="true">→</span>
      </Link>
    </>
  )
}

function FactoryViewForSelection({ factory }: { factory: Factory }) {
  const [view, setView] = useState<ViewType>(factory.has3dModel ? '3d' : '2d')
  const [selectedMachineId, setSelectedMachineId] = useState(() =>
    getInitialMachineId(factory),
  )
  const showFloorPlan = () => setView('2d')

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow={`${factory.name} · ${
          factory.has3dModel ? '3D model available' : '2D floor plan'
        }`}
        title="Factory view"
        actions={
          <div className={styles.viewActions}>
            <span className={styles.viewLabel}>View type</span>
            <SegmentedToggle
              ariaLabel="View type"
              value={view}
              onChange={(value) => setView(value === '3d' ? '3d' : '2d')}
              options={[
                { value: '2d', label: '2D floor plan' },
                {
                  value: '3d',
                  label: '3D model',
                  disabled: !factory.has3dModel,
                },
              ]}
            />
          </div>
        }
      />
      {view === '3d' && factory.has3dModel ? (
        <>
          <div className={styles.viewNotice} role="status">
            {factory.name} · 3D model view
          </div>
          <FactoryStats factory={factory} />
          <ThreeDSlot factory={factory} onShowFloorPlan={showFloorPlan} />
        </>
      ) : (
        <>
          {!factory.has3dModel && (
            <div className={styles.viewNotice} role="status">
              This factory has no 3D model · showing 2D floor plan
            </div>
          )}
          <FactoryStats factory={factory} />
          <FactoryFloorPlan
            factory={factory}
            selectedMachineId={selectedMachineId}
            onSelectMachine={setSelectedMachineId}
          />
        </>
      )}
    </div>
  )
}

export default function FactoryViewPage() {
  const { factory } = useFactory()
  return <FactoryViewForSelection key={factory.id} factory={factory} />
}
