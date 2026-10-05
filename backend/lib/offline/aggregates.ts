/**
 * Offline implementation of the database-side aggregates.
 *
 * Migration 0004 adds `energy_totals` to Postgres because PostgREST cannot
 * express `SELECT sum(x)` as a query — aggregates have always required a
 * database function. The repository therefore reaches this through the same
 * `rpc(...)` seam `replace_schedule_entries` uses (migration 0003).
 *
 * The difference this removes: the old code fetched every matching reading into
 * Node to sum it there, under a hard 50,000-row limit. Past that limit the
 * total was silently computed from a partial set while `intervals` reported the
 * partial count as if it were the whole. Here the sum, the count and the
 * bounds are computed by SQLite over the filtered set, so there is no page to
 * run out of and no limit to be silently truncated at.
 *
 * `min`/`max` are deliberately taken over the FILTERED rows rather than over a
 * fetched page, so `from`/`to` describe the filter the caller asked for.
 */

import type { SqliteDatabase } from './db'
import { getDb } from './db'

export interface OfflineAggregateResult {
  data: unknown
  error: { code: string; message: string; details: string | null; hint: string | null } | null
  count: number | null
}

export interface EnergyTotalsRow {
  consumption_kwh: number
  generation_kwh: number
  interval_count: number
  first_recorded_at: string | null
  last_recorded_at: string | null
}

/**
 * Sums measured energy data in the database.
 *
 * Always returns exactly one row, even when nothing matched — Postgres
 * `select sum(...) from <empty>` does the same, so the repository sees an
 * identical shape on both backends and never has to special-case the empty
 * result. `sum()` of no rows is null in both engines, hence the coalesce.
 *
 * `count(*)` is deliberate: it is the number of readings that actually
 * contributed to the sums, which is what makes truncation detectable by a
 * caller instead of something they have to know about.
 */
export function energyTotals(
  db: SqliteDatabase,
  factoryId: string,
  from?: string | null,
  to?: string | null,
  machineId?: string | null,
): OfflineAggregateResult {
  const clauses = ['factory_id = ?']
  const params: unknown[] = [factoryId]

  // A null bound means "no bound", matching the SQL's `(p_from is null or ...)`
  // rather than filtering on null.
  if (from) {
    clauses.push('recorded_at >= ?')
    params.push(from)
  }
  if (to) {
    clauses.push('recorded_at <= ?')
    params.push(to)
  }
  if (machineId) {
    clauses.push('machine_id = ?')
    params.push(machineId)
  }

  try {
    const row = db
      .prepare(
        `SELECT
           coalesce(sum(consumption_kwh), 0) AS consumption_kwh,
           coalesce(sum(generation_kwh), 0)  AS generation_kwh,
           count(*)                          AS interval_count,
           min(recorded_at)                  AS first_recorded_at,
           max(recorded_at)                  AS last_recorded_at
         FROM energy_data
         WHERE ${clauses.join(' AND ')}`,
      )
      .get(...params) as Omit<EnergyTotalsRow, 'interval_count'> & { interval_count: number }

    const totals: EnergyTotalsRow = {
      consumption_kwh: Number(row.consumption_kwh ?? 0),
      generation_kwh: Number(row.generation_kwh ?? 0),
      interval_count: Number(row.interval_count ?? 0),
      first_recorded_at: row.first_recorded_at ?? null,
      last_recorded_at: row.last_recorded_at ?? null,
    }

    return { data: totals, error: null, count: 1 }
  } catch (error) {
    return {
      data: null,
      error: {
        code: 'P0001',
        message: String((error as Error)?.message ?? error),
        details: null,
        hint: null,
      },
      count: null,
    }
  }
}

/**
 * Dispatches an aggregate RPC to its offline implementation.
 *
 * Mirrors PostgREST's `/rest/v1/rpc/<name>`. An unknown name is an error
 * rather than a silent no-op, so a typo cannot look like a result.
 */
export function offlineAggregateRpc(
  name: string,
  args: {
    p_factory_id?: unknown
    p_from?: unknown
    p_to?: unknown
    p_machine_id?: unknown
  } = {},
  db: SqliteDatabase = getDb(),
): OfflineAggregateResult {
  const factoryId = typeof args.p_factory_id === 'string' ? args.p_factory_id : ''

  if (name === 'energy_totals') {
    return energyTotals(
      db,
      factoryId,
      typeof args.p_from === 'string' ? args.p_from : null,
      typeof args.p_to === 'string' ? args.p_to : null,
      typeof args.p_machine_id === 'string' ? args.p_machine_id : null,
    )
  }

  return {
    data: null,
    error: {
      code: 'PGRST202',
      message: `offline: no aggregate RPC named '${name}'`,
      details: null,
      hint: 'Implement it in lib/offline/aggregates.ts.',
    },
    count: null,
  }
}
