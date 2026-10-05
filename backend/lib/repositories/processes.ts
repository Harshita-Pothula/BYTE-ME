import {
  processDependencyRowSchema,
  processRowSchema,
  type ProcessCreate,
  type ProcessDependencyCreate,
  type ProcessDependencyRow,
  type ProcessDependencyUpdate,
  type ProcessRow,
  type ProcessUpdate,
  type ProcessWithDependencies,
} from '../schemas/processes'
import { createScopedRepository, definedFields, jsonColumn } from './create-scoped-repository'
import { applyPagination, client, throwIfError, validateRow } from './base'
import type { ListParams, ListResult } from './types'

const CREATE_COLUMNS = {
  slug: 'slug',
  name: 'name',
  description: 'description',
  duration_minutes: 'duration_minutes',
  machine_id: 'machine_id',
  power_requirement_kw: 'power_requirement_kw',
  production_quantity: 'production_quantity',
  unit: 'unit',
} as const

const UPDATE_COLUMNS = {
  name: 'name',
  description: 'description',
  duration_minutes: 'duration_minutes',
  machine_id: 'machine_id',
  power_requirement_kw: 'power_requirement_kw',
  production_quantity: 'production_quantity',
  unit: 'unit',
} as const

export const processesRepository = createScopedRepository<ProcessRow, ProcessCreate, ProcessUpdate>({
  table: 'processes',
  resource: 'processes',
  rowSchema: processRowSchema,
  defaultSortColumn: 'name',
  defaultSortAscending: true,

  toInsert(_factoryId, input) {
    return {
      ...definedFields(input, CREATE_COLUMNS),
      metadata: jsonColumn(input.metadata, {}),
      is_active: input.is_active,
    }
  },

  toUpdate(input) {
    return {
      ...definedFields(input, UPDATE_COLUMNS),
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
      ...(input.is_active === undefined ? {} : { is_active: input.is_active }),
    }
  },
})

/* -------------------------------------------------------------------------- */
/* Filtered listing                                                           */
/* -------------------------------------------------------------------------- */

export interface ProcessFilters {
  machine_id?: string
  is_active?: boolean
}

/** Lists processes with the optional machine and active filters applied. */
export async function listProcesses(
  factoryId: string,
  params: ListParams,
  filters: ProcessFilters = {},
): Promise<ListResult<ProcessRow>> {
  let query = client().from('processes').select('*', { count: 'exact' }).eq('factory_id', factoryId)

  if (filters.machine_id) query = query.eq('machine_id', filters.machine_id)
  if (filters.is_active !== undefined) query = query.eq('is_active', filters.is_active)

  query = applyPagination(query, params).order(
    params.sortColumn ?? 'name',
    { ascending: params.sortAscending ?? true },
  )

  const { data, error, count } = await query

  throwIfError(error, 'list processes')
  return {
    rows: (data ?? []).map((row) => validateRow(processRowSchema, row, 'processes')),
    total: count ?? null,
  }
}

/* -------------------------------------------------------------------------- */
/* Processes with resolved dependencies                                       */
/* -------------------------------------------------------------------------- */

/**
 * Loads dependency edges for a set of process ids, resolved to slugs/names so
 * the optimizer payload and the API response stay readable.
 *
 * Two queries instead of an embed: the supabase-js typed embed cannot express
 * "rows where this id is either side of the edge" in one call.
 */
export async function loadDependencyEdges(
  factoryId: string,
  processIds: string[],
): Promise<{
  dependsOn: Map<string, ProcessWithDependencies['depends_on']>
  blocks: Map<string, ProcessWithDependencies['blocks']>
}> {
  const dependsOn = new Map<string, ProcessWithDependencies['depends_on']>()
  const blocks = new Map<string, ProcessWithDependencies['blocks']>()

  if (processIds.length === 0) return { dependsOn, blocks }

  const { data, error } = await client()
    .from('process_dependencies')
    .select('*')
    .eq('factory_id', factoryId)
    .or(`process_id.in.(${processIds.join(',')}),depends_on_process_id.in.(${processIds.join(',')})`)

  throwIfError(error, 'list process dependencies')

  const edges = (data ?? []).map((row) =>
    validateRow(processDependencyRowSchema, row, 'process_dependencies'),
  )

  if (edges.length === 0) return { dependsOn, blocks }

  // Resolve every referenced process id to a display name in one round trip.
  const referencedIds = [...new Set(edges.flatMap((e) => [e.process_id, e.depends_on_process_id]))]
  const { data: processRows, error: processError } = await client()
    .from('processes')
    .select('id, slug, name')
    .eq('factory_id', factoryId)
    .in('id', referencedIds)

  throwIfError(processError, 'resolve dependency processes')

  const lookup = new Map<string, { slug: string; name: string }>()
  for (const row of processRows ?? []) {
    lookup.set(row.id as string, { slug: row.slug as string, name: row.name as string })
  }

  for (const edge of edges) {
    const upstream = lookup.get(edge.depends_on_process_id)
    const downstream = lookup.get(edge.process_id)

    if (upstream) {
      const list = dependsOn.get(edge.process_id) ?? []
      list.push({
        id: edge.depends_on_process_id,
        slug: upstream.slug,
        name: upstream.name,
        dependency_type: edge.dependency_type,
        lag_minutes: edge.lag_minutes,
      })
      dependsOn.set(edge.process_id, list)
    }

    if (downstream) {
      const list = blocks.get(edge.depends_on_process_id) ?? []
      list.push({ id: edge.process_id, slug: downstream.slug, name: downstream.name })
      blocks.set(edge.depends_on_process_id, list)
    }
  }

  return { dependsOn, blocks }
}

/** Attaches `depends_on` / `blocks` to a batch of processes. */
export async function withDependencies(
  factoryId: string,
  rows: ProcessRow[],
): Promise<ProcessWithDependencies[]> {
  const { dependsOn, blocks } = await loadDependencyEdges(
    factoryId,
    rows.map((row) => row.id),
  )

  return rows.map((row) => ({
    ...row,
    depends_on: dependsOn.get(row.id) ?? [],
    blocks: blocks.get(row.id) ?? [],
  }))
}

/* -------------------------------------------------------------------------- */
/* Dependency repository                                                      */
/* -------------------------------------------------------------------------- */

const DEPENDENCY_COLUMNS = {
  depends_on_process_id: 'depends_on_process_id',
  dependency_type: 'dependency_type',
  lag_minutes: 'lag_minutes',
} as const

export const processDependenciesRepository = createScopedRepository<
  ProcessDependencyRow,
  ProcessDependencyCreate,
  ProcessDependencyUpdate
>({
  table: 'process_dependencies',
  resource: 'process dependencies',
  rowSchema: processDependencyRowSchema,
  defaultSortColumn: 'created_at',
  defaultSortAscending: true,

  toInsert(_factoryId, input) {
    return {
      process_id: input.process_id,
      depends_on_process_id: input.depends_on_process_id,
      dependency_type: input.dependency_type,
      lag_minutes: input.lag_minutes,
      metadata: jsonColumn(input.metadata, {}),
    }
  },

  toUpdate(input) {
    return {
      ...definedFields(input, DEPENDENCY_COLUMNS),
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
    }
  },
})

/** Bulk insert for loading a whole process graph in one call. */
export async function bulkCreateDependencies(
  factoryId: string,
  inputs: ProcessDependencyCreate[],
): Promise<ProcessDependencyRow[]> {
  if (inputs.length === 0) return []

  const rows = inputs.map((input) => ({
    factory_id: factoryId,
    process_id: input.process_id,
    depends_on_process_id: input.depends_on_process_id,
    dependency_type: input.dependency_type,
    lag_minutes: input.lag_minutes,
    metadata: input.metadata ?? {},
  }))

  const { data, error } = await client().from('process_dependencies').insert(rows).select('*')

  throwIfError(error, 'bulk create process dependencies')
  return (data ?? []).map((row) => validateRow(processDependencyRowSchema, row, 'process_dependencies'))
}

/** True when the edge already exists for this process pair. */
export async function dependencyExists(
  factoryId: string,
  processId: string,
  dependsOnProcessId: string,
): Promise<boolean> {
  const { data, error } = await client()
    .from('process_dependencies')
    .select('id')
    .eq('factory_id', factoryId)
    .eq('process_id', processId)
    .eq('depends_on_process_id', dependsOnProcessId)
    .maybeSingle()

  throwIfError(error, 'check process dependency')
  return data !== null
}