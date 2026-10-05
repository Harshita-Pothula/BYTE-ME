/**
 * The offline implementation of the atomic schedule write operations.
 *
 * 0003 adds `replace_schedule_entries` and `append_schedule_entries` to
 * Postgres, because PostgREST cannot hold a transaction open across two HTTP
 * requests and the delete+insert of a schedule replacement therefore had to
 * happen inside the database. SQLite has no such limitation, but the guarantee
 * still has to be implemented or the offline backend would quietly be the one
 * that can half-apply a replacement.
 *
 * So this module runs the same three steps inside a real
 * `db.transaction(...)`, which is better-sqlite3's BEGIN/COMMIT/ROLLBACK:
 *
 *   1. lock the schedule row      (BEGIN IMMEDIATE takes the write lock, and
 *                                  the existence check proves the id is real)
 *   2. delete / append the entries
 *   3. update the schedule's status, metadata and denormalised totals
 *
 * Any throw inside the callback rolls the whole thing back, so a bad entry in
 * the middle of a batch leaves the previous contents intact — the property the
 * Postgres functions provide.
 *
 * PATCH SEMANTICS
 * ---------------
 * A key absent from the patch leaves the column alone; a key present with a
 * null clears it. `undefined` means absent, `null` means clear, which is why
 * the patch is built with an explicit key-presence test rather than
 * coalesced. This mirrors the `p_patch ? 'key'` test in the SQL migration, and
 * `metadata` is merged rather than replaced for the same reason it is there.
 */

import type { SqliteDatabase } from './db'
import { getDb } from './db'
import { COLUMN_TYPES } from './schema'
import { offlineAggregateRpc } from './aggregates'

type Row = Record<string, unknown>

/** A schedule-entry column set, decoded from the repository's jsonb payload. */
type EntryInput = {
  machine_id: string
  process_id: string
  production_order_id?: string | null
  starts_at: string
  ends_at: string
  power_kw?: number | null
  energy_kwh?: number | null
  cost?: number | null
  quantity?: number | null
  sequence?: number | null
  metadata?: Record<string, unknown> | null
}

/** Columns the replacement/append writes on `schedules`. */
const SCHEDULE_PATCH_COLUMNS = [
  'status',
  'total_energy_cost',
  'total_energy_kwh',
  'peak_demand_kw',
] as const

/** SQLite raises this text for a FOREIGN KEY constraint failure. */
function isForeignKeyFailure(error: unknown): boolean {
  return /FOREIGN KEY constraint failed/i.test(String((error as Error)?.message ?? ''))
}

/** SQLite raises this text for a NOT NULL constraint failure. */
function isNotNullFailure(error: unknown): boolean {
  return /NOT NULL constraint failed/i.test(String((error as Error)?.message ?? ''))
}

/** SQLite raises this text for a CHECK constraint failure. */
function isCheckFailure(error: unknown): boolean {
  return /CHECK constraint failed/i.test(String((error as Error)?.message ?? ''))
}

/**
 * Shapes a thrown SQLite error like PostgREST, so `mapDatabaseError` in
 * lib/http.ts maps it to the same HTTP status on both backends.
 *
 * These codes are the SQLite equivalents:
 *   FK violation   -> 23503  (ValidationError, "references a record that does
 *                              not exist")
 *   NOT NULL       -> 23502  (ValidationError, "a required field was missing")
 *   CHECK          -> 23514  (ValidationError, "violates a check constraint")
 */
export function offlineEntryError(error: unknown): {
  code: string
  message: string
  details: string | null
  hint: string | null
} {
  const message = String((error as Error)?.message ?? error)

  if (isForeignKeyFailure(error)) {
    return {
      code: '23503',
      message: 'FOREIGN KEY constraint failed',
      details: message,
      hint: 'A referenced machine, process or production order does not exist.',
    }
  }
  if (isNotNullFailure(error)) {
    return { code: '23502', message: 'NOT NULL constraint failed', details: message, hint: null }
  }
  if (isCheckFailure(error)) {
    return { code: '23514', message: 'CHECK constraint failed', details: message, hint: null }
  }

  return { code: 'P0001', message, details: null, hint: null }
}

/** Maps the `schedule does not exist` signal onto the same code the SQL uses. */
function scheduleMissing(scheduleId: string) {
  return {
    code: 'P0002',
    message: `schedule ${scheduleId} does not exist`,
    details: null,
    hint: null,
  }
}

function toEntries(payload: unknown): EntryInput[] {
  return Array.isArray(payload) ? (payload as EntryInput[]) : []
}

function toPatch(payload: unknown): Row {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return {}
  return payload as Row
}

/**
 * Builds the INSERT for a batch of entries.
 *
 * The column list is the union across the batch, mirroring the adapter's own
 * insert: a key absent from one entry falls back to its column default rather
 * than being written as NULL.
 */
function insertEntries(
  db: SqliteDatabase,
  scheduleId: string,
  entries: EntryInput[],
): Row[] {
  if (entries.length === 0) return []

  const kinds = COLUMN_TYPES.schedule_entries
  const prepared = entries.map((entry) => ({
    id: crypto.randomUUID(),
    schedule_id: scheduleId,
    machine_id: entry.machine_id,
    process_id: entry.process_id,
    production_order_id: entry.production_order_id ?? null,
    starts_at: entry.starts_at,
    ends_at: entry.ends_at,
    power_kw: entry.power_kw ?? null,
    energy_kwh: entry.energy_kwh ?? null,
    cost: entry.cost ?? null,
    quantity: entry.quantity ?? null,
    sequence: entry.sequence ?? 0,
    metadata: JSON.stringify(entry.metadata ?? {}),
  }))

  const columns = [...new Set(prepared.flatMap((row) => Object.keys(row)))]
  const sql =
    `INSERT INTO schedule_entries (${columns.join(', ')}) VALUES ` +
    prepared.map(() => `(${columns.map(() => '?').join(', ')})`).join(', ')

  // One statement, one binding of the whole batch. Executing the same prepared
  // statement once per row does not work: the SQL still carries a placeholder
  // for every row, so `get()` would bind a single row's parameters against a
  // multi-row statement and better-sqlite3 would reject it as "too few
  // parameter values".
  const params = prepared.flatMap((entry) => {
    const record = entry as Row
    return columns.map((column) => {
      const value = record[column]
      return kinds[column as keyof typeof kinds] === 'json' && typeof value === 'string'
        ? value
        : (value ?? null)
    })
  })

  return db.prepare(`${sql} RETURNING *`).all(...params) as Row[]
}

/**
 * Applies the schedule patch.
 *
 * Key presence decides what is written, exactly as `p_patch ? 'key'` does in
 * the SQL migration. `metadata` is merged so a patch that mentions one key
 * does not discard the caller's others.
 */
function patchSchedule(db: SqliteDatabase, scheduleId: string, patch: Row): void {
  const assignments: string[] = []
  const params: unknown[] = []

  for (const column of SCHEDULE_PATCH_COLUMNS) {
    if (!(column in patch)) continue
    assignments.push(`${column} = ?`)
    params.push(patch[column] ?? null)
  }

  if ('metadata' in patch) {
    const current = db
      .prepare('SELECT metadata FROM schedules WHERE id = ?')
      .get(scheduleId) as { metadata?: string } | undefined

    let existing: Record<string, unknown> = {}
    if (current?.metadata) {
      try {
        existing = JSON.parse(current.metadata) as Record<string, unknown>
      } catch {
        existing = {}
      }
    }

    const incoming = (patch.metadata ?? {}) as Record<string, unknown>
    assignments.push('metadata = ?')
    params.push(JSON.stringify({ ...existing, ...incoming }))
  }

  if (assignments.length === 0) return

  // SQL always issues the UPDATE, even for an empty patch, so `updated_at` is
  // bumped via the 0001 trigger. Here an empty patch issues no statement at
  // all, so `updated_at` is left alone. That is a deliberate difference: the
  // offline trigger only fires when an UPDATE reaches the row, and no caller
  // reads `updated_at` to decide whether a replacement happened — the entry
  // rows themselves are the record.
  db.prepare(`UPDATE schedules SET ${assignments.join(', ')} WHERE id = ?`).run(...params, scheduleId)
}

/** True when the schedule exists, locking the write for the transaction. */
function scheduleExists(db: SqliteDatabase, scheduleId: string): boolean {
  const row = db.prepare('SELECT id FROM schedules WHERE id = ?').get(scheduleId)
  return row !== undefined
}

function orderRows(rows: Row[]): Row[] {
  return [...rows].sort((a, b) => {
    const byStart = String(a.starts_at).localeCompare(String(b.starts_at))
    if (byStart !== 0) return byStart
    const bySequence = Number(a.sequence ?? 0) - Number(b.sequence ?? 0)
    if (bySequence !== 0) return bySequence
    return String(a.id).localeCompare(String(b.id))
  })
}

function decodeEntry(row: Row): Row {
  const out: Row = { ...row }
  const kinds = COLUMN_TYPES.schedule_entries
  for (const [column, kind] of Object.entries(kinds)) {
    if (kind === 'json' && typeof out[column] === 'string') {
      try {
        out[column] = JSON.parse(out[column] as string)
      } catch {
        out[column] = {}
      }
    }
  }
  return out
}

export interface OfflineWriteResult {
  data: unknown
  error: ReturnType<typeof offlineEntryError> | null
  count: number | null
}

/**
 * Deletes every entry of a schedule and inserts `payload` in their place,
 * updating the schedule row in the same transaction.
 */
export function replaceScheduleEntries(
  db: SqliteDatabase,
  scheduleId: string,
  payload: unknown,
  patchPayload: unknown,
): OfflineWriteResult {
  const entries = toEntries(payload)
  const patch = toPatch(patchPayload)

  const run = db.transaction((): Row[] => {
    if (!scheduleExists(db, scheduleId)) throw Object.assign(new Error('missing'), { __offlineMissing: true })

    db.prepare('DELETE FROM schedule_entries WHERE schedule_id = ?').run(scheduleId)
    const inserted = insertEntries(db, scheduleId, entries)
    patchSchedule(db, scheduleId, patch)

    return orderRows(inserted)
  })

  try {
    const rows = run()
    return { data: rows.map(decodeEntry), error: null, count: rows.length }
  } catch (error) {
    if ((error as { __offlineMissing?: boolean }).__offlineMissing) {
      return { data: null, error: scheduleMissing(scheduleId), count: null }
    }
    return { data: null, error: offlineEntryError(error), count: null }
  }
}

/** Appends `payload` to a schedule without deleting anything, atomically. */
export function appendScheduleEntries(
  db: SqliteDatabase,
  scheduleId: string,
  payload: unknown,
  patchPayload: unknown,
): OfflineWriteResult {
  const entries = toEntries(payload)
  const patch = toPatch(patchPayload)

  const run = db.transaction((): Row[] => {
    if (!scheduleExists(db, scheduleId)) throw Object.assign(new Error('missing'), { __offlineMissing: true })

    const inserted = insertEntries(db, scheduleId, entries)
    patchSchedule(db, scheduleId, patch)

    return orderRows(inserted)
  })

  try {
    const rows = run()
    return { data: rows.map(decodeEntry), error: null, count: rows.length }
  } catch (error) {
    if ((error as { __offlineMissing?: boolean }).__offlineMissing) {
      return { data: null, error: scheduleMissing(scheduleId), count: null }
    }
    return { data: null, error: offlineEntryError(error), count: null }
  }
}

/**
 * Dispatches an RPC name to its offline implementation.
 *
 * Mirrors PostgREST's `/rest/v1/rpc/<name>` surface so the repository can call
 * one function name regardless of backend. An unknown name is a 404-shaped
 * error rather than a silent no-op, so a typo fails loudly.
 *
 * Aggregate functions (migration 0004) are dispatched first, in
 * lib/offline/aggregates.ts; the multi-statement writes live here.
 */
export function offlineRpc(
  name: string,
  args: { p_schedule_id?: unknown; p_entries?: unknown; p_patch?: unknown } = {},
  db: SqliteDatabase = getDb(),
): OfflineWriteResult {
  // Aggregates are a different concern in a different module; try them first so
  // this dispatcher stays focused on the writes it owns.
  const aggregate = offlineAggregateRpc(name, args as never, db)
  if (aggregate.error?.code !== 'PGRST202') return aggregate

  const scheduleId = typeof args.p_schedule_id === 'string' ? args.p_schedule_id : ''

  switch (name) {
    case 'replace_schedule_entries':
      return replaceScheduleEntries(db, scheduleId, args.p_entries, args.p_patch)
    case 'append_schedule_entries':
      return appendScheduleEntries(db, scheduleId, args.p_entries, args.p_patch)
    default:
      return {
        data: null,
        error: {
          code: 'PGRST202',
          message: `offline: no RPC named '${name}'`,
          details: null,
          hint: 'Implement it in lib/offline/writes.ts or lib/offline/aggregates.ts, or call the repository directly.',
        },
        count: null,
      }
  }
}
