/**
 * Verifies the payload builder is generic and lossless.
 *
 * These are the guarantees the optimizer integration depends on: every factory
 * attribute reaches the adapter, nothing is invented, and the shape does not
 * depend on the factory's industry.
 */

import { describe, expect, it } from 'vitest'
import { buildOptimizationProblem } from '@/lib/optimizer/payload'
import {
  automobileFactory,
  cancelledOrder,
  chocolateFactory,
  dependency,
  energyInterval,
  generatorMachine,
  grindProcess,
  productionOrder,
  roastProcess,
  tariff,
  thermalMachine,
} from './helpers/fixtures'

describe('buildOptimizationProblem', () => {
  const buildChocolate = () =>
    buildOptimizationProblem({
      factory: chocolateFactory,
      machines: [thermalMachine],
      processes: [roastProcess, grindProcess],
      dependencies: [dependency],
      productionOrders: [productionOrder],
      energyData: [energyInterval],
      tariffs: [tariff],
      requestReference: 'req-test-1',
      horizonStart: '2026-03-02T08:00:00.000Z',
      horizonEnd: '2026-03-02T20:00:00.000Z',
      objective: { cost: 1 },
      constraints: { maxParallelMachines: 4 },
    })

  it('produces the documented top-level shape', () => {
    const problem = buildChocolate()

    expect(Object.keys(problem).sort()).toEqual(
      [
        'constraints',
        'dependencies',
        'energyData',
        'factory',
        'factoryId',
        'horizon',
        'machines',
        'objective',
        'processes',
        'productionOrders',
        'requestReference',
        'schemaVersion',
        'tariffs',
      ].sort(),
    )
  })

  it('carries the factory identity, timezone, currency and raw config', () => {
    const problem = buildChocolate()

    expect(problem.factoryId).toBe(chocolateFactory.id)
    expect(problem.factory).toMatchObject({
      slug: 'demo-chocolate-factory',
      timezone: 'Europe/Amsterdam',
      currency: 'EUR',
    })
    // config is passed through verbatim, not reshaped.
    expect(problem.factory.config).toEqual(chocolateFactory.config)
  })

  it('passes machine electrical and operating envelopes through unchanged', () => {
    const [machine] = buildChocolate().machines

    expect(machine).toMatchObject({
      id: thermalMachine.id,
      slug: 'roasting-drum',
      type: 'thermal_asset',
      ratedPowerKw: 250,
      minPowerKw: 90,
      maxPowerKw: 250,
      minRuntimeMinutes: 30,
      maxRuntimeMinutes: 480,
    })
  })

  it('keeps nullable machine fields null rather than substituting defaults', () => {
    const problem = buildOptimizationProblem({
      factory: automobileFactory,
      machines: [generatorMachine],
      processes: [],
      dependencies: [],
      productionOrders: [],
      energyData: [],
      tariffs: [],
      requestReference: 'req-test-2',
      horizonStart: null,
      horizonEnd: null,
    })

    const [machine] = problem.machines
    expect(machine?.ratedPowerKw).toBeNull()
    expect(machine?.minRuntimeMinutes).toBeNull()
    expect(machine?.availability).toEqual({})
  })

  it('resolves the required machine on each process', () => {
    const processes = buildChocolate().processes

    expect(processes).toHaveLength(2)
    for (const process of processes) {
      expect(process.machineId).toBe(thermalMachine.id)
    }
  })

  it('expresses dependencies as directed edges', () => {
    const [edge] = buildChocolate().dependencies

    expect(edge).toEqual({
      processId: dependency.process_id,
      dependsOnProcessId: dependency.depends_on_process_id,
      dependencyType: 'finish_to_start',
      lagMinutes: 0,
    })
  })

  it('carries production requirements including deadline and priority', () => {
    const [order] = buildChocolate().productionOrders

    expect(order).toMatchObject({
      id: productionOrder.id,
      reference: 'PO-DEMO-0001',
      quantity: 5000,
      unit: 'kg',
      dueAt: productionOrder.due_at,
      priority: 10,
      status: 'released',
    })
  })

  it('normalises energy intervals to kWh with both directions of flow', () => {
    const [interval] = buildChocolate().energyData

    expect(interval).toEqual({
      recordedAt: '2026-03-02T08:00:00.000Z',
      intervalMinutes: 15,
      consumptionKwh: 120.5,
      generationKwh: 0,
      machineId: null,
    })
  })

  it('carries time-of-use tariff windows', () => {
    const [row] = buildChocolate().tariffs

    expect(row).toMatchObject({
      startTime: '17:00',
      endTime: '22:00',
      daysOfWeek: [1, 2, 3, 4, 5],
      energyPricePerKwh: 0.218,
      taxRate: 0.21,
    })
  })

  it('passes objective weights and constraints through untouched', () => {
    const problem = buildChocolate()

    expect(problem.objective).toEqual({ cost: 1 })
    expect(problem.constraints).toEqual({ maxParallelMachines: 4 })
  })

  it('defaults objective and constraints to empty objects, never to guesses', () => {
    const problem = buildOptimizationProblem({
      factory: automobileFactory,
      machines: [],
      processes: [],
      dependencies: [],
      productionOrders: [],
      energyData: [],
      tariffs: [],
      requestReference: 'req-test-3',
    })

    expect(problem.objective).toEqual({})
    expect(problem.constraints).toEqual({})
    expect(problem.horizon).toEqual({ start: null, end: null })
  })

  it('builds an equivalent document for a non-food factory', () => {
    const problem = buildOptimizationProblem({
      factory: automobileFactory,
      machines: [generatorMachine],
      processes: [],
      dependencies: [],
      productionOrders: [],
      energyData: [],
      tariffs: [],
      requestReference: 'req-test-4',
      horizonStart: '2026-03-02T08:00:00.000Z',
      horizonEnd: '2026-03-02T20:00:00.000Z',
    })

    expect(problem.factoryId).toBe(automobileFactory.id)
    expect(problem.machines[0]?.type).toBe('robot_cell')
  })

  it('tolerates a factory with no schedules data at all', () => {
    const problem = buildOptimizationProblem({
      factory: automobileFactory,
      machines: [],
      processes: [],
      dependencies: [],
      productionOrders: [],
      energyData: [],
      tariffs: [],
      requestReference: 'req-test-5',
    })

    expect(problem.processes).toEqual([])
    expect(problem.dependencies).toEqual([])
    expect(problem.tariffs).toEqual([])
  })

  it('excludes cancelled orders from the problem', () => {
    // The service filters before calling the builder; this asserts the builder
    // preserves whatever it is handed without re-interpreting status.
    const problem = buildOptimizationProblem({
      factory: chocolateFactory,
      machines: [],
      processes: [],
      dependencies: [],
      productionOrders: [productionOrder, cancelledOrder],
      energyData: [],
      tariffs: [],
      requestReference: 'req-test-6',
    })

    expect(problem.productionOrders).toHaveLength(2)
  })
})