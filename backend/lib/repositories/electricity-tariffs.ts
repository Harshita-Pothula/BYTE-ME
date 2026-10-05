import {
  electricityTariffRowSchema,
  type ElectricityTariffCreate,
  type ElectricityTariffRow,
  type ElectricityTariffUpdate,
} from '../schemas/electricity-tariffs'
import { createScopedRepository, definedFields, jsonColumn } from './create-scoped-repository'
import { client, throwIfError } from './base'
import type { ListParams, ListResult } from './types'
import { applyPagination, validateRow } from './base'

const CREATE_COLUMNS = {
  slug: 'slug',
  name: 'name',
  currency: 'currency',
  start_time: 'start_time',
  end_time: 'end_time',
  days_of_week: 'days_of_week',
  energy_price_per_kwh: 'energy_price_per_kwh',
  demand_charge_per_kw: 'demand_charge_per_kw',
  fixed_charge: 'fixed_charge',
  tax_rate: 'tax_rate',
  effective_from: 'effective_from',
  effective_to: 'effective_to',
  priority: 'priority',
} as const

export const tariffsRepository = createScopedRepository<
  ElectricityTariffRow,
  ElectricityTariffCreate,
  ElectricityTariffUpdate
>({
  table: 'electricity_tariffs',
  resource: 'tariffs',
  rowSchema: electricityTariffRowSchema,
  defaultSortColumn: 'priority',
  defaultSortAscending: false,

  toInsert(_factoryId, input) {
    return {
      ...definedFields(input, CREATE_COLUMNS),
      days_of_week: input.days_of_week ?? null,
      metadata: jsonColumn(input.metadata, {}),
    }
  },

  toUpdate(input) {
    return {
      ...definedFields(input, CREATE_COLUMNS),
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
    }
  },
})

/**
 * Tariffs whose validity window covers `at`, highest `priority` first.
 *
 * The optimizer needs every overlapping window, not just one "current" row,
 * because it plans across a horizon that can span a price change.
 */
export async function listActiveTariffs(
  factoryId: string,
  at: string,
): Promise<ElectricityTariffRow[]> {
  const { data, error } = await client()
    .from('electricity_tariffs')
    .select('*')
    .eq('factory_id', factoryId)
    .or(`effective_from.is.null,effective_from.lte.${at}`)
    .or(`effective_to.is.null,effective_to.gt.${at}`)
    .order('priority', { ascending: false })

  throwIfError(error, 'list active tariffs')

  return (data ?? []).map((row) => validateRow(electricityTariffRowSchema, row, 'electricity_tariffs'))
}

/** All tariffs that could apply at any point inside a horizon. */
export async function listTariffsForHorizon(
  factoryId: string,
  from: string,
  to: string,
): Promise<ElectricityTariffRow[]> {
  const { data, error } = await client()
    .from('electricity_tariffs')
    .select('*')
    .eq('factory_id', factoryId)
    .or(`effective_from.is.null,effective_from.lt.${to}`)
    .or(`effective_to.is.null,effective_to.gt.${from}`)
    .order('priority', { ascending: false })

  throwIfError(error, 'list tariffs for horizon')

  return (data ?? []).map((row) =>
    validateRow(electricityTariffRowSchema, row, 'electricity_tariffs'),
  )
}

/** Plain listing with pagination, used by GET /factories/:id/tariffs. */
export async function listTariffs(
  factoryId: string,
  params: ListParams,
): Promise<ListResult<ElectricityTariffRow>> {
  const query = applyPagination(
    client().from('electricity_tariffs').select('*', { count: 'exact' }).eq('factory_id', factoryId),
    params,
  ).order(params.sortColumn ?? 'priority', { ascending: params.sortAscending ?? false })

  const { data, error, count } = await query

  throwIfError(error, 'list tariffs')
  return {
    rows: (data ?? []).map((row) => validateRow(electricityTariffRowSchema, row, 'electricity_tariffs')),
    total: count ?? null,
  }
}