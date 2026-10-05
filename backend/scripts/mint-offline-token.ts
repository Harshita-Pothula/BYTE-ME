/**
 * Mints an offline access token for local development.
 *
 *   npm run offline:token -- --factory <uuid> [--factory <uuid> ...] [--admin]
 *
 * Offline mode has no Supabase project to authenticate against, so
 * `BYTEME_OFFLINE_JWT_SECRET` is used to sign an HS256 token that
 * `lib/auth/verify.ts` accepts. This is a development convenience only: the
 * token is meaningless to the online path, which verifies against Supabase's
 * own signing keys.
 *
 * SECRET HANDLING
 *   The secret is read from the environment and never printed, echoed, or
 *   written to disk. The minted token is written to stdout and nowhere else,
 *   so it does not end up in a log file. Nothing here touches the database.
 */

import { SignJWT } from 'jose'
import { serverEnv } from '../lib/env'

interface Options {
  factoryIds: string[]
  admin: boolean
  subject: string
  email: string | null
  ttlSeconds: number
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    factoryIds: [],
    admin: false,
    subject: '00000000-0000-0000-0000-000000000000',
    email: null,
    ttlSeconds: 3600,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const value = argv[index + 1]

    switch (arg) {
      case '--factory':
        if (value) options.factoryIds.push(value)
        index += 1
        break
      case '--admin':
        options.admin = true
        break
      case '--subject':
        if (value) options.subject = value
        index += 1
        break
      case '--email':
        if (value) options.email = value
        index += 1
        break
      case '--ttl':
        if (value) options.ttlSeconds = Number(value)
        index += 1
        break
      default:
        break
    }
  }

  return options
}

async function main(): Promise<void> {
  const env = serverEnv()

  if (!env.BYTEME_OFFLINE_MODE) {
    console.error(
      'This script mints OFFLINE tokens. Set BYTEME_OFFLINE_MODE=true, or use a real Supabase access token online.',
    )
    process.exitCode = 1
    return
  }

  if (!env.BYTEME_OFFLINE_JWT_SECRET) {
    console.error(
      'BYTEME_OFFLINE_JWT_SECRET is not set. Protected routes will answer 500 until it is configured.',
    )
    process.exitCode = 1
    return
  }

  const options = parseArgs(process.argv.slice(2))

  if (!options.admin && options.factoryIds.length === 0) {
    console.error(
      'Grant at least one factory with --factory <uuid>, or pass --admin for full access.\n' +
        'Grants live in app_metadata.factory_ids and are set from the Supabase dashboard in online mode.',
    )
    process.exitCode = 1
    return
  }

  const now = Math.floor(Date.now() / 1000)

  const token = await new SignJWT({
    app_metadata: {
      ...(options.factoryIds.length > 0 ? { factory_ids: options.factoryIds } : {}),
      ...(options.admin ? { byteme_admin: true } : {}),
    },
    ...(options.email ? { email: options.email } : {}),
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(options.subject)
    .setIssuedAt(now)
    .setExpirationTime(now + options.ttlSeconds)
    .sign(new TextEncoder().encode(env.BYTEME_OFFLINE_JWT_SECRET))

  // The token itself is the deliverable of this command; nothing else is
  // printed, and the signing secret never appears.
  console.log(token)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})