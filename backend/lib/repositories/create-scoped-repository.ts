/**
 * Generic factory-scoped repository builder.
 *
 * Every factory-owned table has the same lifecycle: list with pagination and
 * sorting, fetch by id or slug, create, patch, delete, count. Rather than
 * repeat that eight times, this builder parameterises it and each entity
 * repository supplies only its table name, schemas, and the two places where
 * behaviour genuinely differs: how a create payload is mapped to a row, and
 * the default sort column.
 */

import { z } from 'zod'
import { ValidationError } from '../errors'
import { applyPagination, client, notFound, throwIfError, validateRow } from './base'
import type { ListParams, ListResult, ScopedRepository } from './types'

export interface ScopedRepositoryOptions<
  TRow,
  TCreate extends object,
  TUpdate extends object,
> {
  table: string
  /**
   * Row schema. Typed as `ZodType<TRow, _, any>` because row schemas coerce
   * Postgres `numeric` strings, so their declared input differs from their
   * output. Callers get `TRow`, which is the parsed shape.
   */
  rowSchema: z.ZodType<TRow, z.ZodTypeDef, any>
  /** Extra equality filters applied to every list query. */
  defaultFilters?: (query: ReturnType<ReturnType<typeof client>['from']>, factoryId: string) => never
  defaultSortColumn?: string
  defaultSortAscending?: boolean
  /** Maps a validated create payload onto the table's column names. */
  toInsert: (factoryId: string, input: TCreate) => Record<string, unknown>
  /** Maps a validated patch payload onto the table's column names. */
  toUpdate: (input: TUpdate) => Record<string, unknown>
  /** Human-readable resource name used in 404 messages. */
  resource: string
}

/**
 * Builds a repository for a `factory_id`-scoped table.
 *
 * @param options table name, schemas, and column mappings.
 */
export function createScopedRepository<
  TRow,
  TCreate extends object,
  TUpdate extends object,
>(options: ScopedRepositoryOptions<TRow, TCreate, TUpdate>): ScopedRepository<TRow, TCreate, TUpdate> {
  const {
    table,
    rowSchema,
    defaultSortColumn = 'created_at',
    defaultSortAscending = false,
    toInsert,
    toUpdate,
    resource,
  } = options

  async function fetchSingle(
    factoryId: string,
    id: string,
    context: string,
  ): Promise<TRow | null> {
    const { data, error } = await client()
      .from(table)
      .select('*')
      .eq('factory_id', factoryId)
      .eq('id', id)
      .maybeSingle()

    throwIfError(error, context)
    return data ? validateRow(rowSchema, data, table) : null
  }

  return {
    async list(factoryId: string, params: ListParams): Promise<ListResult<TRow>> {
      const sortColumn = params.sortColumn ?? defaultSortColumn
      const sortAscending = params.sortAscending ?? defaultSortAscending

      const query = applyPagination(
        client().from(table).select('*', { count: 'exact' }).eq('factory_id', factoryId),
        params,
      ).order(sortColumn, { ascending: sortAscending })

      const { data, error, count } = await query

      throwIfError(error, `list ${resource}`)
      const raw = (data ?? []) as unknown[]
      return {
        rows: raw.map((row) => validateRow(rowSchema, row, table)),
        total: count ?? null,
      }
    },

    async getById(factoryId: string, id: string): Promise<TRow | null> {
      return fetchSingle(factoryId, id, `get ${resource}`)
    },

    async getBySlug(factoryId: string, slug: string): Promise<TRow | null> {
      const { data, error } = await client()
        .from(table)
        .select('*')
        .eq('factory_id', factoryId)
        .eq('slug', slug)
        .maybeSingle()

      throwIfError(error, `get ${resource} by slug`)
      return data ? validateRow(rowSchema, data, table) : null
    },

    async create(factoryId: string, input: TCreate): Promise<TRow> {
      const row = { ...toInsert(factoryId, input), factory_id: factoryId }

      const { data, error } = await client()
        .from(table)
        .insert(row)
        .select('*')
        .single()

      throwIfError(error, `create ${resource}`)
      return validateRow(rowSchema, data, table)
    },

    async update(factoryId: string, id: string, input: TUpdate): Promise<TRow> {
      const patch = toUpdate(input)

      // An empty patch is a client mistake, not a no-op write.
      if (Object.keys(patch).length === 0) {
        throw new ValidationError(
          `Provide at least one field to update on ${resource}`,
          { received: Object.keys(input as object) },
        )
      }

      const { data, error } = await client()
        .from(table)
        .update(patch)
        .eq('factory_id', factoryId)
        .eq('id', id)
        .select('*')
        .maybeSingle()

      throwIfError(error, `update ${resource}`)
      if (!data) throw notFound(resource, id)
      return validateRow(rowSchema, data, table)
    },

    async remove(factoryId: string, id: string): Promise<void> {
      const { data, error } = await client()
        .from(table)
        .delete()
        .eq('factory_id', factoryId)
        .eq('id', id)
        .select('id')
        .maybeSingle()

      throwIfError(error, `delete ${resource}`)
      if (!data) throw notFound(resource, id)
    },

    async count(factoryId: string): Promise<number> {
      const { count, error } = await client()
        .from(table)
        .select('id', { count: 'exact', head: true })
        .eq('factory_id', factoryId)

      throwIfError(error, `count ${resource}`)
      return count ?? 0
    },
  }
}

/**
 * Copies only the keys that were actually provided, mapping `undefined` to
 * "leave alone". `null` is preserved, because clearing a nullable column is a
 * meaningful write.
 */
export function definedFields<T extends object>(
  input: T,
  mapping: Partial<Record<keyof T, string>>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {}

  // `mapping` is a partial record keyed by T's property names; casting the
  // entry list to string keys keeps the loop simple for the generic case.
  const entries = Object.entries(mapping as Record<string, string | undefined>)

  for (const [key, column] of entries) {
    if (!column) continue
    const value = (input as Record<string, unknown>)[key]
    if (value === undefined) continue
    patch[column] = value
  }

  return patch
}

/** Normalises an optional JSON column: absent stays absent, null clears. */
export function jsonColumn(value: unknown, fallback: Record<string, unknown>): Record<string, unknown> {
  return value === undefined ? fallback : (value as Record<string, unknown>)
}