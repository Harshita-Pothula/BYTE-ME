/**
 * Offline demo data.
 *
 * Deliberately GENERIC. This is a plant-level dataset with industry-neutral
 * machines and product names. It is not a transcription of the Postgres demo
 * seed in supabase/seed.sql: the schema and the optimizer payload are
 * factory-agnostic, and the demo has to prove that by not naming any
 * particular product.
 *
 * Every value here is ordinary manufacturing data: grid limits, power
 * envelopes, availability calendars, orders, meter readings and time-of-use
 * tariffs. Nothing about this dataset is special-cased anywhere in the code.
 *
 * Loading is idempotent: keyed on natural unique keys, so re-running replaces
 * the demo rather than duplicating it.
 */

import { randomUUID } from 'node:crypto'
import type { SqliteDatabase } from './db'
import { createOfflineClient, type OfflineClient } from './adapter'
import { initOfflineSchema } from './init'

/** The demo factory slug. Stable so re-running replaces rather than duplicates. */
export const DEMO_FACTORY_SLUG = 'offline-demo-plant'

interface DemoMachine {
  slug: string
  name: string
  type: string
  ratedPowerKw: number | null
  minPowerKw: number | null
  maxPowerKw: number | null
  minRuntimeMinutes: number | null
  maxRuntimeMinutes: number | null
  generation?: boolean
}

const MACHINES: DemoMachine[] = [
  { slug: 'press-line', name: 'Press Line', type: 'forming_asset', ratedPowerKw: 180, minPowerKw: 55, maxPowerKw: 180, minRuntimeMinutes: 30, maxRuntimeMinutes: 600 },
  { slug: 'cure-oven', name: 'Cure Oven', type: 'thermal_asset', ratedPowerKw: 240, minPowerKw: 80, maxPowerKw: 240, minRuntimeMinutes: 45, maxRuntimeMinutes: 720 },
  { slug: 'robot-cell', name: 'Robot Cell', type: 'handling_asset', ratedPowerKw: 65, minPowerKw: 18, maxPowerKw: 65, minRuntimeMinutes: 20, maxRuntimeMinutes: 420 },
  { slug: 'compressor', name: 'Compressor', type: 'utility_asset', ratedPowerKw: 150, minPowerKw: 90, maxPowerKw: 150, minRuntimeMinutes: 60, maxRuntimeMinutes: 1440 },
  { slug: 'chiller', name: 'Chiller', type: 'thermal_asset', ratedPowerKw: 120, minPowerKw: 45, maxPowerKw: 120, minRuntimeMinutes: 30, maxRuntimeMinutes: 600 },
  { slug: 'inspection-station', name: 'Inspection Station', type: 'quality_asset', ratedPowerKw: 35, minPowerKw: 8, maxPowerKw: 35, minRuntimeMinutes: 10, maxRuntimeMinutes: 180 },
  { slug: 'rooftop-array', name: 'Rooftop Array', type: 'generator', ratedPowerKw: null, minPowerKw: null, maxPowerKw: 260, minRuntimeMinutes: null, maxRuntimeMinutes: null, generation: true },
]

const PROCESSES = [
  { slug: 'form-panel', name: 'Form Panel', machine: 'press-line', durationMinutes: 40, powerKw: 170, quantity: 1200, unit: 'units', stage: 'forming' },
  { slug: 'cure-cycle', name: 'Cure Cycle', machine: 'cure-oven', durationMinutes: 180, powerKw: 230, quantity: 1200, unit: 'units', stage: 'curing' },
  { slug: 'machine-feature', name: 'Machine Feature', machine: 'robot-cell', durationMinutes: 55, powerKw: 58, quantity: 1200, unit: 'units', stage: 'assembly' },
  { slug: 'inspect-batch', name: 'Inspect Batch', machine: 'inspection-station', durationMinutes: 25, powerKw: 30, quantity: 1200, unit: 'units', stage: 'quality' },
  { slug: 'condition-parts', name: 'Condition Parts', machine: 'chiller', durationMinutes: 45, powerKw: 110, quantity: 1200, unit: 'units', stage: 'conditioning', blocking: true },
  { slug: 'pack-output', name: 'Pack Output', machine: 'robot-cell', durationMinutes: 35, powerKw: 48, quantity: 1200, unit: 'units', stage: 'packing' },
]

/** Production chain: each process follows the one before it. */
const DEPENDENCIES: Array<[string, string]> = [
  ['cure-cycle', 'form-panel'],
  ['machine-feature', 'cure-cycle'],
  ['condition-parts', 'machine-feature'],
  ['inspect-batch', 'condition-parts'],
  ['pack-output', 'inspect-batch'],
]

const WEEKDAY_AVAILABILITY = (from: string, to: string) => ({
  weekly: [1, 2, 3, 4, 5].map((day) => ({ day, start: from, end: to })),
  exceptions: [],
})

const TARIFFS = [
  { slug: 'off-peak', name: 'Off-peak', startTime: '00:00:00', endTime: '07:00:00', daysOfWeek: null, price: 0.082, demandCharge: null, fixedCharge: null, taxRate: 0.2, priority: 10 },
  { slug: 'shoulder', name: 'Shoulder', startTime: '07:00:00', endTime: '17:00:00', daysOfWeek: null, price: 0.138, demandCharge: null, fixedCharge: null, taxRate: 0.2, priority: 10 },
  { slug: 'peak', name: 'Peak', startTime: '17:00:00', endTime: '22:00:00', daysOfWeek: [1, 2, 3, 4, 5], price: 0.221, demandCharge: null, fixedCharge: null, taxRate: 0.2, priority: 20 },
  { slug: 'demand-charge', name: 'Monthly demand charge', startTime: '00:00:00', endTime: '23:59:00', daysOfWeek: null, price: 0, demandCharge: 17.4, fixedCharge: 132, taxRate: 0.2, priority: 30 },
]

const PRODUCTION_ORDERS = [
  { reference: 'OFFLINE-ORD-0001', product: 'Panel batch A', quantity: 1200, unit: 'units', dueInHours: 48, priority: 10, status: 'released' },
  { reference: 'OFFLINE-ORD-0002', product: 'Panel batch B', quantity: 800, unit: 'units', dueInHours: 96, priority: 5, status: 'planned' },
]

export interface OfflineSeedResult {
  factoryId: string
  machineIds: Record<string, string>
  processIds: Record<string, string>
  energyIntervals: number
}

/**
 * Populates the offline database with generic demo data.
 *
 * @param db database to seed; defaults to the shared connection.
 * @param client optional pre-built client, for tests.
 */
export async function seedOfflineDatabase(
  db: SqliteDatabase,
  client: OfflineClient = createOfflineClient(db),
): Promise<OfflineSeedResult> {
  initOfflineSchema(db)

  /* ---- factory ------------------------------------------------------- */
  const { data: factoryRow, error: factoryError } = await client
    .from('factories')
    .upsert(
      {
        id: randomUUID(),
        slug: DEMO_FACTORY_SLUG,
        name: 'Offline Demo Plant',
        description: 'DEMONSTRATION DATA ONLY. A generic plant used to exercise the offline SQLite backend. Not a real site.',
        timezone: 'UTC',
        currency: 'EUR',
        config: {
          demo: true,
          demo_only: true,
          offline: true,
          grid: { max_import_kw: 1500, max_export_kw: 260, voltage_kv: 10 },
          scheduling: { max_parallel_machines: 4, min_batch_size: 1, allow_overlapping_production: true },
          energy_balance: { allow_export: true, self_consumption_preferred: true },
        },
        metadata: {
          demo: true,
          purpose: 'sample data for ByteMe offline mode',
          not_for_production_use: true,
        },
        is_active: true,
      },
      { onConflict: 'slug' },
    )
    .single()

  if (factoryError) throw new Error(`offline seed: factory insert failed: ${factoryError.message}`)
  const factoryId = (factoryRow as { id: string }).id

  /* ---- machines -------------------------------------------------------- */
  const machineIds: Record<string, string> = {}

  for (const machine of MACHINES) {
    const { data, error } = await client
      .from('machines')
      .upsert(
        {
          id: randomUUID(),
          factory_id: factoryId,
          slug: machine.slug,
          name: machine.name,
          type: machine.type,
          rated_power_kw: machine.ratedPowerKw,
          min_power_kw: machine.minPowerKw,
          max_power_kw: machine.maxPowerKw,
          min_runtime_minutes: machine.minRuntimeMinutes,
          max_runtime_minutes: machine.maxRuntimeMinutes,
          availability: machine.generation
            ? { weekly: [], exceptions: [], note: 'generation-only asset' }
            : WEEKDAY_AVAILABILITY('06:00', '22:00'),
          metadata: { demo: true, generation: machine.generation === true },
          is_active: true,
        },
        { onConflict: 'factory_id,slug' },
      )
      .single()

    if (error) throw new Error(`offline seed: machine '${machine.slug}' failed: ${error.message}`)
    machineIds[machine.slug] = (data as { id: string }).id
  }

  /* ---- processes ------------------------------------------------------- */
  const processIds: Record<string, string> = {}

  for (const process of PROCESSES) {
    const { data, error } = await client
      .from('processes')
      .upsert(
        {
          id: randomUUID(),
          factory_id: factoryId,
          slug: process.slug,
          name: process.name,
          description: `DEMO. ${process.name} stage.`,
          duration_minutes: process.durationMinutes,
          machine_id: machineIds[process.machine] as string,
          power_requirement_kw: process.powerKw,
          production_quantity: process.quantity,
          unit: process.unit,
          metadata: { demo: true, stage: process.stage, blocking: process.blocking === true },
          is_active: true,
        },
        { onConflict: 'factory_id,slug' },
      )
      .single()

    if (error) throw new Error(`offline seed: process '${process.slug}' failed: ${error.message}`)
    processIds[process.slug] = (data as { id: string }).id
  }

  /* ---- dependencies ---------------------------------------------------- */
  for (const [processSlug, dependsOnSlug] of DEPENDENCIES) {
    const { error } = await client.from('process_dependencies').upsert(
      {
        id: randomUUID(),
        factory_id: factoryId,
        process_id: processIds[processSlug] as string,
        depends_on_process_id: processIds[dependsOnSlug] as string,
        dependency_type: 'finish_to_start',
        lag_minutes: 0,
        metadata: { demo: true },
      },
      { onConflict: 'process_id,depends_on_process_id' },
    )

    if (error) throw new Error(`offline seed: dependency failed: ${error.message}`)
  }

  /* ---- production orders ------------------------------------------------ */
  const now = Date.now()
  for (const order of PRODUCTION_ORDERS) {
    const { error } = await client.from('production_orders').upsert(
      {
        id: randomUUID(),
        factory_id: factoryId,
        reference: order.reference,
        product: order.product,
        quantity: order.quantity,
        unit: order.unit,
        due_at: new Date(now + order.dueInHours * 3_600_000).toISOString(),
        priority: order.priority,
        status: order.status,
        requirements: { demo: true },
        metadata: { demo: true },
      },
      { onConflict: 'factory_id,reference' },
    )

    if (error) throw new Error(`offline seed: order '${order.reference}' failed: ${error.message}`)
  }

  /* ---- energy data ------------------------------------------------------ */
  // Two days of 15-minute site-level readings with a daily load shape and a
  // daylight generation curve. Deterministic, so re-running is reproducible.
  const intervals: Array<Record<string, unknown>> = []
  const start = new Date(now)
  start.setUTCHours(0, 0, 0, 0)

  for (let minutes = 0; minutes < 2 * 24 * 60; minutes += 15) {
    const ts = new Date(start.getTime() + minutes * 60_000)
    const hour = ts.getUTCHours()

    const consumption = round4(500 + 240 * (0.5 + 0.5 * Math.sin((2 * Math.PI * hour) / 24)))
    const generation =
      hour >= 8 && hour <= 17 ? round4(240 * Math.max(0, Math.sin((Math.PI * (hour - 8)) / 9))) : 0

    intervals.push({
      id: randomUUID(),
      factory_id: factoryId,
      recorded_at: ts.toISOString(),
      interval_minutes: 15,
      consumption_kwh: consumption,
      generation_kwh: generation,
      machine_id: null,
      source: 'measured',
      metadata: { demo: true, note: 'synthetic offline demonstration series' },
    })
  }

  const { error: energyError } = await client
    .from('energy_data')
    .upsert(intervals, { ignoreDuplicates: true })

  if (energyError) throw new Error(`offline seed: energy_data failed: ${energyError.message}`)

  /* ---- tariffs ---------------------------------------------------------- */
  for (const tariff of TARIFFS) {
    const { error } = await client.from('electricity_tariffs').upsert(
      {
        id: randomUUID(),
        factory_id: factoryId,
        slug: tariff.slug,
        name: tariff.name,
        currency: 'EUR',
        start_time: tariff.startTime,
        end_time: tariff.endTime,
        days_of_week: tariff.daysOfWeek,
        energy_price_per_kwh: tariff.price,
        demand_charge_per_kw: tariff.demandCharge,
        fixed_charge: tariff.fixedCharge,
        tax_rate: tariff.taxRate,
        effective_from: new Date(start).toISOString(),
        effective_to: null,
        priority: tariff.priority,
        metadata: { demo: true },
      },
      { onConflict: 'factory_id,slug' },
    )

    if (error) throw new Error(`offline seed: tariff '${tariff.slug}' failed: ${error.message}`)
  }

  // No schedules and no optimization results: ByteMe never fabricates them.

  return {
    factoryId,
    machineIds,
    processIds,
    energyIntervals: intervals.length,
  }
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000
}

/** True when the offline database already holds the demo factory. */
export async function isOfflineSeeded(
  client: OfflineClient,
  factoryId?: string,
): Promise<boolean> {
  const { data } = factoryId
    ? await client.from('factories').select('id').eq('id', factoryId).maybeSingle()
    : await client.from('factories').select('id').eq('slug', DEMO_FACTORY_SLUG).maybeSingle()

  return Boolean(data)
}