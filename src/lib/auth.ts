import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { parseAdminSession } from './admin-auth'

export const GUEST_SESSION_COOKIE = 'guest_session'

const GUEST_SESSION_PAYLOAD = 'guest-v1'

/**
 * Compares two strings in a timing-safe manner. Guards against the length
 * mismatch that would otherwise make crypto.timingSafeEqual throw.
 */
export function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)

  if (bufA.length !== bufB.length) {
    // Still run a comparison of equal-length buffers so the response time
    // doesn't trivially leak whether the length matched.
    crypto.timingSafeEqual(bufA, bufA)
    return false
  }

  return crypto.timingSafeEqual(bufA, bufB)
}

/**
 * Verifies admin authentication via a signed httpOnly cookie.
 * Falls back to the legacy Authorization header (raw password) for backwards
 * compatibility during the transition period.
 * Returns null when authorized, otherwise a NextResponse to return immediately.
 */
export function checkAdmin(request: Request): NextResponse | null {
  const expectedPassword = process.env.ADMIN_PASSWORD

  if (!expectedPassword) {
    return NextResponse.json(
      { success: false, error: 'Configuración del servidor incompleta.' },
      { status: 500 }
    )
  }

  // 1. Check signed admin_session cookie (new auth flow)
  const adminSession = parseAdminSession(request)
  if (adminSession.isValid) {
    return null
  }

  // 2. Fallback: legacy Authorization header (raw password comparison)
  const authHeader = request.headers.get('Authorization')

  if (!authHeader || !timingSafeStringEqual(authHeader, expectedPassword)) {
    return NextResponse.json(
      { success: false, error: 'No autorizado.' },
      { status: 401 }
    )
  }

  return null
}

function getSessionSecret(): string | null {
  const secret = process.env.SESSION_SECRET
  if (secret) return secret

  if (process.env.NODE_ENV !== 'development') {
    // Fuera de desarrollo local, SESSION_SECRET es obligatorio; no usar
    // ADMIN_PASSWORD como fallback (son secretos con ciclos de vida distintos).
    return null
  }
  return process.env.ADMIN_PASSWORD || null
}

/**
 * Signed token value to store in the guest_session cookie.
 * Can be a general passcode-only session or upgraded to a guest-specific session.
 */
export function signGuestSession(guestId?: string): string {
  const secret = getSessionSecret()

  if (!secret) {
    throw new Error('SESSION_SECRET no está configurado en el servidor.')
  }

  const payload = guestId ? `${GUEST_SESSION_PAYLOAD}:${guestId}` : GUEST_SESSION_PAYLOAD
  const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  return `${payload}.${hmac}`
}

export function parseCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null

  const parts = cookieHeader.split(';')
  for (const part of parts) {
    const [rawKey, ...rawValue] = part.trim().split('=')
    if (rawKey === name) {
      try {
        return decodeURIComponent(rawValue.join('='))
      } catch {
        // Malformed percent-encoding in the cookie value: treat as no token
        // so the caller returns 401 rather than a 500.
        return null
      }
    }
  }

  return null
}

export interface GuestSession {
  isValid: boolean
  guestId?: string
}

export function parseGuestSession(request: Request): GuestSession {
  const cookieHeader = request.headers.get('cookie')
  const token = parseCookie(cookieHeader, GUEST_SESSION_COOKIE)

  if (!token) {
    return { isValid: false }
  }

  const secret = getSessionSecret()
  if (!secret) {
    return { isValid: false }
  }

  const lastDotIndex = token.lastIndexOf('.')
  if (lastDotIndex === -1) {
    return { isValid: false }
  }

  const payload = token.substring(0, lastDotIndex)
  const signature = token.substring(lastDotIndex + 1)

  // Verify that the payload starts with our prefix
  if (!payload.startsWith(GUEST_SESSION_PAYLOAD)) {
    return { isValid: false }
  }

  const expectedSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  if (!timingSafeStringEqual(signature, expectedSignature)) {
    return { isValid: false }
  }

  // If payload is exactly the general payload, it's valid but not guest-specific
  if (payload === GUEST_SESSION_PAYLOAD) {
    return { isValid: true }
  }

  // Otherwise, it should be guest-v1:guestId
  const prefix = `${GUEST_SESSION_PAYLOAD}:`
  if (payload.startsWith(prefix)) {
    const guestId = payload.substring(prefix.length)
    return { isValid: true, guestId }
  }

  return { isValid: false }
}

/**
 * Verifies the guest_session cookie. Returns null when valid, otherwise a
 * 401 NextResponse to return immediately.
 */
export function checkGuestSession(request: Request): NextResponse | null {
  const session = parseGuestSession(request)

  if (!session.isValid) {
    return NextResponse.json(
      { success: false, error: 'Sesión no válida. Vuelve a introducir el código.' },
      { status: 401 }
    )
  }

  return null
}
