/**
 * Factory service.
 *
 * Composes the repositories into the read models the API returns, so route
 * handlers stay thin and the same composition is reusable from tests.
 */

import { NotFoundError } from '../errors'
import { isOptimizerConfigured, optimizerUnavailableReason, readOptimizerConfig } from '../optimizer/client'
import type { FactorySummary, EnergyTotals } from '../schemas/factories'
import { energyDataRepository, energyTimeWindow, energyTotals } from '../repositories/energy-data'
import { factoriesRepository } from '../repositories/factories'
import { machinesRepository } from '../repositories/machines'
import { processDependenciesRepository, processesRepository } from '../repositories/processes'
import { productionOrdersRepository } from '../repositories/production-orders'
import { scheduleEntriesRepository, schedulesRepository } from '../repositories/schedules'
import { tariffsRepository } from '../repositories/electricity-tariffs'
import { optimizationRequestsRepository, optimizationResultsRepository } from '../repositories/optimization'

/** Loads a factory or throws a 404. */
export async function requireFactory(factoryId: string) {
  const factory = await factoriesRepository.getById(factoryId)
  if (!factory) throw new NotFoundError('Factory', factoryId)
  return factory
}

/** Asserts a factory exists before writing a child row. */
export async function assertFactoryExists(factoryId: string): Promise<void> {
  await requireFactory(factoryId)
}

/**
 * Aggregate view of one factory.
 *
 * Note there is no "recommended schedule" or "optimal cost" here. Those can
 * only come from a real optimizer run.
 */
export async function getFactorySummary(factoryId: string): Promise<FactorySummary> {
  const factory = await requireFactory(factoryId)

  const [
    machines,
    processes,
    dependencies,
    orders,
    energyIntervals,
    tariffs,
    optimizationRequests,
    optimizationResults,
    schedules,
    scheduleEntries,
    energyWindow,
  ] = await Promise.all([
    machinesRepository.count(factoryId),
    processesRepository.count(factoryId),
    processDependenciesRepository.count(factoryId),
    productionOrdersRepository.count(factoryId),
    energyDataRepository.count(factoryId),
    tariffsRepository.count(factoryId),
    optimizationRequestsRepository.count(factoryId),
    optimizationResultsRepository.count(factoryId),
    schedulesRepository.count(factoryId),
    scheduleEntriesRepository.countEntries(factoryId),
    energyTimeWindow(factoryId),
  ])

  const config = readOptimizerConfig()

  return {
    factory,
    counts: {
      machines,
      processes,
      process_dependencies: dependencies,
      production_orders: orders,
      energy_intervals: energyIntervals,
      tariffs,
      optimization_requests: optimizationRequests,
      optimization_results: optimizationResults,
      schedules,
      schedule_entries: scheduleEntries,
    },
    energy_window: energyWindow,
    optimizer: {
      configured: isOptimizerConfigured(config),
      reason: optimizerUnavailableReason(config),
    },
  }
}

/** Measured energy totals for a window. Not an optimisation result. */
export async function getEnergyTotals(
  factoryId: string,
  filters: { from?: string; to?: string; machine_id?: string },
): Promise<EnergyTotals> {
  return energyTotals(factoryId, filters)
}