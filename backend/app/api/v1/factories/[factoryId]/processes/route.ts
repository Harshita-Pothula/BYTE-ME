/**
 * GET  /api/v1/factories/:factoryId/processes — list processes
 * POST /api/v1/factories/:factoryId/processes — create a process
 *
 * `?include_dependencies=true` resolves each row's dependency edges to
 * readable slug/name pairs.
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
import { processCreateSchema, processListQuerySchema } from '@/lib/schemas/processes'
import { parseSort } from '@/lib/schemas/common'
import {
  listProcesses,
  processesRepository,
  withDependencies,
} from '@/lib/repositories/processes'
import { machinesRepository } from '@/lib/repositories/machines'
import { NotFoundError } from '@/lib/errors'
import { assertFactoryExists } from '@/lib/services/factories'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface Context {
  params: { factoryId: string }
}

export const GET = withFactoryAccess(async (request: NextRequest, { params }: Context) => {
  const factoryId = parseUuidParam(params.factoryId, 'factoryId')
  const query = parseSearchParams(request.nextUrl.searchParams, processListQuerySchema)
  const sort = parseSort(query.sort, { column: 'name', ascending: true })

  const result = await listProcesses(
    factoryId,
    { limit: query.limit, offset: query.offset, sortColumn: sort.column, sortAscending: sort.ascending },
    { machine_id: query.machine_id, is_active: query.is_active },
  )

  const rows = query.include_dependencies ? await withDependencies(factoryId, result.rows) : result.rows

  return ok(rows, { total: result.total ?? undefined, limit: query.limit, offset: query.offset })
})

export const POST = withFactoryAccess(async (request: NextRequest, { params }: Context) => {
  const factoryId = parseUuidParam(params.factoryId, 'factoryId')
  await assertFactoryExists(factoryId)

  const body = await parseBody(request, processCreateSchema)

  // The machine must belong to this factory. Catching it here gives a 404
  // naming the machine, instead of a bare FK violation.
  const machine = await machinesRepository.getById(factoryId, body.machine_id)
  if (!machine) {
    throw new NotFoundError('Machine', body.machine_id)
  }

  const process = await processesRepository.create(factoryId, body)

  return created(process, {
    location: `/api/v1/factories/${factoryId}/processes/${process.id}`,
  })
})