import { afterEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { GET as healthGET } from '@/app/api/v1/health/route'
import { closeDb } from '@/lib/offline/db'
import { resetEnvCache } from '@/lib/env'
import { MAX_JSON_BODY_BYTES, MAX_QUERY_STRING_BYTES, parseJsonBody, parseSearchParams } from '@/lib/http'
import { z } from 'zod'
// @ts-ignore Next config is a JavaScript ESM module without a declaration file.
import nextConfig from '../next.config.mjs'

const previousOfflineMode = process.env.BYTEME_OFFLINE_MODE
const previousOfflinePath = process.env.BYTEME_OFFLINE_DB_PATH

interface HeaderRule {
  source: string
  headers: Array<{ key: string; value: string }>
}

async function configuredHeaders(): Promise<HeaderRule[]> {
  return (nextConfig as unknown as { headers: () => Promise<HeaderRule[]> }).headers()
}

afterEach(() => {
  vi.unstubAllEnvs()
  closeDb()
  if (previousOfflineMode === undefined) delete process.env.BYTEME_OFFLINE_MODE
  else process.env.BYTEME_OFFLINE_MODE = previousOfflineMode
  if (previousOfflinePath === undefined) delete process.env.BYTEME_OFFLINE_DB_PATH
  else process.env.BYTEME_OFFLINE_DB_PATH = previousOfflinePath
  resetEnvCache()
})

describe('production security headers', () => {
  it('applies safe non-HSTS headers to every path in development', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const [rule] = await configuredHeaders()
    const headers = new Map(rule?.headers.map(({ key, value }) => [key.toLowerCase(), value]))

    expect(rule?.source).toBe('/:path*')
    expect(headers.get('x-content-type-options')).toBe('nosniff')
    expect(headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
    expect(headers.get('x-frame-options')).toBe('DENY')
    expect(headers.get('permissions-policy')).toBe('camera=(), geolocation=(), microphone=()')
    expect(headers.has('strict-transport-security')).toBe(false)
  })

  it('adds HSTS only for production and does not opt subdomains into HSTS', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('BYTEME_HSTS_ENABLED', 'true')
    const [rule] = await configuredHeaders()
    const hsts = rule?.headers.find(({ key }) => key.toLowerCase() === 'strict-transport-security')

    expect(hsts?.value).toBe('max-age=31536000')
  })

  it('does not enable HSTS in production unless HTTPS is explicitly confirmed', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('BYTEME_HSTS_ENABLED', 'false')
    const [rule] = await configuredHeaders()

    expect(rule?.headers.some(({ key }) => key.toLowerCase() === 'strict-transport-security')).toBe(false)
  })
})

describe('bounded JSON request parsing', () => {
  it('rejects a streamed body exceeding the byte cap even without Content-Length', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_JSON_BODY_BYTES))
        controller.enqueue(new Uint8Array(1))
        controller.close()
      },
    })
    const request = new Request('http://localhost/api/v1/test', {
      method: 'POST',
      body,
      duplex: 'half',
    } as RequestInit)

    await expect(parseJsonBody(request)).rejects.toMatchObject({
      status: 400,
      code: 'validation_error',
      message: 'Request body exceeds the maximum allowed size',
      details: { max_bytes: MAX_JSON_BODY_BYTES },
    })
  })

  it('rejects excessively nested JSON with a clean validation response', async () => {
    let nested: unknown = null
    for (let depth = 0; depth < 65; depth += 1) nested = [nested]
    const request = new Request('http://localhost/api/v1/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(nested),
    })

    await expect(parseJsonBody(request)).rejects.toMatchObject({
      status: 400,
      code: 'validation_error',
      message: 'Request JSON exceeds the maximum nesting depth',
      details: { max_depth: 64 },
    })
  })

  it('rejects query strings beyond the shared byte ceiling', () => {
    const searchParams = new URLSearchParams({ filter: 'x'.repeat(MAX_QUERY_STRING_BYTES) })
    expect(() => parseSearchParams(searchParams, z.object({}))).toThrowError(
      'Query string exceeds the maximum allowed size',
    )
  })
})

describe('public health error sanitization', () => {
  it('does not expose the offline database path when the database probe fails', async () => {
    const privatePath = resolve(tmpdir(), `byteme-private-${randomUUID()}`, 'offline.db')
    process.env.BYTEME_OFFLINE_MODE = 'true'
    process.env.BYTEME_OFFLINE_DB_PATH = privatePath
    resetEnvCache()

    const response = await healthGET()
    const raw = await response.text()
    const body = JSON.parse(raw) as {
      data: { checks: { database: { error?: string } } }
    }

    expect(response.status).toBe(503)
    expect(body.data.checks.database.error).toBe('Database probe failed.')
    expect(raw).not.toContain(privatePath)
  })
})
