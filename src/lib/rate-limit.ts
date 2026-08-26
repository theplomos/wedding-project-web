import { NextResponse } from 'next/server'

/**
 * In-memory rate limiter for serverless (Vercel) and local dev.
 *
 * Trade-off: each serverless instance keeps its own Map, so the effective
 * limit is multiplied by the number of concurrent instances. For a low-traffic
 * wedding portal this is acceptable; for higher traffic, swap the store for
 * Upstash Redis (@upstash/ratelimit) without changing the call sites.
 *
 * The store lives at module scope so it persists across warm invocations of
 * the same instance.
 */

interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000
let lastCleanup = Date.now()

function cleanupStale(): void {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return
  lastCleanup = now
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) {
      store.delete(key)
    }
  }
}

/** Exposed for tests so each test starts from a clean state. */
export function resetRateLimitStore(): void {
  store.clear()
}

/** Extracts the client IP from standard proxy headers. */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  const realIp = request.headers.get('x-real-ip')
  if (realIp) return realIp.trim()
  return 'unknown'
}

/**
 * Checks whether a request is within the rate limit.
 *
 * @returns `null` if allowed; a 429 `NextResponse` if rate-limited.
 */
export function rateLimit(
  request: Request,
  identifier: string,
  limit: number,
  windowMs: number
): NextResponse | null {
  cleanupStale()

  const ip = getClientIp(request)
  const key = `${identifier}:${ip}`
  const now = Date.now()

  const entry = store.get(key)

  if (!entry || entry.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return null
  }

  if (entry.count >= limit) {
    const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000)
    return NextResponse.json(
      { success: false, error: 'Demasiadas peticiones. Inténtalo más tarde.' },
      {
        status: 429,
        headers: { 'Retry-After': String(retryAfterSeconds) },
      }
    )
  }

  entry.count++
  return null
}

// ---------------------------------------------------------------------------
// Presets — centralised so limits are easy to audit and tune.
// ---------------------------------------------------------------------------

export const RATE_LIMITS = {
  /** POST /api/auth/validate-passcode — 5 attempts per IP every 15 min. */
  validatePasscode: { limit: 5, windowMs: 15 * 60 * 1000 },
  /** POST /api/guest/match — 10 attempts per IP every 5 min. */
  guestMatch: { limit: 10, windowMs: 5 * 60 * 1000 },
  /** POST /api/drive/upload — 10 requests per IP per min. */
  driveUpload: { limit: 10, windowMs: 60 * 1000 },
  /** GET /api/spotify/search — 20 requests per IP per min. */
  spotifySearch: { limit: 20, windowMs: 60 * 1000 },
  /** All /api/admin/* endpoints — 30 requests per IP per min. */
  admin: { limit: 30, windowMs: 60 * 1000 },
} as const
