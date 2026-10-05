/**
 * Consistent HTTP responses and route-handler plumbing.
 *
 * Every successful response uses the same envelope:
 *   { "data": <payload>, "meta"?: {...} }
 * Every failure response uses:
 *   { "error": { "code": "...", "message": "...", "details"?: {...} } }
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  AppError,
  ConflictError,
  InternalError,
  ValidationError,
  isAppError,
} from './errors'

/* -------------------------------------------------------------------------- */
/* Success envelopes                                                          */
/* -------------------------------------------------------------------------- */

export interface SuccessMeta {
  /** Total rows matching the filter, when the query supports an exact count. */
  total?: number
  limit?: number
  offset?: number
  [key: string]: unknown
}

export interface SuccessBody<T> {
  data: T
  meta?: SuccessMeta
}

/** 200 OK. */
export function ok<T>(data: T, meta?: SuccessMeta): NextResponse<SuccessBody<T>> {
  return NextResponse.json(meta ? { data, meta } : { data })
}

/** 201 Created, with an optional `Location` header. */
export function created<T>(
  data: T,
  options: { location?: string; meta?: SuccessMeta } = {},
): NextResponse<SuccessBody<T>> {
  const body = options.meta ? { data, meta: options.meta } : { data }
  const headers: Record<string, string> = {}
  if (options.location) headers.Location = options.location
  return NextResponse.json(body, { status: 201, headers })
}

/** 202 Accepted — used when work is queued rather than completed inline. */
export function accepted<T>(data: T, meta?: SuccessMeta): NextResponse<SuccessBody<T>> {
  return NextResponse.json(meta ? { data, meta } : { data }, { status: 202 })
}

/* -------------------------------------------------------------------------- */
/* Error envelope                                                             */
/* -------------------------------------------------------------------------- */

export interface ErrorBody {
  error: {
    code: string
    message: string
    details?: unknown
  }
}

/** Hard cap for API JSON bodies; every route parser uses this before schema validation. */
export const MAX_JSON_BODY_BYTES = 5 * 1024 * 1024
export const MAX_QUERY_STRING_BYTES = 8 * 1024
export const MAX_QUERY_PARAMETERS = 64
const MAX_JSON_NESTING_DEPTH = 64

/**
 * Serialises an error into the standard failure envelope.
 *
 * Unexpected errors are collapsed to a generic 500 so internal messages and
 * stack traces never leak to a client.
 */
export function errorResponse(error: unknown): NextResponse<ErrorBody> {
  if (isAppError(error)) {
    const body: ErrorBody = {
      error: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      },
    }
    return NextResponse.json(body, { status: error.status })
  }

  if (error instanceof z.ZodError) {
    return NextResponse.json<ErrorBody>(
      {
        error: {
          code: 'validation_error',
          message: 'Request validation failed',
          details: { issues: formatZodIssues(error) },
        },
      },
      { status: 400 },
    )
  }

  return NextResponse.json<ErrorBody>(
    {
      error: {
        code: 'internal_error',
        message: 'Internal server error',
      },
    },
    { status: 500 },
  )
}

/** Flattens a ZodError into `{ path, message, code }` records. */
export function formatZodIssues(error: z.ZodError): Array<{
  path: string
  message: string
  code: string
}> {
  return error.issues.map((issue) => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message,
    code: issue.code,
  }))
}

/* -------------------------------------------------------------------------- */
/* Handler wrapper                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Wraps a route handler so thrown errors become proper JSON responses.
 *
 * Usage:
 *   export const GET = withErrorHandling(async (req: NextRequest) => ok(await ...))
 */
export function withErrorHandling<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse>,
): (...args: Args) => Promise<NextResponse> {
  return async (...args: Args) => {
    try {
      return await handler(...args)
    } catch (error) {
      return errorResponse(error)
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Request parsing                                                            */
/* -------------------------------------------------------------------------- */

/** Shared shape for `?limit=` and `?offset=`. */
export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export type Pagination = z.infer<typeof paginationSchema>

/**
 * Parses a JSON request body with a Zod schema.
 *
 * A malformed or empty body becomes a 400 rather than a 500.
 */
export async function parseBody<T extends z.ZodTypeAny>(
  request: Request,
  schema: T,
): Promise<z.infer<T>> {
  return parseWithSchema(schema, await parseJsonBody(request))
}

/** Reads JSON without buffering an unbounded request body. */
export async function parseJsonBody(request: Request): Promise<unknown> {
  const declaredLength = request.headers.get('content-length')
  if (declaredLength && /^\d+$/.test(declaredLength) && Number(declaredLength) > MAX_JSON_BODY_BYTES) {
    throw oversizedJsonBodyError()
  }

  if (!request.body) throw new ValidationError('Request body must be valid JSON')

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue

      totalBytes += value.byteLength
      if (totalBytes > MAX_JSON_BODY_BYTES) {
        try {
          void reader.cancel().catch(() => undefined)
        } catch {
          // The size limit already determined the response; cancellation is best-effort.
        }
        throw oversizedJsonBodyError()
      }
      chunks.push(value)
    }
  } catch (error) {
    if (error instanceof ValidationError) throw error
    throw new ValidationError('Request body must be valid JSON')
  } finally {
    reader.releaseLock()
  }

  const bytes = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }

  let raw: unknown
  try {
    raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown
  } catch {
    throw new ValidationError('Request body must be valid JSON')
  }

  assertJsonNestingDepth(raw)
  return raw
}

function oversizedJsonBodyError(): ValidationError {
  return new ValidationError('Request body exceeds the maximum allowed size', {
    max_bytes: MAX_JSON_BODY_BYTES,
  })
}

function assertJsonNestingDepth(value: unknown): void {
  const pending: Array<{ values: Iterator<unknown>; depth: number }> = []
  let current: { value: unknown; depth: number } | undefined = { value, depth: 0 }

  while (current || pending.length > 0) {
    if (current && current.depth > MAX_JSON_NESTING_DEPTH) {
      throw new ValidationError('Request JSON exceeds the maximum nesting depth', {
        max_depth: MAX_JSON_NESTING_DEPTH,
      })
    }

    if (current && typeof current.value === 'object' && current.value !== null) {
      pending.push({ values: jsonChildren(current.value)[Symbol.iterator](), depth: current.depth + 1 })
    }

    current = undefined
    while (pending.length > 0) {
      const frame = pending[pending.length - 1]
      const next = frame?.values.next()
      if (!frame || !next || next.done) {
        pending.pop()
        continue
      }
      current = { value: next.value, depth: frame.depth }
      break
    }
  }
}

function* jsonChildren(value: object): Generator<unknown> {
  if (Array.isArray(value)) {
    yield* value
    return
  }

  const record = value as Record<string, unknown>
  for (const key in record) {
    if (Object.prototype.hasOwnProperty.call(record, key)) yield record[key]
  }
}

/** Validates an already-decoded value, converting failures to a 400. */
export function parseWithSchema<T extends z.ZodTypeAny>(schema: T, raw: unknown): z.infer<T> {
  const result = schema.safeParse(raw)
  if (!result.success) {
    throw new ValidationError('Request validation failed', { issues: formatZodIssues(result.error) })
  }
  return result.data
}

/** Parses `searchParams` against a schema, coercing single strings. */
export function parseSearchParams<T extends z.ZodTypeAny>(
  searchParams: URLSearchParams,
  schema: T,
): z.infer<T> {
  const queryBytes = new TextEncoder().encode(searchParams.toString()).byteLength
  if (queryBytes > MAX_QUERY_STRING_BYTES) {
    throw new ValidationError('Query string exceeds the maximum allowed size', {
      max_bytes: MAX_QUERY_STRING_BYTES,
    })
  }

  const raw: Record<string, string> = {}
  let parameterCount = 0
  searchParams.forEach((value, key) => {
    parameterCount += 1
    if (parameterCount > MAX_QUERY_PARAMETERS) {
      throw new ValidationError('Query string contains too many parameters', {
        max_parameters: MAX_QUERY_PARAMETERS,
      })
    }
    raw[key] = value
  })
  return parseWithSchema(schema, raw)
}

/** Parses a path parameter (`:id`) as a UUID. */
export function parseUuidParam(value: string | undefined, name = 'id'): string {
  const result = z.string().uuid().safeParse(value)
  if (!result.success) {
    throw new ValidationError(`Path parameter '${name}' must be a valid UUID`, {
      issues: [{ path: name, message: 'must be a valid UUID', code: 'invalid_string' }],
    })
  }
  return result.data
}

/* -------------------------------------------------------------------------- */
/* Supabase error mapping                                                     */
/* -------------------------------------------------------------------------- */

/** Minimal shape of the PostgREST error object we depend on. */
export interface DatabaseError {
  code?: string
  message?: string
  details?: string | null
  hint?: string | null
}

/**
 * Converts a Supabase/PostgREST failure into the right `AppError`.
 *
 * Constraint violations surface as 409/400 with the database constraint name,
 * which makes debugging a bad payload straightforward from the client.
 */
export function mapDatabaseError(error: DatabaseError, context?: string): AppError {
  const prefix = context ? `${context}: ` : ''
  // Postgres `details` and `hint` can contain conflicting values or SQL
  // fragments. Keep responses useful through the stable error code and
  // operation context, but never return those raw server diagnostics.

  switch (error.code) {
    case '23505':
      return new ConflictError(`${prefix}violates a unique constraint`)
    case '23503':
      return new ValidationError(`${prefix}references a record that does not exist`)
    case '23502':
      return new ValidationError(`${prefix}a required field was missing`)
    case '23514':
      return new ValidationError(`${prefix}violates a check constraint`)
    case '22P02':
      return new ValidationError(`${prefix}contains an invalid value for a typed column`)
    default:
      return new InternalError(`${prefix}database request failed`, {
        code: error.code ?? null,
      })
  }
}