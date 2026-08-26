import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { signAdminSession, parseAdminSession, ADMIN_SESSION_COOKIE } from '../admin-auth'
import { checkAdmin } from '../auth'

describe('Admin Authentication (admin-auth)', () => {
  const TEST_SECRET = 'test-secret-32-chars-minimum-admin-auth-ok!'
  const TEST_PASSWORD = 'admin-secure-password-123'

  beforeEach(() => {
    vi.stubEnv('SESSION_SECRET', TEST_SECRET)
    vi.stubEnv('ADMIN_PASSWORD', TEST_PASSWORD)
    vi.stubEnv('NODE_ENV', 'development')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('signAdminSession & parseAdminSession', () => {
    it('generates a valid signed token that parses successfully', () => {
      const token = signAdminSession()
      expect(typeof token).toBe('string')
      expect(token).toContain('admin-v1:')
      expect(token).toContain('.')

      const req = new Request('http://localhost/api/admin/data', {
        headers: { cookie: `${ADMIN_SESSION_COOKIE}=${token}` },
      })

      const session = parseAdminSession(req)
      expect(session.isValid).toBe(true)
    })

    it('returns isValid: false when cookie is missing', () => {
      const req = new Request('http://localhost/api/admin/data')
      const session = parseAdminSession(req)
      expect(session.isValid).toBe(false)
    })

    it('returns isValid: false when signature is tampered', () => {
      const token = signAdminSession()
      const parts = token.split('.')
      const tamperedToken = `${parts[0]}.invalidhmacsignature1234567890abcdef`

      const req = new Request('http://localhost/api/admin/data', {
        headers: { cookie: `${ADMIN_SESSION_COOKIE}=${tamperedToken}` },
      })

      const session = parseAdminSession(req)
      expect(session.isValid).toBe(false)
    })

    it('returns isValid: false when payload prefix is invalid', () => {
      const req = new Request('http://localhost/api/admin/data', {
        headers: { cookie: `${ADMIN_SESSION_COOKIE}=unknown-prefix:12345.signature` },
      })
      const session = parseAdminSession(req)
      expect(session.isValid).toBe(false)
    })

    it('returns isValid: false when token is expired', () => {
      const expiredTimestamp = Date.now() - 1000 // 1 second in the past
      const payload = `admin-v1:${expiredTimestamp}`
      const crypto = require('crypto')
      const hmac = crypto.createHmac('sha256', TEST_SECRET).update(payload).digest('hex')
      const expiredToken = `${payload}.${hmac}`

      const req = new Request('http://localhost/api/admin/data', {
        headers: { cookie: `${ADMIN_SESSION_COOKIE}=${expiredToken}` },
      })

      const session = parseAdminSession(req)
      expect(session.isValid).toBe(false)
    })
  })

  describe('checkAdmin', () => {
    it('allows request with valid admin_session cookie', () => {
      const token = signAdminSession()
      const req = new Request('http://localhost/api/admin/data', {
        headers: { cookie: `${ADMIN_SESSION_COOKIE}=${token}` },
      })

      const result = checkAdmin(req)
      expect(result).toBeNull() // null means authorized
    })

    it('allows request with legacy Authorization header matching ADMIN_PASSWORD', () => {
      const req = new Request('http://localhost/api/admin/data', {
        headers: { Authorization: TEST_PASSWORD },
      })

      const result = checkAdmin(req)
      expect(result).toBeNull()
    })

    it('returns 401 when neither cookie nor Authorization header is valid', async () => {
      const req = new Request('http://localhost/api/admin/data', {
        headers: { Authorization: 'wrong-password' },
      })

      const result = checkAdmin(req)
      expect(result).not.toBeNull()
      expect(result?.status).toBe(401)
      const body = await result?.json()
      expect(body.success).toBe(false)
      expect(body.error).toBe('No autorizado.')
    })
  })
})
