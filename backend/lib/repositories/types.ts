/**
 * Shared repository types.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { z } from 'zod'

/** A factory-scoped Supabase client. Every query is filtered by `factory_id`. */
export type ServiceClient = SupabaseClient

export interface ListParams {
  limit: number
  offset: number
  sortColumn?: string
  sortAscending?: boolean
}

export interface ListResult<T> {
  rows: T[]
  total: number | null
}

export type RowSchema<TSchema extends z.ZodTypeAny> = TSchema

/**
 * A factory-scoped repository.
 *
 * Implementations must validate every row they return against the entity's row
 * schema, so a schema drift shows up as a clear validation error rather than a
 * silently malformed API response.
 */
export interface ScopedRepository<
  TRow,
  TCreate extends object,
  TUpdate extends object,
> {
  list(factoryId: string, params: ListParams): Promise<ListResult<TRow>>
  getById(factoryId: string, id: string): Promise<TRow | null>
  getBySlug(factoryId: string, slug: string): Promise<TRow | null>
  create(factoryId: string, input: TCreate): Promise<TRow>
  update(factoryId: string, id: string, input: TUpdate): Promise<TRow>
  remove(factoryId: string, id: string): Promise<void>
  count(factoryId: string): Promise<number>
}