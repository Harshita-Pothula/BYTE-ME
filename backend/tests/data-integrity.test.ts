/**
 * Phase 3 — data integrity: no silent truncation, aggregates in the database.
 *
 * THE DEFECTS UNDER TEST
 * ----------------------
 * Three places read a bounded number of rows and used whatever came back,
 * reporting it as though it were the whole truth:
 *
 *   1. `energyTotals` fetched up to 50,000 readings and summed them in Node.
 *      Past that limit the total was computed from a partial set, and
 *      `intervals` reported the partial count as the true one.
 *
 *   2. `getScheduleWithEntries` fetched at most 10,000 entries. A longer
 *      schedule silently lost its tail — and because the same rows feed
 *      `computed_totals`, the reported peak demand and energy totals described
 *      only the entries that fitted.
 *
 *   3. The optimizer capped each entity (1,000 machines, 2,000 processes,
 *      5,000 dependencies, 2,000 orders, 2,000 readings) and sent the
 *      remainder nowhere. The problem document has no field in which to say
 *      "truncated", so a 1,001-process factory was presented to the optimizer
 *      as a 1,000-process factory.
 *
 * WHY THE SCALE CASES MATTER
 * --------------------------
 * Each regression below is asserted at a size that crosses the old limit or
 * the new page size. A test at 50 rows would pass against the broken code, so
 * the interesting assertions are the ones that would have failed before:
 * totals that exceed the old cap, and entry sets that span several pages.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { closeDb, getDb } from '@/lib/offline/db'
import { resetEnvCache } from '@/lib/env'
import { initOfflineSchema } from '@/lib/offline/init'
import { seedOfflineDatabase } from '@/lib/offline/seed'
import { energyTotals } from '@/lib/repositories/energy-data'
import {
  getScheduleWithEntries,
  scheduleEntriesRepository,
  schedulesRepository,
} from '@/lib/repositories/schedules'
import { offlineAggregateRpc } from '@/lib/offline/aggregates'
import { buildProblem } from '@/lib/services/optimization'
import type { SqliteDatabase } from '@/lib/offline/db'

const savedEnv = {
  mode: process.env.BYTEME_OFFLINE_MODE,
  path: process.env.BYTEME_OFFLINE_DB_PATH,
}

const T0 = '2033-06-01T00:00:00.000Z'

let db: SqliteDatabase
let factoryId = ''
let machineId = ''
let processId = ''

/** ISO instant `minutes` after T0, so windows never overlap. */
function at(minutes: number): string {
  return new Date(new Date(T0).getTime() + minutes * 60_000).toISOString()
}

async function newSchedule(name: string, horizonEnd: string): Promise<string> {
  const schedule = await schedulesRepository.create(factoryId, {
    name,
    version: 1,
    status: 'draft',
    horizon_start: T0,
    horizon_end: horizonEnd,
  })
  return schedule.id
}

/** Inserts readings straight through SQL: thousands of validated round trips would dominate the test. */
function insertReadings(count: number, fromMinute: number, consumption = 1, generation = 0): void {
  const statement = db.prepare(
    `INSERT INTO energy_data (id, factory_id, recorded_at, interval_minutes, consumption_kwh, generation_kwh, source)
     VALUES (?, ?, ?, ?, ?, ?, 'test')`,
  )
  for (let i = 0; i < count; i += 1) {
    statement.run(
      crypto.randomUUID(),
      factoryId,
      at(fromMinute + i),
      15,
      consumption,
      generation,
    )
  }
}

beforeAll(async () => {
  process.env.BYTEME_OFFLINE_MODE = 'true'
  process.env.BYTEME_OFFLINE_DB_PATH = ':memory:'
  resetEnvCache()

  db = getDb()
  initOfflineSchema(db)

  const seeded = await seedOfflineDatabase(db)
  factoryId = seeded.factoryId
  machineId = Object.values(seeded.machineIds)[0] ?? ''
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
/* energyTotals: the sum belongs to the database                              */
/* -------------------------------------------------------------------------- */

/**
 * A window holding more readings than the old 50,000-row cap, inserted once and
 * shared by every test that needs to cross that threshold.
 *
 * Inserted lazily because the repository never asks for a window this size
 * otherwise, and the seeded factory is the right place to put bulk data.
 */
const BULK_COUNT = 50_001
const BULK_START = 100_000
let bulkInserted = false

function ensureBulkReadings(): void {
  if (bulkInserted) return
  insertReadings(BULK_COUNT, BULK_START, 1, 0)
  bulkInserted = true
}

describe('energy totals', () => {
  it('totals exactly what a direct SQL aggregate reports', async () => {
    // Parity with the database is the property that matters: whatever the
    // repository returns must be what SQLite itself computes, not a recount of
    // a page the application happened to receive.
    const expected = db
      .prepare(
        `SELECT coalesce(sum(consumption_kwh),0) c, coalesce(sum(generation_kwh),0) g,
                count(*) n, min(recorded_at) lo, max(recorded_at) hi
           FROM energy_data WHERE factory_id = ?`,
      )
      .get(factoryId) as { c: number; g: number; n: number; lo: string; hi: string }

    const totals = await energyTotals(factoryId, {})

    expect(totals.consumption_kwh).toBeCloseTo(expected.c, 6)
    expect(totals.generation_kwh).toBeCloseTo(expected.g, 6)
    expect(totals.net_kwh).toBeCloseTo(expected.c - expected.g, 6)
    expect(totals.intervals).toBe(expected.n)
    expect(totals.from).toBe(expected.lo)
    expect(totals.to).toBe(expected.hi)
  })

  it('counts every reading, with no cap', async () => {
    // 2,500 readings in a window the old code would have read in full. The
    // point of the case is the count, not the sum: `intervals` is what made
    // truncation invisible.
    insertReadings(2_500, 0, 1, 0)

    const totals = await energyTotals(factoryId, { from: T0, to: at(2_600) })

    expect(totals.intervals).toBe(2_500)
    expect(totals.consumption_kwh).toBeCloseTo(2_500, 6)
  })

  it('counts correctly past the old 50,000-row cap', async () => {
    // THE regression case. The old implementation read at most 50,000 rows and
    // summed them, so this window would have reported `intervals: 50000` and a
    // total 1,001 short of the truth — with nothing in the response to say so.
    //
    // Sized deliberately to cross the old limit. A test at 2,500 rows (above)
    // passes against the broken code, which is why this one exists.
    ensureBulkReadings()

    const totals = await energyTotals(factoryId, { from: at(BULK_START), to: at(BULK_START + BULK_COUNT + 1) })

    // Both numbers are wrong under the old code: the count, and the sum.
    expect(totals.intervals).toBe(BULK_COUNT)
    expect(totals.consumption_kwh).toBeCloseTo(BULK_COUNT, 6)
  })

  it('reports bounds of the filtered window, not of a fetched page', async () => {
    // The old code took `from`/`to` from the first and last row of whatever it
    // fetched. With a filter that excludes the earliest readings, those two
    // described the page rather than the filter.
    const totals = await energyTotals(factoryId, { from: at(100), to: at(200) })

    expect(totals.from).toBe(at(100))
    expect(totals.to).toBe(at(200))
    expect(totals.intervals).toBe(101)
  })

  it('honours a machine filter', async () => {
    const totals = await energyTotals(factoryId, { machine_id: machineId })
    const expected = db
      .prepare('SELECT count(*) n FROM energy_data WHERE factory_id = ? AND machine_id = ?')
      .get(factoryId, machineId) as { n: number }

    expect(totals.intervals).toBe(expected.n)
  })

  it('returns zeros and null bounds when nothing matches', async () => {
    // The shape the pre-aggregation code returned for an empty set. A
    // repository that returned an empty array here would break the summary
    // route, which spreads the result directly.
    const totals = await energyTotals(factoryId, {
      from: '2030-01-01T00:00:00.000Z',
      to: '2030-01-01T00:00:00.000Z',
    })

    expect(totals.consumption_kwh).toBe(0)
    expect(totals.generation_kwh).toBe(0)
    expect(totals.net_kwh).toBe(0)
    expect(totals.intervals).toBe(0)
    expect(totals.from).toBeNull()
    expect(totals.to).toBeNull()
  })
})

/* -------------------------------------------------------------------------- */
/* getScheduleWithEntries: the whole schedule, across pages                   */
/* -------------------------------------------------------------------------- */

describe('loading a whole schedule', () => {
  it('returns every entry when the schedule spans several pages', async () => {
    const scheduleId = await newSchedule('paged', at(3_000))

    // 2,500 entries over a page size of 1,000: three pages. The old code asked
    // for 10,000 in one go and would have passed this, so the entry count is
    // additionally asserted against the database rather than against a
    // constant.
    const rows = await scheduleEntriesRepository.replaceAll(scheduleId, {
      entries: Array.from({ length: 2_500 }, (_, i) => ({
        machine_id: machineId,
        process_id: processId,
        starts_at: at(i * 2),
        ends_at: at(i * 2 + 1),
        power_kw: 10,
        energy_kwh: 1,
        sequence: i,
      })),
    })
    expect(rows).toHaveLength(2_500)

    const expected = db
      .prepare('SELECT COUNT(*) n FROM schedule_entries WHERE schedule_id = ?')
      .get(scheduleId) as { n: number }

    const detail = await getScheduleWithEntries(factoryId, scheduleId)

    expect(detail?.entry_count).toBe(expected.n)
    expect(detail?.entries).toHaveLength(expected.n)
    expect(detail?.computed_totals.total_energy_kwh).toBeCloseTo(2_500, 6)
  })

  it('returns entries in chronological order with a stable tie-break', async () => {
    const scheduleId = await newSchedule('ordered', at(500))

    // Many entries share a start instant on purpose: ordering by `starts_at`
    // alone leaves those rows in an unspecified order, so across page
    // boundaries the same row could appear twice while another was dropped.
    await scheduleEntriesRepository.replaceAll(scheduleId, {
      entries: Array.from({ length: 1_200 }, (_, i) => ({
        machine_id: machineId,
        process_id: processId,
        starts_at: T0,
        ends_at: at(10_000),
        power_kw: 1,
        energy_kwh: 1,
        sequence: i,
      })),
    })

    const detail = await getScheduleWithEntries(factoryId, scheduleId)
    const ids = detail?.entries.map((e) => e.id) ?? []

    expect(detail?.entry_count).toBe(1_200)
    // Every id appears exactly once: no duplication and no loss across pages.
    expect(new Set(ids).size).toBe(1_200)
  })

  it('computes totals over every entry, not a truncated subset', async () => {
    const scheduleId = await newSchedule('totals', at(5_000))

    // 1,500 non-overlapping entries of 2 kWh each.
    await scheduleEntriesRepository.replaceAll(scheduleId, {
      entries: Array.from({ length: 1_500 }, (_, i) => ({
        machine_id: machineId,
        process_id: processId,
        starts_at: at(i * 2),
        ends_at: at(i * 2 + 1),
        power_kw: 25,
        energy_kwh: 2,
        sequence: i,
      })),
    })

    const detail = await getScheduleWithEntries(factoryId, scheduleId)

    expect(detail?.computed_totals.total_energy_kwh).toBeCloseTo(3_000, 6)
    // Entries do not overlap, so the peak is one entry's draw, not the sum.
    expect(detail?.computed_totals.peak_demand_kw).toBeCloseTo(25, 6)
  })

  it('still returns null for a schedule that does not exist', async () => {
    const missing = await getScheduleWithEntries(
      factoryId,
      '00000000-0000-4000-8000-000000000000',
    )
    expect(missing).toBeNull()
  })

  it('loads every entry past the old 10,000-entry cap', async () => {
    // THE regression case. The old loader read at most 10,000 entries, so this
    // schedule would have come back 501 entries short — and because those same
    // rows feed computed_totals, the reported energy total would have been
    // understated while looking authoritative.
    const scheduleId = await newSchedule('over-old-cap', at(40_000))

    // Straight SQL: 10,501 validated repository inserts would dominate the
    // test's runtime without testing anything the bulk insert does not.
    const statement = db.prepare(
      `INSERT INTO schedule_entries
         (id, schedule_id, machine_id, process_id, starts_at, ends_at, power_kw, energy_kwh, cost, quantity, sequence, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}')`,
    )
    const count = 10_501
    db.transaction(() => {
      for (let i = 0; i < count; i += 1) {
        statement.run(
          crypto.randomUUID(),
          scheduleId,
          machineId,
          processId,
          at(i * 2),
          at(i * 2 + 1),
          10,
          1,
          1,
          1,
          i,
        )
      }
    })()

    const detail = await getScheduleWithEntries(factoryId, scheduleId)

    expect(detail?.entry_count).toBe(count)
    expect(detail?.entries).toHaveLength(count)
    // Also wrong under the old code: 10,000 instead of 10,501.
    expect(detail?.computed_totals.total_energy_kwh).toBeCloseTo(count, 6)
  })
})

/* -------------------------------------------------------------------------- */
/* The aggregate RPC seam                                                    */
/* -------------------------------------------------------------------------- */

describe('the aggregate rpc', () => {
  it('dispatches energy_totals', () => {
    const result = offlineAggregateRpc('energy_totals', { p_factory_id: factoryId }, db)
    expect(result.error).toBeNull()
    expect((result.data as { interval_count: number }).interval_count).toBeGreaterThan(0)
  })

  it('fails loudly on an unknown aggregate rather than returning a plausible zero', () => {
    // A silent zero would read as "this factory consumed no energy", which is a
    // far worse failure than an error.
    const result = offlineAggregateRpc('energy_totl', { p_factory_id: factoryId }, db)
    expect(result.error?.code).toBe('PGRST202')
    expect(result.data).toBeNull()
  })
})

/* -------------------------------------------------------------------------- */
/* Migration 0004                                                             */
/* -------------------------------------------------------------------------- */

describe('migration 0004 — energy totals aggregate', () => {
  const sql = readFileSync(
    join('supabase', 'migrations', '0004_energy_totals_aggregate.sql'),
    'utf8',
  )

  it('defines the aggregate as a function', () => {
    // PostgREST cannot express sum() as a query, which is why this is a
    // function rather than a cleverer query.
    expect(sql).toContain('create or replace function public.energy_totals(')
    expect(sql).toContain('sum(e.consumption_kwh)')
    expect(sql).toContain('sum(e.generation_kwh)')
    expect(sql).toContain('count(*)')
    expect(sql).toContain('min(e.recorded_at)')
    expect(sql).toContain('max(e.recorded_at)')
  })

  it('coalesces an empty sum to zero, matching the previous empty-set response', () => {
    expect(sql).toContain('coalesce(sum(e.consumption_kwh), 0)')
  })

  it('treats a null bound as no bound', () => {
    expect(sql).toContain('(p_from is null or e.recorded_at >= p_from)')
    expect(sql).toContain('(p_to is null or e.recorded_at <= p_to)')
  })

  it('carries no row limit', () => {
    // The defect being fixed. A LIMIT here would reintroduce it. The check
    // strips comments first: the migration discusses the old limit in prose,
    // and prose about a limit is not a limit.
    const executable = sql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
    expect(executable).not.toMatch(/\blimit\b/i)
  })

  it('creates or alters no table', () => {
    expect(sql).not.toMatch(/create\s+table/i)
    expect(sql).not.toMatch(/alter\s+table/i)
    expect(sql).not.toMatch(/drop\s+table/i)
  })

  it('is security invoker so RLS still governs it', () => {
    expect(sql).toContain('security invoker')
    expect(sql).not.toContain('security definer')
  })

  it('pins search_path', () => {
    expect(sql).toContain('set search_path = public, pg_temp')
  })

  it('grants execute to service_role only, revoking the PUBLIC default first', () => {
    expect(sql).toContain(
      'revoke execute on function public.energy_totals(uuid, timestamptz, timestamptz, uuid) from public;',
    )
    expect(sql).toContain(
      'revoke execute on function public.energy_totals(uuid, timestamptz, timestamptz, uuid) from authenticated;',
    )
    expect(sql).toContain(
      'grant execute on function public.energy_totals(uuid, timestamptz, timestamptz, uuid) to service_role;',
    )
  })

  it('grants nothing to anon', () => {
    expect(sql).not.toMatch(/grant[^\n;]*\bto anon\b/i)
  })

  it('reloads the PostgREST schema cache', () => {
    expect(sql).toContain("notify pgrst, 'reload schema'")
  })

  it('mentions no factory-specific domain terms', () => {
    const lowered = sql.toLowerCase()
    for (const term of ['chocolate', 'cocoa', 'conche', 'tempering', 'mould', 'cacao']) {
      expect(lowered).not.toContain(term)
    }
  })
})

/* -------------------------------------------------------------------------- */
/* The optimizer: a complete factory, or a loud refusal                     */
/* -------------------------------------------------------------------------- */

describe('the optimizer problem document', () => {
  const request = (over: Record<string, unknown>) =>
    ({
      objective: { cost: 1 },
      constraints: {},
      created_by: null,
      ...over,
    }) as never

  it('describes every process, past the old 2,000 cap', async () => {
    // THE regression case, and the most consequential one in this phase: the
    // problem document has no field in which to record "this was truncated", so
    // a 1,001-process factory was described to the optimizer as a 1,000-process
    // factory. The resulting schedule would be internally consistent and
    // operationally wrong, which is the hardest kind of defect to notice.
    const mid = (db.prepare('SELECT id FROM machines LIMIT 1').get() as { id: string }).id
    const statement = db.prepare(
      `INSERT INTO processes (id, factory_id, slug, name, duration_minutes, machine_id, metadata, is_active)
       VALUES (?, ?, ?, ?, ?, ?, '{}', 1)`,
    )
    db.transaction(() => {
      for (let i = 0; i < 2_050; i += 1) {
        statement.run(crypto.randomUUID(), factoryId, `zzp-${i}`, `ZP${i}`, 10, mid)
      }
    })()

    const expected = (
      db.prepare('SELECT COUNT(*) n FROM processes WHERE factory_id = ?').get(factoryId) as { n: number }
    ).n
    expect(expected).toBeGreaterThan(2_000)

    const { problem } = await buildProblem(
      factoryId,
      request({ horizon_start: T0, horizon_end: at(1_440) }),
      'phase3-complete',
    )

    expect(problem.processes).toHaveLength(expected)
  })

  it('refuses an oversized horizon instead of sending a partial history', async () => {
    // A truncated energy history is not a smaller problem, it is a wrong one:
    // the optimizer would plan against a factory that appears to have no
    // consumption in the omitted window, and could return a schedule that is
    // cheap precisely because it assumed the missing data.
    //
    // The same bulk window the energy-total case uses — shared rather than
    // re-inserted, because 50,001 rows is the expensive part of this file.
    ensureBulkReadings()

    await expect(
      buildProblem(
        factoryId,
        request({ horizon_start: at(BULK_START), horizon_end: at(BULK_START + BULK_COUNT + 1) }),
        'phase3-oversized',
      ),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('names the offending resource in the refusal, so the caller can act', async () => {
    // A bare "too big" tells the caller nothing about what to narrow.
    await expect(
      buildProblem(
        factoryId,
        request({ horizon_start: at(BULK_START), horizon_end: at(BULK_START + BULK_COUNT + 1) }),
        'phase3-named',
      ),
    ).rejects.toThrow(/energy readings/)
  })
})

/* -------------------------------------------------------------------------- */
/* No hidden limits remain                                                   */
/* -------------------------------------------------------------------------- */

describe('no silent truncation remains in the read paths', () => {
  it('no repository reads a fixed page in place of loading everything', () => {
    // Comments are stripped: both files describe the limits they used to have,
    // and prose about a limit is not a limit.
    const code = (file: string) =>
      readFileSync(join('lib', ...file.split('/')), 'utf8')
        .split('\n')
        .filter((line) => !line.trim().startsWith('*') && !line.trim().startsWith('//'))
        .join('\n')

    const schedules = code('repositories/schedules.ts')
    const energy = code('repositories/energy-data.ts')

    // The schedule loader pages with ENTRY_PAGE_SIZE and stops when the
    // database says it is done; nothing may reintroduce a single big read.
    expect(schedules).not.toMatch(/limit:\s*10_000/)
    expect(energy).not.toMatch(/\.limit\(50_000\)/)
  })

  it('the optimizer states its ceiling rather than truncating quietly', () => {
    const service = readFileSync(join('lib', 'services', 'optimization.ts'), 'utf8')

    // The old per-entity caps.
    expect(service).not.toMatch(/limit:\s*1000\b/)
    expect(service).not.toMatch(/limit:\s*2000\b/)
    expect(service).not.toMatch(/limit:\s*5000\b/)
    expect(service).not.toMatch(/limit:\s*2000\b/)
    expect(service).not.toMatch(/DEFAULT_HISTORY_LIMIT/)

    // The replacement fails loudly instead.
    expect(service).toContain('MAX_ENERGY_INTERVALS')
    expect(service).toContain('drainAll')
  })
})
