/**
 * SQLite connection for offline mode.
 *
 * Replaces the original eager module-level connection. Two reasons:
 *
 *  1. The previous version opened (and created) a database file the moment the
 *     module was imported. Switching backends must not touch the filesystem as
 *     an import side effect, and doing so breaks test isolation.
 *  2. The path was hard-coded to `process.cwd()`. It is now configurable so a
 *     test can point at `:memory:` or a temp file, and a deployment can choose
 *     where the database lives.
 *
 * The connection is opened lazily on first use and reused thereafter.
 */

import path from 'node:path'
import Database from 'better-sqlite3'

/** Default filename, overridable with BYTEME_OFFLINE_DB_PATH. */
const DEFAULT_FILENAME = 'byteme-offline.db'

export type SqliteDatabase = InstanceType<typeof Database>

let connection: SqliteDatabase | null = null

/**
 * Resolves the database location.
 *
 * `BYTEME_OFFLINE_DB_PATH` may be `:memory:` for an ephemeral database, which
 * is what the test suite uses.
 */
export function resolveDbPath(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.BYTEME_OFFLINE_DB_PATH?.trim()
  if (configured === ':memory:') return ':memory:'
  if (configured) return path.resolve(configured)
  return path.join(process.cwd(), DEFAULT_FILENAME)
}

/** True when the resolved path is ephemeral and will not be written to disk. */
export function isEphemeral(env: NodeJS.ProcessEnv = process.env): boolean {
  return resolveDbPath(env) === ':memory:'
}

/**
 * Returns the shared SQLite connection, opening it on first use.
 *
 * Foreign keys are enabled explicitly: SQLite disables them by default, and the
 * schema relies on ON DELETE CASCADE / RESTRICT to mirror Postgres.
 */
export function getDb(env: NodeJS.ProcessEnv = process.env): SqliteDatabase {
  if (connection) return connection

  const db = new Database(resolveDbPath(env))

  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  // Wait rather than fail immediately if another process holds the write lock.
  db.pragma('busy_timeout = 5000')

  connection = db
  return db
}

/** Closes and forgets the connection. Used by tests and graceful shutdown. */
export function closeDb(): void {
  if (!connection) return
  try {
    connection.close()
  } finally {
    connection = null
  }
}

/**
 * Opens a throwaway in-memory database.
 *
 * Used by tests so no state leaks between cases and nothing touches disk.
 */
export function createInMemoryDb(): SqliteDatabase {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  return db
}

/**
 * Default export kept for compatibility with the original
 * `import db from "./db"` shape. These are lazy accessors on the shared
 * connection rather than a module-level instance.
 */
const db = {
  get current(): SqliteDatabase {
    return getDb()
  },
  close: closeDb,
  prepare: (...args: Parameters<SqliteDatabase['prepare']>) => getDb().prepare(...args),
  exec: (...args: Parameters<SqliteDatabase['exec']>) => getDb().exec(...args),
  pragma: (...args: Parameters<SqliteDatabase['pragma']>) => getDb().pragma(...args),
}

export default db