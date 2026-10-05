import {
  productionOrderRowSchema,
  type ProductionOrderCreate,
  type ProductionOrderRow,
  type ProductionOrderUpdate,
} from '../schemas/production-orders'
import { applyPagination, client, throwIfError, validateRow } from './base'
import { createScopedRepository, definedFields, jsonColumn } from './create-scoped-repository'
import type { ListParams, ListResult } from './types'

const CREATE_COLUMNS = {
  reference: 'reference',
  product: 'product',
  quantity: 'quantity',
  unit: 'unit',
  due_at: 'due_at',
  priority: 'priority',
  status: 'status',
} as const

const UPDATE_COLUMNS = CREATE_COLUMNS

export const productionOrdersRepository = createScopedRepository<
  ProductionOrderRow,
  ProductionOrderCreate,
  ProductionOrderUpdate
>({
  table: 'production_orders',
  resource: 'production orders',
  rowSchema: productionOrderRowSchema,
  defaultSortColumn: 'due_at',
  defaultSortAscending: true,

  toInsert(_factoryId, input) {
    return {
      ...definedFields(input, CREATE_COLUMNS),
      requirements: jsonColumn(input.requirements, {}),
      metadata: jsonColumn(input.metadata, {}),
    }
  },

  toUpdate(input) {
    return {
      ...definedFields(input, UPDATE_COLUMNS),
      ...(input.requirements === undefined ? {} : { requirements: input.requirements }),
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
    }
  },
})

export interface ProductionOrderFilters {
  status?: string
  due_before?: string
  due_after?: string
}

/** List with the deadline window and status filters the API exposes. */
export async function listProductionOrders(
  factoryId: string,
  params: ListParams,
  filters: ProductionOrderFilters = {},
): Promise<ListResult<ProductionOrderRow>> {
  let query = client()
    .from('production_orders')
    .select('*', { count: 'exact' })
    .eq('factory_id', factoryId)

  if (filters.status) query = query.eq('status', filters.status)
  if (filters.due_before) query = query.lte('due_at', filters.due_before)
  if (filters.due_after) query = query.gte('due_at', filters.due_after)

  query = applyPagination(query, params).order(
    params.sortColumn ?? 'due_at',
    { ascending: params.sortAscending ?? true },
  )

  const { data, error, count } = await query

  throwIfError(error, 'list production orders')
  return {
    rows: (data ?? []).map((row) => validateRow(productionOrderRowSchema, row, 'production_orders')),
    total: count ?? null,
  }
}