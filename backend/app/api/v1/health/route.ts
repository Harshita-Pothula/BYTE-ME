/**
 * GET /api/v1/health
 *
 * Reports process liveness plus whether Supabase and the optimizer are usable.
 * A database that is not reachable returns 503; diagnostic strings are kept
 * generic because this endpoint is public.
 */

import { NextResponse } from 'next/server'
import { isDatabaseConfigured, serverEnv } from '@/lib/env'
import { getSupabaseAdmin } from '@/lib/supabase'
import { isOfflineMode } from '@/lib/offline/mode'
import { isOfflineSchemaReady } from '@/lib/offline/init'
import { optimizerStatus } from '@/lib/services/optimization'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Names of required-but-absent variables. Never returns values.
 *
 * Only meaningful for the active backend: Supabase is still the primary online
 * path, so its two variables are the ones reported as missing there. In offline
 * mode no credential is required at all, and reporting Supabase blanks would
 * send an operator chasing a problem they do not have.
 */
function missingRequiredEnv(): string[] {
  if (isOfflineMode()) return []
  const required = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']
  return required.filter((key) => !process.env[key])
}

/**
 * Probes whichever backend is active.
 *
 * Supabase is probed with a cheap count, which exercises the connection and the
 * service-role key. Offline mode is probed by checking that the SQLite schema
 * exists: an uninitialised file is the offline equivalent of an unreachable
 * database and should report degraded rather than a raw "no such table".
 */
async function probeDatabase(): Promise<{ reachable: boolean; error: string | null }> {
  if (isOfflineMode()) {
    try {
      if (!isOfflineSchemaReady()) {
        return {
          reachable: false,
          error: 'The offline SQLite schema is not initialized.',
        }
      }
      return { reachable: true, error: null }
    } catch {
      return { reachable: false, error: 'Database probe failed.' }
    }
  }

  try {
    const { error } = await getSupabaseAdmin()
      .from('factories')
      .select('id', { count: 'exact', head: true })
    return { reachable: !error, error: error ? 'Database probe failed.' : null }
  } catch {
    return { reachable: false, error: 'Database probe failed.' }
  }
}

export async function GET(): Promise<NextResponse> {
  const databaseConfigured = isDatabaseConfigured()

  let databaseReachable = false
  let databaseError: string | null = null

  if (databaseConfigured) {
    const probe = await probeDatabase()
    databaseReachable = probe.reachable
    databaseError = probe.error
  }

  // Optimizer readiness is independent of the database, and this endpoint is
  // often the first thing hit while configuration is still incomplete, so
  // neither lookup may throw.
  let optimizer: { configured: boolean; reason: string | null }
  try {
    optimizer = optimizerStatus()
  } catch {
    optimizer = {
      configured: false,
      reason: 'Optimizer status could not be determined.',
    }
  }

  let app: { name: string; version: string }
  try {
    const env = serverEnv()
    app = { name: env.APP_NAME, version: env.APP_VERSION }
  } catch {
    app = { name: 'ByteMe', version: 'unknown' }
  }

  const body = {
    data: {
      status: databaseReachable ? 'ok' : 'degraded',
      app,
      timestamp: new Date().toISOString(),
      checks: {
        database: {
          configured: databaseConfigured,
          reachable: databaseReachable,
          ...(databaseError ? { error: databaseError } : {}),
        },
        optimizer: {
          // Not part of overall health: ByteMe is fully usable for data
          // management without an optimizer, it just cannot schedule yet.
          configured: optimizer.configured,
          reason: optimizer.reason,
        },
        environment: {
          // Tells an operator whether the blanks in .env.local are the cause.
          // Names only; no values are ever echoed.
          missing_variables: missingRequiredEnv(),
        },
      },
    },
  }

  return NextResponse.json(body, { status: databaseReachable ? 200 : 503 })
}