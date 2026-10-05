/**
 * Typed application errors.
 *
 * Every error carries an HTTP status and a stable machine-readable `code`, so
 * route handlers can translate failures into consistent JSON without knowing
 * anything about Supabase or the optimizer.
 */

export interface AppErrorOptions {
  code: string
  status: number
  message: string
  details?: unknown
  cause?: unknown
}

/** Base class for every error the API deliberately surfaces to a client. */
export class AppError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: unknown

  constructor(options: AppErrorOptions) {
    super(options.message, { cause: options.cause })
    this.name = new.target.name
    this.status = options.status
    this.code = options.code
    this.details = options.details
  }
}

/** 400 — the request body, query, or params failed validation. */
export class ValidationError extends AppError {
  constructor(message = 'Request validation failed', details?: unknown) {
    super({ code: 'validation_error', status: 400, message, details })
  }
}

/**
 * 401 — the request carried no usable credential.
 *
 * `details` may carry a short machine-readable `reason` (for example
 * `missing_token` or `jwt_expired`). It must never carry the token itself, any
 * part of it, or any value from the environment.
 */
export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required', details?: unknown) {
    super({ code: 'unauthorized', status: 401, message, details })
  }
}

/** 403 — authenticated but not allowed. */
export class ForbiddenError extends AppError {
  constructor(message = 'Not permitted', details?: unknown) {
    super({ code: 'forbidden', status: 403, message, details })
  }
}

/** 404 — the addressed resource does not exist. */
export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super({
      code: 'not_found',
      status: 404,
      message: id ? `${resource} '${id}' was not found` : `${resource} was not found`,
      details: { resource, ...(id ? { id } : {}) },
    })
  }
}

/** 409 — the write conflicts with existing state (duplicate slug, etc.). */
export class ConflictError extends AppError {
  constructor(message = 'Resource conflict', details?: unknown) {
    super({ code: 'conflict', status: 409, message, details })
  }
}

/**
 * 503 — a dependency the request needs is not configured or not reachable.
 *
 * This is what the optimization endpoints return while the Python/OR-Tools
 * optimizer contract is still unknown. ByteMe never substitutes a fabricated
 * schedule for a missing optimizer.
 */
export class ServiceUnavailableError extends AppError {
  constructor(message: string, details?: unknown) {
    super({ code: 'service_unavailable', status: 503, message, details })
  }
}

/** 502 — an upstream dependency answered, but with something unusable. */
export class UpstreamError extends AppError {
  constructor(message: string, details?: unknown) {
    super({ code: 'upstream_error', status: 502, message, details })
  }
}

/** 500 — a genuine bug or an unmapped database failure. */
export class InternalError extends AppError {
  constructor(message = 'Internal server error', details?: unknown, cause?: unknown) {
    super({ code: 'internal_error', status: 500, message, details, cause })
  }
}

/**
 * 500 — the server is not configured correctly.
 *
 * Distinct from `ValidationError` (400) on purpose: a missing environment
 * variable is the operator's problem, not the caller's, and reporting it as
 * 400 tells a client its request was malformed when it was perfectly fine.
 */
export class ConfigurationError extends AppError {
  constructor(message = 'The server is not configured correctly', details?: unknown) {
    super({ code: 'configuration_error', status: 500, message, details })
  }
}

/** True when `value` is one of our deliberate, client-facing errors. */
export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError
}