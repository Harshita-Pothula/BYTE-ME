/**
 * GET  /api/v1/factories/:factoryId/production-orders — list orders
 * POST /api/v1/factories/:factoryId/production-orders — create an order
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
  productionOrderCreateSchema,
  productionOrderListQuerySchema,
} from '@/lib/schemas/production-orders'
import { parseSort } from '@/lib/schemas/common'
import { listProductionOrders, productionOrdersRepository } from '@/lib/repositories/production-orders'
import { assertFactoryExists } from '@/lib/services/factories'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface Context {
  params: { factoryId: string }
}

export const GET = withFactoryAccess(async (request: NextRequest, { params }: Context) => {
  const factoryId = parseUuidParam(params.factoryId, 'factoryId')
  const query = parseSearchParams(request.nextUrl.searchParams, productionOrderListQuerySchema)
  const sort = parseSort(query.sort, { column: 'due_at', ascending: true })

  const result = await listProductionOrders(
    factoryId,
    { limit: query.limit, offset: query.offset, sortColumn: sort.column, sortAscending: sort.ascending },
    { status: query.status, due_before: query.due_before, due_after: query.due_after },
  )

  return ok(result.rows, { total: result.total ?? undefined, limit: query.limit, offset: query.offset })
})

export const POST = withFactoryAccess(async (request: NextRequest, { params }: Context) => {
  const factoryId = parseUuidParam(params.factoryId, 'factoryId')
  await assertFactoryExists(factoryId)

  const body = await parseBody(request, productionOrderCreateSchema)
  const order = await productionOrdersRepository.create(factoryId, body)

  return created(order, {
    location: `/api/v1/factories/${factoryId}/production-orders/${order.id}`,
  })
})