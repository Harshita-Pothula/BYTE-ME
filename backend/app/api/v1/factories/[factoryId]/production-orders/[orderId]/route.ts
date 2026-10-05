/**
 * GET    /api/v1/factories/:factoryId/production-orders/:orderId
 * PATCH  /api/v1/factories/:factoryId/production-orders/:orderId
 * DELETE /api/v1/factories/:factoryId/production-orders/:orderId
 */

import type { NextRequest } from 'next/server'
import { NotFoundError } from '@/lib/errors'
import { withFactoryAccess } from '@/lib/auth'
import { ok, parseBody, parseUuidParam } from '@/lib/http'
import { productionOrderUpdateSchema } from '@/lib/schemas/production-orders'
import { productionOrdersRepository } from '@/lib/repositories/production-orders'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface Context {
  params: { factoryId: string; orderId: string }
}

export const GET = withFactoryAccess(async (_request: NextRequest, { params }: Context) => {
  const factoryId = parseUuidParam(params.factoryId, 'factoryId')
  const orderId = parseUuidParam(params.orderId, 'orderId')

  const order = await productionOrdersRepository.getById(factoryId, orderId)
  if (!order) throw new NotFoundError('Production order', orderId)

  return ok(order)
})

export const PATCH = withFactoryAccess(async (request: NextRequest, { params }: Context) => {
  const factoryId = parseUuidParam(params.factoryId, 'factoryId')
  const orderId = parseUuidParam(params.orderId, 'orderId')

  const body = await parseBody(request, productionOrderUpdateSchema)

  return ok(await productionOrdersRepository.update(factoryId, orderId, body))
})

export const DELETE = withFactoryAccess(async (_request: NextRequest, { params }: Context) => {
  const factoryId = parseUuidParam(params.factoryId, 'factoryId')
  const orderId = parseUuidParam(params.orderId, 'orderId')

  await productionOrdersRepository.remove(factoryId, orderId)

  return ok({ id: orderId, deleted: true })
})