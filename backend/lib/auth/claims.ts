/**
 * Claim interpretation: what a verified token says about the caller.
 *
 * WHICH CLAIMS ARE TRUSTED
 * ------------------------
 * Only `app_metadata` is read. In Supabase, `user_metadata` is writable by the
 * end user through `updateUser()`, so a grant read from there would let anyone
 * grant themselves access to any factory. `app_metadata` is only editable by
 * the service role (or a custom access-token hook), which is what makes it
 * suitable for authorization.
 *
 * Two claims are understood:
 *
 *   app_metadata.byteme_admin   boolean  grants every factory
 *   app_metadata.factory_ids    string[] the factories the caller owns
 *
 * Both are set from the Supabase dashboard, a service-role script, or a custom
 * access token hook. Neither is ever read from the request body, a header, or
 * `user_metadata`.
 */

/** Claim holding the caller's factory ids. */
export const FACTORY_IDS_CLAIM = 'factory_ids'

/** Claim marking a platform operator. */
export const ADMIN_CLAIM = 'byteme_admin'

export interface RawClaims {
  sub?: unknown
  email?: unknown
  app_metadata?: unknown
}

/**
 * Reads the factory ids from a claim value.
 *
 * Anything that is not an array of non-empty strings is ignored rather than
 * throwing: a malformed claim must deny access, never grant it.
 */
export function parseFactoryIds(value: unknown): Set<string> {
  if (!Array.isArray(value)) return new Set()

  const ids = new Set<string>()
  for (const entry of value) {
    if (typeof entry !== 'string') continue
    const trimmed = entry.trim()
    if (trimmed.length === 0) continue
    ids.add(trimmed)
  }
  return ids
}

/** True only when the admin claim is literally `true`. */
export function parseAdmin(value: unknown): boolean {
  return value === true
}

/** Narrow `unknown` to a plain object, treating arrays and null as absent. */
function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

/** The verified subject and the raw `app_metadata` object. */
export function readClaims(payload: RawClaims): {
  userId: string
  email: string | null
  appMetadata: Record<string, unknown>
} {
  const appMetadata = asRecord(payload.app_metadata)
  return {
    userId: typeof payload.sub === 'string' ? payload.sub : '',
    email: typeof payload.email === 'string' ? payload.email : null,
    appMetadata,
  }
}