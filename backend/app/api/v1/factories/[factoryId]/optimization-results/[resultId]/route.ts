/**
 * GET    /api/v1/factories/:factoryId/optimization-results/:resultId
 * PATCH  /api/v1/factories/:factoryId/optimization-results/:resultId
 * DELETE /api/v1/factories/:factoryId/optimization-results/:resultId
 */

import type { NextRequest } from 'next/server'
import { NotFoundError } from '@/lib/errors'
import { withFactoryAccess } from '@/lib/auth'
import { ok, parseBody, parseUuidParam } from '@/lib/http'
import { optimizationResultUpdateSchema } from '@/lib/schemas/optimization'
import { optimizationResultsRepository } from '@/lib/repositories/optimization'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface Context {
  params: { factoryId: string; resultId: string }
}

export const GET = withFactoryAccess(async (_request: NextRequest, { params }: Context) => {
  const factoryId = parseUuidParam(params.factoryId, 'factoryId')
  const resultId = parseUuidParam(params.resultId, 'resultId')

  const result = await optimizationResultsRepository.getById(factoryId, resultId)
  if (!result) throw new NotFoundError('Optimization result', resultId)

  return ok(result)
})

/** Records a corrected or completed result from an external optimizer run. */
export const PATCH = withFactoryAccess(async (request: NextRequest, { params }: Context) => {
  const factoryId = parseUuidParam(params.factoryId, 'factoryId')
  const resultId = parseUuidParam(params.resultId, 'resultId')

  const body = await parseBody(request, optimizationResultUpdateSchema)

  return ok(await optimizationResultsRepository.update(factoryId, resultId, body))
})

export const DELETE = withFactoryAccess(async (_request: NextRequest, { params }: Context) => {
  const factoryId = parseUuidParam(params.factoryId, 'factoryId')
  const resultId = parseUuidParam(params.resultId, 'resultId')

  await optimizationResultsRepository.remove(factoryId, resultId)

  return ok({ id: resultId, deleted: true })
})