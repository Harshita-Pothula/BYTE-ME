/**
 * GET /api/v1/factories/:factoryId/energy-data/summary
 *
 * Consumption and generation totals over a time window, plus optimizer
 * readiness. These are sums of stored measurements. They are explicitly not a
 * forecast, a schedule, or an optimisation outcome.
 */

import type { NextRequest } from 'next/server'
import { withFactoryAccess } from '@/lib/auth'
import { ok, parseSearchParams, parseUuidParam } from '@/lib/http'
import { z } from 'zod'
import { energyDataListQuerySchema } from '@/lib/schemas/energy-data'
import { optimizerStatus } from '@/lib/services/optimization'
import { getEnergyTotals } from '@/lib/services/factories'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface Context {
  params: { factoryId: string }
}

const summaryQuerySchema = energyDataListQuerySchema
  .pick({ from: true, to: true, machine_id: true })
  .extend({ limit: z.coerce.number().int().min(1).max(200).optional() })

export const GET = withFactoryAccess(async (request: NextRequest, { params }: Context) => {
  const factoryId = parseUuidParam(params.factoryId, 'factoryId')
  const query = parseSearchParams(request.nextUrl.searchParams, summaryQuerySchema)

  const totals = await getEnergyTotals(factoryId, {
    from: query.from,
    to: query.to,
    machine_id: query.machine_id,
  })

  return ok({
    ...totals,
    source: 'measured_energy_data',
    note: 'Totals are sums of stored readings, not an optimisation result.',
    optimizer: optimizerStatus(),
  })
})