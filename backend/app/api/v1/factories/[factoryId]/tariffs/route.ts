/**
 * GET  /api/v1/factories/:factoryId/tariffs — list tariffs
 * POST /api/v1/factories/:factoryId/tariffs — create a tariff
 *
 * Tariffs are time-of-use price rows. `?active_at=<iso>` returns only the rows
 * whose validity window covers that instant, highest priority first.
 */

import type { NextRequest } from 'next/server'
import { withFactoryAccess } from '@/lib/auth'
import {
  created,
  ok,
  parseBody,
  parseSearchParams,
  parseUuidParam,
} from '@/lib/http'
import {
  electricityTariffCreateSchema,
  electricityTariffListQuerySchema,
} from '@/lib/schemas/electricity-tariffs'
import { parseSort } from '@/lib/schemas/common'
import { listActiveTariffs, listTariffs, tariffsRepository } from '@/lib/repositories/electricity-tariffs'
import { assertFactoryExists } from '@/lib/services/factories'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface Context {
  params: { factoryId: string }
}

export const GET = withFactoryAccess(async (request: NextRequest, { params }: Context) => {
  const factoryId = parseUuidParam(params.factoryId, 'factoryId')
  const query = parseSearchParams(request.nextUrl.searchParams, electricityTariffListQuerySchema)
  const sort = parseSort(query.sort, { column: 'priority', ascending: false })

  if (query.active_at) {
    const rows = await listActiveTariffs(factoryId, query.active_at)
    return ok(rows, { active_at: query.active_at })
  }

  const result = await listTariffs(factoryId, {
    limit: query.limit,
    offset: query.offset,
    sortColumn: sort.column,
    sortAscending: sort.ascending,
  })

  return ok(result.rows, { total: result.total ?? undefined, limit: query.limit, offset: query.offset })
})

export const POST = withFactoryAccess(async (request: NextRequest, { params }: Context) => {
  const factoryId = parseUuidParam(params.factoryId, 'factoryId')
  await assertFactoryExists(factoryId)

  const body = await parseBody(request, electricityTariffCreateSchema)
  const tariff = await tariffsRepository.create(factoryId, body)

  return created(tariff, {
    location: `/api/v1/factories/${factoryId}/tariffs/${tariff.id}`,
  })
})