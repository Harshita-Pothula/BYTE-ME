/**
 * GET  /api/v1/factories/:factoryId/energy-data — list intervals
 * POST /api/v1/factories/:factoryId/energy-data — ingest one or many intervals
 * GET  /api/v1/factories/:factoryId/energy-data/summary — measured totals
 *
 * A single interval is posted as a plain object; a batch is posted as
 * `{ "intervals": [...], "on_conflict": "skip" }`.
 *
 * The summary is a plain sum of stored meter readings. It is NOT an
 * optimisation result and says nothing about achievable cost.
 */

import type { NextRequest } from 'next/server'
import { withFactoryAccess } from '@/lib/auth'
import {
  created,
  ok,
  parseJsonBody,
  parseSearchParams,
  parseUuidParam,
  parseWithSchema,
} from '@/lib/http'
import {
  energyDataBulkSchema,
  energyDataCreateSchema,
  energyDataListQuerySchema,
} from '@/lib/schemas/energy-data'
import { parseSort } from '@/lib/schemas/common'
import { bulkUpsertEnergyData, listEnergyData } from '@/lib/repositories/energy-data'
import { assertFactoryExists } from '@/lib/services/factories'
import { machinesRepository } from '@/lib/repositories/machines'
import { NotFoundError } from '@/lib/errors'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface Context {
  params: { factoryId: string }
}

export const GET = withFactoryAccess(async (request: NextRequest, { params }: Context) => {
  const factoryId = parseUuidParam(params.factoryId, 'factoryId')
  const query = parseSearchParams(request.nextUrl.searchParams, energyDataListQuerySchema)
  const sort = parseSort(query.sort, { column: 'recorded_at', ascending: false })

  const result = await listEnergyData(
    factoryId,
    { limit: query.limit, offset: query.offset, sortColumn: sort.column, sortAscending: sort.ascending },
    { from: query.from, to: query.to, machine_id: query.machine_id, source: query.source },
  )

  return ok(
    { intervals: result.rows, resolution: query.resolution },
    { total: result.total ?? undefined, limit: query.limit, offset: query.offset },
  )
})

export const POST = withFactoryAccess(async (request: NextRequest, { params }: Context) => {
  const factoryId = parseUuidParam(params.factoryId, 'factoryId')
  await assertFactoryExists(factoryId)

  const raw = await parseJsonBody(request)

  const isBatch = typeof raw === 'object' && raw !== null && Array.isArray((raw as Record<string, unknown>).intervals)

  if (isBatch) {
    const body = parseWithSchema(energyDataBulkSchema, raw)
    const result = await bulkUpsertEnergyData(factoryId, body)

    return created(
      { inserted: result.inserted },
      { meta: { requested: body.intervals.length, on_conflict: body.on_conflict } },
    )
  }

  const body = parseWithSchema(energyDataCreateSchema, raw)

  if (body.machine_id) {
    const machine = await machinesRepository.getById(factoryId, body.machine_id)
    if (!machine) throw new NotFoundError('Machine', body.machine_id)
  }

  const result = await bulkUpsertEnergyData(factoryId, {
    intervals: [body],
    on_conflict: 'update',
  })

  const [interval] = result.rows
  return created(interval)
})