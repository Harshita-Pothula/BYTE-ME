/**
 * Factories repository.
 *
 * Factories are the only table not nested under a factory scope, so this
 * repository owns the global list/filter/sort behaviour plus the `config`
 * merge semantics used by PATCH /factories/:id/config.
 */

import { parseSort } from '../schemas/common'
import {
  factoryRowSchema,
  type FactoryCreate,
  type FactoryRow,
  type FactoryUpdate,
} from '../schemas/factories'
import type { ListParams, ListResult } from './types'
import { applyPagination, client, notFound, throwIfError, validateRow } from './base'

const TABLE = 'factories'

const DEFAULT_SORT = { column: 'created_at', ascending: false }

export interface FactoryListFilters {
  is_active?: boolean
  /**
   * Restricts the result to these factory ids.
   *
   * Used by `GET /api/v1/factories` to scope the list to the factories the
   * authenticated caller actually owns, so the collection route cannot be used
   * to enumerate every factory in the database.
   */
  ids?: string[]
}

export const factoriesRepository = {
  async list(
    params: ListParams,
    filters: FactoryListFilters = {},
  ): Promise<ListResult<FactoryRow>> {
    const sort = parseSort(
      params.sortColumn ? `${params.sortAscending ? '' : '-'}${params.sortColumn}` : undefined,
      DEFAULT_SORT,
    )

    // An empty id list is answered without touching the database: an `in.()`
    // with no values is not portable across PostgREST and the offline adapter,
    // and there is provably nothing to return.
    if (filters.ids && filters.ids.length === 0) {
      return { rows: [], total: 0 }
    }

    let query = client().from(TABLE).select('*', { count: 'exact' })

    if (filters.is_active !== undefined) {
      query = query.eq('is_active', filters.is_active)
    }

    if (filters.ids) {
      query = query.in('id', filters.ids)
    }

    query = applyPagination(query, params)

    const { data, error, count } = await query.order(sort.column, { ascending: sort.ascending })

    throwIfError(error, 'list factories')
    return {
      rows: (data ?? []).map((row) => validateRow(factoryRowSchema, row, TABLE)),
      total: count ?? null,
    }
  },

  async getById(id: string): Promise<FactoryRow | null> {
    const { data, error } = await client().from(TABLE).select('*').eq('id', id).maybeSingle()
    throwIfError(error, 'get factory')
    return data ? validateRow(factoryRowSchema, data, TABLE) : null
  },

  async getBySlug(slug: string): Promise<FactoryRow | null> {
    const { data, error } = await client().from(TABLE).select('*').eq('slug', slug).maybeSingle()
    throwIfError(error, 'get factory by slug')
    return data ? validateRow(factoryRowSchema, data, TABLE) : null
  },

  async create(input: FactoryCreate): Promise<FactoryRow> {
    const { data, error } = await client()
      .from(TABLE)
      .insert({
        slug: input.slug,
        name: input.name,
        description: input.description ?? null,
        timezone: input.timezone,
        currency: input.currency,
        config: input.config ?? {},
        metadata: input.metadata ?? {},
        is_active: input.is_active,
      })
      .select('*')
      .single()

    throwIfError(error, 'create factory')
    return validateRow(factoryRowSchema, data, TABLE)
  },

  async update(id: string, input: FactoryUpdate): Promise<FactoryRow> {
    const patch: Record<string, unknown> = {}
    if (input.name !== undefined) patch.name = input.name
    if (input.description !== undefined) patch.description = input.description
    if (input.timezone !== undefined) patch.timezone = input.timezone
    if (input.currency !== undefined) patch.currency = input.currency
    if (input.is_active !== undefined) patch.is_active = input.is_active

    const { data, error } = await client()
      .from(TABLE)
      .update(patch)
      .eq('id', id)
      .select('*')
      .maybeSingle()

    throwIfError(error, 'update factory')
    if (!data) throw notFound('factories', id)
    return validateRow(factoryRowSchema, data, TABLE)
  },

  /**
   * Shallow-merges `config`.
   *
   * Keys present in `patch` replace the stored value. Keys explicitly set to
   * `null` are deleted. Keys absent from `patch` are left untouched, so two
   * clients editing different keys do not clobber each other.
   */
  async patchConfig(id: string, patch: Record<string, unknown>): Promise<FactoryRow> {
    const current = await this.getById(id)
    if (!current) throw notFound('factories', id)

    const next: Record<string, unknown> = { ...current.config }
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) delete next[key]
      else next[key] = value
    }

    const { data, error } = await client()
      .from(TABLE)
      .update({ config: next })
      .eq('id', id)
      .select('*')
      .maybeSingle()

    throwIfError(error, 'update factory config')
    if (!data) throw notFound('factories', id)
    return validateRow(factoryRowSchema, data, TABLE)
  },

  /** Replaces `config` wholesale. */
  async replaceConfig(id: string, config: Record<string, unknown>): Promise<FactoryRow> {
    const { data, error } = await client()
      .from(TABLE)
      .update({ config })
      .eq('id', id)
      .select('*')
      .maybeSingle()

    throwIfError(error, 'replace factory config')
    if (!data) throw notFound('factories', id)
    return validateRow(factoryRowSchema, data, TABLE)
  },

  async remove(id: string): Promise<void> {
    const { data, error } = await client()
      .from(TABLE)
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle()

    throwIfError(error, 'delete factory')
    if (!data) throw notFound('factories', id)
  },

  async exists(id: string): Promise<boolean> {
    const { count, error } = await client()
      .from(TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('id', id)

    throwIfError(error, 'check factory')
    return (count ?? 0) > 0
  },
}