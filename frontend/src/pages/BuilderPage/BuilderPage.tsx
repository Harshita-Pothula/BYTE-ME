import { useState } from 'react'
import Button from '../../components/Button/Button'
import Card from '../../components/Card/Card'
import Field from '../../components/Field/Field'
import PageHeader from '../../components/PageHeader/PageHeader'
import { useFactory } from '../../context/useFactory'
import type {
  CompareMetric,
  EnergyTariff,
  Factory,
  FactoryKpi,
  HourEnergy,
  Machine,
  MachineType,
  ScheduleBlock,
  Stage,
} from '../../data/types'
import { Link } from 'react-router-dom'
import styles from './BuilderPage.module.css'

const STEPS = [
  'Factory details',
  'Machines',
  'Processes',
  'Energy & tariff',
  'Review',
]

const INDUSTRIES = [
  'Food processing',
  'Textiles',
  'Bottling',
  'Cosmetics',
  'Metal works',
  'Other',
]

const MACHINE_TYPES: MachineType[] = [
  'mixer',
  'tank',
  'oven',
  'conveyor',
  'filler',
  'packer',
  'grinder',
  'generic',
]

const SCHEDULE_COLORS: ScheduleBlock['colorKey'][] = [
  'roast',
  'grind',
  'conche',
  'temper',
  'mould',
  'pack',
]

interface MachineDraft {
  id: string
  name: string
  power: string
  type: MachineType
  available: boolean
  editing: boolean
}

interface ProcessDraft {
  id: string
  name: string
  machineId: string
  duration: string
}

interface BuilderForm {
  name: string
  industry: string
  workingHours: string
  solarCapacity: string
  peakTariff: string
  offPeakTariff: string
  machines: MachineDraft[]
  processes: ProcessDraft[]
}

const INITIAL_FORM: BuilderForm = {
  name: '',
  industry: INDUSTRIES[0],
  workingHours: '8',
  solarCapacity: '40',
  peakTariff: '12',
  offPeakTariff: '6',
  machines: [
    { id: 'machine-1', name: 'Dough mixer', power: '40', type: 'mixer', available: true, editing: false },
    { id: 'machine-2', name: 'Heating tank', power: '25', type: 'tank', available: true, editing: false },
  ],
  processes: [
    { id: 'process-1', name: 'Mixing', machineId: 'machine-1', duration: '40' },
  ],
}

const PLUS_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

const PENCIL_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="m4 16.5-.8 4.3 4.3-.8L20 7.5 16.5 4 4 16.5Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="m14.8 5.7 3.5 3.5" stroke="currentColor" strokeWidth="1.8" />
  </svg>
)

const ARROW_ICON = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M4 12h15m-6-6 6 6-6 6"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

function createEnergy(hours: HourEnergy[], solarCapacity: number): HourEnergy[] {
  const solarProfile = hours.map((hour) => hour.solarKwh)
  const maxSolar = Math.max(...solarProfile, 1)
  return hours.map((hour, index) => ({
    hour: index,
    solarKwh: Math.round((solarProfile[index] / maxSolar) * solarCapacity * 0.75),
    gridKwh: Math.max(4, Math.round(hour.gridKwh * 0.7)),
    tariff:
      index >= 18 && index <= 21
        ? 'peak'
        : index >= 6 && index <= 9
          ? 'mid'
          : 'off',
  }))
}

function createFactory(form: BuilderForm, sampleFactory: Factory): Factory {
  const availableMachines = form.machines.filter((machine) => machine.available)
  const machineById = new Map(form.machines.map((machine) => [machine.id, machine]))
  const stages: Stage[] = form.processes.map((process) => {
    const draft = machineById.get(process.machineId)
    const machine: Machine = {
      id: process.machineId,
      name: draft?.name || 'Machine',
      type: draft?.type ?? 'generic',
      ratedKw: Number(draft?.power) || 0,
      status: draft?.available ? 'Running' : 'Maintenance',
      utilization: draft?.available ? 75 : 0,
      currentJob: process.name,
      onSolar: true,
    }
    return {
      id: process.id,
      name: process.name,
      machines: [machine],
    }
  })
  const workingHours = Number(form.workingHours)
  const solarCapacityKw = Number(form.solarCapacity)
  const peakTariff = Number(form.peakTariff)
  const offPeakTariff = Number(form.offPeakTariff)
  const totalPower = availableMachines.reduce(
    (total, machine) => total + (Number(machine.power) || 0),
    0,
  )
  const totalMinutes = form.processes.reduce(
    (total, process) => total + (Number(process.duration) || 0),
    0,
  )
  const baselineGridKwh = Math.round(totalPower * Math.max(workingHours, 1) * 0.65)
  const optimizedGridKwh = Math.round(baselineGridKwh * 0.72)
  const baselineCost = Math.round(
    baselineGridKwh * ((peakTariff + offPeakTariff) / 2),
  )
  const optimizedCost = Math.round(baselineCost * 0.78)
  const peakDemand = Math.round(totalPower * 0.8)
  const optimizedPeak = Math.round(peakDemand * 0.75)
  const makespan = Math.max(1, Math.round((totalMinutes / 60) * 10) / 10)
  const optimizedMakespan = Math.max(1, Math.round(makespan * 0.92 * 10) / 10)
  const energyByHour = createEnergy(sampleFactory.energyByHour, solarCapacityKw)

  const baselineSchedule: ScheduleBlock[] = form.processes.map((process, index) => {
    const start = (6 + index * 2) % 24
    const duration = Math.max(0.5, (Number(process.duration) || 30) / 60)
    return {
      id: `${process.id}-baseline`,
      processName: process.name,
      machineId: process.machineId,
      start,
      end: Math.min(24, start + duration),
      colorKey: SCHEDULE_COLORS[index % SCHEDULE_COLORS.length],
      shifted: false,
    }
  })
  const optimizedSchedule: ScheduleBlock[] = form.processes.map((process, index) => {
    const start = (10 + index * 2) % 24
    const duration = Math.max(0.5, (Number(process.duration) || 30) / 60)
    return {
      id: `${process.id}-optimized`,
      processName: process.name,
      machineId: process.machineId,
      start,
      end: Math.min(24, start + duration),
      colorKey: SCHEDULE_COLORS[index % SCHEDULE_COLORS.length],
      shifted: start !== baselineSchedule[index].start,
    }
  })

  const compare: CompareMetric[] = [
    {
      label: 'Energy cost',
      baseline: `₹ ${baselineCost.toLocaleString('en-IN')}`,
      optimized: `₹ ${optimizedCost.toLocaleString('en-IN')}`,
      baselinePct: 100,
      optimizedPct: 78,
      change: '−22%',
    },
    {
      label: 'Grid energy',
      baseline: `${baselineGridKwh.toLocaleString('en-IN')} kWh`,
      optimized: `${optimizedGridKwh.toLocaleString('en-IN')} kWh`,
      baselinePct: 100,
      optimizedPct: 72,
      change: '−28%',
    },
    {
      label: 'Peak demand',
      baseline: `${peakDemand} kW`,
      optimized: `${optimizedPeak} kW`,
      baselinePct: 100,
      optimizedPct: 75,
      change: '−25%',
    },
    {
      label: 'Makespan',
      baseline: `${makespan} h`,
      optimized: `${optimizedMakespan} h`,
      baselinePct: 100,
      optimizedPct: 92,
      change: '−8%',
    },
  ]
  const solarShare = solarCapacityKw > 0 ? Math.min(75, Math.round((solarCapacityKw / (solarCapacityKw + totalPower)) * 100)) : 0
  const kpis: FactoryKpi[] = [
    { label: 'Energy cost saved', value: `₹ ${(baselineCost - optimizedCost).toLocaleString('en-IN')}`, delta: '−22%', note: 'vs baseline', dotColor: 'var(--teal)' },
    { label: 'Makespan', value: `${optimizedMakespan} h`, delta: `−${Math.max(0, makespan - optimizedMakespan).toFixed(1)} h`, note: `from ${makespan} h`, dotColor: 'var(--caramel)' },
    { label: 'Solar share', value: `${solarShare}%`, delta: '+10 pts', note: 'vs baseline', dotColor: 'var(--sun)' },
    { label: 'Machine utilization', value: '75%', delta: '+8 pts', note: 'vs baseline', dotColor: 'var(--plum)' },
  ]

  return {
    id: `custom-${crypto.randomUUID()}`,
    name: form.name.trim(),
    has3dModel: false,
    solarCapacityKw,
    solarNowKw: Math.round(solarCapacityKw * 0.7),
    gridNowKw: Math.round(totalPower * 0.6),
    gridMaxKw: totalPower,
    stages,
    kpis,
    energyByHour,
    compare,
    baselineSchedule,
    optimizedSchedule,
    shifted: form.processes.map((process, index) => ({
      process: process.name,
      machine: machineById.get(process.machineId)?.name ?? 'Machine',
      was: `${String(6 + index * 2).padStart(2, '0')}:00`,
      now: `${String(10 + index * 2).padStart(2, '0')}:00`,
      reason: 'Use solar',
      saved: `₹ ${Math.round((baselineCost - optimizedCost) / Math.max(1, form.processes.length)).toLocaleString('en-IN')}`,
    })),
  }
}

function formatAvailability(available: boolean) {
  return available ? 'Available' : 'Unavailable'
}

function isBuilderForm(value: unknown): value is BuilderForm {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<BuilderForm>
  return (
    typeof candidate.name === 'string' &&
    typeof candidate.industry === 'string' &&
    typeof candidate.workingHours === 'string' &&
    typeof candidate.solarCapacity === 'string' &&
    typeof candidate.peakTariff === 'string' &&
    typeof candidate.offPeakTariff === 'string' &&
    Array.isArray(candidate.machines) &&
    candidate.machines.every(
      (machine) =>
        typeof machine.id === 'string' &&
        typeof machine.name === 'string' &&
        typeof machine.power === 'string' &&
        MACHINE_TYPES.includes(machine.type) &&
        typeof machine.available === 'boolean' &&
        typeof machine.editing === 'boolean',
    ) &&
    Array.isArray(candidate.processes) &&
    candidate.processes.every(
      (process) =>
        typeof process.id === 'string' &&
        typeof process.name === 'string' &&
        typeof process.machineId === 'string' &&
        typeof process.duration === 'string',
    )
  )
}

function loadSavedDraft(): {
  form: BuilderForm
  message: string
  messageIsError: boolean
} {
  try {
    const draft = window.localStorage.getItem('byteme-factory-builder-draft')
    if (!draft) return { form: INITIAL_FORM, message: '', messageIsError: false }

    const parsed: unknown = JSON.parse(draft)
    if (isBuilderForm(parsed)) {
      return { form: parsed, message: 'Saved draft restored.', messageIsError: false }
    }
    return {
      form: INITIAL_FORM,
      message: 'Saved draft data is invalid and was ignored.',
      messageIsError: true,
    }
  } catch (error) {
    return {
      form: INITIAL_FORM,
      message:
        error instanceof Error
          ? `Could not restore draft: ${error.message}`
          : 'Could not restore draft because browser storage is unavailable.',
      messageIsError: true,
    }
  }
}

export default function BuilderPage() {
  const { factory, addFactory } = useFactory()
  const [step, setStep] = useState(0)
  const [initialDraft] = useState(loadSavedDraft)
  const [form, setForm] = useState<BuilderForm>(initialDraft.form)
  const [message, setMessage] = useState(initialDraft.message)
  const [messageIsError, setMessageIsError] = useState(initialDraft.messageIsError)

  const updateForm = <K extends keyof BuilderForm>(key: K, value: BuilderForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
    setMessage('')
  }

  const updateMachine = (id: string, updates: Partial<MachineDraft>) => {
    updateForm(
      'machines',
      form.machines.map((machine) =>
        machine.id === id ? { ...machine, ...updates } : machine,
      ),
    )
  }

  const addMachine = () => {
    const id = `machine-${crypto.randomUUID()}`
    updateForm('machines', [
      ...form.machines,
      { id, name: '', power: '', type: 'generic', available: true, editing: true },
    ])
  }

  const addProcess = () => {
    const availableMachine = form.machines.find((machine) => machine.available)
    const index = form.processes.length + 1
    updateForm('processes', [
      ...form.processes,
      {
        id: `process-${crypto.randomUUID()}`,
        name: `Step ${index}`,
        machineId: availableMachine?.id ?? '',
        duration: '30',
      },
    ])
  }

  const updateProcess = (id: string, updates: Partial<ProcessDraft>) => {
    updateForm(
      'processes',
      form.processes.map((process) =>
        process.id === id ? { ...process, ...updates } : process,
      ),
    )
  }

  const moveProcess = (index: number, offset: -1 | 1) => {
    const destination = index + offset
    if (destination < 0 || destination >= form.processes.length) return
    const reordered = [...form.processes]
    ;[reordered[index], reordered[destination]] = [
      reordered[destination],
      reordered[index],
    ]
    updateForm('processes', reordered)
  }

  const saveDraft = () => {
    try {
      window.localStorage.setItem('byteme-factory-builder-draft', JSON.stringify(form))
      setMessage('Draft saved on this device.')
      setMessageIsError(false)
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `Could not save draft: ${error.message}`
          : 'Could not save draft because browser storage is unavailable.',
      )
      setMessageIsError(true)
    }
  }

  const saveFactory = () => {
    const availableMachines = form.machines.filter((machine) => machine.available)
    if (!form.name.trim()) {
      setStep(0)
      setMessage('Enter a factory name before saving.')
      setMessageIsError(true)
      return
    }
    if (availableMachines.length === 0) {
      setStep(1)
      setMessage('Add at least one available machine before saving.')
      setMessageIsError(true)
      return
    }
    if (form.processes.length === 0) {
      setStep(2)
      setMessage('Add at least one process step before saving.')
      setMessageIsError(true)
      return
    }
    if (form.processes.some((process) => !availableMachines.some((machine) => machine.id === process.machineId))) {
      setStep(2)
      setMessage('Assign every process to an available machine before saving.')
      setMessageIsError(true)
      return
    }

    const newFactory = createFactory(form, factory)
    addFactory(newFactory)
    setMessage(`${newFactory.name} was saved and added to the factory selector.`)
    setMessageIsError(false)
  }

  const renderDetails = () => (
    <Card title="Factory details" className={styles.detailsCard}>
      <div className={styles.detailsFields}>
        <Field id="builder-factory-name" label="Factory name">
          <input
            id="builder-factory-name"
            type="text"
            value={form.name}
            onChange={(event) => updateForm('name', event.currentTarget.value)}
            placeholder="e.g. Riverside Foods"
            required
          />
        </Field>
        <Field id="builder-industry" label="Industry type">
          <select
            id="builder-industry"
            value={form.industry}
            onChange={(event) => updateForm('industry', event.currentTarget.value)}
          >
            {INDUSTRIES.map((industry) => <option key={industry}>{industry}</option>)}
          </select>
        </Field>
        <div className={styles.fieldGrid}>
          <Field id="builder-hours" label="Working hours / day">
            <input id="builder-hours" type="number" min="1" max="24" value={form.workingHours} onChange={(event) => updateForm('workingHours', event.currentTarget.value)} />
          </Field>
          <Field id="builder-solar" label="Solar capacity (kW)">
            <input id="builder-solar" type="number" min="0" value={form.solarCapacity} onChange={(event) => updateForm('solarCapacity', event.currentTarget.value)} />
          </Field>
          <Field id="builder-peak-tariff" label="Peak tariff (₹ /kWh)">
            <input id="builder-peak-tariff" type="number" min="0" step="0.1" value={form.peakTariff} onChange={(event) => updateForm('peakTariff', event.currentTarget.value)} />
          </Field>
          <Field id="builder-offpeak-tariff" label="Off-peak tariff (₹ /kWh)">
            <input id="builder-offpeak-tariff" type="number" min="0" step="0.1" value={form.offPeakTariff} onChange={(event) => updateForm('offPeakTariff', event.currentTarget.value)} />
          </Field>
        </div>
        <p className={styles.helper}>
          Tip: tariffs come from your electricity bill. You can change them later.
        </p>
      </div>
    </Card>
  )

  const renderMachines = () => (
    <Card
      title="Machines"
      action={
        <Button variant="secondary" icon={PLUS_ICON} onClick={addMachine}>
          Add machine
        </Button>
      }
    >
      <div className={styles.tableScroller}>
        <table className={styles.machineTable}>
          <thead>
            <tr>
              <th scope="col">Machine</th>
              <th scope="col">Power</th>
              <th scope="col">Type</th>
              <th scope="col">Available</th>
              <th scope="col" className="visually-hidden">Actions</th>
            </tr>
          </thead>
          <tbody>
            {form.machines.map((machine) => (
              <tr key={machine.id}>
                <th scope="row">
                  <input
                    aria-label={`${machine.name || 'New machine'} name`}
                    type="text"
                    value={machine.name}
                    disabled={!machine.editing}
                    onChange={(event) => updateMachine(machine.id, { name: event.currentTarget.value })}
                    placeholder="Machine name"
                  />
                </th>
                <td>
                  <label className={styles.powerInput}>
                    <input
                      aria-label={`${machine.name || 'New machine'} power in kW`}
                      type="number"
                      min="0"
                      value={machine.power}
                      disabled={!machine.editing}
                      onChange={(event) => updateMachine(machine.id, { power: event.currentTarget.value })}
                    />
                    <span>kW</span>
                  </label>
                </td>
                <td>
                  <select
                    aria-label={`${machine.name || 'New machine'} type`}
                    value={machine.type}
                    disabled={!machine.editing}
                    onChange={(event) => {
                      const type = MACHINE_TYPES.find(
                        (candidate) => candidate === event.currentTarget.value,
                      )
                      if (type) updateMachine(machine.id, { type })
                    }}
                  >
                    {MACHINE_TYPES.map((type) => <option key={type}>{type}</option>)}
                  </select>
                </td>
                <td>
                  <label className={styles.available}>
                    <input
                      aria-label={`${machine.name || 'New machine'} available`}
                      type="checkbox"
                      checked={machine.available}
                      onChange={(event) => updateMachine(machine.id, { available: event.currentTarget.checked })}
                    />
                    {formatAvailability(machine.available)}
                  </label>
                </td>
                <td>
                  <Button
                    variant="secondary"
                    className={styles.editButton}
                    aria-label={`${machine.editing ? 'Finish editing' : 'Edit'} ${machine.name || 'machine'}`}
                    aria-pressed={machine.editing}
                    onClick={() => updateMachine(machine.id, { editing: !machine.editing })}
                  >
                    {PENCIL_ICON}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )

  const renderProcesses = () => {
    const assignableMachines = form.machines.filter((machine) => machine.available)

    return (
      <Card
        title="Process flow"
        action={<span className={styles.processHint}>Use arrows to reorder · each step runs on one machine</span>}
      >
        <div className={styles.processFlow}>
          {form.processes.map((process, index) => (
            <div className={styles.processEntry} key={process.id}>
              <article className={`${styles.processCard} ${styles[`processColor${index % 5}`]}`}>
                <label>
                  <span className="visually-hidden">Step {index + 1} name</span>
                  <input
                    aria-label={`Step ${index + 1} name`}
                    type="text"
                    value={process.name}
                    onChange={(event) => updateProcess(process.id, { name: event.currentTarget.value })}
                  />
                </label>
                <div className={styles.processMeta}>
                  <select
                    aria-label={`Step ${index + 1} machine`}
                    value={process.machineId}
                    onChange={(event) => updateProcess(process.id, { machineId: event.currentTarget.value })}
                  >
                    {assignableMachines.map((machine) => (
                      <option key={machine.id} value={machine.id}>{machine.name || 'Unnamed machine'}</option>
                    ))}
                  </select>
                  <label>
                    <span className="visually-hidden">Step {index + 1} duration in minutes</span>
                    <input
                      aria-label={`Step ${index + 1} duration in minutes`}
                      type="number"
                      min="1"
                      value={process.duration}
                      onChange={(event) => updateProcess(process.id, { duration: event.currentTarget.value })}
                    />
                    <span>min</span>
                  </label>
                </div>
                <div className={styles.processActions}>
                  <Button variant="secondary" aria-label={`Move ${process.name} up`} disabled={index === 0} onClick={() => moveProcess(index, -1)}>↑</Button>
                  <Button variant="secondary" aria-label={`Move ${process.name} down`} disabled={index === form.processes.length - 1} onClick={() => moveProcess(index, 1)}>↓</Button>
                  <Button variant="secondary" aria-label={`Remove ${process.name}`} onClick={() => updateForm('processes', form.processes.filter((item) => item.id !== process.id))}>×</Button>
                </div>
              </article>
              {index < form.processes.length - 1 && (
                <span className={styles.flowArrow}>{ARROW_ICON}</span>
              )}
            </div>
          ))}
          <button className={styles.addStep} type="button" onClick={addProcess}>
            + Add step
          </button>
        </div>
      </Card>
    )
  }

  const renderEnergy = () => (
    <Card title="Energy & tariff">
      <p className={styles.energyIntro}>
        Review the working hours, on-site solar capacity, and electricity rates
        used for this factory.
      </p>
      <div className={styles.energySummary}>
        <div><span>Working hours / day</span><strong>{form.workingHours} h</strong></div>
        <div><span>Solar capacity</span><strong>{form.solarCapacity} kW</strong></div>
        <div><span>Peak tariff</span><strong>₹ {form.peakTariff} /kWh</strong></div>
        <div><span>Off-peak tariff</span><strong>₹ {form.offPeakTariff} /kWh</strong></div>
      </div>
      <div className={styles.energyBands} aria-label="Daily tariff band preview">
        {Array.from({ length: 24 }, (_, hour) => {
          const tariff: EnergyTariff =
            hour >= 18 && hour <= 21 ? 'peak' : hour >= 6 && hour <= 9 ? 'mid' : 'off'
          return <span key={hour} className={styles[`tariff-${tariff}`]} title={`${String(hour).padStart(2, '0')}:00 · ${tariff}`} />
        })}
      </div>
      <p className={styles.energyCaption}>Off-peak · Mid tariff · Peak tariff</p>
    </Card>
  )

  const renderReview = () => (
    <Card title="Review factory">
      <dl className={styles.reviewGrid}>
        <div><dt>Factory name</dt><dd>{form.name.trim() || 'Add a factory name'}</dd></div>
        <div><dt>Industry</dt><dd>{form.industry}</dd></div>
        <div><dt>Working hours / day</dt><dd>{form.workingHours} h</dd></div>
        <div><dt>Solar capacity</dt><dd>{form.solarCapacity} kW</dd></div>
        <div><dt>Peak tariff</dt><dd>₹ {form.peakTariff} /kWh</dd></div>
        <div><dt>Off-peak tariff</dt><dd>₹ {form.offPeakTariff} /kWh</dd></div>
        <div><dt>Available machines</dt><dd>{form.machines.filter((machine) => machine.available).length}</dd></div>
        <div><dt>Process steps</dt><dd>{form.processes.length}</dd></div>
      </dl>
      <div className={styles.reviewLists}>
        <div>
          <h3>Machines</h3>
          <ul>
            {form.machines.map((machine) => (
              <li key={machine.id}>
                {machine.name || 'Unnamed machine'} · {machine.power || '0'} kW · {machine.type}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3>Process flow</h3>
          <ol>
            {form.processes.map((process) => (
              <li key={process.id}>{process.name || 'Unnamed step'} · {process.duration} min</li>
            ))}
          </ol>
        </div>
      </div>
    </Card>
  )

  const content = [
    renderDetails(),
    renderMachines(),
    renderProcesses(),
    renderEnergy(),
    renderReview(),
  ][step]

  return (
    <div className={styles.builderPage}>
      <PageHeader eyebrow="New custom factory" title="Factory builder" />

      <ol className={styles.stepper} aria-label="Factory builder steps">
        {STEPS.map((label, index) => {
          const current = index === step
          const done = index < step
          return (
            <li key={label}>
              <button
                className={`${styles.stepPill} ${current ? styles.current : done ? styles.done : styles.upcoming}`}
                type="button"
                aria-current={current ? 'step' : undefined}
                onClick={() => {
                  setStep(index)
                  setMessage('')
                }}
              >
                <span className={styles.stepNumber}>{done ? '✓' : index + 1}</span>
                {label}
              </button>
            </li>
          )
        })}
      </ol>

      {content}

      {message && (
        <p className={messageIsError ? styles.errorMessage : styles.successMessage} role={messageIsError ? 'alert' : 'status'}>
          {message}
        </p>
      )}

      <footer className={styles.footer}>
        <Link className={styles.backLink} to="/">← Back to dashboard</Link>
        <div className={styles.footerActions}>
          <Button variant="secondary" onClick={saveDraft}>Save draft</Button>
          {step < STEPS.length - 1 ? (
            <Button
              variant="primary"
              onClick={() => {
                setStep((current) => Math.min(STEPS.length - 1, current + 1))
                setMessage('')
              }}
            >
              {step === STEPS.length - 2
                ? 'Review factory →'
                : `Next: ${STEPS[step + 1]} →`}
            </Button>
          ) : (
            <Button variant="primary" onClick={saveFactory}>Save factory</Button>
          )}
        </div>
      </footer>
    </div>
  )
}
