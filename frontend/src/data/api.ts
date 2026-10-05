import factories from './factories'
import type {
  CompareMetric,
  Factory,
  FactoryKpi,
  HourEnergy,
  Machine,
  MachineType,
  ScheduleBlock,
  ShiftReason,
  ShiftedProcess,
  Stage,
} from './types'

const API_BASE_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')
const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

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
const MACHINE_STATUSES: Machine['status'][] = ['Running', 'Idle', 'Maintenance']
const SCHEDULE_COLORS: ScheduleBlock['colorKey'][] = [
  'roast',
  'grind',
  'conche',
  'temper',
  'mould',
  'pack',
]
const SHIFT_REASONS: ShiftReason[] = ['Use solar', 'Avoid peak', 'Off-peak rate']
const TARIFFS: HourEnergy['tariff'][] = ['peak', 'mid', 'off']

export class ApiError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ApiError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isMachine(value: unknown): value is Machine {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.name) &&
    MACHINE_TYPES.includes(value.type as MachineType) &&
    isNumber(value.ratedKw) &&
    MACHINE_STATUSES.includes(value.status as Machine['status']) &&
    isNumber(value.utilization) &&
    isString(value.currentJob) &&
    typeof value.onSolar === 'boolean'
  )
}

function isStage(value: unknown): value is Stage {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.name) &&
    Array.isArray(value.machines) &&
    value.machines.every(isMachine)
  )
}

function isScheduleBlock(value: unknown): value is ScheduleBlock {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.processName) &&
    isString(value.machineId) &&
    isNumber(value.start) &&
    isNumber(value.end) &&
    SCHEDULE_COLORS.includes(value.colorKey as ScheduleBlock['colorKey']) &&
    typeof value.shifted === 'boolean'
  )
}

function isHourEnergy(value: unknown): value is HourEnergy {
  return (
    isRecord(value) &&
    isNumber(value.hour) &&
    isNumber(value.solarKwh) &&
    isNumber(value.gridKwh) &&
    TARIFFS.includes(value.tariff as HourEnergy['tariff'])
  )
}

function isCompareMetric(value: unknown): value is CompareMetric {
  return (
    isRecord(value) &&
    isString(value.label) &&
    isString(value.baseline) &&
    isString(value.optimized) &&
    isNumber(value.baselinePct) &&
    isNumber(value.optimizedPct) &&
    isString(value.change)
  )
}

function isFactoryKpi(value: unknown): value is FactoryKpi {
  return (
    isRecord(value) &&
    isString(value.label) &&
    isString(value.value) &&
    isString(value.delta) &&
    isString(value.note) &&
    isString(value.dotColor)
  )
}

function isShiftedProcess(value: unknown): value is ShiftedProcess {
  return (
    isRecord(value) &&
    isString(value.process) &&
    isString(value.machine) &&
    isString(value.was) &&
    isString(value.now) &&
    SHIFT_REASONS.includes(value.reason as ShiftReason) &&
    isString(value.saved)
  )
}

function isFactory(value: unknown): value is Factory {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.name) &&
    typeof value.has3dModel === 'boolean' &&
    isNumber(value.solarCapacityKw) &&
    isNumber(value.solarNowKw) &&
    isNumber(value.gridNowKw) &&
    isNumber(value.gridMaxKw) &&
    Array.isArray(value.stages) &&
    value.stages.every(isStage) &&
    Array.isArray(value.kpis) &&
    value.kpis.every(isFactoryKpi) &&
    Array.isArray(value.energyByHour) &&
    value.energyByHour.every(isHourEnergy) &&
    Array.isArray(value.compare) &&
    value.compare.every(isCompareMetric) &&
    Array.isArray(value.baselineSchedule) &&
    value.baselineSchedule.every(isScheduleBlock) &&
    Array.isArray(value.optimizedSchedule) &&
    value.optimizedSchedule.every(isScheduleBlock) &&
    Array.isArray(value.shifted) &&
    value.shifted.every(isShiftedProcess)
  )
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...init?.headers,
      },
    })
  } catch (error) {
    throw new ApiError(
      error instanceof Error
        ? `Could not connect to the ByteMe API: ${error.message}`
        : 'Could not connect to the ByteMe API.',
      { cause: error },
    )
  }

  if (!response.ok) {
    let detail = ''
    try {
      detail = (await response.text()).trim()
    } catch {
      detail = ''
    }
    throw new ApiError(
      detail
        ? `The ByteMe API returned ${response.status}: ${detail}`
        : `The ByteMe API returned ${response.status} ${response.statusText}.`,
    )
  }
  return response
}

async function responseJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch (error) {
    throw new ApiError('The ByteMe API returned invalid JSON.', { cause: error })
  }
}

export async function getFactories(): Promise<Factory[]> {
  if (USE_MOCK) return factories
  const payload = await responseJson(await request('/factories'))
  if (!Array.isArray(payload) || !payload.every(isFactory)) {
    throw new ApiError('The ByteMe API returned factory data in an unsupported format.')
  }
  return payload
}

export async function getFactory(id: string): Promise<Factory> {
  if (USE_MOCK) {
    const factory = factories.find((item) => item.id === id)
    if (!factory) throw new ApiError(`Factory "${id}" was not found in mock data.`)
    return factory
  }

  const payload = await responseJson(
    await request(`/factories/${encodeURIComponent(id)}`),
  )
  if (!isFactory(payload)) {
    throw new ApiError('The ByteMe API returned factory data in an unsupported format.')
  }
  return payload
}

export async function runOptimization(id: string): Promise<void> {
  if (USE_MOCK) {
    await new Promise((resolve) => window.setTimeout(resolve, 350))
    return
  }

  await request(`/factories/${encodeURIComponent(id)}/optimize`, {
    method: 'POST',
  })
}
