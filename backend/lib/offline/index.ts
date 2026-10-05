/**
 * Barrel for the offline SQLite backend.
 *
 * Importing this module has no side effects: the database is opened lazily on
 * first query, and the schema is created by `initOfflineSchema` rather than as
 * an import-time surprise.
 */

export {
  closeDb,
  createInMemoryDb,
  default as db,
  getDb,
  isEphemeral,
  resolveDbPath,
  type SqliteDatabase,
} from './db'

export {
  createInitializedMemoryDb,
  existingTables,
  initOfflineSchema,
  isOfflineSchemaReady,
} from './init'

export {
  createOfflineClient,
  decodeValue,
  encodeValue,
  parseOrFilter,
  type OfflineClient,
} from './adapter'

export {
  DEMO_FACTORY_SLUG,
  isOfflineSeeded,
  seedOfflineDatabase,
  type OfflineSeedResult,
} from './seed'

export { COLUMN_TYPES, schemaSql, TABLES, type TableName } from './schema'

export { isOfflineMode } from './mode'