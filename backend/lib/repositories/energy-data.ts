import {
  energyDataRowSchema,
  type EnergyDataBulkInput,
  type EnergyDataCreate,
  type EnergyDataRow,
  type EnergyDataUpdate,
} from '../schemas/energy-data'
import { applyPagination, client, throwIfError, validateRow } from './base'
import { createScopedRepository, definedFields, jsonColumn } from './create-scoped-repository'
import type { ListParams, ListResult } from './types'

const CREATE_COLUMNS = {
  recorded_at: 'recorded_at',
  interval_minutes: 'interval_minutes',
  consumption_kwh: 'consumption_kwh',
  generation_kwh: 'generation_kwh',
  machine_id: 'machine_id',
  source: 'source',
} as const

const UPDATE_COLUMNS = {
  interval_minutes: 'interval_minutes',
  consumption_kwh: 'consumption_kwh',
  generation_kwh: 'generation_kwh',
  source: 'source',
} as const

export const energyDataRepository = createScopedRepository<
  EnergyDataRow,
  EnergyDataCreate,
  EnergyDataUpdate
>({
  table: 'energy_data',
  resource: 'energy data',
  rowSchema: energyDataRowSchema,
  defaultSortColumn: 'recorded_at',
  defaultSortAscending: false,

  toInsert(_factoryId, input) {
    return {
      ...definedFields(input, CREATE_COLUMNS),
      metadata: jsonColumn(input.metadata, {}),
    }
  },

  toUpdate(input) {
    return {
      ...definedFields(input, UPDATE_COLUMNS),
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
    }
  },
})

export interface EnergyDataFilters {
  from?: string
  to?: string
  machine_id?: string
  source?: string
}

/** Time-window listing. `from`/`to` bound `recorded_at` inclusive. */
export async function listEnergyData(
  factoryId: string,
  params: ListParams,
  filters: EnergyDataFilters = {},
): Promise<ListResult<EnergyDataRow>> {
  let query = client().from('energy_data').select('*', { count: 'exact' }).eq('factory_id', factoryId)

  if (filters.from) query = query.gte('recorded_at', filters.from)
  if (filters.to) query = query.lte('recorded_at', filters.to)
  if (filters.machine_id) query = query.eq('machine_id', filters.machine_id)
  if (filters.source) query = query.eq('source', filters.source)

  query = applyPagination(query, params).order(
    params.sortColumn ?? 'recorded_at',
    { ascending: params.sortAscending ?? false },
  )

  const { data, error, count } = await query

  throwIfError(error, 'list energy data')
  return {
    rows: (data ?? []).map((row) => validateRow(energyDataRowSchema, row, 'energy_data')),
    total: count ?? null,
  }
}

/**
 * Bulk upsert.
 *
 * The unique index is (factory_id, coalesce(machine_id, zero-uuid), recorded_at),
 * so the same meter reading cannot be stored twice. `skip` ignores incoming
 * duplicates, `update` overwrites the stored values.
 */
export async function bulkUpsertEnergyData(
  factoryId: string,
  input: EnergyDataBulkInput,
): Promise<{ inserted: number; rows: EnergyDataRow[] }> {
  const rows = input.intervals.map((interval) => ({
    factory_id: factoryId,
    recorded_at: interval.recorded_at,
    interval_minutes: interval.interval_minutes,
    consumption_kwh: interval.consumption_kwh,
    generation_kwh: interval.generation_kwh,
    machine_id: interval.machine_id ?? null,
    source: interval.source,
    metadata: interval.metadata ?? {},
  }))

  const conflict =
    'factory_id,coalesce(machine_id,\'00000000-0000-0000-0000-000000000000\'::uuid),recorded_at'

  const { data, error } = await client()
    .from('energy_data')
    .upsert(rows, {
      onConflict: conflict,
      ignoreDuplicates: input.on_conflict === 'skip',
    })
    .select('*')

  throwIfError(error, 'bulk upsert energy data')

  const raw = (data ?? []) as unknown[]
  const validated = raw.map((row) => validateRow(energyDataRowSchema, row, 'energy_data'))
  return { inserted: validated.length, rows: validated }
}

/**
 * Consumption/generation totals over a window.
 *
 * These are plain sums of stored measurements, not a schedule or an
 * optimisation outcome.
 *
 * THE SUM RUNS IN THE DATABASE
 * ----------------------------
 * This used to fetch every matching reading into the Node process and total it
 * in a loop, under a hard `limit(50_000)`. That limit was invisible to callers:
 * a factory with 50,001 readings in range reported a total computed from the
 * first 50,000, with `intervals: 50000` presented as though it were the true
 * count. Nothing in the response marked the number as partial.
 *
 * It is now one aggregate call (migration 0004). Three consequences:
 *
 *   - no limit, so nothing can be silently truncated;
 *   - every reading no longer crosses the network to be discarded by a loop;
 *   - `from`/`to` describe the FILTER, via min()/max(). They previously came
 *     from the first and last row of the fetched page, so under truncation they
 *     described the page rather than what the caller asked for.
 *
 * PostgREST cannot express `sum()` as a query, which is why this is a database
 * function rather than a cleverer query — the same reason 0003 needed one.
 */
export async function energyTotals(
  factoryId: string,
  filters: EnergyDataFilters = {},
): Promise<{
  consumption_kwh: number
  generation_kwh: number
  net_kwh: number
  intervals: number
  from: string | null
  to: string | null
}> {
  const { data, error } = await client().rpc('energy_totals', {
    p_factory_id: factoryId,
    p_from: filters.from ?? null,
    p_to: filters.to ?? null,
    p_machine_id: filters.machine_id ?? null,
  })

  throwIfError(error, 'sum energy data')

  const row = (Array.isArray(data) ? data[0] : data) as
    | {
        consumption_kwh?: unknown
        generation_kwh?: unknown
        interval_count?: unknown
        first_recorded_at?: string | null
        last_recorded_at?: string | null
      }
    | null
    | undefined

  // No matching rows: the aggregate still returns one row of zeros with null
  // bounds, which is what the pre-aggregation code returned for an empty set.
  const consumption = Number(row?.consumption_kwh ?? 0)
  const generation = Number(row?.generation_kwh ?? 0)

  return {
    consumption_kwh: consumption,
    generation_kwh: generation,
    net_kwh: consumption - generation,
    intervals: Number(row?.interval_count ?? 0),
    from: row?.first_recorded_at ?? null,
    to: row?.last_recorded_at ?? null,
  }
}

/** Oldest and newest timestamps, used to default an optimization horizon. */
export async function energyTimeWindow(
  factoryId: string,
): Promise<{ from: string | null; to: string | null }> {
  const { data, error } = await client()
    .from('energy_data')
    .select('recorded_at')
    .eq('factory_id', factoryId)
    .order('recorded_at', { ascending: true })
    .limit(1)

  throwIfError(error, 'read energy data window start')

  const first = data?.[0]?.recorded_at ?? null

  const { data: lastRows, error: lastError } = await client()
    .from('energy_data')
    .select('recorded_at')
    .eq('factory_id', factoryId)
    .order('recorded_at', { ascending: false })
    .limit(1)

  throwIfError(lastError, 'read energy data window end')

  return { from: first, to: lastRows?.[0]?.recorded_at ?? null }
}