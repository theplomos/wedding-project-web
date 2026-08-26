/**
 * Resolves the public base URL of the app (scheme + host, no trailing slash).
 *
 * Used to build a DETERMINISTIC OAuth redirect_uri for the Spotify host-link
 * flow. Spotify requires the redirect_uri to match its dashboard allowlist
 * exactly, so it must not depend on the per-deploy Vercel preview hostname.
 *
 * Priority:
 *   1. NEXT_PUBLIC_APP_URL          — explicit, stable public URL (recommended)
 *   2. VERCEL_PROJECT_PRODUCTION_URL — Vercel-provided stable production domain
 *   3. request `host` header         — dev/localhost fallback
 */
export function getBaseUrl(request: Request): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL
  if (explicit) {
    return stripTrailingSlash(withScheme(explicit))
  }

  const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL
  if (vercelProd) {
    return stripTrailingSlash(withScheme(vercelProd))
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'NEXT_PUBLIC_APP_URL o VERCEL_PROJECT_PRODUCTION_URL es obligatorio en producción para prevenir Host Header Injection.'
    )
  }

  const rawHost = request.headers.get('host') || 'localhost:3000'
  const isLocal = rawHost.startsWith('localhost') || rawHost.startsWith('127.0.0.1')
  const safeHost = isLocal ? rawHost : 'localhost:3000'
  const protocol = safeHost.includes('localhost') || safeHost.includes('127.0.0.1') ? 'http' : 'https'
  return `${protocol}://${safeHost}`
}

/** redirect_uri used by both the Spotify login and callback routes. */
export function getSpotifyRedirectUri(request: Request): string {
  return `${getBaseUrl(request)}/api/admin/spotify/callback`
}

function withScheme(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}
