/**
 * GET  /api/v1/factories/:factoryId/optimization-results — list results
 * POST /api/v1/factories/:factoryId/optimization-results — record a result
 *
 * A result row is a record of something an optimizer actually produced:
 *   - written automatically by the adapter after a successful solve, or
 *   - POSTed here by an out-of-band harness that ran the Python service
 *     itself (useful before the HTTP interface is agreed).
 *
 * This endpoint stores what it is given. It never constructs a solution, and
 * it never derives one from a request.
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
  optimizationResultCreateSchema,
  optimizationResultListQuerySchema,
} from '@/lib/schemas/optimization'
import { parseSort } from '@/lib/schemas/common'
import {
  listOptimizationResults,
  optimizationRequestsRepository,
  optimizationResultsRepository,
} from '@/lib/repositories/optimization'
import { NotFoundError } from '@/lib/errors'
import { assertFactoryExists } from '@/lib/services/factories'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface Context {
  params: { factoryId: string }
}

export const GET = withFactoryAccess(async (request: NextRequest, { params }: Context) => {
  const factoryId = parseUuidParam(params.factoryId, 'factoryId')
  const query = parseSearchParams(request.nextUrl.searchParams, optimizationResultListQuerySchema)
  const sort = parseSort(query.sort, { column: 'created_at', ascending: false })

  const result = await listOptimizationResults(
    factoryId,
    { limit: query.limit, offset: query.offset, sortColumn: sort.column, sortAscending: sort.ascending },
    { status: query.status, optimization_request_id: query.optimization_request_id },
  )

  return ok(result.rows, { total: result.total ?? undefined, limit: query.limit, offset: query.offset })
})

export const POST = withFactoryAccess(async (request: NextRequest, { params }: Context) => {
  const factoryId = parseUuidParam(params.factoryId, 'factoryId')
  await assertFactoryExists(factoryId)

  const body = await parseBody(request, optimizationResultCreateSchema)

  if (body.optimization_request_id) {
    const parent = await optimizationRequestsRepository.getById(
      factoryId,
      body.optimization_request_id,
    )
    if (!parent) throw new NotFoundError('Optimization request', body.optimization_request_id)
  }

  const result = await optimizationResultsRepository.create(factoryId, body)

  return created(result, {
    location: `/api/v1/factories/${factoryId}/optimization-results/${result.id}`,
  })
})