/**
 * Builds an `OptimizationProblem` from database rows.
 *
 * This is pure data assembly: no factory-specific knowledge, no defaults that
 * imply what the optimizer should do, no solving. If a factory has no tariffs
 * or no energy data, the corresponding array is simply empty and the optimizer
 * decides what that means.
 */

import type {
  FactoryRow,
  MachineRow,
  ProcessDependencyRow,
  ProcessRow,
  ProductionOrderRow,
  ElectricityTariffRow,
  EnergyDataRow,
} from '../schemas'
import {
  OPTIMIZATION_SCHEMA_VERSION,
  type OptimizationProblem,
  type ProblemDependency,
  type ProblemEnergyInterval,
  type ProblemMachine,
  type ProblemProcess,
  type ProblemProductionOrder,
  type ProblemTariff,
} from './contract'

export interface BuildProblemInput {
  factory: FactoryRow
  machines: MachineRow[]
  processes: ProcessRow[]
  dependencies: ProcessDependencyRow[]
  productionOrders: ProductionOrderRow[]
  energyData: EnergyDataRow[]
  tariffs: ElectricityTariffRow[]
  requestReference: string
  horizonStart?: string | null
  horizonEnd?: string | null
  objective?: Record<string, unknown>
  constraints?: Record<string, unknown>
}

/**
 * Assembles the problem document.
 *
 * Machine/process ids are carried as UUIDs because they are the stable keys in
 * this database; slugs and names are included alongside so a Python service
 * can report readable identifiers without a second lookup.
 */
export function buildOptimizationProblem(input: BuildProblemInput): OptimizationProblem {
  const { factory } = input

  return {
    schemaVersion: OPTIMIZATION_SCHEMA_VERSION,
    requestReference: input.requestReference,
    factoryId: factory.id,

    factory: {
      slug: factory.slug,
      name: factory.name,
      timezone: factory.timezone,
      currency: factory.currency,
      config: factory.config,
      metadata: factory.metadata,
    },

    horizon: {
      start: input.horizonStart ?? null,
      end: input.horizonEnd ?? null,
    },

    machines: input.machines.map(toProblemMachine),
    processes: input.processes.map(toProblemProcess),
    dependencies: input.dependencies.map(toProblemDependency),
    productionOrders: input.productionOrders.map(toProblemProductionOrder),
    energyData: input.energyData.map(toProblemEnergyInterval),
    tariffs: input.tariffs.map(toProblemTariff),

    // Caller values win; factory config is passed through under `factory`
    // rather than silently merged in, so the optimizer sees exactly what the
    // caller asked for.
    objective: input.objective ?? {},
    constraints: input.constraints ?? {},
  }
}

function toProblemMachine(machine: MachineRow): ProblemMachine {
  return {
    id: machine.id,
    slug: machine.slug,
    name: machine.name,
    type: machine.type,
    ratedPowerKw: machine.rated_power_kw,
    minPowerKw: machine.min_power_kw,
    maxPowerKw: machine.max_power_kw,
    minRuntimeMinutes: machine.min_runtime_minutes,
    maxRuntimeMinutes: machine.max_runtime_minutes,
    availability: machine.availability,
    metadata: machine.metadata,
  }
}

function toProblemProcess(process: ProcessRow): ProblemProcess {
  return {
    id: process.id,
    slug: process.slug,
    name: process.name,
    description: process.description,
    durationMinutes: process.duration_minutes,
    machineId: process.machine_id,
    powerRequirementKw: process.power_requirement_kw,
    productionQuantity: process.production_quantity,
    unit: process.unit,
    metadata: process.metadata,
  }
}

function toProblemDependency(dependency: ProcessDependencyRow): ProblemDependency {
  return {
    processId: dependency.process_id,
    dependsOnProcessId: dependency.depends_on_process_id,
    dependencyType: dependency.dependency_type,
    lagMinutes: dependency.lag_minutes,
  }
}

function toProblemProductionOrder(order: ProductionOrderRow): ProblemProductionOrder {
  return {
    id: order.id,
    reference: order.reference,
    product: order.product,
    quantity: order.quantity,
    unit: order.unit,
    dueAt: order.due_at,
    priority: order.priority,
    status: order.status,
    requirements: order.requirements,
  }
}

function toProblemEnergyInterval(interval: EnergyDataRow): ProblemEnergyInterval {
  return {
    recordedAt: interval.recorded_at,
    intervalMinutes: interval.interval_minutes,
    consumptionKwh: interval.consumption_kwh,
    generationKwh: interval.generation_kwh,
    machineId: interval.machine_id,
  }
}

function toProblemTariff(tariff: ElectricityTariffRow): ProblemTariff {
  return {
    id: tariff.id,
    slug: tariff.slug,
    name: tariff.name,
    currency: tariff.currency,
    startTime: tariff.start_time,
    endTime: tariff.end_time,
    daysOfWeek: tariff.days_of_week,
    energyPricePerKwh: tariff.energy_price_per_kwh,
    demandChargePerKw: tariff.demand_charge_per_kw,
    fixedCharge: tariff.fixed_charge,
    taxRate: tariff.tax_rate,
    effectiveFrom: tariff.effective_from,
    effectiveTo: tariff.effective_to,
    priority: tariff.priority,
  }
}

/**
 * Default horizon when the caller does not supply one: the window actually
 * covered by stored energy data. Returns nulls when no energy data exists,
 * which the caller surfaces as a 400 rather than inventing a horizon.
 */
export function defaultHorizon(energyWindow: {
  from: string | null
  to: string | null
}): { start: string | null; end: string | null } {
  return { start: energyWindow.from, end: energyWindow.to }
}