/**
 * Types for the authentication layer.
 *
 * ByteMe does not invent its own identity system. Callers authenticate with
 * Supabase Auth and present the resulting access token; this layer only
 * verifies that token and reads the server-controlled claims it carries.
 */

/** A caller whose Supabase access token has been verified. */
export interface AuthenticatedUser {
  /** Supabase Auth user id (`auth.users.id`). */
  id: string
  email: string | null
  /**
   * Which factories this caller may read and write.
   *
   * `isAdmin` is the escape hatch for platform operators and comes from a
   * server-controlled claim, never from anything the caller supplied.
   */
  access: FactoryAccess
}

/** Factory-level authorization derived from the token's `app_metadata`. */
export interface FactoryAccess {
  /** True when the caller may reach every factory. */
  isAdmin: boolean
  /** Factory ids this caller owns. Empty for a non-admin with no grants. */
  factoryIds: ReadonlySet<string>
}