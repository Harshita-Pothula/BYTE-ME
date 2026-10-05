/**
 * Authentication and factory-level authorization.
 *
 * Import from `@/lib/auth` rather than the individual modules. Nothing in this
 * directory touches the database and nothing in it logs, so the whole directory
 * is safe to import from any server-side route.
 */

export {
  ADMIN_CLAIM,
  FACTORY_IDS_CLAIM,
  parseAdmin,
  parseFactoryIds,
  readClaims,
  type RawClaims,
} from './claims'

export {
  assertAnyFactoryAccess,
  assertFactoryAccess,
  assertFactoryAdmin,
  authenticateRequest,
  resetAuthCache,
  withAuthentication,
  withFactoryAccess,
} from './guard'

export { extractBearerToken } from './token'

export { resetJwksCache, verifyAccessToken, type VerifiedToken } from './verify'

export type { AuthenticatedUser, FactoryAccess } from './types'