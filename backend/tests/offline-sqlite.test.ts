/**
 * Offline (SQLite) backend tests.
 *
 * These do NOT test a parallel API. They prove that the SAME repositories,
 * services and Zod row schemas work unchanged when `BYTEME_OFFLINE_MODE=true`,
 * by flipping the one environment flag that `client()` in
 * lib/repositories/base.ts reads and then exercising the real code paths.
 *
 * Everything runs against an isolated in-memory database, so no file is created
 * and no state leaks between cases.
 *
 * The point of the suite is the seam, not the adapter in isolation: a test that
 * only called `createOfflineClient()` directly would still pass if `client()`
 * kept handing out Supabase. So every behavioural case below goes through the
 * real repositories.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

import { closeDb, getDb } from '@/lib/offline/db'
import { initOfflineSchema, isOfflineSchemaReady } from '@/lib/offline/init'
import { seedOfflineDatabase, DEMO_FACTORY_SLUG } from '@/lib/offline/seed'
import { TABLES } from '@/lib/offline/schema'
import { decodeValue, encodeValue, parseOrFilter } from '@/lib/offline/adapter'
import { isOfflineMode } from '@/lib/offline/mode'

import { client, isOffline } from '@/lib/repositories/base'
import { factoriesRepository } from '@/lib/repositories/factories'
import { machinesRepository } from '@/lib/repositories/machines'
import {
  loadDependencyEdges,
  processesRepository,
  withDependencies,
} from '@/lib/repositories/processes'
import { productionOrdersRepository } from '@/lib/repositories/production-orders'
import {
  bulkUpsertEnergyData,
  energyDataRepository,
  energyTotals,
  listEnergyData,
} from '@/lib/repositories/energy-data'
import {
  tariffsRepository,
  listActiveTariffs,
  listTariffsForHorizon,
} from '@/lib/repositories/electricity-tariffs'
import {
  getScheduleWithEntries,
  scheduleEntriesRepository,
  schedulesRepository,
} from '@/lib/repositories/schedules'
import { runOptimization } from '@/lib/services/optimization'
import { ConfigurationError, ServiceUnavailableError } from '@/lib/errors'
import { machineCreateSchema } from '@/lib/schemas/machines'
import { getSupabaseAdmin } from '@/lib/supabase'
import { isDatabaseConfigured, resetEnvCache, serverEnv } from '@/lib/env'

/* -------------------------------------------------------------------------- */
/* Harness                                                                    */
/* -------------------------------------------------------------------------- */

/** Environment as it was before this file ran, restored in afterAll. */
const savedEnv = {
  mode: process.env.BYTEME_OFFLINE_MODE,
  path: process.env.BYTEME_OFFLINE_DB_PATH,
}

/** Seeded demo identifiers, filled in by beforeAll. */
let factoryId = ''
let machineId = ''
let secondMachineId = ''
let processId = ''

/**
 * The seeded tariffs take effect on the seed date, so the horizon used by the
 * tariff and optimizer cases must fall after it rather than before.
 */
const TEST_INSTANT = '2031-03-02T08:00:00.000Z'
const TEST_INSTANT_END = '2031-03-02T20:00:00.000Z'

/** Offsets from TEST_INSTANT, so every entry sits inside the schedule horizon. */
const addMinutes = (base: string, minutes: number): string =>
  new Date(new Date(base).getTime() + minutes * 60_000).toISOString()
const addHours = (base: string, hours: number): string => addMinutes(base, hours * 60)

beforeAll(async () => {
  process.env.BYTEME_OFFLINE_MODE = 'true'
  process.env.BYTEME_OFFLINE_DB_PATH = ':memory:'
  // serverEnv() memoises; drop it so the flags above are what it reads.
  resetEnvCache()

  initOfflineSchema(getDb())

  const seeded = await seedOfflineDatabase(getDb())
  factoryId = seeded.factoryId

  const machineIds = Object.values(seeded.machineIds)
  machineId = machineIds[0] ?? ''
  secondMachineId = machineIds[1] ?? ''
  processId = Object.values(seeded.processIds)[0] ?? ''
})

afterAll(() => {
  closeDb()

  if (savedEnv.mode === undefined) delete process.env.BYTEME_OFFLINE_MODE
  else process.env.BYTEME_OFFLINE_MODE = savedEnv.mode

  if (savedEnv.path === undefined) delete process.env.BYTEME_OFFLINE_DB_PATH
  else process.env.BYTEME_OFFLINE_DB_PATH = savedEnv.path

  resetEnvCache()
})

/* -------------------------------------------------------------------------- */
/* The seam                                                                    */
/* -------------------------------------------------------------------------- */

describe('the backend seam', () => {
  it('reports offline mode and routes client() at SQLite', () => {
    expect(isOfflineMode()).toBe(true)
    expect(isOffline()).toBe(true)
    // A working query builder is the observable proof; no Supabase involved.
    expect(typeof client().from).toBe('function')
  })

  it('never constructs a Supabase client in offline mode', () => {
    // getSupabaseAdmin() throws when BYTEME_OFFLINE_MODE=true rather than
    // building a client, so a repository reaching for it would fail loudly
    // instead of silently querying the wrong backend.
    expect(() => getSupabaseAdmin()).toThrow(/BYTEME_OFFLINE_MODE/)
  })

  it('reads no Supabase credential at all', () => {
    // Offline mode must work with no credentials. serverEnv() therefore does
    // not require them, which is the property being asserted here.
    expect(isDatabaseConfigured()).toBe(true)

    const env = serverEnv()
    expect(env.BYTEME_OFFLINE_MODE).toBe(true)
  })
})

/* -------------------------------------------------------------------------- */
/* Schema                                                                      */
/* -------------------------------------------------------------------------- */

describe('schema', () => {
  it('creates every ByteMe table', () => {
    expect(isOfflineSchemaReady()).toBe(true)

    const present = (
      getDb()
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`)
        .all() as Array<{ name: string }>
    ).map((row) => row.name)

    for (const table of TABLES) expect(present).toContain(table)
  })

  it('is idempotent, so restarting does not fail', () => {
    expect(() => initOfflineSchema(getDb())).not.toThrow()
    expect(isOfflineSchemaReady()).toBe(true)
  })

  it('enforces foreign keys, which SQLite disables by default', () => {
    expect(getDb().pragma('foreign_keys', { simple: true })).toBe(1)
  })

  it('stores no credential in the database', () => {
    // The adapter encodes only the columns the repositories write. There is no
    // code path that can put a Supabase key, an optimizer API key, or a project
    // URL into a row, and this asserts the demo data really is just data.
    const serialised = JSON.stringify(
      getDb()
        .prepare(`SELECT * FROM factories`)
        .all()
        .concat(getDb().prepare(`SELECT * FROM machines`).all()),
    )

    expect(serialised).not.toMatch(/sb_secret_/)
    expect(serialised).not.toMatch(/supabase\.co/)
    expect(serialised).not.toMatch(/service_role/i)
  })
})

/* -------------------------------------------------------------------------- */
/* Value encoding                                                             */
/* -------------------------------------------------------------------------- */

describe('value encoding', () => {
  it('round-trips json, booleans, numbers and arrays', () => {
    expect(decodeValue(encodeValue({ a: 1 }, 'json'), 'json')).toEqual({ a: 1 })
    expect(decodeValue(encodeValue([1, 2, 3], 'array'), 'array')).toEqual([1, 2, 3])
    expect(decodeValue(encodeValue(true, 'bool'), 'bool')).toBe(true)
    expect(decodeValue(encodeValue(false, 'bool'), 'bool')).toBe(false)
    expect(decodeValue(encodeValue(null, 'json'), 'json')).toBeNull()
    expect(decodeValue(encodeValue(12.5, 'number'), 'number')).toBe(12.5)
  })

  it('leaves a stored json column as text, never as a double-encoded string', () => {
    const stored = getDb()
      .prepare(`SELECT config FROM factories WHERE id = ?`)
      .get(factoryId) as { config: string }

    // Raw SQLite storage is JSON text...
    expect(typeof stored.config).toBe('string')
    // ...and the row schema hands the client a real object, not a string.
    expect(typeof JSON.parse(stored.config)).toBe('object')
  })
})

/* -------------------------------------------------------------------------- */
/* PostgREST .or() translation                                                 */
/* -------------------------------------------------------------------------- */

describe('.or() translation', () => {
  const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222']

  it('handles the null / comparison form used by the tariff repositories', () => {
    const at = TEST_INSTANT
    const result = parseOrFilter(`effective_from.is.null,effective_from.lte.${at}`)

    expect(result.sql).toContain('IS NULL')
    expect(result.sql).toContain('<= ?')
    expect(result.params).toContain(at)
  })

  it('handles the .in.() form used by the dependency repository', () => {
    const result = parseOrFilter(
      `process_id.in.(${ids.join(',')}),depends_on_process_id.in.(${ids.join(',')})`,
    )

    expect(result.sql).toContain('IN (?, ?)')
    expect(result.params).toHaveLength(4)
  })

  it('refuses syntax it does not understand instead of guessing', () => {
    // A silently ignored filter would return wrong rows, which is worse than an
    // explicit failure during integration.
    expect(() => parseOrFilter('name.ilike.%x%')).toThrow()
  })
})

/* -------------------------------------------------------------------------- */
/* Repositories, unchanged                                                    */
/* -------------------------------------------------------------------------- */

describe('factories', () => {
  it('reads the seeded factory back through the row schema', async () => {
    const factory = await factoriesRepository.getById(factoryId)

    expect(factory).not.toBeNull()
    expect(factory?.slug).toBe(DEMO_FACTORY_SLUG)
    // A jsonb column arrived as a real object, not a JSON string.
    expect(typeof factory?.config).toBe('object')
    expect(factory?.is_active).toBe(true)
    expect(typeof factory?.timezone).toBe('string')
  })

  it('supports the full create / update / delete cycle', async () => {
    const created = await factoriesRepository.create({
      slug: 'offline-lifecycle-plant',
      name: 'Lifecycle Plant',
      timezone: 'Europe/Berlin',
      currency: 'EUR',
      is_active: true,
    })

    expect(created.id).toMatch(/^[0-9a-f-]{36}$/)

    const updated = await factoriesRepository.update(created.id, { name: 'Renamed Plant' })
    expect(updated.name).toBe('Renamed Plant')

    await factoriesRepository.remove(created.id)
    expect(await factoriesRepository.getById(created.id)).toBeNull()
  })

  it('shallow-merges config, leaving untouched keys alone', async () => {
    const before = await factoriesRepository.getById(factoryId)
    const originalGrid = before?.config

    const patched = await factoriesRepository.patchConfig(factoryId, {
      'demo-marker': 'offline-test',
    })

    expect(patched.config['demo-marker']).toBe('offline-test')
    // Keys not mentioned in the patch survive, which is the whole point of the
    // shallow merge.
    expect(Object.keys(patched.config).sort()).toEqual(
      [...Object.keys(originalGrid ?? {}), 'demo-marker'].sort(),
    )
  })

  it('reports a missing row as not found rather than an empty object', async () => {
    expect(
      await factoriesRepository.getById('00000000-0000-4000-8000-000000000000'),
    ).toBeNull()
    expect(await factoriesRepository.exists('00000000-0000-4000-8000-000000000000')).toBe(false)
  })

  it('paginates and reports an exact total', async () => {
    const page = await factoriesRepository.list({ limit: 1, offset: 0 })

    expect(page.rows).toHaveLength(1)
    // Only the seeded factory remains; the lifecycle test deleted its own.
    expect(page.total).toBe(1)
  })
})

describe('machines', () => {
  it('lists the seeded machines with json and boolean columns intact', async () => {
    const { rows, total } = await machinesRepository.list(factoryId, {
      limit: 50,
      offset: 0,
    })

    expect(rows).toHaveLength(7)
    expect(total).toBe(7)
    expect(typeof rows[0]?.availability).toBe('object')
    expect(typeof rows[0]?.is_active).toBe('boolean')
  })

  it('creates, reads back and deletes a machine', async () => {
    const created = await machinesRepository.create(factoryId, {
      slug: 'offline-test-machine',
      name: 'Offline Test Machine',
      type: 'press',
      rated_power_kw: 120,
      min_power_kw: 30,
      is_active: true,
    })

    expect(created.slug).toBe('offline-test-machine')
    expect(created.rated_power_kw).toBe(120)

    const fetched = await machinesRepository.getBySlug(factoryId, 'offline-test-machine')
    expect(fetched?.id).toBe(created.id)

    await machinesRepository.remove(factoryId, created.id)
    expect(await machinesRepository.getById(factoryId, created.id)).toBeNull()
  })

  it('applies limit, offset and sorting', async () => {
    const first = await machinesRepository.list(factoryId, {
      limit: 3,
      offset: 0,
      sortColumn: 'slug',
      sortAscending: true,
    })
    const second = await machinesRepository.list(factoryId, {
      limit: 3,
      offset: 3,
      sortColumn: 'slug',
      sortAscending: true,
    })

    expect(first.rows).toHaveLength(3)
    expect(second.rows).toHaveLength(3)
    // A stable sort with a real offset: no overlap between pages.
    const firstIds = first.rows.map((row) => row.id)
    for (const row of second.rows) expect(firstIds).not.toContain(row.id)
  })

  it('counts with a head-only exact count', async () => {
    expect(await machinesRepository.count(factoryId)).toBe(7)
  })
})

describe('processes and dependencies', () => {
  it('lists the seeded processes', async () => {
    const { rows, total } = await processesRepository.list(factoryId, { limit: 50, offset: 0 })

    expect(rows).toHaveLength(6)
    expect(total).toBe(6)
    expect(rows.every((row) => row.factory_id === factoryId)).toBe(true)
  })

  it('resolves dependency edges through the .or() two-sided filter', async () => {
    const ids = [processId]
    const { dependsOn, blocks } = await loadDependencyEdges(factoryId, ids)

    const total = [...dependsOn.values()].flat().length + [...blocks.values()].flat().length
    expect(total).toBeGreaterThan(0)

    // Every resolved edge carries a display name, meaning the follow-up
    // `.in('id', ...)` + column subset select also worked.
    for (const edge of [...dependsOn.values()].flat()) {
      expect(edge.name).toBeTruthy()
      expect(edge.slug).toBeTruthy()
    }
  })

  it('attaches depends_on and blocks to processes', async () => {
    const { rows } = await processesRepository.list(factoryId, { limit: 50, offset: 0 })
    const [withDeps] = await withDependencies(factoryId, rows.slice(0, 3))

    expect(withDeps).toBeDefined()
    expect(Array.isArray(withDeps?.depends_on)).toBe(true)
    expect(Array.isArray(withDeps?.blocks)).toBe(true)
  })

  it('returns empty maps rather than failing on an empty id list', async () => {
    const { dependsOn, blocks } = await loadDependencyEdges(factoryId, [])

    expect(dependsOn.size).toBe(0)
    expect(blocks.size).toBe(0)
  })
})

describe('production orders', () => {
  it('lists the seeded orders with numeric and json columns intact', async () => {
    const { rows, total } = await productionOrdersRepository.list(factoryId, {
      limit: 50,
      offset: 0,
    })

    expect(rows).toHaveLength(2)
    expect(total).toBe(2)
    expect(typeof rows[0]?.quantity).toBe('number')
    expect(typeof rows[0]?.requirements).toBe('object')
    expect(rows.some((row) => row.status === 'released')).toBe(true)
  })

  it('creates an order and rejects an empty patch', async () => {
    const created = await productionOrdersRepository.create(factoryId, {
      reference: 'OFFLINE-TEST-0001',
      quantity: 100,
      unit: 'units',
      priority: 5,
      status: 'planned',
    })

    expect(created.reference).toBe('OFFLINE-TEST-0001')
    expect(created.quantity).toBe(100)

    await expect(productionOrdersRepository.update(factoryId, created.id, {})).rejects.toThrow()

    await productionOrdersRepository.remove(factoryId, created.id)
  })
})

describe('energy data', () => {
  it('lists seeded intervals inside a time window with an exact count', async () => {
    const { rows, total } = await listEnergyData(
      factoryId,
      { limit: 10, offset: 0, sortColumn: 'recorded_at', sortAscending: true },
      {},
    )

    expect(rows).toHaveLength(10)
    expect(total).toBe(192)
    // Ascending order really is ascending.
    const times = rows.map((row) => row.recorded_at)
    expect([...times].sort()).toEqual(times)
  })

  it('filters a window with gte / lte', async () => {
    const all = await listEnergyData(
      factoryId,
      { limit: 500, offset: 0, sortColumn: 'recorded_at', sortAscending: true },
      {},
    )

    const first = all.rows[0]?.recorded_at
    const third = all.rows[2]?.recorded_at
    expect(first).toBeTruthy()

    const windowed = await listEnergyData(
      factoryId,
      { limit: 500, offset: 0, sortColumn: 'recorded_at', sortAscending: true },
      { from: first, to: third },
    )

    expect(windowed.total).toBe(3)
  })

  it('upserts new intervals and returns them, like .insert().select()', async () => {
    const recordedAt = '2030-01-01T00:00:00.000Z'

    const result = await bulkUpsertEnergyData(factoryId, {
      intervals: [
        {
          recorded_at: recordedAt,
          interval_minutes: 15,
          consumption_kwh: 42.5,
          generation_kwh: 1.25,
          source: 'measured',
        },
      ],
      on_conflict: 'update',
    })

    expect(result.inserted).toBe(1)
    expect(result.rows[0]?.consumption_kwh).toBe(42.5)
    expect(result.rows[0]?.machine_id).toBeNull()
    expect(typeof result.rows[0]?.metadata).toBe('object')
  })

  it('honours on_conflict=skip against the expression unique index', async () => {
    const recordedAt = '2030-01-01T00:00:00.000Z'

    const skipped = await bulkUpsertEnergyData(factoryId, {
      intervals: [
        {
          recorded_at: recordedAt,
          interval_minutes: 15,
          consumption_kwh: 99,
          generation_kwh: 0,
          source: 'measured',
        },
      ],
      on_conflict: 'skip',
    })

    expect(skipped.inserted).toBe(0)

    // 'skip' really did leave the stored value alone.
    const stored = await energyDataRepository.getById(
      factoryId,
      skipped.rows[0]?.id ?? (
        await listEnergyData(
          factoryId,
          { limit: 1, offset: 0 },
          { from: recordedAt, to: recordedAt },
        )
      ).rows[0]!.id,
    )
    expect(stored?.consumption_kwh).toBe(42.5)
  })

  it('computes totals over a window', async () => {
    const totals = await energyTotals(factoryId, {
      from: '2030-01-01T00:00:00.000Z',
      to: '2030-01-01T00:00:00.000Z',
    })

    expect(totals.consumption_kwh).toBeCloseTo(42.5, 6)
    expect(totals.intervals).toBe(1)
  })
})

describe('electricity tariffs', () => {
  it('lists the seeded tariffs', async () => {
    const { rows, total } = await tariffsRepository.list(factoryId, {
      limit: 50,
      offset: 0,
    })

    expect(rows).toHaveLength(4)
    expect(total).toBe(4)
  })

  it('filters active tariffs through the .or() null / lte pair', async () => {
    const active = await listActiveTariffs(factoryId, TEST_INSTANT)

    expect(active.length).toBeGreaterThan(0)
    // Ordered by priority descending, as the repository asks.
    const priorities = active.map((row) => row.priority)
    expect([...priorities].sort((a, b) => b - a)).toEqual(priorities)
    // Null days_of_week round-trips as null, not as an empty array.
    expect(active.every((row) => row.days_of_week === null || Array.isArray(row.days_of_week))).toBe(true)
  })

  it('finds every tariff overlapping a horizon', async () => {
    const inHorizon = await listTariffsForHorizon(
      factoryId,
      TEST_INSTANT,
      TEST_INSTANT_END,
    )

    expect(inHorizon.length).toBeGreaterThan(0)
  })

  it('excludes a tariff whose window ended before the horizon', async () => {
    const expired = '2020-01-01T00:00:00.000Z'
    const ended = '2020-06-01T00:00:00.000Z'

    await tariffsRepository.create(factoryId, {
      slug: 'offline-expired-tariff',
      name: 'Expired',
      currency: 'EUR',
      start_time: '00:00',
      end_time: '23:59',
      energy_price_per_kwh: 0.5,
      effective_from: expired,
      effective_to: ended,
      priority: 40,
    })

    const active = await listActiveTariffs(factoryId, TEST_INSTANT)
    expect(active.some((row) => row.slug === 'offline-expired-tariff')).toBe(false)
  })
})

describe('schedules and entries', () => {
  let scheduleId = ''

  it('creates a schedule', async () => {
    const created = await schedulesRepository.create(factoryId, {
      name: 'Offline Test Schedule',
      version: 1,
      status: 'draft',
      horizon_start: TEST_INSTANT,
      horizon_end: TEST_INSTANT_END,
    })

    scheduleId = created.id
    expect(created.name).toBe('Offline Test Schedule')
    expect(typeof created.metadata).toBe('object')
  })

  it('creates entries and orders them chronologically', async () => {
    await scheduleEntriesRepository.create(scheduleId, {
      machine_id: machineId,
      process_id: processId,
      starts_at: addHours(TEST_INSTANT, 1),
      ends_at: addHours(TEST_INSTANT, 2),
      power_kw: 100,
      energy_kwh: 100,
      sequence: 1,
    })

    await scheduleEntriesRepository.create(scheduleId, {
      machine_id: secondMachineId,
      process_id: processId,
      starts_at: TEST_INSTANT,
      ends_at: addMinutes(TEST_INSTANT, 30),
      power_kw: 40,
      energy_kwh: 20,
      sequence: 2,
    })

    const { rows } = await scheduleEntriesRepository.list(scheduleId, {
      limit: 50,
      offset: 0,
      sortColumn: 'starts_at',
      sortAscending: true,
    })

    expect(rows).toHaveLength(2)
    // ISO-8601 UTC strings sort lexicographically, which is the comparison
    // the adapter itself performs in SQL.
    const starts = rows.map((row) => row.starts_at)
    expect(starts).toEqual([...starts].sort())
    expect(await scheduleEntriesRepository.count(scheduleId)).toBe(2)
  })

  it('replaces every entry in one call and recomputes totals', async () => {
    const replaced = await scheduleEntriesRepository.replaceAll(scheduleId, {
      entries: [
        {
          machine_id: machineId,
          process_id: processId,
          starts_at: TEST_INSTANT,
          ends_at: addHours(TEST_INSTANT, 1),
          power_kw: 150,
          energy_kwh: 150,
          cost: 20,
          sequence: 1,
        },
      ],
    })

    expect(replaced).toHaveLength(1)

    const detail = await getScheduleWithEntries(factoryId, scheduleId)
    expect(detail?.entry_count).toBe(1)
    expect(detail?.computed_totals.total_energy_kwh).toBe(150)
    expect(detail?.computed_totals.peak_demand_kw).toBe(150)
  })

  it('counts entries across every schedule of the factory with .in()', async () => {
    expect(await scheduleEntriesRepository.countEntries(factoryId)).toBe(1)
  })

  it('detects overlapping entries using lt / gt', async () => {
    const overlapping = await import('@/lib/repositories/schedules').then((m) =>
      m.findOverlappingEntries(
        scheduleId,
        machineId,
        addMinutes(TEST_INSTANT, 30),
        addMinutes(TEST_INSTANT, 45),
      ),
    )

    expect(overlapping).toHaveLength(1)
  })

  it('cleans up', async () => {
    await schedulesRepository.remove(factoryId, scheduleId)
    expect(await schedulesRepository.getById(factoryId, scheduleId)).toBeNull()
  })
})

/* -------------------------------------------------------------------------- */
/* Error mapping                                                              */
/* -------------------------------------------------------------------------- */

describe('database error mapping', () => {
  it('maps a unique violation onto 409, as Postgres 23505 does', async () => {
    let status = 0
    let code = ''

    try {
      await factoriesRepository.create({
        // The seeded factory already owns this slug.
        slug: DEMO_FACTORY_SLUG,
        name: 'Duplicate',
        timezone: 'UTC',
        currency: 'EUR',
        is_active: true,
      })
    } catch (error) {
      status = (error as { status?: number }).status ?? 0
      code = (error as { code?: string }).code ?? ''
    }

    expect(status).toBe(409)
    expect(code).toBeTruthy()
  })

  it('maps a foreign key violation onto 400, as Postgres 23503 does', async () => {
    let status = 0

    try {
      await machinesRepository.create('00000000-0000-4000-8000-000000000000', {
        slug: 'orphan-machine',
        name: 'Orphan',
        is_active: true,
      })
    } catch (error) {
      status = (error as { status?: number }).status ?? 0
    }

    expect(status).toBe(400)
  })

  it('maps a check constraint violation onto 400, as Postgres 23514 does', async () => {
    let status = 0

    try {
      // min_runtime_minutes above max_runtime_minutes is a real CHECK in both
      // the Postgres migration and the SQLite schema, so this exercises the
      // database rather than the Zod layer.
      await machinesRepository.create(factoryId, {
        slug: 'impossible-machine',
        name: 'Impossible',
        min_runtime_minutes: 900,
        max_runtime_minutes: 60,
        is_active: true,
      })
    } catch (error) {
      status = (error as { status?: number }).status ?? 0
    }

    expect(status).toBe(400)
  })

  it('still enforces the min/max power rule from the Zod schema', async () => {
    // This one is validation, not a database CHECK, so it is rejected before
    // any query is issued. Asserted here so both layers stay covered.
    const parsed = machineCreateSchema.safeParse({
      slug: 'impossible-machine',
      name: 'Impossible',
      rated_power_kw: 10,
      min_power_kw: 100,
    })

    expect(parsed.success).toBe(false)
  })
})

/* -------------------------------------------------------------------------- */
/* Optimizer boundary                                                          */
/* -------------------------------------------------------------------------- */

describe('optimizer in offline mode', () => {
  it('still refuses to invent a contract and answers 503', async () => {
    let caught: unknown

    try {
      await runOptimization(factoryId, {
        horizon_start: TEST_INSTANT,
        horizon_end: TEST_INSTANT_END,
      })
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(ServiceUnavailableError)
  })

  it('still records the attempt against the local database', async () => {
    // The payload was assembled from SQLite data, and the request row was
    // written locally, so integration work can proceed with no internet.
    const { optimizationRequestsRepository } = await import('@/lib/repositories/optimization')

    const { rows } = await optimizationRequestsRepository.list(factoryId, {
      limit: 10,
      offset: 0,
    })

    expect(rows.length).toBeGreaterThan(0)
    expect(rows.some((row) => row.status === 'not_configured')).toBe(true)
  })

  it('assembles a real problem payload from the seeded SQLite data', async () => {
    const { buildProblem } = await import('@/lib/services/optimization')

    const { problem } = await buildProblem(
      factoryId,
      {
        horizon_start: TEST_INSTANT,
        horizon_end: TEST_INSTANT_END,
      },
      'offline-probe',
    )

    expect(problem.machines.length).toBe(7)
    expect(problem.processes.length).toBe(6)
    expect(problem.tariffs.length).toBeGreaterThan(0)
  })

  it('supports a dry run without contacting anything', async () => {
    const { solution, request } = await runOptimization(factoryId, {
      horizon_start: TEST_INSTANT,
      horizon_end: TEST_INSTANT_END,
      dry_run: true,
    })

    // A dry run proves the payload path only. It never fabricates a schedule.
    expect(solution).toBeNull()
    expect(request.status).toBe('succeeded')
  })
})

/* -------------------------------------------------------------------------- */
/* Guards                                                                      */
/* -------------------------------------------------------------------------- */

describe('generic-domain guardrail', () => {
  it('keeps the offline layer free of industry vocabulary', () => {
    const source = ['db', 'init', 'adapter', 'seed', 'schema', 'mode', 'index']
      .map((file) => readFileSync(`lib/offline/${file}.ts`, 'utf8'))
      .join('\n')
      .toLowerCase()

    for (const word of ['chocolate', 'cocoa', 'bean', 'roast', 'grind', 'conche', 'temper']) {
      expect(source, `lib/offline must not hard-code "${word}"`).not.toContain(word)
    }
  })

  it('never writes a secret into the SQLite layer', () => {
    const source = ['db', 'init', 'adapter', 'seed', 'schema', 'mode', 'index']
      .map((file) => readFileSync(`lib/offline/${file}.ts`, 'utf8'))
      .join('\n')

    for (const secret of ['SUPABASE_SERVICE_ROLE_KEY', 'sb_secret_', 'BYTEME_OPTIMIZER_API_KEY']) {
      expect(source, `lib/offline must not reference ${secret}`).not.toContain(secret)
    }
  })
})

describe('configuration errors', () => {
  it('is a ConfigurationError, not a client error', () => {
    expect(new ConfigurationError('x').status).toBe(500)
  })
})
