/**
 * Verifies the response contract: one success envelope, one error envelope,
 * and correct HTTP status codes. Clients depend on these shapes being stable.
 */

import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  accepted,
  created,
  errorResponse,
  formatZodIssues,
  mapDatabaseError,
  ok,
  parseUuidParam,
  parseWithSchema,
  withErrorHandling,
} from '@/lib/http'
import {
  ConflictError,
  NotFoundError,
  ServiceUnavailableError,
  ValidationError,
} from '@/lib/errors'

describe('success envelopes', () => {
  it('wraps data without meta when none is supplied', async () => {
    const response = ok({ id: 1 })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: { id: 1 } })
  })

  it('includes meta when supplied', async () => {
    const response = ok([1, 2], { total: 42, limit: 2, offset: 0 })

    expect(await response.json()).toEqual({
      data: [1, 2],
      meta: { total: 42, limit: 2, offset: 0 },
    })
  })

  it('answers 201 with a Location header on create', async () => {
    const response = created({ id: 'abc' }, { location: '/api/v1/factories/abc' })

    expect(response.status).toBe(201)
    expect(response.headers.get('Location')).toBe('/api/v1/factories/abc')
  })

  it('answers 202 for queued work', async () => {
    expect(accepted({ queued: true }).status).toBe(202)
  })
})

describe('error envelopes', () => {
  it('renders a 404 with the resource and id in details', async () => {
    const response = errorResponse(new NotFoundError('Machine', 'abc'))

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      error: {
        code: 'not_found',
        message: "Machine 'abc' was not found",
        details: { resource: 'Machine', id: 'abc' },
      },
    })
  })

  it('renders a 503 for an unconfigured optimizer', async () => {
    const response = errorResponse(
      new ServiceUnavailableError('Optimizer not configured', { reason: 'no base url' }),
    )

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      error: {
        code: 'service_unavailable',
        message: 'Optimizer not configured',
        details: { reason: 'no base url' },
      },
    })
  })

  it('renders a 400 for a validation error with the issue list', async () => {
    const response = errorResponse(
      new ValidationError('Request validation failed', {
        issues: [{ path: 'name', message: 'required', code: 'invalid_type' }],
      }),
    )

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.code).toBe('validation_error')
    expect(body.error.details.issues).toHaveLength(1)
  })

  it('collapses an unexpected error to a generic 500 without leaking details', async () => {
    const response = errorResponse(new Error('connection string leaked here'))

    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body.error.code).toBe('internal_error')
    expect(JSON.stringify(body)).not.toMatch(/connection string/)
  })

  it('handles a bare ZodError as a 400', async () => {
    const result = z.object({ a: z.string() }).safeParse({})
    if (result.success) throw new Error('expected failure')

    const response = errorResponse(result.error)

    expect(response.status).toBe(400)
    expect((await response.json()).error.code).toBe('validation_error')
  })

  it('flattens zod issues with a readable path', () => {
    const result = z.object({ nested: z.object({ field: z.number() }) }).safeParse({
      nested: { field: 'nope' },
    })
    if (result.success) throw new Error('expected failure')

    const issues = formatZodIssues(result.error)
    expect(issues[0]?.path).toBe('nested.field')
    expect(issues[0]?.code).toBe('invalid_type')
  })
})

describe('withErrorHandling', () => {
  it('passes a successful response through unchanged', async () => {
    const handler = withErrorHandling(async () => ok({ fine: true }))
    const response = await handler()

    expect(response.status).toBe(200)
  })

  it('converts a thrown AppError into its status', async () => {
    const handler = withErrorHandling(async () => {
      throw new ConflictError('slug already exists')
    })

    const response = await handler()
    expect(response.status).toBe(409)
  })

  it('converts an unknown throw into a 500', async () => {
    const handler = withErrorHandling(async () => {
      throw new TypeError('undefined is not a function')
    })

    const response = await handler()
    expect(response.status).toBe(500)
  })
})

describe('request parsing', () => {
  it('converts a Zod failure into a 400 ValidationError with issues', () => {
    const schema = z.object({ name: z.string().min(1) })

    try {
      parseWithSchema(schema, { name: '' })
      expect.unreachable('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError)
      const details = (error as ValidationError).details as { issues: unknown[] }
      expect(details.issues.length).toBeGreaterThan(0)
    }
  })

  it('accepts a valid UUID path parameter', () => {
    const id = '11111111-1111-4111-8111-111111111111'
    expect(parseUuidParam(id, 'factoryId')).toBe(id)
  })

  it('rejects a malformed UUID path parameter with a 400', () => {
    expect(() => parseUuidParam('not-a-uuid', 'factoryId')).toThrow(ValidationError)
  })

  it('rejects an undefined path parameter', () => {
    expect(() => parseUuidParam(undefined, 'factoryId')).toThrow(ValidationError)
  })
})

describe('PostgREST error mapping', () => {
  it('maps a unique violation to 409 without reflecting database details', () => {
    const error = mapDatabaseError({
      code: '23505',
      message: 'duplicate key for private-slug',
      details: 'Key (slug)=(private-slug) already exists',
      hint: 'internal SQL hint',
    })

    expect(error.status).toBe(409)
    expect(error.code).toBe('conflict')
    expect(error.details).toBeUndefined()
    expect(JSON.stringify(error)).not.toContain('private-slug')
    expect(JSON.stringify(error)).not.toContain('internal SQL hint')
  })

  it('maps a foreign key violation to 400', () => {
    expect(mapDatabaseError({ code: '23503' }).status).toBe(400)
  })

  it('maps a not-null violation to 400', () => {
    expect(mapDatabaseError({ code: '23502', details: 'name' }).status).toBe(400)
  })

  it('maps a check-constraint violation to 400 without exposing database diagnostics', () => {
    const error = mapDatabaseError({
      code: '23514',
      details: 'private row value violated machines_power_bounds_ordered',
      hint: 'internal check expression',
    })
    expect(error.status).toBe(400)
    expect(JSON.stringify(error)).not.toContain('private row value')
    expect(JSON.stringify(error)).not.toContain('internal check expression')
  })

  it('maps an unknown database error to 500', () => {
    const error = mapDatabaseError({ code: '08006', message: 'connection failure' })

    expect(error.status).toBe(500)
    expect(error.code).toBe('internal_error')
  })

  it('prefixes messages with the operation context', () => {
    const error = mapDatabaseError({ code: '23505' }, 'create machine')
    expect(error.message).toMatch(/^create machine: /)
  })
})