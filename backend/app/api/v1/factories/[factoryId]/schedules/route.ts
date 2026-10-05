/**
 * GET  /api/v1/factories/:factoryId/schedules — list schedules
 * POST /api/v1/factories/:factoryId/schedules — create a schedule
 *
 * A schedule is an accepted plan. ByteMe only creates one when a real optimizer
 * result exists (POST /optimization-requests, or a manually recorded result
 * that a human or an out-of-band harness produced). This endpoint never invents
 * entries.
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
import { scheduleCreateSchema, scheduleListQuerySchema } from '@/lib/schemas/schedules'
import { parseSort } from '@/lib/schemas/common'
import { listSchedules, schedulesRepository } from '@/lib/repositories/schedules'
import { assertFactoryExists } from '@/lib/services/factories'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface Context {
  params: { factoryId: string }
}

export const GET = withFactoryAccess(async (request: NextRequest, { params }: Context) => {
  const factoryId = parseUuidParam(params.factoryId, 'factoryId')
  const query = parseSearchParams(request.nextUrl.searchParams, scheduleListQuerySchema)
  const sort = parseSort(query.sort, { column: 'created_at', ascending: false })

  const result = await listSchedules(
    factoryId,
    { limit: query.limit, offset: query.offset, sortColumn: sort.column, sortAscending: sort.ascending },
    { status: query.status, active_at: query.active_at },
  )

  return ok(result.rows, { total: result.total ?? undefined, limit: query.limit, offset: query.offset })
})

export const POST = withFactoryAccess(async (request: NextRequest, { params }: Context) => {
  const factoryId = parseUuidParam(params.factoryId, 'factoryId')
  await assertFactoryExists(factoryId)

  const body = await parseBody(request, scheduleCreateSchema)
  const schedule = await schedulesRepository.create(factoryId, body)

  return created(schedule, {
    location: `/api/v1/factories/${factoryId}/schedules/${schedule.id}`,
  })
})