/**
 * GET  /api/v1/factories/:factoryId/process-dependencies — list dependency edges
 * POST /api/v1/factories/:factoryId/process-dependencies — create one edge
 *
 * Edges are directed: `process_id` must happen after `depends_on_process_id`.
 * Both processes must belong to this factory.
 */

import type { NextRequest } from 'next/server'
import { NotFoundError } from '@/lib/errors'
import { withFactoryAccess } from '@/lib/auth'
import {
  created,
  ok,
  parseJsonBody,
  parseSearchParams,
  parseUuidParam,
  parseWithSchema,
} from '@/lib/http'
import {
  processDependencyBulkSchema,
  processDependencyCreateSchema,
  processDependencyListQuerySchema,
} from '@/lib/schemas/processes'
import {
  bulkCreateDependencies,
  processDependenciesRepository,
  processesRepository,
} from '@/lib/repositories/processes'
import { parseSort } from '@/lib/schemas/common'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface Context {
  params: { factoryId: string }
}

export const GET = withFactoryAccess(async (request: NextRequest, { params }: Context) => {
  const factoryId = parseUuidParam(params.factoryId, 'factoryId')
  const query = parseSearchParams(request.nextUrl.searchParams, processDependencyListQuerySchema)
  const sort = parseSort(query.sort, { column: 'created_at', ascending: true })

  const result = await processDependenciesRepository.list(factoryId, {
    limit: query.limit,
    offset: query.offset,
    sortColumn: sort.column,
    sortAscending: sort.ascending,
  })

  // Narrow to one side of the edge when asked.
  const rows = result.rows.filter((row) => {
    if (query.process_id && row.process_id !== query.process_id) return false
    if (query.depends_on_process_id && row.depends_on_process_id !== query.depends_on_process_id) {
      return false
    }
    return true
  })

  return ok(rows, {
    total: result.total ?? undefined,
    limit: query.limit,
    offset: query.offset,
  })
})

/**
 * Validates that both endpoints of the edge exist in this factory.
 *
 * Without this, a foreign key to another factory's process would be accepted
 * and produce a nonsensical graph.
 */
async function assertBothProcesses(factoryId: string, processId: string, dependsOnId: string) {
  const [process, dependsOn] = await Promise.all([
    processesRepository.getById(factoryId, processId),
    processesRepository.getById(factoryId, dependsOnId),
  ])

  if (!process) throw new NotFoundError('Process', processId)
  if (!dependsOn) throw new NotFoundError('Process', dependsOnId)
}

/**
 * Creates one edge, or a whole batch.
 *
 * A body of `{ "dependencies": [...], "process_id": "..." }` is treated as a
 * bulk insert; anything else is a single edge.
 */
export const POST = withFactoryAccess(async (request: NextRequest, { params }: Context) => {
  const factoryId = parseUuidParam(params.factoryId, 'factoryId')

  const raw = await parseJsonBody(request)

  const isBulk =
    typeof raw === 'object' && raw !== null && Array.isArray((raw as Record<string, unknown>).dependencies)

  if (isBulk) {
    const body = parseWithSchema(processDependencyBulkSchema, raw)

    // Expand each `{ depends_on_process_id }` against the shared process_id.
    const inputs = body.dependencies.map((dependency) => ({
      process_id: body.process_id,
      depends_on_process_id: dependency.depends_on_process_id,
      dependency_type: dependency.dependency_type,
      lag_minutes: dependency.lag_minutes,
      metadata: dependency.metadata ?? {},
    }))

    for (const input of inputs) {
      await assertBothProcesses(factoryId, input.process_id, input.depends_on_process_id)
    }

    const rows = await bulkCreateDependencies(factoryId, inputs)
    return created(rows, { meta: { created: rows.length } })
  }

  const body = parseWithSchema(processDependencyCreateSchema, raw)

  await assertBothProcesses(factoryId, body.process_id, body.depends_on_process_id)

  const row = await processDependenciesRepository.create(factoryId, body)

  return created(row, {
    location: `/api/v1/factories/${factoryId}/process-dependencies/${row.id}`,
  })
})