/**
 * GET /api/v1/factories/:factoryId/summary
 *
 * Aggregate view of one factory: row counts, the energy window available, and
 * whether the optimizer is configured.
 *
 * Deliberately absent: any "recommended", "optimal" or "expected" cost. Those
 * require a real optimizer run.
 */

import type { NextRequest } from 'next/server'
import { withFactoryAccess } from '@/lib/auth'
import { ok, parseUuidParam } from '@/lib/http'
import { getFactorySummary } from '@/lib/services/factories'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface Context {
  params: { factoryId: string }
}

export const GET = withFactoryAccess(async (_request: NextRequest, { params }: Context) => {
  const factoryId = parseUuidParam(params.factoryId, 'factoryId')

  const summary = await getFactorySummary(factoryId)

  return ok(summary)
})