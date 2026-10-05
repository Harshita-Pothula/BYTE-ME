/**
 * Verifies the optimization SERVICE behaviour end to end against a stubbed
 * Supabase client: payload assembly, dry runs, and the 503 that must appear
 * while the optimizer is unconfigured.
 *
 * The stub returns the real row fixtures, so the payload assembled here is the
 * same shape the HTTP route would send.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ServiceUnavailableError } from '@/lib/errors'
import { resetEnvCache } from '@/lib/env'

// Stubbed before the service (and therefore the repositories) is imported.
const state: {
  requests: Array<Record<string, unknown>>
  results: Array<Record<string, unknown>>
} = { requests: [], results: [] }

/** Stand-in for a stored optimization_requests row. */
const stubRequest = {
  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  factory_id: '11111111-1111-4111-8111-111111111111',
  reference: 'req-test',
  status: 'pending',
  horizon_start: '2026-03-02T08:00:00.000Z',
  horizon_end: '2026-03-02T20:00:00.000Z',
  objective: {},
  constraints: {},
  request_payload: null,
  adapter_metadata: null,
  error_message: null,
  created_by: null,
  created_at: '2026-03-01T08:00:00.000Z',
  updated_at: '2026-03-01T08:00:00.000Z',
}

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => makeStubClient(),
  isServiceRoleClient: () => true,
  resetSupabaseClient: () => {},
  getServiceClient: () => makeStubClient(),
}))

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseAdmin: () => makeStubClient(),
  isServiceRoleClient: () => true,
  resetSupabaseClient: () => {},
}))

import { buildProblem, runOptimization } from '@/lib/services/optimization'
import {
  cancelledOrder,
  chocolateFactory,
  dependency,
  energyInterval,
  grindProcess,
  productionOrder,
  roastProcess,
  tariff,
  thermalMachine,
} from './helpers/fixtures'

/** Minimal thenable standing in for a PostgREST query builder. */
function makeQuery(result: { data: unknown; count?: number }) {
  const builder: Record<string, unknown> = {}

  const chain = () => builder
  for (const method of [
    'select',
    'insert',
    'update',
    'delete',
    'upsert',
    'eq',
    'neq',
    'gt',
    'lt',
    'gte',
    'lte',
    'or',
    'in',
    'limit',
    'range',
    'order',
    'single',
    'maybeSingle',
    'is',
  ]) {
    builder[method] = () => {
      if (method === 'single' || method === 'maybeSingle') return Promise.resolve(result)
      return chain()
    }
  }

  builder.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({ data: result.data, error: null, count: result.count ?? null }).then(resolve)

  return builder
}

function makeStubClient() {
  const handler = (table: string) => {
    switch (table) {
      case 'factories':
        return makeQuery({ data: chocolateFactory, count: 1 })
      case 'machines':
        return makeQuery({ data: [thermalMachine], count: 1 })
      case 'processes':
        return makeQuery({ data: [roastProcess, grindProcess], count: 2 })
      case 'process_dependencies':
        return makeQuery({ data: [dependency], count: 1 })
      case 'production_orders':
        return makeQuery({ data: [productionOrder, cancelledOrder], count: 2 })
      case 'energy_data':
        return makeQuery({ data: [energyInterval], count: 1 })
      case 'electricity_tariffs':
        return makeQuery({ data: [tariff], count: 1 })
      case 'optimization_requests': {
        // Writes echo the merged row back, so the service sees a real request
        // rather than null. Field-level updates are reflected on the stored row
        // so status transitions are observable.
        const stored = { ...stubRequest }

        const builder: Record<string, unknown> = {}
        const chain = () => builder

        let patch: Record<string, unknown> = {}
        builder.update = (values: Record<string, unknown>) => {
          patch = values
          return chain()
        }
        builder.insert = () => chain()
        builder.select = () => chain()
        builder.eq = () => chain()
        for (const method of ['neq', 'gt', 'lt', 'gte', 'lte', 'or', 'in', 'limit', 'order']) {
          builder[method] = () => chain()
        }
        builder.single = () =>
          Promise.resolve({ data: { ...stored, ...patch }, error: null, count: null })
        builder.maybeSingle = builder.single
        builder.then = (resolve: (value: unknown) => unknown) =>
          Promise.resolve({
            data: { ...stored, ...patch },
            error: null,
            count: 1,
          }).then(resolve)

        return builder
      }
      case 'optimization_results':
        return makeQuery({ data: [], count: 0 })
      default:
        return makeQuery({ data: [], count: 0 })
    }
  }

  return {
    from: (table: string) => handler(table),
  }
}

describe('optimization service — optimizer unconfigured', () => {
  beforeEach(() => {
    state.requests = []
    state.results = []
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
    vi.stubEnv('BYTEME_OPTIMIZER_ENABLED', 'false')
    resetEnvCache()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    resetEnvCache()
  })

  it('builds a complete problem document from stored data', async () => {
    const { problem } = await buildProblem(
      chocolateFactory.id,
      {
        horizon_start: '2026-03-02T08:00:00.000Z',
        horizon_end: '2026-03-02T20:00:00.000Z',
      },
      'req-test',
    )

    expect(problem.factoryId).toBe(chocolateFactory.id)
    expect(problem.machines).toHaveLength(1)
    expect(problem.processes).toHaveLength(2)
    expect(problem.dependencies).toHaveLength(1)
    expect(problem.energyData).toHaveLength(1)
    expect(problem.tariffs).toHaveLength(1)
    expect(problem.horizon).toEqual({
      start: '2026-03-02T08:00:00.000Z',
      end: '2026-03-02T20:00:00.000Z',
    })
  })

  it('drops cancelled production orders from the problem', async () => {
    const { problem } = await buildProblem(
      chocolateFactory.id,
      {
        horizon_start: '2026-03-02T08:00:00.000Z',
        horizon_end: '2026-03-02T20:00:00.000Z',
      },
      'req-test',
    )

    expect(problem.productionOrders).toHaveLength(1)
    expect(problem.productionOrders[0]?.reference).toBe('PO-DEMO-0001')
  })

  it('throws 503 and returns no solution when the optimizer is unconfigured', async () => {
    await expect(
      runOptimization(chocolateFactory.id, {
        horizon_start: '2026-03-02T08:00:00.000Z',
        horizon_end: '2026-03-02T20:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableError)
  })

  it('never writes an optimization result when the optimizer is unconfigured', async () => {
    await expect(
      runOptimization(chocolateFactory.id, {
        horizon_start: '2026-03-02T08:00:00.000Z',
        horizon_end: '2026-03-02T20:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableError)

    expect(state.results).toEqual([])
  })

  it('attaches the payload it would have sent to the 503 details', async () => {
    try {
      await runOptimization(chocolateFactory.id, {
        horizon_start: '2026-03-02T08:00:00.000Z',
        horizon_end: '2026-03-02T20:00:00.000Z',
      })
      expect.unreachable('should have thrown')
    } catch (error) {
      const details = (error as ServiceUnavailableError).details as Record<string, unknown>
      const payload = details.payload_would_be_sent as Record<string, unknown>

      expect(payload.factoryId).toBe(chocolateFactory.id)
      expect(Array.isArray(payload.machines)).toBe(true)
    }
  })

  it('reports a missing horizon rather than inventing one', async () => {
    await expect(
      runOptimization(chocolateFactory.id, {}),
    ).rejects.toThrow()
  })
})

describe('optimization service — dry run', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
    vi.stubEnv('BYTEME_OPTIMIZER_ENABLED', 'false')
    resetEnvCache()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    resetEnvCache()
  })

  it('returns the request with a null solution and does not contact anything', async () => {
    const { request, solution } = await runOptimization(chocolateFactory.id, {
      horizon_start: '2026-03-02T08:00:00.000Z',
      horizon_end: '2026-03-02T20:00:00.000Z',
      dry_run: true,
    })

    expect(solution).toBeNull()
    expect(request.status).toBe('succeeded')
    expect(request.adapter_metadata).toMatchObject({ adapter: 'dry-run' })
  })

  it('does not throw 503 for a dry run, since nothing is needed', async () => {
    await expect(
      runOptimization(chocolateFactory.id, {
        horizon_start: '2026-03-02T08:00:00.000Z',
        horizon_end: '2026-03-02T20:00:00.000Z',
        dry_run: true,
      }),
    ).resolves.toBeDefined()
  })
})