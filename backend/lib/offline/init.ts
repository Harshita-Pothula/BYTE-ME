/**
 * Idempotent schema initialisation for the offline SQLite database.
 *
 * Replaces the original bootstrap, which created five placeholder tables with
 * columns that did not match the Postgres schema. Offline mode now mirrors the
 * real schema, so the same repositories, services and Zod row schemas apply to
 * both backends.
 *
 * Safe to call on every start: every statement is `IF NOT EXISTS`.
 */

import { createInMemoryDb, getDb, type SqliteDatabase } from './db'
import { schemaSql, TABLES } from './schema'

/**
 * Creates every table, index, constraint and trigger if they do not exist.
 *
 * @returns the database that was initialised.
 */
export function initOfflineSchema(db: SqliteDatabase = getDb()): SqliteDatabase {
  db.exec(schemaSql())
  return db
}

/** The table names that currently exist in the database. */
export function existingTables(db: SqliteDatabase = getDb()): string[] {
  const rows = db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
    )
    .all() as Array<{ name: string }>
  return rows.map((row) => row.name)
}

/**
 * True when all ByteMe tables are present.
 *
 * Used by `/api/v1/health` so an uninitialised offline database reports a
 * clear problem instead of failing every query.
 */
export function isOfflineSchemaReady(db: SqliteDatabase = getDb()): boolean {
  const present = new Set(existingTables(db))
  return TABLES.every((table) => present.has(table))
}

/**
 * Creates a fully initialised throwaway in-memory database.
 *
 * The test suite uses this so every case gets a clean, isolated database that
 * never touches disk.
 */
export function createInitializedMemoryDb(): SqliteDatabase {
  return initOfflineSchema(createInMemoryDb())
}