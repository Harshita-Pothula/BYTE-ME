/**
 * Bearer-token extraction.
 *
 * SECURITY RULES
 *   - The token is never logged, echoed into an error, or stored.
 *   - Only the `Authorization: Bearer <token>` header is accepted. ByteMe does
 *     not read tokens out of query strings, because those end up in access logs,
 *     browser history and `Referer` headers.
 *   - Nothing here ever returns part of the token in an error message; callers
 *     only learn whether a token was present and well-formed.
 */

/**
 * Returns the raw access token from an `Authorization: Bearer ...` header.
 *
 * @returns the token, or `null` when the header is absent or not a bearer
 *          scheme. The distinction between "absent" and "malformed" is
 *          deliberately not reported, so a caller learns nothing about how the
 *          request was formed.
 */
export function extractBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization')
  if (!header) return null

  const match = /^Bearer[ ]+(.+)$/i.exec(header.trim())
  if (!match) return null

  const token = (match[1] ?? '').trim()
  // A JWT is three dot-separated base64url segments. Rejecting anything else
  // here keeps obviously malformed input away from the crypto layer.
  if (token.length === 0 || token.split('.').length !== 3) return null

  return token
}