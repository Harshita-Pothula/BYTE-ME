/**
 * GET  /api/v1/factories  — list the factories the caller may access
 * POST /api/v1/factories  — create a factory (administrators only)
 *
 * AUTHORIZATION
 *   GET  requires a valid access token and is filtered to the factories in the
 *        caller's grants, so this collection can never be used to enumerate
 *        every factory in the database. A caller with no grants gets 403.
 *   POST creates a tenant root, which would grant nothing to the caller and
 *        could not be represented in the claim-based grant model without a
 *        membership table. It is therefore restricted to administrators, who
 *        then assign `factory_ids` to the intended user.
 */

import type { NextRequest } from 'next/server'
import { assertAnyFactoryAccess, assertFactoryAdmin, authenticateRequest, withAuthentication } from '@/lib/auth'
import { created, ok, parseBody, parseSearchParams } from '@/lib/http'
import { factoryCreateSchema, factoryListQuerySchema } from '@/lib/schemas/factories'
import { parseSort } from '@/lib/schemas/common'
import { factoriesRepository } from '@/lib/repositories/factories'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = withAuthentication(async (request: NextRequest) => {
  const user = await authenticateRequest(request)
  assertAnyFactoryAccess(user)

  const query = parseSearchParams(request.nextUrl.searchParams, factoryListQuerySchema)
  const sort = parseSort(query.sort, { column: 'created_at', ascending: false })

  const result = await factoriesRepository.list(
    { limit: query.limit, offset: query.offset, sortColumn: sort.column, sortAscending: sort.ascending },
    {
      is_active: query.is_active,
      // An administrator sees everything; everyone else sees only their grants.
      ids: user.access.isAdmin ? undefined : [...user.access.factoryIds],
    },
  )

  return ok(result.rows, { total: result.total ?? undefined, limit: query.limit, offset: query.offset })
})

export const POST = withAuthentication(async (request: NextRequest) => {
  const user = await authenticateRequest(request)
  assertFactoryAdmin(user)

  const body = await parseBody(request, factoryCreateSchema)
  const factory = await factoriesRepository.create(body)

  return created(factory, { location: `/api/v1/factories/${factory.id}` })
})