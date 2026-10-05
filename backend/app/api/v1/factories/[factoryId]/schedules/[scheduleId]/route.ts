/**
 * GET    /api/v1/factories/:factoryId/schedules/:scheduleId
 * PATCH  /api/v1/factories/:factoryId/schedules/:scheduleId
 * DELETE /api/v1/factories/:factoryId/schedules/:scheduleId
 *
 * GET returns the schedule with its chronological entries and totals recomputed
 * from those entries, so a client can verify the stored aggregates.
 */

import type { NextRequest } from 'next/server'
import { NotFoundError } from '@/lib/errors'
import { withFactoryAccess } from '@/lib/auth'
import { ok, parseBody, parseUuidParam } from '@/lib/http'
import { scheduleUpdateSchema } from '@/lib/schemas/schedules'
import {
  getScheduleWithEntries,
  schedulesRepository,
} from '@/lib/repositories/schedules'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface Context {
  params: { factoryId: string; scheduleId: string }
}

export const GET = withFactoryAccess(async (_request: NextRequest, { params }: Context) => {
  const factoryId = parseUuidParam(params.factoryId, 'factoryId')
  const scheduleId = parseUuidParam(params.scheduleId, 'scheduleId')

  const schedule = await getScheduleWithEntries(factoryId, scheduleId)
  if (!schedule) throw new NotFoundError('Schedule', scheduleId)

  return ok(schedule)
})

export const PATCH = withFactoryAccess(async (request: NextRequest, { params }: Context) => {
  const factoryId = parseUuidParam(params.factoryId, 'factoryId')
  const scheduleId = parseUuidParam(params.scheduleId, 'scheduleId')

  const body = await parseBody(request, scheduleUpdateSchema)

  return ok(await schedulesRepository.update(factoryId, scheduleId, body))
})

/** Deletes a schedule; its entries cascade. */
export const DELETE = withFactoryAccess(async (_request: NextRequest, { params }: Context) => {
  const factoryId = parseUuidParam(params.factoryId, 'factoryId')
  const scheduleId = parseUuidParam(params.scheduleId, 'scheduleId')

  await schedulesRepository.remove(factoryId, scheduleId)

  return ok({ id: scheduleId, deleted: true })
})