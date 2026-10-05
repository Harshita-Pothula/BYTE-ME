/**
 * Shared schema primitives.
 *
 * Two directions matter:
 *   - `*Schema` objects validate INCOMING API payloads (already JS numbers).
 *   - `*Row` objects validate rows coming BACK from Postgres. PostgREST returns
 *     `numeric` as a string and `timestamptz` as an ISO string, so the row
 *     schemas coerce. Every repository validates rows through these.
 */

import { z } from 'zod'

/* -------------------------------------------------------------------------- */
/* JSON                                                                       */
/* -------------------------------------------------------------------------- */

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }
export type JsonObject = { [key: string]: JsonValue }

/** A JSON object (never an array or scalar). */
export const jsonObjectSchema = z
  .record(z.string(), z.unknown())
  .default({})
  .transform((value) => value as JsonObject)

/* -------------------------------------------------------------------------- */
/* Identifiers and slugs                                                      */
/* -------------------------------------------------------------------------- */

export const uuidSchema = z.string().uuid()

/** Lowercase, URL-safe identifier: 2–63 chars. */
export const slugSchema = z
  .string()
  .min(2, 'slug must be at least 2 characters')
  .max(63, 'slug must be at most 63 characters')
  .regex(/^[a-z0-9][a-z0-9_-]*$/, 'slug may only contain lowercase letters, digits, - and _')

/* -------------------------------------------------------------------------- */
/* Numbers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Postgres `numeric` arrives from PostgREST as a string. Coerce to number and
 * fall back to 0 for anything non-finite, since a database CHECK constraint
 * has already guaranteed the value is sane.
 */
export const numericFromDb = z
  .union([z.number(), z.string()])
  .transform((value) => {
    const parsed = typeof value === 'number' ? value : Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  })

/** Accepts a number or a numeric string on input. */
export const numericInput = z.coerce.number()

/* -------------------------------------------------------------------------- */
/* Timestamps                                                                 */
/* -------------------------------------------------------------------------- */

export const timestamptzSchema = z.string().datetime({ offset: true })

/** Postgres `time` serialises as `HH:MM` or `HH:MM:SS`. */
export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'must be a HH:MM[:SS] time')

/* -------------------------------------------------------------------------- */
/* Pagination and sort                                                        */
/* -------------------------------------------------------------------------- */

/** Prevent pathologically deep database offsets from forcing expensive scans. */
export const MAX_PAGINATION_OFFSET = 1_000_000

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(MAX_PAGINATION_OFFSET).default(0),
})

export const sortDirectionSchema = z.enum(['asc', 'desc']).default('desc')

/**
 * A sort expression such as `-created_at` (descending) or `name` (ascending).
 * The leading `-` convention keeps the query string readable.
 */
export const sortSchema = z
  .string()
  .min(1)
  .regex(/^-?[a-z_][a-z0-9_]*$/, 'sort must look like "field" or "-field"')
  .optional()

/** Splits `-created_at` into `{ column: 'created_at', ascending: false }`. */
export function parseSort(
  sort: string | undefined,
  fallback: { column: string; ascending: boolean },
): { column: string; ascending: boolean } {
  if (!sort) return fallback
  const descending = sort.startsWith('-')
  return {
    column: descending ? sort.slice(1) : sort,
    ascending: !descending,
  }
}

/* -------------------------------------------------------------------------- */
/* Shared field helpers                                                       */
/* -------------------------------------------------------------------------- */

/** `factory_id` supplied by a path parameter rather than a body. */
export const factoryIdSchema = uuidSchema