/**
 * GET    /api/v1/factories/:factoryId/energy-data/:energyId
 * PATCH  /api/v1/factories/:factoryId/energy-data/:energyId
 * DELETE /api/v1/factories/:factoryId/energy-data/:energyId
 *
 * `recorded_at` is immutable: changing an interval's timestamp would silently
 * move data in a time series, so correct it by delete + create.
 */

import type { NextRequest } from 'next/server'
import { NotFoundError } from '@/lib/errors'
import { withFactoryAccess } from '@/lib/auth'
import { ok, parseBody, parseUuidParam } from '@/lib/http'
import { energyDataUpdateSchema } from '@/lib/schemas/energy-data'
import { energyDataRepository } from '@/lib/repositories/energy-data'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface Context {
  params: { factoryId: string; energyId: string }
}

export const GET = withFactoryAccess(async (_request: NextRequest, { params }: Context) => {
  const factoryId = parseUuidParam(params.factoryId, 'factoryId')
  const energyId = parseUuidParam(params.energyId, 'energyId')

  const interval = await energyDataRepository.getById(factoryId, energyId)
  if (!interval) throw new NotFoundError('Energy data interval', energyId)

  return ok(interval)
})

export const PATCH = withFactoryAccess(async (request: NextRequest, { params }: Context) => {
  const factoryId = parseUuidParam(params.factoryId, 'factoryId')
  const energyId = parseUuidParam(params.energyId, 'energyId')

  const body = await parseBody(request, energyDataUpdateSchema)

  return ok(await energyDataRepository.update(factoryId, energyId, body))
})

export const DELETE = withFactoryAccess(async (_request: NextRequest, { params }: Context) => {
  const factoryId = parseUuidParam(params.factoryId, 'factoryId')
  const energyId = parseUuidParam(params.energyId, 'energyId')

  await energyDataRepository.remove(factoryId, energyId)

  return ok({ id: energyId, deleted: true })
})