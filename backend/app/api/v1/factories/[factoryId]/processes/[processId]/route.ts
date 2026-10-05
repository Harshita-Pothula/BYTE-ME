/**
 * GET    /api/v1/factories/:factoryId/processes/:processId
 * PATCH  /api/v1/factories/:factoryId/processes/:processId
 * DELETE /api/v1/factories/:factoryId/processes/:processId
 *
 * The GET response includes resolved `depends_on` / `blocks` edges.
 */

import type { NextRequest } from 'next/server'
import { NotFoundError } from '@/lib/errors'
import { withFactoryAccess } from '@/lib/auth'
import { ok, parseBody, parseUuidParam } from '@/lib/http'
import { processUpdateSchema } from '@/lib/schemas/processes'
import { processesRepository, withDependencies } from '@/lib/repositories/processes'
import { machinesRepository } from '@/lib/repositories/machines'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface Context {
  params: { factoryId: string; processId: string }
}

export const GET = withFactoryAccess(async (_request: NextRequest, { params }: Context) => {
  const factoryId = parseUuidParam(params.factoryId, 'factoryId')
  const processId = parseUuidParam(params.processId, 'processId')

  const process = await processesRepository.getById(factoryId, processId)
  if (!process) throw new NotFoundError('Process', processId)

  const [resolved] = await withDependencies(factoryId, [process])
  return ok(resolved)
})

export const PATCH = withFactoryAccess(async (request: NextRequest, { params }: Context) => {
  const factoryId = parseUuidParam(params.factoryId, 'factoryId')
  const processId = parseUuidParam(params.processId, 'processId')

  const body = await parseBody(request, processUpdateSchema)

  if (body.machine_id) {
    const machine = await machinesRepository.getById(factoryId, body.machine_id)
    if (!machine) throw new NotFoundError('Machine', body.machine_id)
  }

  return ok(await processesRepository.update(factoryId, processId, body))
})

/**
 * Deletes a process. Its dependency edges cascade; schedule entries referencing
 * it are restricted at the database level, so a process that appears in a
 * schedule cannot be dropped.
 */
export const DELETE = withFactoryAccess(async (_request: NextRequest, { params }: Context) => {
  const factoryId = parseUuidParam(params.factoryId, 'factoryId')
  const processId = parseUuidParam(params.processId, 'processId')

  const process = await processesRepository.getById(factoryId, processId)
  if (!process) throw new NotFoundError('Process', processId)

  await processesRepository.remove(factoryId, processId)

  return ok({ id: processId, deleted: true })
})