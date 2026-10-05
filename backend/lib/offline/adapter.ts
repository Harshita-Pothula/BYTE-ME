/**
 * A SQLite adapter that speaks the subset of the supabase-js query builder the
 * repositories use.
 *
 * WHY THIS EXISTS
 * ---------------
 * Every repository obtains its connection through one function,
 * `client()` in lib/repositories/base.ts, and then chains PostgREST calls:
 *
 *   client().from('machines').select('*', { count: 'exact' })
 *     .eq('factory_id', id).order('name').range(0, 49)
 *
 * Rather than write a parallel set of SQLite repositories (which would be a
 * second, divergent architecture), this adapter implements the same chainable
 * surface over SQLite. Repositories, services, routes, Zod schemas and response
 * envelopes are all unchanged and backend-agnostic.
 *
 * SUPPORTED SURFACE
 *   from, select, insert, upsert, update, delete
 *   eq, neq, gt, gte, lt, lte, in, is, or
 *   order, limit, range
 *   single, maybeSingle, and thenable resolution to { data, error, count }
 *
 * TYPE BRIDGING
 *   Postgres jsonb     <-> TEXT holding JSON
 *   Postgres boolean   <-> INTEGER 0/1
 *   Postgres smallint[]<-> TEXT holding a JSON array
 *   Postgres numeric   <-> REAL (Zod's numericFromDb accepts both)
 *
 * Errors are shaped like PostgREST ({ code, message, details, hint }) so
 * `mapDatabaseError` in lib/http.ts maps them identically on both backends.
 */

import { randomUUID } from 'node:crypto'
import type { SqliteDatabase } from './db'
import { getDb } from './db'
import { COLUMN_TYPES, TABLES, type TableName } from './schema'
import { offlineRpc } from './writes'

type ColumnKind = 'json' | 'bool' | 'number' | 'array'

/** PostgREST-shaped error, consumed by `mapDatabaseError`. */
interface QueryError {
  code: string
  message: string
  details: string | null
  hint: string | null
}

interface QueryResponse {
  data: unknown
  error: QueryError | null
  count: number | null
}

type Row = Record<string, unknown>

interface Filter {
  sql: string
  params: unknown[]
}

interface SelectOptions {
  count?: 'exact' | 'planned' | 'estimated'
  head?: boolean
}

/** SQLite raises this text for a UNIQUE constraint failure. */
function uniqueViolation(error: unknown): boolean {
  return /UNIQUE constraint failed/i.test(String((error as Error)?.message ?? ''))
}

/** SQLite raises this text for a FOREIGN KEY constraint failure. */
function foreignKeyViolation(error: unknown): boolean {
  return /FOREIGN KEY constraint failed/i.test(String((error as Error)?.message ?? ''))
}

function notNullViolation(error: unknown): boolean {
  return /NOT NULL constraint failed/i.test(String((error as Error)?.message ?? ''))
}

function checkViolation(error: unknown): boolean {
  return /CHECK constraint failed/i.test(String((error as Error)?.message ?? ''))
}

/** Translates a better-sqlite3 error into the PostgREST error shape. */
function toQueryError(error: unknown, context: string): QueryError {
  const message = error instanceof Error ? error.message : String(error)

  if (uniqueViolation(error)) {
    return { code: '23505', message: `${context}: duplicate key`, details: message, hint: null }
  }
  if (foreignKeyViolation(error)) {
    return {
      code: '23503',
      message: `${context}: foreign key violation`,
      details: message,
      hint: null,
    }
  }
  if (notNullViolation(error)) {
    return {
      code: '23502',
      message: `${context}: a required field was null`,
      details: message,
      hint: null,
    }
  }
  if (checkViolation(error)) {
    return {
      code: '23514',
      message: `${context}: check constraint violated`,
      details: message,
      hint: null,
    }
  }

  return { code: 'P0001', message: `${context}: ${message}`, details: null, hint: null }
}

/** Column kinds for a table, or an empty map for an unknown table. */
function kindsFor(table: string): Record<string, ColumnKind> {
  return (COLUMN_TYPES as Record<string, Record<string, ColumnKind>>)[table] ?? {}
}

function isKnownTable(table: string): table is TableName {
  return (TABLES as readonly string[]).includes(table)
}

/* -------------------------------------------------------------------------- */
/* Value encoding / decoding                                                  */
/* -------------------------------------------------------------------------- */

/** Converts a JS value into something SQLite can bind for a known column. */
export function encodeValue(value: unknown, kind: ColumnKind | undefined): unknown {
  if (value === undefined || value === null) return null

  switch (kind) {
    case 'json':
      return JSON.stringify(value)
    case 'array':
      return JSON.stringify(value)
    case 'bool':
      // Accept booleans and the 0/1 that SQLite returns.
      return typeof value === 'boolean' ? (value ? 1 : 0) : Number(value) === 0 ? 0 : 1
    default:
      return value
  }
}

/** Converts a stored SQLite value back into the shape Postgres would return. */
export function decodeValue(value: unknown, kind: ColumnKind | undefined): unknown {
  if (value === undefined || value === null) return null

  switch (kind) {
    case 'json':
    case 'array':
      try {
        return JSON.parse(String(value)) as unknown
      } catch {
        return null
      }
    case 'bool':
      return Number(value) === 1
    default:
      return value
  }
}

/** Applies encoding across a whole row using a table's column kinds. */
function encodeRow(table: string, row: Row): Row {
  const kinds = kindsFor(table)
  const out: Row = {}
  for (const [column, value] of Object.entries(row)) {
    out[column] = encodeValue(value, kinds[column])
  }
  return out
}

/**
 * Recovers the bare column name from a conflict-target term.
 *
 * `recorded_at` stays `recorded_at`; `ifnull(machine_id, '')` becomes
 * `machine_id` so it can be checked against the table's real columns.
 */
function unwrappedColumn(term: string): string {
  const wrapped = term.match(/^ifnull\(\s*([a-z_]+)/i)
  return (wrapped?.[1] ?? term).trim()
}

/**
 * Drops keys whose value is `undefined`.
 *
 * PostgREST omits an `undefined` property from the JSON body, so the database
 * applies that column's DEFAULT. SQLite has no such notion: an explicit NULL
 * would violate NOT NULL on a defaulted column. Reproducing the omission here is
 * what lets the same repository code write `is_active: input.is_active`
 * unchanged on both backends.
 *
 * `null` is preserved, because clearing a nullable column is a real write.
 */
function withoutUndefined(row: Row): Row {
  const out: Row = {}
  for (const [column, value] of Object.entries(row)) {
    if (value === undefined) continue
    out[column] = value
  }
  return out
}

/** Applies decoding across a whole row using a table's column kinds. */
function decodeRow(table: string, row: Row): Row {
  const kinds = kindsFor(table)
  const out: Row = {}
  for (const [column, value] of Object.entries(row)) {
    out[column] = decodeValue(value, kinds[column])
  }
  return out
}

/* -------------------------------------------------------------------------- */
/* PostgREST .or() parsing                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Translates PostgREST's `.or('a.is.null,b.lte.X')` syntax into SQL.
 *
 * Supported forms, which is the complete set the repositories use:
 *   col.is.null
 *   col.gt / .gte / .lt / .lte / .eq  with a value
 *   col.in.(v1,v2,v3)
 *
 * Values are split on commas outside parentheses so an `in.()` list stays whole.
 */
export function parseOrFilter(expression: string): Filter {
  const clauses: string[] = []
  const params: unknown[] = []

  for (const rawClause of splitTopLevel(expression, ',')) {
    const clause = rawClause.trim()
    if (!clause) continue

    if (clause.endsWith('.is.null')) {
      clauses.push(`${clause.slice(0, -'.is.null'.length)} IS NULL`)
      continue
    }
    if (clause.endsWith('.is.not.null')) {
      clauses.push(`${clause.slice(0, -'.is.not.null'.length)} IS NOT NULL`)
      continue
    }

    const inMatch = clause.match(/^([a-z_]+)\.in\.\((.*)\)$/i)
    if (inMatch?.[1]) {
      const [, column, list] = inMatch
      const values = splitTopLevel(list as string, ',')
        .map((v) => v.trim())
        .filter((v) => v.length > 0)
      if (values.length === 0) {
        // An empty IN list matches nothing.
        clauses.push('1 = 0')
        continue
      }
      clauses.push(`${column} IN (${values.map(() => '?').join(', ')})`)
      params.push(...values)
      continue
    }

    const opMatch = clause.match(/^([a-z_]+)\.(gt|gte|lt|lte|eq)\.(.*)$/i)
    if (opMatch?.[1] && opMatch[2]) {
      const [, column, op, value] = opMatch
      const sqlOp = { gt: '>', gte: '>=', lt: '<', lte: '<=', eq: '=' }[op.toLowerCase()] ?? '='
      clauses.push(`${column} ${sqlOp} ?`)
      params.push(coerceLiteral(value as string))
      continue
    }

    // Unknown syntax: fail loudly rather than silently dropping a predicate.
    throw new Error(`Unsupported .or() clause in offline mode: ${clause}`)
  }

  return { sql: `(${clauses.join(' OR ')})`, params }
}

/** Splits on a delimiter, ignoring separators nested inside parentheses. */
function splitTopLevel(input: string, delimiter: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''

  for (const ch of input) {
    if (ch === '(') depth += 1
    if (ch === ')') depth -= 1

    if (ch === delimiter && depth === 0) {
      parts.push(current)
      current = ''
      continue
    }
    current += ch
  }

  parts.push(current)
  return parts
}

/** `null` becomes SQL NULL; everything else stays a text literal. */
function coerceLiteral(value: string): unknown {
  return value === 'null' ? null : value
}

/* -------------------------------------------------------------------------- */
/* Query builder                                                              */
/* -------------------------------------------------------------------------- */

type Operation = 'select' | 'insert' | 'upsert' | 'update' | 'delete'

class SqliteQueryBuilder implements PromiseLike<QueryResponse> {
  private operation: Operation = 'select'
  private columns = '*'
  private countMode: SelectOptions['count'] | undefined
  private headOnly = false

  private filters: Filter[] = []
  private orderTerms: Array<{ column: string; ascending: boolean }> = []
  private limitValue: number | null = null
  private offsetValue = 0

  private insertRows: Row[] = []
  private updatePatch: Row | null = null
  private upsertOptions: { onConflict?: string; ignoreDuplicates?: boolean } = {}

  constructor(
    private readonly table: string,
    private readonly db: SqliteDatabase,
  ) {}

  /* ---- column selection ---------------------------------------------- */

  select(columns = '*', options: SelectOptions = {}): this {
    this.columns = columns
    this.countMode = options.count
    this.headOnly = options.head === true
    return this
  }

  /* ---- writes ---------------------------------------------------------- */

  insert(values: Row | Row[]): this {
    this.operation = 'insert'
    this.insertRows = Array.isArray(values) ? values : [values]
    return this
  }

  upsert(values: Row | Row[], options: { onConflict?: string; ignoreDuplicates?: boolean } = {}): this {
    this.operation = 'upsert'
    this.insertRows = Array.isArray(values) ? values : [values]
    this.upsertOptions = options
    return this
  }

  update(patch: Row): this {
    this.operation = 'update'
    this.updatePatch = patch
    return this
  }

  delete(): this {
    this.operation = 'delete'
    return this
  }

  /* ---- filters --------------------------------------------------------- */

  eq(column: string, value: unknown): this {
    return this.addCondition(column, value, '=')
  }

  neq(column: string, value: unknown): this {
    return this.addCondition(column, value, '!=')
  }

  gt(column: string, value: unknown): this {
    return this.addCondition(column, value, '>')
  }

  gte(column: string, value: unknown): this {
    return this.addCondition(column, value, '>=')
  }

  lt(column: string, value: unknown): this {
    return this.addCondition(column, value, '<')
  }

  lte(column: string, value: unknown): this {
    return this.addCondition(column, value, '<=')
  }

  is(column: string, value: unknown): this {
    if (value === null) return this.addCondition(column, null, 'IS')
    if (value === true) return this.addCondition(column, 1, '=')
    if (value === false) return this.addCondition(column, 0, '=')
    return this.addCondition(column, value, '=')
  }

  in(column: string, values: readonly unknown[]): this {
    const list = values.map((value) => encodeValue(value, kindsFor(this.table)[column]))
    if (list.length === 0) {
      this.filters.push({ sql: '1 = 0', params: [] })
      return this
    }
    this.filters.push({
      sql: `${column} IN (${list.map(() => '?').join(', ')})`,
      params: list,
    })
    return this
  }

  or(expression: string): this {
    this.filters.push(parseOrFilter(expression))
    return this
  }

  private addCondition(column: string, value: unknown, operator: string): this {
    this.filters.push({
      sql: `${column} ${operator} ?`,
      params: [encodeValue(value, kindsFor(this.table)[column])],
    })
    return this
  }

  /* ---- shaping --------------------------------------------------------- */

  /**
   * Adds an ORDER BY term.
   *
   * ACCUMULATES rather than replacing, which is PostgREST's behaviour:
   * `.order('a').order('b')` is `ORDER BY a, b` there, and the second call
   * would silently discard the first here. Accumulation is what makes a stable
   * multi-column sort expressible, which paged loading needs — ordering by
   * `starts_at` alone leaves rows sharing a start instant in an unspecified
   * order, so two pages could each return a different one and duplicate a row
   * while dropping another.
   */
  order(column: string, options: { ascending?: boolean } = {}): this {
    this.orderTerms.push({ column, ascending: options.ascending ?? false })
    return this
  }

  limit(count: number): this {
    this.limitValue = count
    return this
  }

  range(from: number, to: number): this {
    this.offsetValue = from
    // PostgREST `range` is inclusive at both ends; SQLite LIMIT is exclusive.
    this.limitValue = to - from + 1
    return this
  }

  /* ---- terminal -------------------------------------------------------- */

  async single(): Promise<QueryResponse> {
    const response = await this.execute()
    if (response.error) return response

    const rows = (response.data as Row[]) ?? []
    if (rows.length === 0) {
      return {
        data: null,
        error: {
          code: 'PGRST116',
          message: `${this.operation} on ${this.table} returned no rows`,
          details: null,
          hint: null,
        },
        count: 0,
      }
    }
    return { data: rows[0], error: null, count: 1 }
  }

  async maybeSingle(): Promise<QueryResponse> {
    const response = await this.execute()
    if (response.error) return response
    const rows = (response.data as Row[]) ?? []
    return { data: rows[0] ?? null, error: null, count: rows.length }
  }

  then<TResult1 = QueryResponse, TResult2 = never>(
    onfulfilled?: ((value: QueryResponse) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  /* ---- execution ------------------------------------------------------- */

  private buildWhere(): { sql: string; params: unknown[] } {
    if (this.filters.length === 0) return { sql: '', params: [] }
    return {
      sql: ` WHERE ${this.filters.map((filter) => filter.sql).join(' AND ')}`,
      params: this.filters.flatMap((filter) => filter.params),
    }
  }

  private buildOrderLimit(): { sql: string; params: unknown[] } {
    const parts: string[] = []
    const params: unknown[] = []

    if (this.orderTerms.length > 0) {
      parts.push(
        `ORDER BY ${this.orderTerms
          .map((term) => `${term.column} ${term.ascending ? 'ASC' : 'DESC'}`)
          .join(', ')}`,
      )
    }
    if (this.limitValue !== null) {
      parts.push('LIMIT ?')
      params.push(this.limitValue)
    }
    if (this.offsetValue > 0) {
      if (this.limitValue === null) parts.push('LIMIT -1')
      parts.push('OFFSET ?')
      params.push(this.offsetValue)
    }

    return { sql: parts.length ? ` ${parts.join(' ')}` : '', params }
  }

  private async execute(): Promise<QueryResponse> {
    if (!isKnownTable(this.table)) {
      return {
        data: null,
        error: {
          code: '42P01',
          message: `offline: unknown table '${this.table}'`,
          details: null,
          hint: 'Run the offline schema initialiser.',
        },
        count: null,
      }
    }

    try {
      switch (this.operation) {
        case 'insert':
          return this.runInsert(false)
        case 'upsert':
          return this.runInsert(true)
        case 'update':
          return this.runUpdate()
        case 'delete':
          return this.runDelete()
        default:
          return this.runSelect()
      }
    } catch (error) {
      return {
        data: null,
        error: toQueryError(error, this.operation),
        count: null,
      }
    }
  }

  private runSelect(): QueryResponse {
    const where = this.buildWhere()
    const tail = this.buildOrderLimit()

    const columnList = this.columns === '*' ? '*' : this.columns
    const sql = `SELECT ${columnList} FROM ${this.table}${where.sql}${tail.sql}`
    const params = [...where.params, ...tail.params]

    const raw = this.db.prepare(sql).all(...params) as Row[]
    const rows = raw.map((row) => decodeRow(this.table, row))

    let count: number | null = null
    if (this.countMode === 'exact') {
      const countSql = `SELECT COUNT(*) AS c FROM ${this.table}${where.sql}`
      const result = this.db.prepare(countSql).get(...where.params) as { c: number }
      count = result.c
    }

    return { data: this.headOnly ? [] : rows, error: null, count }
  }

  private runInsert(isUpsert: boolean): QueryResponse {
    const rows = this.insertRows
    if (rows.length === 0) return { data: [], error: null, count: 0 }

    const encoded = rows.map((row) =>
      this.withGeneratedId(encodeRow(this.table, withoutUndefined(row))),
    )
    const columns = [...new Set(encoded.flatMap((row) => Object.keys(row)))]

    // Defaults declared in the schema (slug, created_at, ...) are not supplied
    // by the caller, so the insert list is the union across the batch.
    const sql = `INSERT INTO ${this.table} (${columns.join(', ')}) VALUES ${encoded
      .map(() => `(${columns.map(() => '?').join(', ')})`)
      .join(', ')}`
    const params = encoded.flatMap((row) => columns.map((column) => row[column] ?? null))

    const conflictTarget = isUpsert
      ? this.resolveConflictTarget(columns, this.upsertOptions.onConflict)
      : null

    let statement: string
    if (isUpsert) {
      if (this.upsertOptions.ignoreDuplicates) {
        statement = `${sql} ON CONFLICT DO NOTHING`
      } else {
        // `id` is deliberately excluded from the SET list. On a conflict the
        // existing row keeps its primary key, which is what makes re-seeding
        // idempotent: children upserted against the returned ids keep pointing
        // at the same parent instead of accumulating orphans. The
        // `gen_random_uuid()` value is only used for a genuinely new row.
        const assignments = columns
          .filter((column) => column !== 'id')
          .map((column) => `${column} = excluded.${column}`)
          .join(', ')
        statement = `${sql} ON CONFLICT (${conflictTarget}) DO UPDATE SET ${assignments}`
      }
    } else {
      statement = sql
    }

    // RETURNING is how the stored row is recovered, so database defaults
    // (created_at, slug, ...) and generated ids surface to the caller exactly
    // as PostgREST's `.insert().select()` reports them. It also means a
    // conflict-resolved upsert returns the row that actually survived, which a
    // "re-select by the attempted id" approach cannot do.
    const returned = this.db.prepare(`${statement} RETURNING *`).all(...params) as Row[]

    if (returned.length === 0) return { data: [], error: null, count: 0 }

    return {
      data: returned.map((row) => decodeRow(this.table, row)),
      error: null,
      count: returned.length,
    }
  }

  /**
   * Ensures a row has an id, matching the Postgres `gen_random_uuid()` default.
   *
   * Without this, `insert()` from the repositories would fail because they rely
   * on the database to generate the primary key.
   */
  private withGeneratedId(row: Row): Row {
    if (row.id) return row
    return { ...row, id: randomUUID() }
  }

  /**
   * Maps PostgREST's `onConflict` expression onto an SQLite conflict target.
   *
   * Two translations are needed. Postgres casts are dropped
   * (`'...'::uuid` -> nothing), and the repositories pass one expression index
   * that Postgres spells `coalesce(machine_id, '000...')`. The equivalent
   * unique index in lib/offline/schema.ts is declared as
   * `(factory_id, ifnull(machine_id, ''), recorded_at)`, and SQLite requires the
   * conflict target to reproduce an indexed expression verbatim, so the name
   * is translated rather than dropped.
   */
  private resolveConflictTarget(columns: string[], onConflict?: string): string {
    if (!onConflict) return 'id'

    // splitTopLevel, not split(','): a conflict expression can itself contain a
    // comma inside coalesce(machine_id, '...'), and splitting naively would cut
    // that term in half and silently drop it from the target.
    const referenced = splitTopLevel(onConflict, ',')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const coalesceMatch = part.match(/^coalesce\(\s*([a-z_]+)\s*,/i)
        if (coalesceMatch?.[1]) return `ifnull(${coalesceMatch[1]}, '')`
        return part.replace(/::[a-z]+/gi, '').trim()
      })
      // A part is real if it names a column of this table, either bare or as
      // the first argument of the translated ifnull().
      .filter((part) => columns.includes(unwrappedColumn(part)))

    // `recorded_at` is intentionally absent from some conflict expressions and
    // still part of the index, so fall back to the primary key when nothing
    // matches.
    return referenced.length > 0 ? referenced.join(', ') : 'id'
  }

  private runUpdate(): QueryResponse {
    const patch = this.updatePatch
    if (!patch || Object.keys(patch).length === 0) {
      return {
        data: null,
        error: {
          code: 'P0001',
          message: 'update: no columns supplied',
          details: null,
          hint: null,
        },
        count: null,
      }
    }

    const encoded = encodeRow(this.table, withoutUndefined(patch))
    const assignments = Object.keys(encoded).map((column) => `${column} = ?`)
    const where = this.buildWhere()

    const sql = `UPDATE ${this.table} SET ${assignments.join(', ')}${where.sql}`
    const params = [...Object.values(encoded), ...where.params]

    const info = this.db.prepare(sql).run(...params)
    if (info.changes === 0) return { data: null, error: null, count: 0 }

    const raw = this.db.prepare(`SELECT * FROM ${this.table}${where.sql}`).all(...where.params) as Row[]
    return {
      data: raw.map((row) => decodeRow(this.table, row)),
      error: null,
      count: raw.length,
    }
  }

  private runDelete(): QueryResponse {
    const where = this.buildWhere()
    const sql = `DELETE FROM ${this.table}${where.sql}`
    const info = this.db.prepare(sql).run(...where.params)

    if (info.changes === 0) return { data: null, error: null, count: 0 }
    return { data: [{ id: String(info.lastInsertRowid ?? '') }], error: null, count: info.changes }
  }
}

/**
 * A minimal stand-in for the Supabase client surface used by the repositories.
 *
 * `from(table)` is what they call before chaining. `rpc(name, args)` is the
 * PostgREST function-call surface, added for the atomic schedule writes
 * introduced in migration 0003: it lets a repository issue one
 * transaction-spanning call that behaves identically on both backends, instead
 * of branching on which database it happens to be talking to.
 */
export interface OfflineClient {
  from(table: string): SqliteQueryBuilder
  rpc(name: string, args?: Record<string, unknown>): Promise<QueryResponse>
}

/**
 * Builds an offline client bound to a database.
 *
 * Defaults to the shared lazily-opened connection, so production and tests use
 * the same code path.
 */
export function createOfflineClient(db: SqliteDatabase = getDb()): OfflineClient {
  return {
    from(table: string) {
      return new SqliteQueryBuilder(table, db)
    },
    rpc(name: string, args: Record<string, unknown> = {}) {
      return Promise.resolve(offlineRpc(name, args, db))
    },
  }
}