/**
 * SQLite schema mirroring the Postgres migration.
 *
 * This is a faithful translation of `supabase/migrations/0001_initial_schema.sql`,
 * NOT a simplified offline variant. The same eleven tables carry the same
 * columns with the same names and the same constraints, so the repositories,
 * services and routes work against either backend without modification.
 *
 * Type mapping
 *   uuid        -> TEXT          (generated UUIDs are strings)
 *   jsonb       -> TEXT          (JSON-encoded; the adapter encodes/decodes)
 *   numeric     -> REAL          (Zod's numericFromDb accepts number|string)
 *   integer     -> INTEGER
 *   boolean     -> INTEGER       (0/1; the adapter converts on read/write)
 *   timestamptz -> TEXT          (ISO-8601, UTC)
 *   time        -> TEXT          ('HH:MM:SS')
 *   smallint[]  -> TEXT          (JSON array)
 *
 * CHECK constraints are ported where SQLite supports them, so invalid data is
 * rejected by the database and not only by Zod.
 *
 * Nothing here mentions a specific industry. Every factory-specific value
 * lives in a `config`/`metadata` JSON column exactly as in Postgres.
 */

/** Every ByteMe table, in dependency order. */
export const TABLES = [
  'factories',
  'machines',
  'processes',
  'process_dependencies',
  'production_orders',
  'energy_data',
  'electricity_tariffs',
  'optimization_requests',
  'optimization_results',
  'schedules',
  'schedule_entries',
] as const

export type TableName = (typeof TABLES)[number]

/**
 * Per-table column type hints used by the adapter to encode values on write
 * and decode them on read. Derived from the migration, kept here so the two
 * cannot drift without this file being touched.
 */
export const COLUMN_TYPES: Record<TableName, Record<string, 'json' | 'bool' | 'number' | 'array'>> = {
  factories: {
    config: 'json',
    metadata: 'json',
    is_active: 'bool',
  },
  machines: {
    rated_power_kw: 'number',
    min_power_kw: 'number',
    max_power_kw: 'number',
    min_runtime_minutes: 'number',
    max_runtime_minutes: 'number',
    availability: 'json',
    metadata: 'json',
    is_active: 'bool',
  },
  processes: {
    duration_minutes: 'number',
    power_requirement_kw: 'number',
    production_quantity: 'number',
    metadata: 'json',
    is_active: 'bool',
  },
  process_dependencies: {
    lag_minutes: 'number',
    metadata: 'json',
  },
  production_orders: {
    quantity: 'number',
    priority: 'number',
    requirements: 'json',
    metadata: 'json',
  },
  energy_data: {
    consumption_kwh: 'number',
    generation_kwh: 'number',
    metadata: 'json',
  },
  electricity_tariffs: {
    days_of_week: 'array',
    energy_price_per_kwh: 'number',
    demand_charge_per_kw: 'number',
    fixed_charge: 'number',
    tax_rate: 'number',
    priority: 'number',
    metadata: 'json',
  },
  optimization_requests: {
    objective: 'json',
    constraints: 'json',
    request_payload: 'json',
    adapter_metadata: 'json',
  },
  optimization_results: {
    objective_value: 'number',
    total_energy_cost: 'number',
    total_energy_kwh: 'number',
    peak_demand_kw: 'number',
    solution: 'json',
    metrics: 'json',
  },
  schedules: {
    version: 'number',
    total_energy_cost: 'number',
    total_energy_kwh: 'number',
    peak_demand_kw: 'number',
    metadata: 'json',
  },
  schedule_entries: {
    power_kw: 'number',
    energy_kwh: 'number',
    cost: 'number',
    quantity: 'number',
    sequence: 'number',
    metadata: 'json',
  },
}

const SCHEMA_SQL = `
-- Shared trigger keeping updated_at honest, matching the Postgres migration.
CREATE TRIGGER IF NOT EXISTS set_updated_at_factories
  BEFORE UPDATE ON factories FOR EACH ROW
  WHEN NEW.updated_at = OLD.updated_at
  BEGIN
    UPDATE factories SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
  END;

CREATE TRIGGER IF NOT EXISTS set_updated_at_machines
  BEFORE UPDATE ON machines FOR EACH ROW
  WHEN NEW.updated_at = OLD.updated_at
  BEGIN
    UPDATE machines SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
  END;

CREATE TRIGGER IF NOT EXISTS set_updated_at_processes
  BEFORE UPDATE ON processes FOR EACH ROW
  WHEN NEW.updated_at = OLD.updated_at
  BEGIN
    UPDATE processes SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
  END;

CREATE TRIGGER IF NOT EXISTS set_updated_at_process_dependencies
  BEFORE UPDATE ON process_dependencies FOR EACH ROW
  WHEN NEW.updated_at = OLD.updated_at
  BEGIN
    UPDATE process_dependencies SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
  END;

CREATE TRIGGER IF NOT EXISTS set_updated_at_production_orders
  BEFORE UPDATE ON production_orders FOR EACH ROW
  WHEN NEW.updated_at = OLD.updated_at
  BEGIN
    UPDATE production_orders SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
  END;

CREATE TRIGGER IF NOT EXISTS set_updated_at_electricity_tariffs
  BEFORE UPDATE ON electricity_tariffs FOR EACH ROW
  WHEN NEW.updated_at = OLD.updated_at
  BEGIN
    UPDATE electricity_tariffs SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
  END;

CREATE TRIGGER IF NOT EXISTS set_updated_at_optimization_requests
  BEFORE UPDATE ON optimization_requests FOR EACH ROW
  WHEN NEW.updated_at = OLD.updated_at
  BEGIN
    UPDATE optimization_requests SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
  END;

CREATE TRIGGER IF NOT EXISTS set_updated_at_optimization_results
  BEFORE UPDATE ON optimization_results FOR EACH ROW
  WHEN NEW.updated_at = OLD.updated_at
  BEGIN
    UPDATE optimization_results SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
  END;

CREATE TRIGGER IF NOT EXISTS set_updated_at_schedules
  BEFORE UPDATE ON schedules FOR EACH ROW
  WHEN NEW.updated_at = OLD.updated_at
  BEGIN
    UPDATE schedules SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
  END;

CREATE TRIGGER IF NOT EXISTS set_updated_at_schedule_entries
  BEFORE UPDATE ON schedule_entries FOR EACH ROW
  WHEN NEW.updated_at = OLD.updated_at
  BEGIN
    UPDATE schedule_entries SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
  END;
`

const TABLE_SQL: Record<TableName, string> = {
  factories: `
CREATE TABLE IF NOT EXISTS factories (
  id           TEXT PRIMARY KEY,
  slug         TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  description  TEXT,
  timezone     TEXT NOT NULL DEFAULT 'UTC',
  currency     TEXT NOT NULL DEFAULT 'USD',
  config       TEXT NOT NULL DEFAULT '{}',
  metadata     TEXT NOT NULL DEFAULT '{}',
  is_active    INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (slug GLOB '[a-z0-9]*'),
  CHECK (json_valid(config)),
  CHECK (json_valid(metadata))
);

CREATE INDEX IF NOT EXISTS factories_is_active_idx ON factories (is_active);
`,

  machines: `
CREATE TABLE IF NOT EXISTS machines (
  id                  TEXT PRIMARY KEY,
  factory_id          TEXT NOT NULL REFERENCES factories (id) ON DELETE CASCADE,
  slug                TEXT NOT NULL,
  name                TEXT NOT NULL,
  type                TEXT,
  rated_power_kw      REAL,
  min_power_kw        REAL,
  max_power_kw        REAL,
  min_runtime_minutes REAL,
  max_runtime_minutes REAL,
  availability        TEXT NOT NULL DEFAULT '{}',
  metadata            TEXT NOT NULL DEFAULT '{}',
  is_active           INTEGER NOT NULL DEFAULT 1,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (factory_id, slug),
  CHECK (rated_power_kw IS NULL OR rated_power_kw >= 0),
  CHECK (min_power_kw IS NULL OR min_power_kw >= 0),
  CHECK (max_power_kw IS NULL OR max_power_kw >= 0),
  CHECK (min_runtime_minutes IS NULL OR max_runtime_minutes IS NULL
         OR min_runtime_minutes <= max_runtime_minutes),
  CHECK (json_valid(availability)),
  CHECK (json_valid(metadata))
);

CREATE INDEX IF NOT EXISTS machines_factory_idx ON machines (factory_id);
CREATE INDEX IF NOT EXISTS machines_factory_type_idx ON machines (factory_id, type);
`,

  processes: `
CREATE TABLE IF NOT EXISTS processes (
  id                      TEXT PRIMARY KEY,
  factory_id              TEXT NOT NULL REFERENCES factories (id) ON DELETE CASCADE,
  slug                    TEXT NOT NULL,
  name                    TEXT NOT NULL,
  description             TEXT,
  duration_minutes        REAL,
  machine_id              TEXT NOT NULL REFERENCES machines (id) ON DELETE RESTRICT,
  power_requirement_kw    REAL,
  production_quantity     REAL,
  unit                    TEXT,
  metadata                TEXT NOT NULL DEFAULT '{}',
  is_active               INTEGER NOT NULL DEFAULT 1,
  created_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (factory_id, slug),
  CHECK (duration_minutes IS NULL OR duration_minutes >= 0),
  CHECK (power_requirement_kw IS NULL OR power_requirement_kw >= 0),
  CHECK (production_quantity IS NULL OR production_quantity >= 0),
  CHECK (json_valid(metadata))
);

CREATE INDEX IF NOT EXISTS processes_factory_idx ON processes (factory_id);
CREATE INDEX IF NOT EXISTS processes_machine_idx ON processes (machine_id);
`,

  process_dependencies: `
CREATE TABLE IF NOT EXISTS process_dependencies (
  id                    TEXT PRIMARY KEY,
  factory_id            TEXT NOT NULL REFERENCES factories (id) ON DELETE CASCADE,
  process_id            TEXT NOT NULL REFERENCES processes (id) ON DELETE CASCADE,
  depends_on_process_id TEXT NOT NULL REFERENCES processes (id) ON DELETE CASCADE,
  dependency_type       TEXT NOT NULL DEFAULT 'finish_to_start',
  lag_minutes           REAL NOT NULL DEFAULT 0,
  metadata              TEXT NOT NULL DEFAULT '{}',
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (process_id, depends_on_process_id),
  CHECK (process_id <> depends_on_process_id),
  CHECK (dependency_type IN ('finish_to_start', 'start_to_start',
                             'finish_to_finish', 'start_to_finish')),
  CHECK (lag_minutes >= 0),
  CHECK (json_valid(metadata))
);

CREATE INDEX IF NOT EXISTS process_dependencies_factory_idx ON process_dependencies (factory_id);
CREATE INDEX IF NOT EXISTS process_dependencies_process_idx ON process_dependencies (process_id);
`,

  production_orders: `
CREATE TABLE IF NOT EXISTS production_orders (
  id           TEXT PRIMARY KEY,
  factory_id   TEXT NOT NULL REFERENCES factories (id) ON DELETE CASCADE,
  reference    TEXT NOT NULL,
  product      TEXT,
  quantity     REAL NOT NULL,
  unit         TEXT,
  due_at       TEXT,
  priority     INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'planned',
  requirements TEXT NOT NULL DEFAULT '{}',
  metadata     TEXT NOT NULL DEFAULT '{}',
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (factory_id, reference),
  CHECK (quantity > 0),
  CHECK (status IN ('planned', 'released', 'in_progress', 'completed',
                    'cancelled', 'on_hold')),
  CHECK (json_valid(requirements)),
  CHECK (json_valid(metadata))
);

CREATE INDEX IF NOT EXISTS production_orders_factory_idx ON production_orders (factory_id);
CREATE INDEX IF NOT EXISTS production_orders_due_idx ON production_orders (factory_id, due_at);
`,

  energy_data: `
CREATE TABLE IF NOT EXISTS energy_data (
  id               TEXT PRIMARY KEY,
  factory_id       TEXT NOT NULL REFERENCES factories (id) ON DELETE CASCADE,
  recorded_at      TEXT NOT NULL,
  interval_minutes INTEGER NOT NULL DEFAULT 15,
  consumption_kwh  REAL NOT NULL DEFAULT 0,
  generation_kwh   REAL NOT NULL DEFAULT 0,
  machine_id       TEXT REFERENCES machines (id) ON DELETE CASCADE,
  source           TEXT NOT NULL DEFAULT 'measured',
  metadata         TEXT NOT NULL DEFAULT '{}',
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (interval_minutes > 0),
  CHECK (consumption_kwh >= 0),
  CHECK (generation_kwh >= 0),
  CHECK (json_valid(metadata))
);

CREATE INDEX IF NOT EXISTS energy_data_factory_recorded_idx
  ON energy_data (factory_id, recorded_at DESC);

-- Mirrors the Postgres expression unique index that stops duplicate intervals
-- for the same (factory, machine, timestamp).
CREATE UNIQUE INDEX IF NOT EXISTS energy_data_unique_interval_idx
  ON energy_data (factory_id, ifnull(machine_id, ''), recorded_at);
`,

  electricity_tariffs: `
CREATE TABLE IF NOT EXISTS electricity_tariffs (
  id                   TEXT PRIMARY KEY,
  factory_id           TEXT NOT NULL REFERENCES factories (id) ON DELETE CASCADE,
  slug                 TEXT NOT NULL,
  name                 TEXT NOT NULL,
  currency             TEXT NOT NULL DEFAULT 'USD',
  start_time           TEXT NOT NULL DEFAULT '00:00',
  end_time             TEXT NOT NULL DEFAULT '23:59',
  days_of_week         TEXT,
  energy_price_per_kwh REAL NOT NULL,
  demand_charge_per_kw REAL,
  fixed_charge         REAL,
  tax_rate             REAL,
  effective_from       TEXT,
  effective_to         TEXT,
  priority             INTEGER NOT NULL DEFAULT 0,
  metadata             TEXT NOT NULL DEFAULT '{}',
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (factory_id, slug),
  CHECK (energy_price_per_kwh >= 0),
  CHECK (demand_charge_per_kw IS NULL OR demand_charge_per_kw >= 0),
  CHECK (fixed_charge IS NULL OR fixed_charge >= 0),
  CHECK (tax_rate IS NULL OR (tax_rate >= 0 AND tax_rate <= 1)),
  CHECK (days_of_week IS NULL OR json_valid(days_of_week)),
  CHECK (effective_from IS NULL OR effective_to IS NULL OR effective_from < effective_to),
  CHECK (json_valid(metadata))
);

CREATE INDEX IF NOT EXISTS electricity_tariffs_factory_idx
  ON electricity_tariffs (factory_id, priority DESC);
`,

  optimization_requests: `
CREATE TABLE IF NOT EXISTS optimization_requests (
  id                TEXT PRIMARY KEY,
  factory_id        TEXT NOT NULL REFERENCES factories (id) ON DELETE CASCADE,
  reference         TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending',
  horizon_start     TEXT,
  horizon_end       TEXT,
  objective         TEXT NOT NULL DEFAULT '{}',
  constraints       TEXT NOT NULL DEFAULT '{}',
  request_payload   TEXT,
  adapter_metadata  TEXT,
  error_message     TEXT,
  created_by        TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (factory_id, reference),
  CHECK (status IN ('pending', 'queued', 'running', 'succeeded', 'failed',
                    'cancelled', 'not_configured')),
  CHECK (horizon_start IS NULL OR horizon_end IS NULL OR horizon_start < horizon_end),
  CHECK (json_valid(objective)),
  CHECK (json_valid(constraints))
);

CREATE INDEX IF NOT EXISTS optimization_requests_factory_idx
  ON optimization_requests (factory_id);
`,

  optimization_results: `
CREATE TABLE IF NOT EXISTS optimization_results (
  id                      TEXT PRIMARY KEY,
  factory_id              TEXT NOT NULL REFERENCES factories (id) ON DELETE CASCADE,
  optimization_request_id TEXT REFERENCES optimization_requests (id) ON DELETE CASCADE,
  status                  TEXT NOT NULL DEFAULT 'succeeded',
  objective_value         REAL,
  total_energy_cost       REAL,
  total_energy_kwh        REAL,
  peak_demand_kw          REAL,
  solution                TEXT,
  metrics                 TEXT NOT NULL DEFAULT '{}',
  created_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (factory_id, optimization_request_id),
  CHECK (status IN ('succeeded', 'failed', 'partial')),
  CHECK (json_valid(metrics))
);

CREATE INDEX IF NOT EXISTS optimization_results_factory_idx
  ON optimization_results (factory_id);
`,

  schedules: `
CREATE TABLE IF NOT EXISTS schedules (
  id                      TEXT PRIMARY KEY,
  factory_id              TEXT NOT NULL REFERENCES factories (id) ON DELETE CASCADE,
  name                    TEXT NOT NULL,
  version                 INTEGER NOT NULL DEFAULT 1,
  status                  TEXT NOT NULL DEFAULT 'draft',
  horizon_start           TEXT NOT NULL,
  horizon_end             TEXT NOT NULL,
  optimization_request_id TEXT REFERENCES optimization_requests (id) ON DELETE SET NULL,
  optimization_result_id  TEXT REFERENCES optimization_results (id) ON DELETE SET NULL,
  total_energy_cost       REAL,
  total_energy_kwh        REAL,
  peak_demand_kw          REAL,
  metadata                TEXT NOT NULL DEFAULT '{}',
  created_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (factory_id, name, version),
  CHECK (version > 0),
  CHECK (status IN ('draft', 'published', 'active', 'completed',
                    'superseded', 'cancelled')),
  CHECK (horizon_start < horizon_end),
  CHECK (json_valid(metadata))
);

CREATE INDEX IF NOT EXISTS schedules_factory_idx ON schedules (factory_id);
CREATE INDEX IF NOT EXISTS schedules_horizon_idx
  ON schedules (factory_id, horizon_start, horizon_end);
`,

  schedule_entries: `
CREATE TABLE IF NOT EXISTS schedule_entries (
  id                  TEXT PRIMARY KEY,
  schedule_id         TEXT NOT NULL REFERENCES schedules (id) ON DELETE CASCADE,
  machine_id          TEXT NOT NULL REFERENCES machines (id) ON DELETE RESTRICT,
  process_id          TEXT NOT NULL REFERENCES processes (id) ON DELETE RESTRICT,
  production_order_id TEXT REFERENCES production_orders (id) ON DELETE SET NULL,
  starts_at           TEXT NOT NULL,
  ends_at             TEXT NOT NULL,
  power_kw            REAL,
  energy_kwh          REAL,
  cost                REAL,
  quantity            REAL,
  sequence            INTEGER NOT NULL DEFAULT 0,
  metadata            TEXT NOT NULL DEFAULT '{}',
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (ends_at > starts_at),
  CHECK (power_kw IS NULL OR power_kw >= 0),
  CHECK (energy_kwh IS NULL OR energy_kwh >= 0),
  CHECK (json_valid(metadata))
);

CREATE INDEX IF NOT EXISTS schedule_entries_schedule_idx ON schedule_entries (schedule_id);
CREATE INDEX IF NOT EXISTS schedule_entries_machine_idx ON schedule_entries (machine_id);
`,
}

/** The DDL that creates every table, in dependency order, plus triggers. */
export function schemaSql(): string {
  const tables = TABLES.map((name) => TABLE_SQL[name]).join('\n')
  return `${tables}\n${SCHEMA_SQL}`
}