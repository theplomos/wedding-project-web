import crypto from 'crypto'
import { timingSafeStringEqual, parseCookie } from './auth'

export const ADMIN_SESSION_COOKIE = 'admin_session'

const ADMIN_SESSION_PAYLOAD = 'admin-v1'
const ADMIN_SESSION_MAX_AGE_MS = 2 * 60 * 60 * 1000 // 2 hours

function getSessionSecret(): string | null {
  const secret = process.env.SESSION_SECRET
  if (secret) return secret

  if (process.env.NODE_ENV !== 'development') {
    return null
  }
  return process.env.ADMIN_PASSWORD || null
}

/**
 * Creates a signed admin session token with an embedded expiry timestamp.
 * Format: `admin-v1:<expiresAt>.<hmac>`
 */
export function signAdminSession(): string {
  const secret = getSessionSecret()

  if (!secret) {
    throw new Error('SESSION_SECRET no está configurado en el servidor.')
  }

  const expiresAt = Date.now() + ADMIN_SESSION_MAX_AGE_MS
  const payload = `${ADMIN_SESSION_PAYLOAD}:${expiresAt}`
  const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  return `${payload}.${hmac}`
}

export interface AdminSession {
  isValid: boolean
}

/**
 * Verifies the admin_session cookie: checks HMAC signature and expiry.
 */
export function parseAdminSession(request: Request): AdminSession {
  const cookieHeader = request.headers.get('cookie')
  const token = parseCookie(cookieHeader, ADMIN_SESSION_COOKIE)

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

  const prefix = `${ADMIN_SESSION_PAYLOAD}:`
  if (!payload.startsWith(prefix)) {
    return { isValid: false }
  }

  const expectedSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  if (!timingSafeStringEqual(signature, expectedSignature)) {
    return { isValid: false }
  }

  // Check expiry
  const expiresAtStr = payload.substring(prefix.length)
  const expiresAt = Number(expiresAtStr)
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return { isValid: false }
  }

  return { isValid: true }
}
