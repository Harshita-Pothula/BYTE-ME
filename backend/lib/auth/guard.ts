/**
 * Route guards: authentication and factory-level authorization.
 *
 * HOW A ROUTE IS PROTECTED
 * ------------------------
 * `withFactoryAccess` and `withAuthentication` are drop-in replacements for
 * `withErrorHandling`: they include the same error-to-JSON handling, so a
 * protected route keeps exactly one wrapper and no handler body changes.
 *
 *   withAuthentication  the caller must present a valid token; the route is not
 *                       scoped to a single factory.
 *
 *   withFactoryAccess   the caller must present a valid token AND be authorized
 *                       for the `factoryId` route parameter.
 *
 * The verified user is NOT passed to the handler: the wrapper keeps the
 * handler's own signature intact, so guarding a route is a one-word change.
 * A route that needs the caller's grants calls `authenticateRequest` itself,
 * which returns the cached result for the same request and therefore does not
 * verify the token twice.
 *
 * RESPONSE POLICY
 *   401 unauthenticated   no token, or a token that fails verification.
 *   403 forbidden         a valid token with no grant at all, or an operation
 *                         that requires the admin claim.
 *   404 not found         a valid token asking for a factory it does not own.
 *                         404 rather than 403 on purpose: a 403 would confirm
 *                         that the factory exists, which is itself information
 *                         the caller is not entitled to.
 */

import type { NextResponse } from 'next/server'
import { errorResponse } from '../http'
import { ForbiddenError, InternalError, NotFoundError, UnauthorizedError } from '../errors'
import { ADMIN_CLAIM, FACTORY_IDS_CLAIM, parseAdmin, parseFactoryIds } from './claims'
import { extractBearerToken } from './token'
import { verifyAccessToken } from './verify'
import type { AuthenticatedUser } from './types'

/**
 * Per-request cache of the verified user.
 *
 * A `Request` cannot have its headers mutated, so caching against the instance
 * is safe, and it means a route that calls `authenticateRequest` after its guard
 * does not re-verify the signature.
 *
 * Held in a `let` rather than a `const` so `resetAuthCache` can genuinely drop
 * it: a WeakMap has no `clear()` method, and a reset helper that silently did
 * nothing would be worse than no helper at all.
 */
let verifiedByRequest = new WeakMap<Request, AuthenticatedUser>()

/** Test helper: drop every cached verification. */
export function resetAuthCache(): void {
  verifiedByRequest = new WeakMap<Request, AuthenticatedUser>()
}

/**
 * Authenticates a request, or returns the already-verified result for it.
 *
 * @throws {UnauthorizedError} 401 when no usable token is present, or when the
 *         token does not verify.
 */
export async function authenticateRequest(request: Request): Promise<AuthenticatedUser> {
  const cached = verifiedByRequest.get(request)
  if (cached) return cached

  const token = extractBearerToken(request)

  if (!token) {
    throw new UnauthorizedError('Authentication required', {
      reason: 'missing_token',
      hint: 'Send the Supabase access token as: Authorization: Bearer <token>',
    })
  }

  const verified = await verifyAccessToken(token)

  const user: AuthenticatedUser = {
    id: verified.userId,
    email: verified.email,
    access: {
      isAdmin: parseAdmin(verified.appMetadata[ADMIN_CLAIM]),
      factoryIds: parseFactoryIds(verified.appMetadata[FACTORY_IDS_CLAIM]),
    },
  }

  verifiedByRequest.set(request, user)
  return user
}

/**
 * Asserts the caller may reach one factory.
 *
 * @throws {NotFoundError} 404 when the caller has no grant for this factory.
 *         Deliberately indistinguishable from the factory not existing.
 */
export function assertFactoryAccess(user: AuthenticatedUser, factoryId: string): void {
  if (user.access.isAdmin) return
  if (user.access.factoryIds.has(factoryId)) return

  throw new NotFoundError('Factory', factoryId)
}

/**
 * Asserts the caller has at least one factory grant.
 *
 * Used by the factory collection route: a caller with no grants gets neither a
 * 404 (nothing was addressed) nor a confusingly empty list, but a clear 403
 * saying they are not provisioned.
 *
 * @throws {ForbiddenError} 403 when the caller is authenticated but ungranted.
 */
export function assertAnyFactoryAccess(user: AuthenticatedUser): void {
  if (user.access.isAdmin) return
  if (user.access.factoryIds.size > 0) return

  throw new ForbiddenError('This account is not provisioned with access to any factory.', {
    reason: 'no_factory_grants',
    hint: 'An operator must add factory ids to the account app_metadata.',
  })
}

/**
 * Asserts the caller holds the admin claim.
 *
 * @throws {ForbiddenError} 403 for an authenticated non-admin.
 */
export function assertFactoryAdmin(user: AuthenticatedUser): void {
  if (user.access.isAdmin) return

  throw new ForbiddenError('This operation requires an administrator account.', {
    reason: 'admin_required',
  })
}

/** Pulls `factoryId` out of a Next.js route context, if the route has one. */
function factoryIdFrom(args: unknown[]): string | undefined {
  const context = args[1] as { params?: Record<string, unknown> } | undefined
  const value = context?.params?.factoryId
  return typeof value === 'string' ? value : undefined
}

/**
 * The widest handler this guard accepts.
 *
 * `never` parameters make every concrete route handler assignable without
 * weakening the caller's own signature, which `Parameters<H>` then recovers
 * exactly. `any` is avoided so a mistake inside a route still fails typecheck.
 */
type RouteHandler = (...args: never[]) => Promise<NextResponse>

/** Requires a valid token on a route that is not factory-scoped. */
export function withAuthentication<H extends RouteHandler>(
  handler: H,
): (...args: Parameters<H>) => Promise<NextResponse> {
  return async (...args: Parameters<H>) => {
    const call: unknown[] = args
    try {
      await authenticateRequest(call[0] as Request)
      return await handler(...args)
    } catch (error) {
      return errorResponse(error)
    }
  }
}

/**
 * Requires a valid token and access to the route's `factoryId`.
 *
 * Fails closed: a route wrapped in this guard that somehow has no `factoryId`
 * parameter raises a 500 rather than skipping the check.
 */
export function withFactoryAccess<H extends RouteHandler>(
  handler: H,
): (...args: Parameters<H>) => Promise<NextResponse> {
  return async (...args: Parameters<H>) => {
    const call: unknown[] = args
    try {
      const user = await authenticateRequest(call[0] as Request)

      const factoryId = factoryIdFrom(call)
      if (factoryId === undefined) {
        throw new InternalError(
          'withFactoryAccess() was applied to a route with no factoryId parameter. ' +
            'Use withAuthentication() for routes that are not factory-scoped.',
        )
      }

      assertFactoryAccess(user, factoryId)
      return await handler(...args)
    } catch (error) {
      return errorResponse(error)
    }
  }
}