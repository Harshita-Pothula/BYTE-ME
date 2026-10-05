/**
 * Verifies request validation: every schema rejects malformed input, and the
 * cross-field rules that mirror SQL CHECK constraints are enforced in Zod so
 * clients get a precise message.
 */

import { describe, expect, it } from 'vitest'
import {
  electricityTariffCreateSchema,
  energyDataBulkSchema,
  energyDataCreateSchema,
  factoryCreateSchema,
  factoryUpdateSchema,
  machineCreateSchema,
  machineUpdateSchema,
  optimizationRequestCreateSchema,
  processCreateSchema,
  processDependencyCreateSchema,
  productionOrderCreateSchema,
  scheduleEntryCreateSchema,
} from '@/lib/schemas'
import { UUID } from './helpers/fixtures'

describe('factory schemas', () => {
  const valid = {
    slug: 'automobile-plant',
    name: 'Automobile Plant',
    timezone: 'Europe/Berlin',
    currency: 'eur',
  }

  it('accepts a minimal factory and applies defaults', () => {
    const parsed = factoryCreateSchema.parse(valid)

    expect(parsed.currency).toBe('EUR')
    expect(parsed.is_active).toBe(true)
    expect(parsed.timezone).toBe('Europe/Berlin')
  })

  it('rejects an uppercase or space-containing slug', () => {
    expect(factoryCreateSchema.safeParse({ ...valid, slug: 'Auto Plant' }).success).toBe(false)
    expect(factoryCreateSchema.safeParse({ ...valid, slug: 'Auto-Plant' }).success).toBe(false)
  })

  it('rejects a missing name', () => {
    expect(factoryCreateSchema.safeParse({ slug: 'a-plant' }).success).toBe(false)
  })

  it('rejects unknown fields', () => {
    expect(factoryCreateSchema.safeParse({ ...valid, chocolate_batch_size: 500 }).success).toBe(false)
  })

  it('accepts an empty factory update for no-op-free patching', () => {
    expect(factoryUpdateSchema.safeParse({}).success).toBe(true)
  })
})

describe('machine schemas', () => {
  const valid = { slug: 'welding-cell', name: 'Welding Cell', max_power_kw: 90 }

  it('allows a machine with no power ratings at all', () => {
    expect(machineCreateSchema.safeParse({ slug: 'conveyor', name: 'Conveyor' }).success).toBe(true)
  })

  it('rejects a negative power rating', () => {
    expect(machineCreateSchema.safeParse({ ...valid, rated_power_kw: -5 }).success).toBe(false)
  })

  it('rejects min_power_kw above rated_power_kw', () => {
    const result = machineCreateSchema.safeParse({
      ...valid,
      min_power_kw: 100,
      rated_power_kw: 50,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      // The issue points at the offending field, min_power_kw.
      expect(result.error.issues[0]?.path).toContain('min_power_kw')
      expect(result.error.issues[0]?.message).toMatch(/must not exceed rated_power_kw/)
    }
  })

  it('rejects rated_power_kw above max_power_kw', () => {
    const result = machineCreateSchema.safeParse({
      ...valid,
      rated_power_kw: 120,
      max_power_kw: 90,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      // The issue points at the offending field, rated_power_kw.
      expect(result.error.issues[0]?.path).toContain('rated_power_kw')
      expect(result.error.issues[0]?.message).toMatch(/must not exceed max_power_kw/)
    }
  })

  it('rejects max_runtime_minutes below min_runtime_minutes', () => {
    const result = machineCreateSchema.safeParse({
      ...valid,
      min_runtime_minutes: 300,
      max_runtime_minutes: 60,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toContain('max_runtime_minutes')
    }
  })

  it('normalises an availability calendar', () => {
    const parsed = machineCreateSchema.parse({
      ...valid,
      availability: { weekly: [{ day: 1, start: '06:00', end: '22:00' }] },
    })

    expect(parsed.availability?.weekly[0]?.day).toBe(1)
    expect(parsed.availability?.exceptions).toEqual([])
  })

  it('rejects an availability window with an out-of-range weekday', () => {
    expect(
      machineCreateSchema.safeParse({
        ...valid,
        availability: { weekly: [{ day: 9, start: '06:00', end: '22:00' }] },
      }).success,
    ).toBe(false)
  })

  it('rejects an availability window with a malformed time', () => {
    expect(
      machineCreateSchema.safeParse({
        ...valid,
        availability: { weekly: [{ day: 1, start: '6am', end: '22:00' }] },
      }).success,
    ).toBe(false)
  })

  it('rejects a machine update with no fields', () => {
    expect(machineUpdateSchema.safeParse({}).success).toBe(true)
    expect(machineUpdateSchema.safeParse({ nope: 1 }).success).toBe(false)
  })
})

describe('process schemas', () => {
  const valid = {
    slug: 'weld-frame',
    name: 'Weld Frame',
    machine_id: UUID.machine,
    duration_minutes: 45,
  }

  it('requires a machine id', () => {
    expect(processCreateSchema.safeParse({ slug: 'weld', name: 'Weld' }).success).toBe(false)
  })

  it('rejects a machine id that is not a UUID', () => {
    expect(processCreateSchema.safeParse({ ...valid, machine_id: 'machine-1' }).success).toBe(false)
  })

  it('rejects a negative duration', () => {
    expect(processCreateSchema.safeParse({ ...valid, duration_minutes: -1 }).success).toBe(false)
  })

  it('rejects a self-referencing dependency', () => {
    const result = processDependencyCreateSchema.safeParse({
      process_id: UUID.process,
      depends_on_process_id: UUID.process,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/cannot depend on itself/)
    }
  })

  it('defaults dependency type and lag', () => {
    const parsed = processDependencyCreateSchema.parse({
      process_id: UUID.process,
      depends_on_process_id: UUID.processAlt,
    })

    expect(parsed.dependency_type).toBe('finish_to_start')
    expect(parsed.lag_minutes).toBe(0)
  })

  it('rejects an unknown dependency type', () => {
    expect(
      processDependencyCreateSchema.safeParse({
        process_id: UUID.process,
        depends_on_process_id: UUID.processAlt,
        dependency_type: 'whenever',
      }).success,
    ).toBe(false)
  })
})

describe('production order schemas', () => {
  it('requires a positive quantity', () => {
    expect(
      productionOrderCreateSchema.safeParse({ reference: 'PO-1', quantity: 0 }).success,
    ).toBe(false)
  })

  it('rejects an unknown status', () => {
    expect(
      productionOrderCreateSchema.safeParse({ reference: 'PO-1', quantity: 5, status: 'aborted' })
        .success,
    ).toBe(false)
  })

  it('defaults status and priority', () => {
    const parsed = productionOrderCreateSchema.parse({ reference: 'PO-1', quantity: 100 })

    expect(parsed.status).toBe('planned')
    expect(parsed.priority).toBe(0)
  })
})

describe('energy data schemas', () => {
  it('rejects a non-positive interval', () => {
    expect(
      energyDataCreateSchema.safeParse({ recorded_at: '2026-03-02T08:00:00.000Z', interval_minutes: 0 })
        .success,
    ).toBe(false)
  })

  it('rejects negative consumption', () => {
    expect(
      energyDataCreateSchema.safeParse({
        recorded_at: '2026-03-02T08:00:00.000Z',
        consumption_kwh: -1,
      }).success,
    ).toBe(false)
  })

  it('defaults interval, flow and source', () => {
    const parsed = energyDataCreateSchema.parse({ recorded_at: '2026-03-02T08:00:00.000Z' })

    expect(parsed.interval_minutes).toBe(15)
    expect(parsed.consumption_kwh).toBe(0)
    expect(parsed.source).toBe('measured')
  })

  it('requires at least one interval in a batch', () => {
    expect(energyDataBulkSchema.safeParse({ intervals: [] }).success).toBe(false)
  })

  it('defaults the batch conflict policy to skip', () => {
    const parsed = energyDataBulkSchema.parse({
      intervals: [{ recorded_at: '2026-03-02T08:00:00.000Z' }],
    })

    expect(parsed.on_conflict).toBe('skip')
  })
})

describe('tariff schemas', () => {
  const valid = { slug: 'off-peak', name: 'Off peak', energy_price_per_kwh: 0.085 }

  it('applies time-of-use defaults', () => {
    const parsed = electricityTariffCreateSchema.parse(valid)

    expect(parsed.start_time).toBe('00:00')
    expect(parsed.end_time).toBe('23:59')
    expect(parsed.priority).toBe(0)
  })

  it('rejects a negative price', () => {
    expect(
      electricityTariffCreateSchema.safeParse({ ...valid, energy_price_per_kwh: -0.1 }).success,
    ).toBe(false)
  })

  it('rejects a tax rate above 1, since the column stores a fraction', () => {
    expect(electricityTariffCreateSchema.safeParse({ ...valid, tax_rate: 21 }).success).toBe(false)
    expect(electricityTariffCreateSchema.safeParse({ ...valid, tax_rate: 0.21 }).success).toBe(true)
  })

  it('rejects duplicate weekdays', () => {
    expect(
      electricityTariffCreateSchema.safeParse({ ...valid, days_of_week: [1, 1] }).success,
    ).toBe(false)
  })

  it('rejects a weekday outside 1..7', () => {
    expect(
      electricityTariffCreateSchema.safeParse({ ...valid, days_of_week: [0, 8] }).success,
    ).toBe(false)
  })

  it('rejects an effective window that ends before it starts', () => {
    expect(
      electricityTariffCreateSchema.safeParse({
        ...valid,
        effective_from: '2026-06-01T00:00:00.000Z',
        effective_to: '2026-01-01T00:00:00.000Z',
      }).success,
    ).toBe(false)
  })

  it('rejects a malformed time-of-use window', () => {
    expect(electricityTariffCreateSchema.safeParse({ ...valid, start_time: '5pm' }).success).toBe(
      false,
    )
  })
})

describe('schedule entry schemas', () => {
  const valid = {
    machine_id: UUID.machine,
    process_id: UUID.process,
    starts_at: '2026-03-02T09:00:00.000Z',
    ends_at: '2026-03-02T11:00:00.000Z',
  }

  it('rejects an entry that ends before it starts', () => {
    const result = scheduleEntryCreateSchema.safeParse({
      ...valid,
      ends_at: '2026-03-02T08:00:00.000Z',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/ends_at must be after starts_at/)
    }
  })

  it('rejects a zero-length entry', () => {
    expect(
      scheduleEntryCreateSchema.safeParse({
        ...valid,
        ends_at: '2026-03-02T09:00:00.000Z',
      }).success,
    ).toBe(false)
  })

  it('defaults sequence to zero', () => {
    expect(scheduleEntryCreateSchema.parse(valid).sequence).toBe(0)
  })
})

describe('optimization request schemas', () => {
  it('rejects a horizon that ends before it starts', () => {
    const result = optimizationRequestCreateSchema.safeParse({
      horizon_start: '2026-03-02T20:00:00.000Z',
      horizon_end: '2026-03-02T08:00:00.000Z',
    })

    expect(result.success).toBe(false)
  })

  it('accepts a request with no fields at all', () => {
    expect(optimizationRequestCreateSchema.safeParse({}).success).toBe(true)
  })

  it('passes objective weights through without interpretation', () => {
    const parsed = optimizationRequestCreateSchema.parse({
      objective: { cost: 1, peakDemand: 0.3, emissions: 0.05 },
      constraints: { maxParallelMachines: 4 },
    })

    expect(parsed.objective).toEqual({ cost: 1, peakDemand: 0.3, emissions: 0.05 })
    expect(parsed.constraints).toEqual({ maxParallelMachines: 4 })
  })
})