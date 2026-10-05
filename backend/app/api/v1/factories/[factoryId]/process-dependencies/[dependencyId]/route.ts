/**
 * GET    /api/v1/factories/:factoryId/process-dependencies/:dependencyId
 * PATCH  /api/v1/factories/:factoryId/process-dependencies/:dependencyId
 * DELETE /api/v1/factories/:factoryId/process-dependencies/:dependencyId
 */

import type { NextRequest } from 'next/server'
import { NotFoundError } from '@/lib/errors'
import { withFactoryAccess } from '@/lib/auth'
import { ok, parseBody, parseUuidParam } from '@/lib/http'
import { processDependencyUpdateSchema } from '@/lib/schemas/processes'
import { processDependenciesRepository } from '@/lib/repositories/processes'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface Context {
  params: { factoryId: string; dependencyId: string }
}

export const GET = withFactoryAccess(async (_request: NextRequest, { params }: Context) => {
  const factoryId = parseUuidParam(params.factoryId, 'factoryId')
  const dependencyId = parseUuidParam(params.dependencyId, 'dependencyId')

  const dependency = await processDependenciesRepository.getById(factoryId, dependencyId)
  if (!dependency) throw new NotFoundError('Process dependency', dependencyId)

  return ok(dependency)
})

/**
 * Updates the edge's semantics. The endpoints themselves are immutable: to
 * re-point an edge, delete it and create a new one.
 */
export const PATCH = withFactoryAccess(async (request: NextRequest, { params }: Context) => {
  const factoryId = parseUuidParam(params.factoryId, 'factoryId')
  const dependencyId = parseUuidParam(params.dependencyId, 'dependencyId')

  const body = await parseBody(request, processDependencyUpdateSchema)

  return ok(await processDependenciesRepository.update(factoryId, dependencyId, body))
})

export const DELETE = withFactoryAccess(async (_request: NextRequest, { params }: Context) => {
  const factoryId = parseUuidParam(params.factoryId, 'factoryId')
  const dependencyId = parseUuidParam(params.dependencyId, 'dependencyId')

  await processDependenciesRepository.remove(factoryId, dependencyId)

  return ok({ id: dependencyId, deleted: true })
})