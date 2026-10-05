/**
 * GET  /api/v1/factories/:factoryId/schedules/:scheduleId/entries — list entries
 * POST /api/v1/factories/:factoryId/schedules/:scheduleId/entries — add entries
 * PUT  /api/v1/factories/:factoryId/schedules/:scheduleId/entries — replace all
 *
 * Entries are only ever supplied by a caller: this endpoint stores what it is
 * given (typically transcribed from a real optimizer result) and never derives
 * entries itself.
 *
 * Overlapping entries on the SAME machine are rejected with 409, because a
 * machine cannot run two processes at once.
 */

import type { NextRequest } from 'next/server'
import { ConflictError, NotFoundError } from '@/lib/errors'
import { withFactoryAccess } from '@/lib/auth'
import {
  created,
  ok,
  parseBody,
  parseJsonBody,
  parseSearchParams,
  parseWithSchema,
  parseUuidParam,
} from '@/lib/http'
import {
  scheduleEntryBulkSchema,
  scheduleEntryCreateSchema,
  scheduleEntryListQuerySchema,
} from '@/lib/schemas/schedules'
import { parseSort } from '@/lib/schemas/common'
import {
  computeTotals,
  findOverlappingEntries,
  scheduleEntriesRepository,
  schedulesRepository,
} from '@/lib/repositories/schedules'
import { processesRepository } from '@/lib/repositories/processes'
import { machinesRepository } from '@/lib/repositories/machines'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface Context {
  params: { factoryId: string; scheduleId: string }
}

/** Confirms the schedule exists and belongs to this factory. */
async function requireSchedule(factoryId: string, scheduleId: string) {
  const schedule = await schedulesRepository.getById(factoryId, scheduleId)
  if (!schedule) throw new NotFoundError('Schedule', scheduleId)
  return schedule
}

/**
 * Confirms the machine and process exist in this factory.
 *
 * Entries reference both, and a cross-factory reference would produce a
 * schedule the optimizer could never validate.
 */
async function requireMachineAndProcess(
  factoryId: string,
  machineId: string,
  processId: string,
) {
  const [machine, process] = await Promise.all([
    machinesRepository.getById(factoryId, machineId),
    processesRepository.getById(factoryId, processId),
  ])

  if (!machine) throw new NotFoundError('Machine', machineId)
  if (!process) throw new NotFoundError('Process', processId)
}

export const GET = withFactoryAccess(async (request: NextRequest, { params }: Context) => {
  const factoryId = parseUuidParam(params.factoryId, 'factoryId')
  const scheduleId = parseUuidParam(params.scheduleId, 'scheduleId')
  const query = parseSearchParams(request.nextUrl.searchParams, scheduleEntryListQuerySchema)
  const sort = parseSort(query.sort, { column: 'starts_at', ascending: true })

  await requireSchedule(factoryId, scheduleId)

  const result = await scheduleEntriesRepository.list(scheduleId, {
    limit: query.limit,
    offset: query.offset,
    sortColumn: sort.column,
    sortAscending: sort.ascending,
  })

  const rows = result.rows.filter((row) => {
    if (query.machine_id && row.machine_id !== query.machine_id) return false
    if (query.process_id && row.process_id !== query.process_id) return false
    if (query.production_order_id && row.production_order_id !== query.production_order_id) {
      return false
    }
    if (query.from && row.ends_at <= query.from) return false
    if (query.to && row.starts_at >= query.to) return false
    return true
  })

  return ok(rows, { total: result.total ?? undefined, limit: query.limit, offset: query.offset })
})

/** Appends one entry, or a batch of them. */
export const POST = withFactoryAccess(async (request: NextRequest, { params }: Context) => {
  const factoryId = parseUuidParam(params.factoryId, 'factoryId')
  const scheduleId = parseUuidParam(params.scheduleId, 'scheduleId')
  await requireSchedule(factoryId, scheduleId)

  const raw = await parseJsonBody(request)

  const isBatch =
    typeof raw === 'object' && raw !== null && Array.isArray((raw as Record<string, unknown>).entries)

  const entries = isBatch
    ? parseWithSchema(scheduleEntryBulkSchema, raw).entries
    : [parseWithSchema(scheduleEntryCreateSchema, raw)]

  for (const entry of entries) {
    await requireMachineAndProcess(factoryId, entry.machine_id, entry.process_id)

    const overlapping = await findOverlappingEntries(
      scheduleId,
      entry.machine_id,
      entry.starts_at,
      entry.ends_at,
    )

    if (overlapping.length > 0) {
      throw new ConflictError('Machine is already scheduled during that interval', {
        machine_id: entry.machine_id,
        requested: { starts_at: entry.starts_at, ends_at: entry.ends_at },
        conflicting_entry_ids: overlapping.map((row) => row.id),
      })
    }
  }

  // A batch is written in ONE transaction. Inserting row by row meant entry 4
  // of 5 failing left the first three committed while the caller was told the
  // whole request had failed.
  const createdRows = isBatch
    ? await scheduleEntriesRepository.appendMany(scheduleId, { entries })
    : [await scheduleEntriesRepository.create(scheduleId, entries[0] as (typeof entries)[number])]

  return isBatch
    ? created(createdRows, { meta: { created: createdRows.length } })
    : created(createdRows[0] as (typeof createdRows)[number], {
        location: `/api/v1/factories/${factoryId}/schedules/${scheduleId}/entries/${createdRows[0]?.id}`,
      })
})

/** Replaces every entry of the schedule with the supplied set. */
export const PUT = withFactoryAccess(async (request: NextRequest, { params }: Context) => {
  const factoryId = parseUuidParam(params.factoryId, 'factoryId')
  const scheduleId = parseUuidParam(params.scheduleId, 'scheduleId')
  await requireSchedule(factoryId, scheduleId)

  const body = await parseBody(request, scheduleEntryBulkSchema)

  for (const entry of body.entries) {
    await requireMachineAndProcess(factoryId, entry.machine_id, entry.process_id)
  }

  // Check overlaps within the incoming batch itself, since the table has no
  // exclusion constraint to catch them.
  const byMachine = new Map<string, typeof body.entries>()
  for (const entry of body.entries) {
    const list = byMachine.get(entry.machine_id) ?? []
    list.push(entry)
    byMachine.set(entry.machine_id, list)
  }

  for (const [machineId, list] of byMachine) {
    const sorted = [...list].sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    for (let i = 1; i < sorted.length; i += 1) {
      const previous = sorted[i - 1]
      const current = sorted[i]
      if (previous && current && previous.ends_at > current.starts_at) {
        throw new ConflictError('Machine is scheduled twice at overlapping times in this batch', {
          machine_id: machineId,
          first: { starts_at: previous.starts_at, ends_at: previous.ends_at },
          second: { starts_at: current.starts_at, ends_at: current.ends_at },
        })
      }
    }
  }

  // Delete, insert and the schedule-row update commit together, so a failure
  // anywhere leaves the previous entries intact rather than emptying the
  // schedule. Totals are recomputed from the incoming entries and written in
  // the same transaction, so the schedule's stored totals can never describe
  // entries that are not there.
  const totals = computeTotals(body.entries)
  const rows = await scheduleEntriesRepository.replaceAll(scheduleId, body, {
    ...(body.schedule?.status !== undefined ? { status: body.schedule.status } : {}),
    total_energy_kwh: totals.total_energy_kwh,
    total_energy_cost: totals.total_energy_cost,
    peak_demand_kw: totals.peak_demand_kw,
    ...(body.schedule?.metadata !== undefined ? { metadata: body.schedule.metadata } : {}),
  })

  return ok(rows, {
    meta: {
      replaced: rows.length,
      totals: {
        total_energy_kwh: totals.total_energy_kwh,
        total_energy_cost: totals.total_energy_cost,
        peak_demand_kw: totals.peak_demand_kw,
      },
    },
  })
})