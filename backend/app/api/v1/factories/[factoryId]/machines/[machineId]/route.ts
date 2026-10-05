/**
 * GET    /api/v1/factories/:factoryId/machines/:machineId
 * PATCH  /api/v1/factories/:factoryId/machines/:machineId
 * DELETE /api/v1/factories/:factoryId/machines/:machineId
 *
 * DELETE fails with a 400 when processes still reference the machine: the
 * column is `on delete restrict`, because dropping a machine that a live
 * schedule refers to would silently corrupt history.
 */

import type { NextRequest } from 'next/server'
import { NotFoundError, ValidationError } from '@/lib/errors'
import { withFactoryAccess } from '@/lib/auth'
import { ok, parseBody, parseUuidParam } from '@/lib/http'
import { machineUpdateSchema } from '@/lib/schemas/machines'
import { machinesRepository } from '@/lib/repositories/machines'
import { processesRepository } from '@/lib/repositories/processes'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface Context {
  params: { factoryId: string; machineId: string }
}

export const GET = withFactoryAccess(async (_request: NextRequest, { params }: Context) => {
  const factoryId = parseUuidParam(params.factoryId, 'factoryId')
  const machineId = parseUuidParam(params.machineId, 'machineId')

  const machine = await machinesRepository.getById(factoryId, machineId)
  if (!machine) throw new NotFoundError('Machine', machineId)

  return ok(machine)
})

export const PATCH = withFactoryAccess(async (request: NextRequest, { params }: Context) => {
  const factoryId = parseUuidParam(params.factoryId, 'factoryId')
  const machineId = parseUuidParam(params.machineId, 'machineId')

  const body = await parseBody(request, machineUpdateSchema)
  return ok(await machinesRepository.update(factoryId, machineId, body))
})

export const DELETE = withFactoryAccess(async (_request: NextRequest, { params }: Context) => {
  const factoryId = parseUuidParam(params.factoryId, 'factoryId')
  const machineId = parseUuidParam(params.machineId, 'machineId')

  const machine = await machinesRepository.getById(factoryId, machineId)
  if (!machine) throw new NotFoundError('Machine', machineId)

  // Report what is blocking the delete, rather than letting the FK constraint
  // surface as a bare constraint-violation error.
  const processes = await processesRepository.list(factoryId, { limit: 200, offset: 0 })
  const dependents = processes.rows.filter((process) => process.machine_id === machineId)

  if (dependents.length > 0) {
    throw new ValidationError('Cannot delete a machine that still has processes attached', {
      machine_id: machineId,
      process_count: dependents.length,
      example_processes: dependents.slice(0, 5).map((p) => ({ id: p.id, slug: p.slug, name: p.name })),
      hint: 'Delete or reassign these processes first, or deactivate the machine with PATCH { "is_active": false }.',
    })
  }

  await machinesRepository.remove(factoryId, machineId)

  return ok({ id: machineId, deleted: true })
})