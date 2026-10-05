export type MachineStatus = 'Running' | 'Idle' | 'Maintenance'

export type MachineType =
  | 'mixer'
  | 'tank'
  | 'oven'
  | 'conveyor'
  | 'filler'
  | 'packer'
  | 'grinder'
  | 'generic'

export interface Machine {
  id: string
  name: string
  type: MachineType
  ratedKw: number
  status: MachineStatus
  utilization: number
  currentJob: string
  onSolar: boolean
}

export interface Stage {
  id: string
  name: string
  machines: Machine[]
}

export type ScheduleColorKey =
  | 'roast'
  | 'grind'
  | 'conche'
  | 'temper'
  | 'mould'
  | 'pack'

export interface ScheduleBlock {
  id: string
  processName: string
  machineId: string
  start: number
  end: number
  colorKey: ScheduleColorKey
  shifted: boolean
}

export type EnergyTariff = 'peak' | 'mid' | 'off'

export interface HourEnergy {
  hour: number
  solarKwh: number
  gridKwh: number
  tariff: EnergyTariff
}

export interface CompareMetric {
  label: string
  baseline: string
  optimized: string
  baselinePct: number
  optimizedPct: number
  change: string
}

export type ShiftReason = 'Use solar' | 'Avoid peak' | 'Off-peak rate'

export interface ShiftedProcess {
  process: string
  machine: string
  was: string
  now: string
  reason: ShiftReason
  saved: string
}

export interface FactoryKpi {
  label: string
  value: string
  delta: string
  note: string
  dotColor: string
}

export interface Factory {
  id: string
  name: string
  has3dModel: boolean
  solarCapacityKw: number
  solarNowKw: number
  gridNowKw: number
  gridMaxKw: number
  stages: Stage[]
  kpis: FactoryKpi[]
  energyByHour: HourEnergy[]
  compare: CompareMetric[]
  baselineSchedule: ScheduleBlock[]
  optimizedSchedule: ScheduleBlock[]
  shifted: ShiftedProcess[]
}
