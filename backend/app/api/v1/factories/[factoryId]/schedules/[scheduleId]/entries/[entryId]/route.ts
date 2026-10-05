/**
 * GET    /api/v1/factories/:factoryId/schedules/:scheduleId/entries/:entryId
 * PATCH  /api/v1/factories/:factoryId/schedules/:scheduleId/entries/:entryId
 * DELETE /api/v1/factories/:factoryId/schedules/:scheduleId/entries/:entryId
 */

import type { NextRequest } from 'next/server'
import { ConflictError, NotFoundError } from '@/lib/errors'
import { withFactoryAccess } from '@/lib/auth'
import { ok, parseBody, parseUuidParam } from '@/lib/http'
import { scheduleEntryUpdateSchema } from '@/lib/schemas/schedules'
import {
  findOverlappingEntries,
  scheduleEntriesRepository,
} from '@/lib/repositories/schedules'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface Context {
  params: { factoryId: string; scheduleId: string; entryId: string }
}

export const GET = withFactoryAccess(async (_request: NextRequest, { params }: Context) => {
  const scheduleId = parseUuidParam(params.scheduleId, 'scheduleId')
  const entryId = parseUuidParam(params.entryId, 'entryId')

  const entry = await scheduleEntriesRepository.getById(scheduleId, entryId)
  if (!entry) throw new NotFoundError('Schedule entry', entryId)

  return ok(entry)
})

/** Moves an entry in time or changes its values, rejecting machine overlaps. */
export const PATCH = withFactoryAccess(async (request: NextRequest, { params }: Context) => {
  const scheduleId = parseUuidParam(params.scheduleId, 'scheduleId')
  const entryId = parseUuidParam(params.entryId, 'entryId')
  parseUuidParam(params.factoryId, 'factoryId')

  const body = await parseBody(request, scheduleEntryUpdateSchema)

  const existing = await scheduleEntriesRepository.getById(scheduleId, entryId)
  if (!existing) throw new NotFoundError('Schedule entry', entryId)

  // A partial PATCH may move the window, so validate the merged result.
  const startsAt = body.starts_at ?? existing.starts_at
  const endsAt = body.ends_at ?? existing.ends_at

  if (new Date(startsAt) >= new Date(endsAt)) {
    throw new ConflictError('ends_at must be after starts_at', { starts_at: startsAt, ends_at: endsAt })
  }

  const overlapping = await findOverlappingEntries(
    scheduleId,
    existing.machine_id,
    startsAt,
    endsAt,
    entryId,
  )

  if (overlapping.length > 0) {
    throw new ConflictError('Machine is already scheduled during that interval', {
      machine_id: existing.machine_id,
      requested: { starts_at: startsAt, ends_at: endsAt },
      conflicting_entry_ids: overlapping.map((row) => row.id),
    })
  }

  return ok(await scheduleEntriesRepository.update(scheduleId, entryId, body))
})

export const DELETE = withFactoryAccess(async (_request: NextRequest, { params }: Context) => {
  const scheduleId = parseUuidParam(params.scheduleId, 'scheduleId')
  const entryId = parseUuidParam(params.entryId, 'entryId')

  await scheduleEntriesRepository.remove(scheduleId, entryId)

  return ok({ id: entryId, deleted: true })
})