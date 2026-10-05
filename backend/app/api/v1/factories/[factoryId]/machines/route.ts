/**
 * GET  /api/v1/factories/:factoryId/machines — list machines
 * POST /api/v1/factories/:factoryId/machines — create a machine
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
import { machineCreateSchema, machineListQuerySchema } from '@/lib/schemas/machines'
import { parseSort } from '@/lib/schemas/common'
import { listMachines, machinesRepository } from '@/lib/repositories/machines'
import { assertFactoryExists } from '@/lib/services/factories'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface Context {
  params: { factoryId: string }
}

export const GET = withFactoryAccess(async (request: NextRequest, { params }: Context) => {
  const factoryId = parseUuidParam(params.factoryId, 'factoryId')
  const query = parseSearchParams(request.nextUrl.searchParams, machineListQuerySchema)
  const sort = parseSort(query.sort, { column: 'name', ascending: true })

  const result = await listMachines(
    factoryId,
    { limit: query.limit, offset: query.offset, sortColumn: sort.column, sortAscending: sort.ascending },
    { type: query.type, is_active: query.is_active },
  )

  return ok(result.rows, { total: result.total ?? undefined, limit: query.limit, offset: query.offset })
})

export const POST = withFactoryAccess(async (request: NextRequest, { params }: Context) => {
  const factoryId = parseUuidParam(params.factoryId, 'factoryId')
  await assertFactoryExists(factoryId)

  const body = await parseBody(request, machineCreateSchema)
  const machine = await machinesRepository.create(factoryId, body)

  return created(machine, { location: `/api/v1/factories/${factoryId}/machines/${machine.id}` })
})