/**
 * Optimization requests and results repositories.
 *
 * Results are only ever written by something that has actually run the
 * optimizer: either the adapter after a successful solve, or an out-of-band
 * harness that ran the Python service itself. There is no helper that invents
 * a result from the request.
 */

import {
  optimizationRequestRowSchema,
  optimizationResultRowSchema,
  type OptimizationRequestRow,
  type OptimizationRequestUpdate,
  type OptimizationResultCreate,
  type OptimizationResultRow,
  type OptimizationResultUpdate,
} from '../schemas/optimization'
import { applyPagination, client, notFound, throwIfError, validateRow } from './base'
import { createScopedRepository, definedFields, jsonColumn } from './create-scoped-repository'
import type { ListParams, ListResult } from './types'

const REQUEST_COLUMNS = {
  reference: 'reference',
  horizon_start: 'horizon_start',
  horizon_end: 'horizon_end',
  error_message: 'error_message',
  created_by: 'created_by',
  request_payload: 'request_payload',
  adapter_metadata: 'adapter_metadata',
} as const

/**
 * Row to insert for a new request.
 *
 * Distinct from the API body type: the service sets server-owned columns
 * (`status`, `request_payload`, `adapter_metadata`, `error_message`) that a
 * client may not choose.
 */
export interface OptimizationRequestInsert {
  reference: string
  horizon_start: string | null
  horizon_end: string | null
  objective: Record<string, unknown>
  constraints: Record<string, unknown>
  status: string
  created_by: string | null
  error_message: string | null
  adapter_metadata: Record<string, unknown> | null
  request_payload: unknown
}

export const optimizationRequestsRepository = createScopedRepository<
  OptimizationRequestRow,
  OptimizationRequestInsert,
  OptimizationRequestUpdate
>({
  table: 'optimization_requests',
  resource: 'optimization requests',
  rowSchema: optimizationRequestRowSchema,
  defaultSortColumn: 'created_at',
  defaultSortAscending: false,

  toInsert(_factoryId, input) {
    return {
      ...definedFields(input, REQUEST_COLUMNS),
      objective: jsonColumn(input.objective, {}),
      constraints: jsonColumn(input.constraints, {}),
    }
  },

  toUpdate(input) {
    return {
      ...(input.status === undefined ? {} : { status: input.status }),
      ...(input.error_message === undefined ? {} : { error_message: input.error_message }),
      ...(input.adapter_metadata === undefined ? {} : { adapter_metadata: input.adapter_metadata }),
    }
  },
})

/** Persists the exact problem document handed to the optimizer adapter. */
export async function attachRequestPayload(
  factoryId: string,
  requestId: string,
  payload: unknown,
): Promise<OptimizationRequestRow> {
  const { data, error } = await client()
    .from('optimization_requests')
    .update({ request_payload: payload })
    .eq('factory_id', factoryId)
    .eq('id', requestId)
    .select('*')
    .maybeSingle()

  throwIfError(error, 'attach optimizer request payload')
  if (!data) throw notFound('optimization requests', requestId)
  return validateRow(optimizationRequestRowSchema, data, 'optimization_requests')
}

export interface OptimizationRequestFilters {
  status?: string
}

export async function listOptimizationRequests(
  factoryId: string,
  params: ListParams,
  filters: OptimizationRequestFilters = {},
): Promise<ListResult<OptimizationRequestRow>> {
  let query = client()
    .from('optimization_requests')
    .select('*', { count: 'exact' })
    .eq('factory_id', factoryId)

  if (filters.status) query = query.eq('status', filters.status)

  query = applyPagination(query, params).order(
    params.sortColumn ?? 'created_at',
    { ascending: params.sortAscending ?? false },
  )

  const { data, error, count } = await query

  throwIfError(error, 'list optimization requests')
  return {
    rows: (data ?? []).map((row) =>
      validateRow(optimizationRequestRowSchema, row, 'optimization_requests'),
    ),
    total: count ?? null,
  }
}

/* -------------------------------------------------------------------------- */
/* Results                                                                    */
/* -------------------------------------------------------------------------- */

const RESULT_COLUMNS = {
  status: 'status',
  objective_value: 'objective_value',
  total_energy_cost: 'total_energy_cost',
  total_energy_kwh: 'total_energy_kwh',
  peak_demand_kw: 'peak_demand_kw',
} as const

export const optimizationResultsRepository = createScopedRepository<
  OptimizationResultRow,
  OptimizationResultCreate,
  OptimizationResultUpdate
>({
  table: 'optimization_results',
  resource: 'optimization results',
  rowSchema: optimizationResultRowSchema,
  defaultSortColumn: 'created_at',
  defaultSortAscending: false,

  toInsert(_factoryId, input) {
    return {
      optimization_request_id: input.optimization_request_id ?? null,
      ...definedFields(input, RESULT_COLUMNS),
      solution: input.solution ?? null,
      metrics: jsonColumn(input.metrics, {}),
    }
  },

  toUpdate(input) {
    return {
      ...definedFields(input, RESULT_COLUMNS),
      ...(input.solution === undefined ? {} : { solution: input.solution }),
      ...(input.metrics === undefined ? {} : { metrics: input.metrics }),
    }
  },
})

export interface OptimizationResultFilters {
  status?: string
  optimization_request_id?: string
}

export async function listOptimizationResults(
  factoryId: string,
  params: ListParams,
  filters: OptimizationResultFilters = {},
): Promise<ListResult<OptimizationResultRow>> {
  let query = client()
    .from('optimization_results')
    .select('*', { count: 'exact' })
    .eq('factory_id', factoryId)

  if (filters.status) query = query.eq('status', filters.status)
  if (filters.optimization_request_id) {
    query = query.eq('optimization_request_id', filters.optimization_request_id)
  }

  query = applyPagination(query, params).order(
    params.sortColumn ?? 'created_at',
    { ascending: params.sortAscending ?? false },
  )

  const { data, error, count } = await query

  throwIfError(error, 'list optimization results')
  return {
    rows: (data ?? []).map((row) =>
      validateRow(optimizationResultRowSchema, row, 'optimization_results'),
    ),
    total: count ?? null,
  }
}

/** The single result attached to a request, if any. */
export async function getResultForRequest(
  factoryId: string,
  requestId: string,
): Promise<OptimizationResultRow | null> {
  const { data, error } = await client()
    .from('optimization_results')
    .select('*')
    .eq('factory_id', factoryId)
    .eq('optimization_request_id', requestId)
    .maybeSingle()

  throwIfError(error, 'get optimization result for request')
  return data ? validateRow(optimizationResultRowSchema, data, 'optimization_results') : null
}