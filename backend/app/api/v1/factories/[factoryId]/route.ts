/**
 * GET    /api/v1/factories/:factoryId  — fetch one factory
 * PATCH  /api/v1/factories/:factoryId  — update mutable factory fields
 * DELETE /api/v1/factories/:factoryId  — delete a factory and its children
 */

import type { NextRequest } from 'next/server'
import { NotFoundError } from '@/lib/errors'
import { withFactoryAccess } from '@/lib/auth'
import { ok, parseBody, parseUuidParam } from '@/lib/http'
import { factoryUpdateSchema } from '@/lib/schemas/factories'
import { factoriesRepository } from '@/lib/repositories/factories'
import { requireFactory } from '@/lib/services/factories'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface Context {
  params: { factoryId: string }
}

export const GET = withFactoryAccess(async (_request: NextRequest, { params }: Context) => {
  const factoryId = parseUuidParam(params.factoryId, 'factoryId')
  return ok(await requireFactory(factoryId))
})

export const PATCH = withFactoryAccess(async (request: NextRequest, { params }: Context) => {
  const factoryId = parseUuidParam(params.factoryId, 'factoryId')
  const body = await parseBody(request, factoryUpdateSchema)

  const factory = await factoriesRepository.update(factoryId, body)
  return ok(factory)
})

/**
 * Deletes a factory. CASCADE removes its machines, processes, orders, energy
 * data, tariffs, optimization records and schedules.
 *
 * Destructive and irreversible, so it is deliberately a separate explicit call
 * rather than something PATCH can trigger.
 */
export const DELETE = withFactoryAccess(async (_request: NextRequest, { params }: Context) => {
  const factoryId = parseUuidParam(params.factoryId, 'factoryId')

  const existing = await factoriesRepository.getById(factoryId)
  if (!existing) throw new NotFoundError('Factory', factoryId)

  await factoriesRepository.remove(factoryId)

  return ok({ id: factoryId, deleted: true })
})