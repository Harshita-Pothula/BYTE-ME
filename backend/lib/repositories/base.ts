/**
 * Helpers shared by every repository.
 *
 * The rule enforced here: rows read from Postgres are validated against their
 * entity's row schema before they leave the repository. A schema drift then
 * surfaces as a validation error rather than as malformed JSON to a client.
 */

import { z } from 'zod'
import { InternalError, NotFoundError } from '../errors'
import { mapDatabaseError, type DatabaseError } from '../http'
import { getServiceClient } from '../supabase'
import { createOfflineClient } from '../offline/adapter'
import { isOfflineMode } from '../offline/mode'
import type { ListParams, ListResult, ServiceClient } from './types'

/**
 * Returns the database client for the active backend.
 *
 * BACKEND SWITCHING
 * -----------------
 * This function is the single seam. Every repository obtains its connection
 * here and then chains PostgREST calls, so selecting a backend in one place is
 * enough: no repository, service, route or response format is aware of which
 * database it is talking to.
 *
 *   BYTEME_OFFLINE_MODE=false (default) -> Supabase service-role client,
 *     exactly as before. This is the primary, online path.
 *
 *   BYTEME_OFFLINE_MODE=true -> a SQLite adapter implementing the same
 *     chainable surface (see lib/offline/adapter.ts), so the same repository
 *     code runs unchanged against a local file. No network access is involved.
 *
 * The return type is deliberately loose. supabase-js returns a distinct builder
 * class per table and the offline adapter is a third implementation, so the
 * shared surface is structural rather than nominal. The build in `applyPagination`
 * below documents the chainable methods actually used.
 */
export function client(): ServiceClient {
  if (isOfflineMode()) {
    return createOfflineClient() as unknown as ServiceClient
  }
  return getServiceClient()
}

/** True when the offline SQLite backend is active. */
export function isOffline(): boolean {
  return isOfflineMode()
}

/** Parses a repository row, converting failures into a 500 with detail. */
export function validateRow<S extends z.ZodTypeAny>(
  schema: S,
  data: unknown,
  table: string,
): z.infer<S> {
  const result = schema.safeParse(data)
  if (result.success) return result.data

  throw new InternalError(`Row from '${table}' does not match the expected schema`, {
    table,
    issues: result.error.issues.map((issue) => ({
      path: issue.path.join('.') || '(root)',
      message: issue.message,
      code: issue.code,
    })),
  })
}

/** Throws the mapped error when a Supabase query returned an error. */
export function throwIfError(error: DatabaseError | null, context: string): void {
  if (error) throw mapDatabaseError(error, context)
}

/**
 * Normalises a `{ data, error, count }` response.
 *
 * `count` stays `null` when the query did not ask for one, which the HTTP layer
 * reports as "total unknown" rather than inventing a count.
 */
export function toListResult<S extends z.ZodTypeAny>(
  payload: {
    data: unknown
    error: DatabaseError | null
    count: number | null
  },
  schema: S,
  table: string,
  context: string,
): ListResult<z.infer<S>> {
  throwIfError(payload.error, context)

  const raw = (payload.data ?? []) as unknown[]
  const rows = raw.map((row) => validateRow(schema, row, table))
  return { rows, total: payload.count }
}

/** Rejects an empty update payload before it reaches the database. */
export function assertNonEmptyUpdate(input: object, resource: string): void {
  if (Object.keys(input).length === 0) {
    throw new InternalError(`Refusing to issue an empty update for ${resource}`)
  }
}

/**
 * Applies `limit`/`range` to a query builder.
 *
 * Typed generically because each backend returns a distinct builder class and
 * none of them satisfies a `Record<string, unknown>` constraint. The chainable
 * surface used here (`limit`, `range`, `order`) is implemented identically by
 * both backends.
 */
export function applyPagination<T>(
  query: T,
  params: Pick<ListParams, 'limit' | 'offset' | 'sortColumn' | 'sortAscending'>,
): T {
  const builder = query as unknown as {
    limit: (n: number) => unknown
    range: (from: number, to: number) => unknown
    order: (column: string, options: { ascending: boolean }) => unknown
  }

  const windowed = (builder.limit(params.limit) as {
    range: (from: number, to: number) => {
      order: (column: string, options: { ascending: boolean }) => unknown
    }
  }).range(params.offset, params.offset + params.limit - 1)

  if (params.sortColumn) {
    return windowed.order(params.sortColumn, { ascending: params.sortAscending ?? false }) as T
  }

  return windowed as unknown as T
}

/** Fetches a single row or reports which resource was missing. */
export async function fetchOneOrNotFound<Row>(
  promise: PromiseLike<{ data: unknown; error: DatabaseError | null }>,
  table: string,
  context: string,
): Promise<Row | null> {
  const { data, error } = await promise
  throwIfError(error, context)
  return (data ?? null) as Row | null
}

/** Throws a 404 with the right resource label. */
export function notFound(table: string, id: string): NotFoundError {
  return new NotFoundError(table.replace(/^public\./, ''), id)
}