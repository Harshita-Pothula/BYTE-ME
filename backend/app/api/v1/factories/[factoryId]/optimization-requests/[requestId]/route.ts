/**
 * GET    /api/v1/factories/:factoryId/optimization-requests/:requestId
 * PATCH  /api/v1/factories/:factoryId/optimization-requests/:requestId
 * DELETE /api/v1/factories/:factoryId/optimization-requests/:requestId
 *
 * GET also returns the stored `request_payload` (the exact document that was,
 * or would have been, sent to the optimizer) so an integration can be
 * developed against real data.
 */

import type { NextRequest } from 'next/server'
import { NotFoundError } from '@/lib/errors'
import { withFactoryAccess } from '@/lib/auth'
import { ok, parseBody, parseUuidParam } from '@/lib/http'
import { optimizationRequestUpdateSchema } from '@/lib/schemas/optimization'
import {
  getResultForRequest,
  optimizationRequestsRepository,
} from '@/lib/repositories/optimization'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface Context {
  params: { factoryId: string; requestId: string }
}

export const GET = withFactoryAccess(async (_request: NextRequest, { params }: Context) => {
  const factoryId = parseUuidParam(params.factoryId, 'factoryId')
  const requestId = parseUuidParam(params.requestId, 'requestId')

  const optimizationRequest = await optimizationRequestsRepository.getById(factoryId, requestId)
  if (!optimizationRequest) throw new NotFoundError('Optimization request', requestId)

  const result = await getResultForRequest(factoryId, requestId)

  return ok({
    ...optimizationRequest,
    result,
  })
})

/**
 * Updates a request's bookkeeping status. Used by an external harness or an
 * operator to record progress; the adapter updates it automatically on a
 * synchronous run.
 */
export const PATCH = withFactoryAccess(async (request: NextRequest, { params }: Context) => {
  const factoryId = parseUuidParam(params.factoryId, 'factoryId')
  const requestId = parseUuidParam(params.requestId, 'requestId')

  const body = await parseBody(request, optimizationRequestUpdateSchema)

  return ok(await optimizationRequestsRepository.update(factoryId, requestId, body))
})

/** Deletes a request; its result cascades. */
export const DELETE = withFactoryAccess(async (_request: NextRequest, { params }: Context) => {
  const factoryId = parseUuidParam(params.factoryId, 'factoryId')
  const requestId = parseUuidParam(params.requestId, 'requestId')

  await optimizationRequestsRepository.remove(factoryId, requestId)

  return ok({ id: requestId, deleted: true })
})