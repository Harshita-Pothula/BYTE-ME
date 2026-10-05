/**
 * Shared test fixtures.
 *
 * Two factories are represented on purpose:
 *   - `demoChocolate*` mirrors the sample data in supabase/seed.sql, so the
 *     tests exercise the same shapes a real deployment sees.
 *   - `automobile*` is a deliberately different domain (no thermal assets, no
 *     food units) used to prove the code paths carry no chocolate-specific
 *     assumptions.
 */

import type {
  ElectricityTariffRow,
  EnergyDataRow,
  FactoryRow,
  MachineRow,
  ProcessDependencyRow,
  ProcessRow,
  ProductionOrderRow,
} from '@/lib/schemas'

const NOW = '2026-03-02T08:00:00.000Z'
const LATER = '2026-03-02T20:00:00.000Z'

export const UUID = {
  factoryChocolate: '11111111-1111-4111-8111-111111111111',
  factoryAutomobile: '22222222-2222-4222-8222-222222222222',
  machine: '33333333-3333-4333-8333-333333333333',
  machineAlt: '44444444-4444-4444-8444-444444444444',
  process: '55555555-5555-4555-8555-555555555555',
  processAlt: '66666666-6666-4666-8666-666666666666',
  dependency: '77777777-7777-4777-8777-777777777777',
  order: '88888888-8888-4888-8888-888888888888',
  energy: '99999999-9999-4999-8999-999999999999',
  tariff: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
}

export const chocolateFactory: FactoryRow = {
  id: UUID.factoryChocolate,
  slug: 'demo-chocolate-factory',
  name: 'Demo Chocolate Factory',
  description: 'DEMONSTRATION DATA ONLY',
  timezone: 'Europe/Amsterdam',
  currency: 'EUR',
  config: { grid: { max_import_kw: 1200 }, scheduling: { max_parallel_machines: 4 } },
  metadata: { demo: true },
  is_active: true,
  created_at: NOW,
  updated_at: NOW,
}

/** Same shape, unrelated domain. Proves nothing is hard-coded to chocolate. */
export const automobileFactory: FactoryRow = {
  id: UUID.factoryAutomobile,
  slug: 'automobile-plant',
  name: 'Automobile Assembly Plant',
  description: 'Second-domain fixture.',
  timezone: 'Europe/Berlin',
  currency: 'EUR',
  config: { grid: { max_import_kw: 8000 }, line_balance: { takt_seconds: 62 } },
  metadata: { industry: 'automotive' },
  is_active: true,
  created_at: NOW,
  updated_at: NOW,
}

export const thermalMachine: MachineRow = {
  id: UUID.machine,
  factory_id: UUID.factoryChocolate,
  slug: 'roasting-drum',
  name: 'Roasting Drum',
  type: 'thermal_asset',
  rated_power_kw: 250,
  min_power_kw: 90,
  max_power_kw: 250,
  min_runtime_minutes: 30,
  max_runtime_minutes: 480,
  availability: { weekly: [{ day: 1, start: '06:00', end: '22:00' }] },
  metadata: { heating: true },
  is_active: true,
  created_at: NOW,
  updated_at: NOW,
}

/** A machine with no rated power, e.g. a generator or a handling asset. */
export const generatorMachine: MachineRow = {
  id: UUID.machineAlt,
  factory_id: UUID.factoryAutomobile,
  slug: 'welding-cell',
  name: 'Welding Cell',
  type: 'robot_cell',
  rated_power_kw: null,
  min_power_kw: 12,
  max_power_kw: 90,
  min_runtime_minutes: null,
  max_runtime_minutes: null,
  availability: {},
  metadata: {},
  is_active: true,
  created_at: NOW,
  updated_at: NOW,
}

export const roastProcess: ProcessRow = {
  id: UUID.process,
  factory_id: UUID.factoryChocolate,
  slug: 'roast-bean-blend',
  name: 'Roast Bean Blend',
  description: 'Blend and roast.',
  duration_minutes: 120,
  machine_id: UUID.machine,
  power_requirement_kw: 250,
  production_quantity: 500,
  unit: 'kg',
  metadata: {},
  is_active: true,
  created_at: NOW,
  updated_at: NOW,
}

export const grindProcess: ProcessRow = {
  id: UUID.processAlt,
  factory_id: UUID.factoryChocolate,
  slug: 'grind-nibs',
  name: 'Grind Nibs',
  description: null,
  duration_minutes: 45,
  machine_id: UUID.machine,
  power_requirement_kw: 200,
  production_quantity: 480,
  unit: 'kg',
  metadata: {},
  is_active: true,
  created_at: NOW,
  updated_at: NOW,
}

export const dependency: ProcessDependencyRow = {
  id: UUID.dependency,
  factory_id: UUID.factoryChocolate,
  process_id: UUID.processAlt,
  depends_on_process_id: UUID.process,
  dependency_type: 'finish_to_start',
  lag_minutes: 0,
  metadata: {},
  created_at: NOW,
  updated_at: NOW,
}

export const productionOrder: ProductionOrderRow = {
  id: UUID.order,
  factory_id: UUID.factoryChocolate,
  reference: 'PO-DEMO-0001',
  product: 'Dark bar 70%',
  quantity: 5000,
  unit: 'kg',
  due_at: LATER,
  priority: 10,
  status: 'released',
  requirements: {},
  metadata: { demo: true },
  created_at: NOW,
  updated_at: NOW,
}

export const cancelledOrder: ProductionOrderRow = {
  ...productionOrder,
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  reference: 'PO-DEMO-0002',
  status: 'cancelled',
}

export const energyInterval: EnergyDataRow = {
  id: UUID.energy,
  factory_id: UUID.factoryChocolate,
  recorded_at: '2026-03-02T08:00:00.000Z',
  interval_minutes: 15,
  consumption_kwh: 120.5,
  generation_kwh: 0,
  machine_id: null,
  source: 'measured',
  metadata: {},
  created_at: NOW,
}

export const tariff: ElectricityTariffRow = {
  id: UUID.tariff,
  factory_id: UUID.factoryChocolate,
  slug: 'peak',
  name: 'DEMO. Peak',
  currency: 'EUR',
  start_time: '17:00',
  end_time: '22:00',
  days_of_week: [1, 2, 3, 4, 5],
  energy_price_per_kwh: 0.218,
  demand_charge_per_kw: null,
  fixed_charge: null,
  tax_rate: 0.21,
  effective_from: NOW,
  effective_to: null,
  priority: 20,
  metadata: {},
  created_at: NOW,
  updated_at: NOW,
}