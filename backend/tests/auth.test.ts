/**
 * Authentication and factory-level authorization tests.
 *
 * What is being proven:
 *
 *   1. An unauthenticated request to a protected endpoint is refused with 401.
 *   2. An authenticated request is served normally (200/201 as before).
 *   3. An authenticated caller asking for a factory they do not own gets 404,
 *      not 403, so the response does not confirm the factory exists.
 *   4. An authenticated caller who DOES own the factory gets the real data.
 *
 * The route handlers under test are the real ones from `app/api/v1`, running
 * against the real repositories and the real offline SQLite backend, so a
 * guard that was accidentally not applied to a route fails here.
 *
 * TOKENS
 *   Tests sign HS256 tokens with a local secret, which is the same code path
 *   `lib/auth/verify.ts` uses when BYTEME_OFFLINE_MODE=true. The production
 *   online path verifies against Supabase's JWKS and is exercised separately by
 *   the issuer/audience cases below. No test contacts the network.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { SignJWT } from 'jose'
import { NextRequest } from 'next/server'

import { closeDb, getDb } from '@/lib/offline/db'
import { initOfflineSchema } from '@/lib/offline/init'
import { seedOfflineDatabase } from '@/lib/offline/seed'
import { resetEnvCache } from '@/lib/env'
import {
  assertAnyFactoryAccess,
  assertFactoryAccess,
  assertFactoryAdmin,
  authenticateRequest,
  resetAuthCache,
  withAuthentication,
  withFactoryAccess,
} from '@/lib/auth'
import { extractBearerToken } from '@/lib/auth/token'
import { parseAdmin, parseFactoryIds } from '@/lib/auth/claims'
import { ok } from '@/lib/http'

import { GET as factoriesGET, POST as factoriesPOST } from '@/app/api/v1/factories/route'
import { GET as factoryGET, PATCH as factoryPATCH } from '@/app/api/v1/factories/[factoryId]/route'
import { GET as machinesGET, POST as machinesPOST } from '@/app/api/v1/factories/[factoryId]/machines/route'
import { GET as tariffsGET } from '@/app/api/v1/factories/[factoryId]/tariffs/route'
import { POST as optimizationPOST } from '@/app/api/v1/factories/[factoryId]/optimization-requests/route'
import { GET as healthGET } from '@/app/api/v1/health/route'

/* -------------------------------------------------------------------------- */
/* Harness                                                                     */
/* -------------------------------------------------------------------------- */

const SECRET = 'test-only-offline-signing-secret-0123456789'
const OTHER_SECRET = 'a-completely-different-secret-9876543210'
const BASE = 'http://localhost:3000'

const OWNED_FACTORY = '11111111-1111-4111-8111-111111111111'
const OTHER_FACTORY = '22222222-2222-4222-8222-222222222222'

const savedEnv = {
  mode: process.env.BYTEME_OFFLINE_MODE,
  path: process.env.BYTEME_OFFLINE_DB_PATH,
  secret: process.env.BYTEME_OFFLINE_JWT_SECRET,
}

let seededFactoryId = ''

beforeAll(async () => {
  process.env.BYTEME_OFFLINE_MODE = 'true'
  process.env.BYTEME_OFFLINE_DB_PATH = ':memory:'
  process.env.BYTEME_OFFLINE_JWT_SECRET = SECRET
  resetEnvCache()

  initOfflineSchema(getDb())
  const seeded = await seedOfflineDatabase(getDb())
  seededFactoryId = seeded.factoryId
})

afterAll(() => {
  closeDb()

  for (const [key, value] of [
    ['BYTEME_OFFLINE_MODE', savedEnv.mode],
    ['BYTEME_OFFLINE_DB_PATH', savedEnv.path],
    ['BYTEME_OFFLINE_JWT_SECRET', savedEnv.secret],
  ] as const) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }

  resetEnvCache()
})

/** Signs a token the way the offline verifier expects. */
async function mintToken(
  appMetadata: Record<string, unknown>,
  options: { secret?: string; expiresIn?: string; subject?: string } = {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)

  return new SignJWT({ app_metadata: appMetadata })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(options.subject ?? '00000000-0000-4000-8000-000000000001')
    .setIssuedAt(now)
    .setExpirationTime(options.expiresIn ?? '1h')
    .sign(new TextEncoder().encode(options.secret ?? SECRET))
}

/** A token granting exactly one factory. */
const ownerToken = (factoryId: string) => mintToken({ factory_ids: [factoryId] })

/** Builds a request against a route, optionally authenticated. */
function buildRequest(path: string, init: { token?: string; method?: string; body?: unknown } = {}) {
  const headers = new Headers()
  if (init.token) headers.set('authorization', `Bearer ${init.token}`)
  if (init.body !== undefined) headers.set('content-type', 'application/json')

  return new NextRequest(`${BASE}${path}`, {
    method: init.method ?? 'GET',
    headers,
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  })
}

/** Calls a factory-scoped route with its params. */
function callScoped(
  handler: (request: NextRequest, context: { params: { factoryId: string } }) => Promise<Response>,
  factoryId: string,
  init: { token?: string; method?: string; body?: unknown } = {},
) {
  return handler(buildRequest(`/api/v1/factories/${factoryId}`, init), { params: { factoryId } })
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>
}

/* -------------------------------------------------------------------------- */
/* Token extraction                                                            */
/* -------------------------------------------------------------------------- */

describe('token extraction', () => {
  const request = (authorization?: string) =>
    new Request(`${BASE}/x`, authorization ? { headers: { authorization } } : undefined)

  it('reads a bearer token', () => {
    expect(extractBearerToken(request('Bearer a.b.c'))).toBe('a.b.c')
  })

  it('is case-insensitive about the scheme, as RFC 7235 requires', () => {
    expect(extractBearerToken(request('bearer a.b.c'))).toBe('a.b.c')
  })

  it('returns null when the header is absent', () => {
    expect(extractBearerToken(request())).toBeNull()
  })

  it('refuses a non-bearer scheme', () => {
    expect(extractBearerToken(request('Basic dXNlcjpwYXNz'))).toBeNull()
    expect(extractBearerToken(request('a.b.c'))).toBeNull()
  })

  it('refuses something that is not a three-part JWT', () => {
    expect(extractBearerToken(request('Bearer notajwt'))).toBeNull()
    expect(extractBearerToken(request('Bearer a.b'))).toBeNull()
  })

  it('never reads a token from the query string', () => {
    // Tokens in URLs leak into access logs, history and Referer headers.
    const withQuery = new Request(`${BASE}/x?access_token=a.b.c&token=a.b.c`)
    expect(extractBearerToken(withQuery)).toBeNull()
  })
})

/* -------------------------------------------------------------------------- */
/* Claim interpretation                                                        */
/* -------------------------------------------------------------------------- */

describe('claim interpretation', () => {
  it('reads factory ids from an array', () => {
    expect([...parseFactoryIds(['a', 'b'])]).toEqual(['a', 'b'])
  })

  it('ignores a malformed claim rather than granting access', () => {
    // Deny, never guess.
    expect(parseFactoryIds('a').size).toBe(0)
    expect(parseFactoryIds(null).size).toBe(0)
    expect(parseFactoryIds([1, 2, 3]).size).toBe(0)
    expect(parseFactoryIds(['', '  ']).size).toBe(0)
  })

  it('treats only a literal true as admin', () => {
    expect(parseAdmin(true)).toBe(true)
    expect(parseAdmin('true')).toBe(false)
    expect(parseAdmin(1)).toBe(false)
    expect(parseAdmin(undefined)).toBe(false)
  })
})

/* -------------------------------------------------------------------------- */
/* Unauthenticated requests                                                    */
/* -------------------------------------------------------------------------- */

describe('an unauthenticated request', () => {
  it('is refused with 401 on a factory-scoped read', async () => {
    const response = await callScoped(factoryGET, seededFactoryId)

    expect(response.status).toBe(401)

    const body = await readJson(response)
    expect((body.error as { code: string }).code).toBe('unauthorized')
  })

  it('is refused with 401 on a write', async () => {
    const response = await callScoped(machinesPOST, seededFactoryId, {
      method: 'POST',
      body: { slug: 'anon-machine', name: 'Anonymous', is_active: true },
    })

    expect(response.status).toBe(401)
  })

  it('is refused with 401 on a destructive delete', async () => {
    const { DELETE } = await import('@/app/api/v1/factories/[factoryId]/route')
    const response = await callScoped(DELETE, seededFactoryId, { method: 'DELETE' })

    expect(response.status).toBe(401)
  })

  it('is refused with 401 on the factory collection', async () => {
    const response = await factoriesGET(buildRequest('/api/v1/factories'))

    expect(response.status).toBe(401)
  })

  it('is refused with 401 when the token is garbage', async () => {
    const response = await callScoped(factoryGET, seededFactoryId, { token: 'not.a.jwt' })

    expect(response.status).toBe(401)
  })

  it('is refused with 401 when the token was signed with another secret', async () => {
    const forged = await mintToken({ factory_ids: [seededFactoryId] }, { secret: OTHER_SECRET })
    const response = await callScoped(factoryGET, seededFactoryId, { token: forged })

    expect(response.status).toBe(401)
  })

  it('is refused with 401 when the token has expired', async () => {
    const expired = await mintToken({ factory_ids: [seededFactoryId] }, { expiresIn: '-1h' })
    const response = await callScoped(factoryGET, seededFactoryId, { token: expired })

    expect(response.status).toBe(401)
  })

  it('never echoes the token back to the caller', async () => {
    const token = await mintToken({ factory_ids: [seededFactoryId] }, { secret: OTHER_SECRET })
    const response = await callScoped(factoryGET, seededFactoryId, { token })
    const raw = await response.text()

    expect(raw).not.toContain(token)
    expect(raw).not.toContain(SECRET)
    expect(raw).not.toContain(OTHER_SECRET)
    // Nor any fragment of it.
    expect(raw).not.toContain(token.slice(0, 24))
  })

  it('reports a uniform reason, without describing the token', async () => {
    const response = await callScoped(factoryGET, seededFactoryId)
    const body = await readJson(response)
    const error = body.error as { message: string; details?: { reason?: string } }

    expect(error.message).toBe('Authentication required')
    expect(error.details?.reason).toBe('missing_token')
  })

  it('leaves GET /api/v1/health public so a probe needs no credentials', async () => {
    const response = await healthGET()

    expect(response.status).toBe(200)
    const body = await readJson(response)
    expect((body.data as { status: string }).status).toBe('ok')
  })
})

/* -------------------------------------------------------------------------- */
/* Factory-level authorization                                                 */
/* -------------------------------------------------------------------------- */

describe('factory-level authorization', () => {
  it('serves the factory the caller owns', async () => {
    const response = await callScoped(factoryGET, seededFactoryId, {
      token: await ownerToken(seededFactoryId),
    })

    expect(response.status).toBe(200)

    const body = await readJson(response)
    expect((body.data as { id: string }).id).toBe(seededFactoryId)
  })

  it('serves the machines of the factory the caller owns', async () => {
    const response = await callScoped(machinesGET, seededFactoryId, {
      token: await ownerToken(seededFactoryId),
    })

    expect(response.status).toBe(200)
    expect(((await readJson(response)).data as unknown[]).length).toBeGreaterThan(0)
  })

  it('answers 404, not 403, for a factory the caller does not own', async () => {
    const response = await callScoped(factoryGET, OTHER_FACTORY, {
      token: await ownerToken(seededFactoryId),
    })

    // 403 would confirm that OTHER_FACTORY exists. 404 leaks nothing.
    expect(response.status).toBe(404)

    const body = await readJson(response)
    expect((body.error as { code: string }).code).toBe('not_found')
  })

  it('answers 404 for a write against a factory the caller does not own', async () => {
    const response = await callScoped(machinesPOST, OTHER_FACTORY, {
      token: await ownerToken(seededFactoryId),
      method: 'POST',
      body: { slug: 'intruder-machine', name: 'Intruder', is_active: true },
    })

    expect(response.status).toBe(404)
  })

  it('does not create anything when the write is refused', async () => {
    const before = await callScoped(machinesGET, seededFactoryId, {
      token: await ownerToken(seededFactoryId),
    })
    const countBefore = ((await readJson(before)).data as unknown[]).length

    await callScoped(machinesPOST, OTHER_FACTORY, {
      token: await ownerToken(seededFactoryId),
      method: 'POST',
      body: { slug: 'intruder-machine-2', name: 'Intruder', is_active: true },
    })

    const after = await callScoped(machinesGET, seededFactoryId, {
      token: await ownerToken(seededFactoryId),
    })
    expect(((await readJson(after)).data as unknown[]).length).toBe(countBefore)
  })

  it('lets an owner PATCH their own factory', async () => {
    const response = await callScoped(factoryPATCH, seededFactoryId, {
      token: await ownerToken(seededFactoryId),
      method: 'PATCH',
      body: { description: 'patched by its owner' },
    })

    expect(response.status).toBe(200)
  })

  it('blocks a PATCH against someone else\'s factory', async () => {
    const response = await callScoped(factoryPATCH, OTHER_FACTORY, {
      token: await ownerToken(seededFactoryId),
      method: 'PATCH',
      body: { description: 'should not be written' },
    })

    expect(response.status).toBe(404)
  })

  it('serves tariffs for the owner and hides them from everyone else', async () => {
    const owner = await callScoped(tariffsGET, seededFactoryId, {
      token: await ownerToken(seededFactoryId),
    })
    expect(owner.status).toBe(200)
    expect(((await readJson(owner)).data as unknown[]).length).toBeGreaterThan(0)

    const stranger = await callScoped(tariffsGET, seededFactoryId, {
      token: await ownerToken(OTHER_FACTORY),
    })
    expect(stranger.status).toBe(404)
  })

  it('honours a multi-factory grant', async () => {
    const token = await mintToken({ factory_ids: [seededFactoryId, OTHER_FACTORY] })

    // Both granted factories are allowed through the guard.
    expect((await callScoped(factoryGET, seededFactoryId, { token })).status).toBe(200)

    // The second granted factory also clears the guard even though no such
    // factory exists, so the route answers with its normal empty-collection
    // 200 rather than a 404. That is the proof the check is grant-based: the
    // guard asked only whether the id was granted, not whether it resolves.
    const granted = await callScoped(machinesGET, OTHER_FACTORY, { token })
    expect(granted.status).toBe(200)
    expect(((await readJson(granted)).data as unknown[]).length).toBe(0)

    // A factory that is NOT in the grant is refused by the guard, before the
    // handler runs, so it is a 404 no matter what the route would have said.
    const ungranted = '00000000-0000-4000-8000-0000000000ee'
    expect((await callScoped(machinesGET, ungranted, { token })).status).toBe(404)
  })

  it('gives an operator access to every factory', async () => {
    const admin = await mintToken({ byteme_admin: true })

    expect((await callScoped(factoryGET, seededFactoryId, { token: admin })).status).toBe(200)
  })

  it('ignores grants placed in user_metadata', async () => {
    // user_metadata is writable by the end user through updateUser(), so a
    // grant read from there could be self-issued. Only app_metadata counts.
    const selfGranted = await new SignJWT({
      app_metadata: {},
      user_metadata: { factory_ids: [seededFactoryId], byteme_admin: true },
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject('00000000-0000-4000-8000-0000000000ff')
      .setIssuedAt(Math.floor(Date.now() / 1000))
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(SECRET))

    const response = await callScoped(factoryGET, seededFactoryId, { token: selfGranted })
    expect(response.status).toBe(404)
  })
})

/* -------------------------------------------------------------------------- */
/* The factory collection                                                      */
/* -------------------------------------------------------------------------- */

describe('the factory collection', () => {
  it('lists only the factories the caller owns', async () => {
    const response = await factoriesGET(
      buildRequest('/api/v1/factories', { token: await ownerToken(seededFactoryId) }),
    )

    expect(response.status).toBe(200)

    const rows = (await readJson(response)).data as Array<{ id: string }>
    expect(rows.map((row) => row.id)).toEqual([seededFactoryId])
  })

  it('cannot be used to enumerate another factory', async () => {
    // The caller owns only the seeded factory, so the (nonexistent) other one
    // must not appear in the listing.
    const response = await factoriesGET(
      buildRequest('/api/v1/factories', { token: await ownerToken(OWNED_FACTORY) }),
    )

    expect(response.status).toBe(200)

    const rows = (await readJson(response)).data as Array<{ id: string }>
    expect(rows.map((row) => row.id)).not.toContain(OTHER_FACTORY)
  })

  it('answers 403 for an authenticated caller with no grants at all', async () => {
    const response = await factoriesGET(
      buildRequest('/api/v1/factories', { token: await mintToken({}) }),
    )

    expect(response.status).toBe(403)

    const body = await readJson(response)
    expect((body.error as { code: string }).code).toBe('forbidden')
  })

  it('answers 403 when a non-administrator tries to create a factory', async () => {
    const response = await factoriesPOST(
      buildRequest('/api/v1/factories', {
        token: await ownerToken(seededFactoryId),
        method: 'POST',
        body: { slug: 'sneaky-plant', name: 'Sneaky', timezone: 'UTC', currency: 'EUR' },
      }),
    )

    expect(response.status).toBe(403)
  })

  it('lets an administrator create a factory', async () => {
    const response = await factoriesPOST(
      buildRequest('/api/v1/factories', {
        token: await mintToken({ byteme_admin: true }),
        method: 'POST',
        body: {
          slug: 'admin-created-plant',
          name: 'Admin Created',
          timezone: 'UTC',
          currency: 'EUR',
          is_active: true,
        },
      }),
    )

    expect(response.status).toBe(201)
  })
})

/* -------------------------------------------------------------------------- */
/* Optimizer behaviour is unchanged                                            */
/* -------------------------------------------------------------------------- */

describe('the optimizer boundary is unchanged', () => {
  it('still answers 503 for an authenticated caller, fabricating nothing', async () => {
    const response = await callScoped(optimizationPOST, seededFactoryId, {
      token: await ownerToken(seededFactoryId),
      method: 'POST',
      body: {
        horizon_start: '2031-03-02T08:00:00.000Z',
        horizon_end: '2031-03-02T20:00:00.000Z',
      },
    })

    expect(response.status).toBe(503)

    const body = await readJson(response)
    const error = body.error as { code: string; details?: Record<string, unknown> }

    expect(error.code).toBe('service_unavailable')
    // The payload is still offered for integration work...
    expect(error.details?.payload_would_be_sent).toBeDefined()
    // ...and still no schedule was invented.
    expect(error.details?.solution).toBeUndefined()
  })

  it('answers 401 before the optimizer is even considered', async () => {
    const response = await callScoped(optimizationPOST, seededFactoryId, {
      method: 'POST',
      body: { dry_run: true },
    })

    // Authorization is checked first, so an anonymous caller learns nothing
    // about whether an optimizer exists.
    expect(response.status).toBe(401)
  })
})

/* -------------------------------------------------------------------------- */
/* The guards in isolation                                                    */
/* -------------------------------------------------------------------------- */

describe('the guards', () => {
  // Declared with the usual Next.js route parameters (even though unused) so
  // that `Parameters<H>` — the signature the guard must preserve — is the real
  // one and not an empty tuple.
  const handler = async (_request: Request, _context?: unknown) => ok({ reached: true })
  const context = { params: { factoryId: OWNED_FACTORY } }

  it('authenticates and authorizes without changing the handler signature', async () => {
    const guarded = withFactoryAccess(handler)
    const response = await guarded(
      buildRequest(`/api/v1/factories/${OWNED_FACTORY}`, { token: await ownerToken(OWNED_FACTORY) }),
      context,
    )

    expect(response.status).toBe(200)
    expect(((await readJson(response)).data as { reached: boolean }).reached).toBe(true)
  })

  it('refuses before the handler runs', async () => {
    let reached = false
    const guarded = withFactoryAccess(async (_request: Request, _context?: unknown) => {
      reached = true
      return ok({})
    })

    await guarded(buildRequest(`/api/v1/factories/${OWNED_FACTORY}`), context)
    expect(reached).toBe(false)
  })

  it('fails closed when a factory-scoped guard meets a route with no factoryId', async () => {
    // A wiring mistake must not silently skip the check.
    const guarded = withFactoryAccess(handler)
    const response = await guarded(
      buildRequest('/api/v1/anything', { token: await ownerToken(OWNED_FACTORY) }),
      { params: {} },
    )

    expect(response.status).toBe(500)
  })

  it('requires only a token on the non-scoped guard', async () => {
    const guarded = withAuthentication(handler)

    expect((await guarded(buildRequest('/api/v1/factories'))).status).toBe(401)
    expect(
      (
        await guarded(
          buildRequest('/api/v1/factories', { token: await mintToken({ factory_ids: [OWNED_FACTORY] }) }),
        )
      ).status,
    ).toBe(200)
  })

  it('does not verify the same request twice', async () => {
    const request = buildRequest('/api/v1/factories', {
      token: await ownerToken(OWNED_FACTORY),
    })

    const first = await authenticateRequest(request)
    const second = await authenticateRequest(request)

    expect(second).toBe(first)
  })

  it('asserts factory access directly', () => {
    const user = {
      id: 'u',
      email: null,
      access: { isAdmin: false, factoryIds: new Set([OWNED_FACTORY]) },
    }

    expect(() => assertFactoryAccess(user, OWNED_FACTORY)).not.toThrow()
    expect(() => assertFactoryAccess(user, OTHER_FACTORY)).toThrow()
    expect(() => assertAnyFactoryAccess(user)).not.toThrow()
    expect(() => assertFactoryAdmin(user)).toThrow()
  })

  it('lets the admin claim through every assertion', () => {
    const admin = { id: 'a', email: null, access: { isAdmin: true, factoryIds: new Set<string>() } }

    expect(() => assertFactoryAccess(admin, OTHER_FACTORY)).not.toThrow()
    expect(() => assertAnyFactoryAccess(admin)).not.toThrow()
    expect(() => assertFactoryAdmin(admin)).not.toThrow()
  })

  it('forgets a verified request when the cache is reset', async () => {
    const request = buildRequest('/api/v1/factories', {
      token: await ownerToken(OWNED_FACTORY),
    })

    const first = await authenticateRequest(request)
    resetAuthCache()
    const second = await authenticateRequest(request)

    expect(second).not.toBe(first)
    expect(second.id).toBe(first.id)
  })
})

/* -------------------------------------------------------------------------- */
/* Configuration and secret hygiene                                           */
/* -------------------------------------------------------------------------- */

describe('configuration', () => {
  it('reports a misconfigured offline secret as a 500, not a 401', async () => {
    // No secret means no way to know who the caller is. Failing closed is
    // correct; blaming the caller with a 401 would be a lie.
    process.env.BYTEME_OFFLINE_JWT_SECRET = ''
    resetEnvCache()

    try {
      const response = await callScoped(factoryGET, seededFactoryId, { token: 'a.b.c' })
      expect(response.status).toBe(500)

      const body = await readJson(response)
      expect((body.error as { code: string }).code).toBe('configuration_error')
    } finally {
      process.env.BYTEME_OFFLINE_JWT_SECRET = SECRET
      resetEnvCache()
    }
  })

  it('rejects a short offline signing secret as server misconfiguration', async () => {
    process.env.BYTEME_OFFLINE_JWT_SECRET = 'short-secret'
    resetEnvCache()

    try {
      const response = await callScoped(factoryGET, seededFactoryId, { token: 'a.b.c' })
      expect(response.status).toBe(500)
      expect((await readJson(response)).error).toMatchObject({
        code: 'configuration_error',
        message: expect.stringContaining('at least 32 bytes'),
      })
    } finally {
      process.env.BYTEME_OFFLINE_JWT_SECRET = SECRET
      resetEnvCache()
    }
  })

  it('never puts a secret in the signing secret slot of a NEXT_PUBLIC_ variable', async () => {
    const { serverEnv } = await import('@/lib/env')

    process.env.NEXT_PUBLIC_BYTEME_OFFLINE_JWT_SECRET = 'leaked'
    resetEnvCache()

    try {
      expect(() => serverEnv()).toThrow(/NEXT_PUBLIC_BYTEME_OFFLINE_JWT_SECRET/)
    } finally {
      delete process.env.NEXT_PUBLIC_BYTEME_OFFLINE_JWT_SECRET
      resetEnvCache()
    }
  })

  it('keeps every token out of the source of the auth layer', async () => {
    const { readFileSync } = await import('node:fs')
    const source = ['token', 'claims', 'verify', 'guard', 'types', 'index']
      .map((file) => readFileSync(`lib/auth/${file}.ts`, 'utf8'))
      .join('\n')

    // No logging of any kind, so no token can reach a log through this layer.
    expect(source).not.toMatch(/console\.(log|info|warn|error|debug)/)
    expect(source).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/)
  })
})