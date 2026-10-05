/**
 * Supabase access-token verification.
 *
 * ONLINE (the primary path)
 *   Supabase signs access tokens with an asymmetric key and publishes the public
 *   half at `<project-url>/auth/v1/.well-known/jwks.json`. The signature is
 *   verified locally against that JWKS, which `jose` caches, so the hot path
 *   costs no network round trip after the first request. The issuer is pinned
 *   to this project's auth endpoint, so a token minted by a different Supabase
 *   project is rejected even if it is signed by a key this server trusts.
 *
 * OFFLINE (BYTEME_OFFLINE_MODE=true)
 *   There is no Supabase project and no network, so a token cannot be verified
 *   against a remote JWKS. Offline mode instead verifies an HS256 token signed
 *   with `BYTEME_OFFLINE_JWT_SECRET`. That secret is a server-only variable and
 *   is never sent to a client; `scripts/mint-offline-token.ts` mints tokens for
 *   local development.
 *
 * FAILURE POLICY
 *   Every verification failure becomes a 401 with a short machine-readable
 *   `reason`. The underlying JWT error message is not forwarded, and neither is
 *   any part of the token: a client learns that its token was rejected, never
 *   why in terms of its own contents.
 */

import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose'
import { ConfigurationError, UnauthorizedError } from '../errors'
import { serverEnv } from '../env'
import { isOfflineMode } from '../offline/mode'

/** A verified token, reduced to what authorization needs. */
export interface VerifiedToken {
  userId: string
  email: string | null
  appMetadata: Record<string, unknown>
}

/** The issuer every online token must carry. */
function expectedIssuer(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/+$/, '')}/auth/v1`
}

/** Cached remote key set, rebuilt if the project URL changes. */
let cachedJwks: { issuer: string; jwks: JWTVerifyGetKey } | null = null

function remoteJwks(issuer: string, url: string): JWTVerifyGetKey {
  if (cachedJwks && cachedJwks.issuer === issuer) return cachedJwks.jwks

  // A failed JWKS fetch is a server configuration problem, not a bad request.
  // `createRemoteJWKSet` is lazy, so no request leaves the process here.
  const jwks = createRemoteJWKSet(new URL(`${url}/.well-known/jwks.json`), {
    timeoutDuration: 5_000,
    cooldownDuration: 30_000,
  })

  cachedJwks = { issuer, jwks }
  return jwks
}

/** Test helper: forget the cached key set. */
export function resetJwksCache(): void {
  cachedJwks = null
}

/**
 * Maps a `jose` failure onto a 401.
 *
 * Only `error.code` is used. jose messages describe the token's own structure
 * and are not echoed, so a caller cannot use the error text to probe a token.
 */
function unauthorized(reason: string, message: string): UnauthorizedError {
  return new UnauthorizedError(message, { reason })
}

/**
 * Verifies a Supabase access token.
 *
 * @throws {UnauthorizedError} 401 when the token is missing, malformed, expired
 *         or signed by something this server does not trust.
 * @throws {ConfigurationError} 500 when the server itself cannot verify tokens
 *         (no Supabase URL online, or no offline secret).
 */
export async function verifyAccessToken(token: string): Promise<VerifiedToken> {
  if (isOfflineMode()) return verifyOfflineToken(token)
  return verifyOnlineToken(token)
}

async function verifyOnlineToken(token: string): Promise<VerifiedToken> {
  const env = serverEnv()
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL

  if (!supabaseUrl) {
    throw new ConfigurationError(
      'Supabase authentication cannot be verified: NEXT_PUBLIC_SUPABASE_URL is not configured.',
    )
  }

  const issuer = expectedIssuer(supabaseUrl)

  try {
    const { payload } = await jwtVerify(token, remoteJwks(issuer, `${issuer}/`), {
      issuer,
      algorithms: ['RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512'],
    })

    return toVerifiedToken(payload)
  } catch (error) {
    throw unauthorized(reasonFor(error), 'Invalid or expired access token')
  }
}

async function verifyOfflineToken(token: string): Promise<VerifiedToken> {
  const env = serverEnv()
  const secret = env.BYTEME_OFFLINE_JWT_SECRET

  // Failing closed: with no offline secret there is no way to establish who the
  // caller is, so protected routes report a misconfiguration rather than
  // guessing. This is the operator's problem, so it is a 500, not a 401.
  if (!secret) {
    throw new ConfigurationError(
      'Offline authentication is not configured: BYTEME_OFFLINE_JWT_SECRET must be set when BYTEME_OFFLINE_MODE=true. Mint a token with: npm run offline:token',
    )
  }
  if (new TextEncoder().encode(secret).byteLength < 32) {
    throw new ConfigurationError(
      'Offline authentication is not configured: BYTEME_OFFLINE_JWT_SECRET must contain at least 32 bytes.',
    )
  }

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ['HS256'],
    })

    return toVerifiedToken(payload)
  } catch (error) {
    throw unauthorized(reasonFor(error), 'Invalid or expired access token')
  }
}

function toVerifiedToken(payload: JWTPayload): VerifiedToken {
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw unauthorized('missing_subject', 'Invalid or expired access token')
  }

  const appMetadata =
    typeof payload.app_metadata === 'object' && payload.app_metadata !== null
      ? (payload.app_metadata as Record<string, unknown>)
      : {}

  return {
    userId: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : null,
    appMetadata,
  }
}

/** A short, non-revealing reason code taken from the library's error code. */
function reasonFor(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code
    if (typeof code === 'string') return code.toLowerCase()
  }
  return 'invalid_token'
}