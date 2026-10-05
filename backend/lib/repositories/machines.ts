import {
  machineRowSchema,
  type MachineCreate,
  type MachineRow,
  type MachineUpdate,
} from '../schemas/machines'
import { applyPagination, client, throwIfError, validateRow } from './base'
import { createScopedRepository, definedFields, jsonColumn } from './create-scoped-repository'
import type { ListParams, ListResult } from './types'

const CREATE_COLUMNS = {
  slug: 'slug',
  name: 'name',
  type: 'type',
  rated_power_kw: 'rated_power_kw',
  min_power_kw: 'min_power_kw',
  max_power_kw: 'max_power_kw',
  min_runtime_minutes: 'min_runtime_minutes',
  max_runtime_minutes: 'max_runtime_minutes',
} as const

const UPDATE_COLUMNS = {
  name: 'name',
  type: 'type',
  rated_power_kw: 'rated_power_kw',
  min_power_kw: 'min_power_kw',
  max_power_kw: 'max_power_kw',
  min_runtime_minutes: 'min_runtime_minutes',
  max_runtime_minutes: 'max_runtime_minutes',
} as const

export const machinesRepository = createScopedRepository<
  MachineRow,
  MachineCreate,
  MachineUpdate
>({
  table: 'machines',
  resource: 'machines',
  rowSchema: machineRowSchema,
  defaultSortColumn: 'name',
  defaultSortAscending: true,

  toInsert(factoryId, input) {
    return {
      ...definedFields(input, CREATE_COLUMNS),
      availability: jsonColumn(input.availability, {}),
      metadata: jsonColumn(input.metadata, {}),
      is_active: input.is_active,
    }
  },

  toUpdate(input) {
    return {
      ...definedFields(input, UPDATE_COLUMNS),
      ...(input.availability === undefined ? {} : { availability: input.availability }),
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
      ...(input.is_active === undefined ? {} : { is_active: input.is_active }),
    }
  },
})

export interface MachineFilters {
  type?: string
  is_active?: boolean
}

/** Lists machines with the optional `type` and `is_active` filters applied. */
export async function listMachines(
  factoryId: string,
  params: ListParams,
  filters: MachineFilters = {},
): Promise<ListResult<MachineRow>> {
  let query = client().from('machines').select('*', { count: 'exact' }).eq('factory_id', factoryId)

  if (filters.type) query = query.eq('type', filters.type)
  if (filters.is_active !== undefined) query = query.eq('is_active', filters.is_active)

  query = applyPagination(query, params).order(
    params.sortColumn ?? 'name',
    { ascending: params.sortAscending ?? true },
  )

  const { data, error, count } = await query

  throwIfError(error, 'list machines')
  return {
    rows: (data ?? []).map((row) => validateRow(machineRowSchema, row, 'machines')),
    total: count ?? null,
  }
}