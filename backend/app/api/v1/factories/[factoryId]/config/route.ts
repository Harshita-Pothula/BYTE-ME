/**
 * GET   /api/v1/factories/:factoryId/config  — read the factory configuration
 * PATCH /api/v1/factories/:factoryId/config  — merge keys into the configuration
 * PUT   /api/v1/factories/:factoryId/config  — replace the configuration
 *
 * `config` holds the factory-specific knobs the optimizer consumes: grid limits,
 * scheduling limits, energy-balance preferences. It is deliberately unstructured,
 * so PATCH merges rather than replaces: a null value deletes a key.
 */

import type { NextRequest } from 'next/server'
import { withFactoryAccess } from '@/lib/auth'
import { ok, parseBody, parseUuidParam } from '@/lib/http'
import {
  factoryConfigReplaceSchema,
  factoryConfigUpdateSchema,
} from '@/lib/schemas/factories'
import { factoriesRepository } from '@/lib/repositories/factories'
import { requireFactory } from '@/lib/services/factories'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface Context {
  params: { factoryId: string }
}

export const GET = withFactoryAccess(async (_request: NextRequest, { params }: Context) => {
  const factoryId = parseUuidParam(params.factoryId, 'factoryId')
  const factory = await requireFactory(factoryId)

  return ok({ factory_id: factory.id, config: factory.config, metadata: factory.metadata })
})

/** Shallow merge. A `null` value removes the key; other keys are untouched. */
export const PATCH = withFactoryAccess(async (request: NextRequest, { params }: Context) => {
  const factoryId = parseUuidParam(params.factoryId, 'factoryId')
  const body = await parseBody(request, factoryConfigUpdateSchema)

  const factory = await factoriesRepository.patchConfig(factoryId, body.config)
  return ok({ factory_id: factory.id, config: factory.config, metadata: factory.metadata })
})

/** Full replacement of `config`. */
export const PUT = withFactoryAccess(async (request: NextRequest, { params }: Context) => {
  const factoryId = parseUuidParam(params.factoryId, 'factoryId')
  const body = await parseBody(request, factoryConfigReplaceSchema)

  const factory = await factoriesRepository.replaceConfig(factoryId, body.config)
  return ok({ factory_id: factory.id, config: factory.config, metadata: factory.metadata })
})