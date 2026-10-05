/**
 * Barrel for Supabase access.
 *
 * Everything routes need is re-exported here so no route handler ever reaches
 * into the client module directly.
 */

export {
  getSupabaseAdmin,
  isServiceRoleClient,
  resetSupabaseClient,
} from './client'

import { getSupabaseAdmin, isServiceRoleClient } from './client'

/**
 * Returns the service-role client, asserting that it is in fact the
 * service-role client. Guards against a future refactor accidentally
 * swapping in the anon client, which would silently change RLS behaviour.
 */
export function getServiceClient() {
  const client = getSupabaseAdmin()
  if (!isServiceRoleClient(client)) {
    throw new Error('Refusing to query Supabase without the service-role client')
  }
  return client
}