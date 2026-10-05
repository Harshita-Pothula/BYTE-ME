/**
 * GET    /api/v1/factories/:factoryId/tariffs/:tariffId
 * PATCH  /api/v1/factories/:factoryId/tariffs/:tariffId
 * DELETE /api/v1/factories/:factoryId/tariffs/:tariffId
 */

import type { NextRequest } from 'next/server'
import { NotFoundError } from '@/lib/errors'
import { withFactoryAccess } from '@/lib/auth'
import { ok, parseBody, parseUuidParam } from '@/lib/http'
import { electricityTariffUpdateSchema } from '@/lib/schemas/electricity-tariffs'
import { tariffsRepository } from '@/lib/repositories/electricity-tariffs'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface Context {
  params: { factoryId: string; tariffId: string }
}

export const GET = withFactoryAccess(async (_request: NextRequest, { params }: Context) => {
  const factoryId = parseUuidParam(params.factoryId, 'factoryId')
  const tariffId = parseUuidParam(params.tariffId, 'tariffId')

  const tariff = await tariffsRepository.getById(factoryId, tariffId)
  if (!tariff) throw new NotFoundError('Tariff', tariffId)

  return ok(tariff)
})

export const PATCH = withFactoryAccess(async (request: NextRequest, { params }: Context) => {
  const factoryId = parseUuidParam(params.factoryId, 'factoryId')
  const tariffId = parseUuidParam(params.tariffId, 'tariffId')

  const body = await parseBody(request, electricityTariffUpdateSchema)

  return ok(await tariffsRepository.update(factoryId, tariffId, body))
})

export const DELETE = withFactoryAccess(async (_request: NextRequest, { params }: Context) => {
  const factoryId = parseUuidParam(params.factoryId, 'factoryId')
  const tariffId = parseUuidParam(params.tariffId, 'tariffId')

  await tariffsRepository.remove(factoryId, tariffId)

  return ok({ id: tariffId, deleted: true })
})