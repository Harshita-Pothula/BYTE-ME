/**
 * Creates and populates the offline SQLite database.
 *
 * Run it with:
 *
 *   npm run offline:seed
 *
 * Useful options:
 *
 *   BYTEME_OFFLINE_DB_PATH=/tmp/byteme.db  npm run offline:seed   # other location
 *   BYTEME_OFFLINE_DB_PATH=:memory:       npm run offline:seed   # throwaway
 *
 * The command is deliberately narrow. It creates the schema and loads the
 * generic demo dataset, prints only identifiers and counts, and never prints a
 * credential or an environment value. Seeding is idempotent, so running it
 * again replaces the demo rows rather than duplicating them.
 *
 * Note that this script does NOT enable offline mode. Offline mode stays a
 * deliberate choice made in `.env.local` by setting BYTEME_OFFLINE_MODE=true.
 */

import { closeDb, getDb, resolveDbPath } from '../lib/offline/db'
import { initOfflineSchema, isOfflineSchemaReady } from '../lib/offline/init'
import { DEMO_FACTORY_SLUG, seedOfflineDatabase } from '../lib/offline/seed'

function main(): Promise<void> {
  // Path only. The path is a configuration value, not a secret, and it is the
  // one thing the operator needs to see to know which file was written.
  const location = resolveDbPath()

  const db = getDb()
  initOfflineSchema(db)

  if (!isOfflineSchemaReady(db)) {
    throw new Error('Schema initialisation did not produce every expected table')
  }

  // seedOfflineDatabase is async, so the connection must stay open until it
  // settles. Running it synchronously and closing in `finally` would drop the
  // connection halfway through and surface as "connection is not open".
  return seedOfflineDatabase(db).then((result) => {
    console.log(`Offline SQLite database ready: ${location}`)
    console.log(`  demo factory slug : ${DEMO_FACTORY_SLUG}`)
    console.log(`  factory id        : ${result.factoryId}`)
    console.log(`  machines          : ${Object.keys(result.machineIds).length}`)
    console.log(`  processes         : ${Object.keys(result.processIds).length}`)
    console.log(`  energy intervals  : ${result.energyIntervals}`)
    console.log('')
    console.log('Set BYTEME_OFFLINE_MODE=true in .env.local to use this database.')
  })
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
  .finally(closeDb)
