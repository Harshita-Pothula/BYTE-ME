/**
 * GET /api/v1/factories/:factoryId/payload
 *
 * Builds the exact `OptimizationProblem` document ByteMe would send to the
 * optimizer, without sending it and without storing a request row.
 *
 * This is the fastest way to check what the Python side will receive while the
 * interface is still being agreed: point it at a seeded factory, and the
 * response shows machines, processes, dependencies, orders, energy data,
 * tariffs and constraints exactly as the adapter formats them.
 */

import type { NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'
import { withFactoryAccess } from '@/lib/auth'
import { ok, parseSearchParams, parseUuidParam } from '@/lib/http'
import { z } from 'zod'
import { energyTimeWindow } from '@/lib/repositories/energy-data'
import { listTariffsForHorizon } from '@/lib/repositories/electricity-tariffs'
import { machinesRepository } from '@/lib/repositories/machines'
import {
  processDependenciesRepository,
  processesRepository,
} from '@/lib/repositories/processes'
import { productionOrdersRepository } from '@/lib/repositories/production-orders'
import { listEnergyData } from '@/lib/repositories/energy-data'
import { buildOptimizationProblem } from '@/lib/optimizer/payload'
import { requireFactory } from '@/lib/services/factories'
import { ValidationError } from '@/lib/errors'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface Context {
  params: { factoryId: string }
}

const payloadQuerySchema = z.object({
  horizon_start: z.string().datetime({ offset: true }).optional(),
  horizon_end: z.string().datetime({ offset: true }).optional(),
  /** Include the full energy series. Off by default because it can be large. */
  include_energy_data: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
})

export const GET = withFactoryAccess(async (request: NextRequest, { params }: Context) => {
  const factoryId = parseUuidParam(params.factoryId, 'factoryId')
  const query = parseSearchParams(request.nextUrl.searchParams, payloadQuerySchema)

  const factory = await requireFactory(factoryId)

  const energyWindow = await energyTimeWindow(factoryId)
  const horizonStart = query.horizon_start ?? energyWindow.from
  const horizonEnd = query.horizon_end ?? energyWindow.to

  if (!horizonStart || !horizonEnd) {
    throw new ValidationError(
      'Cannot build a payload: no horizon was supplied and the factory has no energy data.',
      { factory_id: factoryId, hint: 'Pass horizon_start and horizon_end, or ingest energy data first.' },
    )
  }

  const [machines, processes, dependencies, productionOrders, energyData, tariffs] =
    await Promise.all([
      machinesRepository.list(factoryId, { limit: 1000, offset: 0 }),
      processesRepository.list(factoryId, { limit: 2000, offset: 0 }),
      processDependenciesRepository.list(factoryId, { limit: 5000, offset: 0 }),
      productionOrdersRepository.list(factoryId, { limit: 2000, offset: 0 }),
      query.include_energy_data
        ? listEnergyData(
            factoryId,
            { limit: 2000, offset: 0, sortColumn: 'recorded_at', sortAscending: true },
            { from: horizonStart, to: horizonEnd },
          )
        : Promise.resolve({ rows: [], total: 0 }),
      listTariffsForHorizon(factoryId, horizonStart, horizonEnd),
    ])

  const problem = buildOptimizationProblem({
    factory,
    machines: machines.rows,
    processes: processes.rows,
    dependencies: dependencies.rows,
    productionOrders: productionOrders.rows.filter((order) => order.status !== 'cancelled'),
    energyData: energyData.rows,
    tariffs,
    // A preview reference, not a stored request.
    requestReference: `preview-${randomUUID()}`,
    horizonStart,
    horizonEnd,
  })

  return ok(problem, {
    note: 'This is the document the adapter would send. Nothing was submitted or stored.',
  })
})