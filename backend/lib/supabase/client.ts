/**
 * Server-only Supabase client.
 *
 * IMPORTANT: this client is built with the SERVICE ROLE key, which bypasses
 * Row Level Security and grants full table access. It must therefore stay in
 * server-only modules. `import 'server-only'` is not used here (it would break
 * Vitest), so the guard below is what actually protects it: any attempt to
 * evaluate this module inside a browser bundle throws.
 *
 * The anon key is deliberately never used. ByteMe's browser clients, if any,
 * should talk to this REST API, which in turn uses this client.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { ConfigurationError } from '../errors'
import { serverEnv } from '../env'

const SERVICE_ROLE_MARKER = '__byteme_service_role__'

type ServiceClient = SupabaseClient & { [SERVICE_ROLE_MARKER]?: true }

let cached: ServiceClient | null = null

function assertServerContext(): void {
  if (typeof window !== 'undefined') {
    throw new Error(
      'Supabase service-role client must never be used in the browser. ' +
        'Call the ByteMe REST API instead of connecting Supabase directly from the client.',
    )
  }
}

/**
 * Returns the shared service-role Supabase client.
 *
 * @throws when the Supabase environment variables are missing or invalid.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached

  assertServerContext()

  const env = serverEnv()

  // serverEnv() treats these as optional so offline mode can run without any
  // Supabase credential. Reaching this function in offline mode is a bug in the
  // caller, not a configuration error, so fail explicitly rather than handing
  // createClient an undefined URL.
  if (env.BYTEME_OFFLINE_MODE) {
    throw new Error(
      'getSupabaseAdmin() was called while BYTEME_OFFLINE_MODE=true. ' +
        'The offline SQLite backend is active; repositories must obtain their client via client() in lib/repositories/base.ts.',
    )
  }

  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new ConfigurationError(
      'Supabase is not configured: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required unless BYTEME_OFFLINE_MODE=true.',
    )
  }

  cached = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { 'x-byteme-client': SERVICE_ROLE_MARKER },
    },
  }) as ServiceClient

  // Cheap canary used by lib/supabase/index.ts to assert the service client
  // was the one handed back.
  cached[SERVICE_ROLE_MARKER] = true

  return cached
}

/** True when the returned client is the service-role client, not the anon one. */
export function isServiceRoleClient(client: SupabaseClient): boolean {
  return (client as ServiceClient)[SERVICE_ROLE_MARKER] === true
}

/** Test helper: drop the memoised client. */
export function resetSupabaseClient(): void {
  cached = null
}