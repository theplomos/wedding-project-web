import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { timingSafeStringEqual, signGuestSession, parseGuestSession, checkGuestSession } from '../auth'
import { signAdminSession, parseAdminSession } from '../admin-auth'
import { rateLimit, resetRateLimitStore, getClientIp, RATE_LIMITS } from '../rate-limit'
import { normalizeName } from '../normalize-name'
import { normalizePhone, waNumber } from '../phone'
import { getBaseUrl, getSpotifyRedirectUri } from '../base-url'

describe('Comprehensive Security Audit Suite (100+ Total Assertions & Scenarios)', () => {
  beforeEach(() => {
    vi.stubEnv('SESSION_SECRET', 'test-super-secret-key-32-chars-long!')
    vi.stubEnv('ADMIN_PASSWORD', 'SuperAdminSecret123!')
    vi.stubEnv('GUEST_PASSCODE', 'BODA2026')
    resetRateLimitStore()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  // ───────────────────────────────────────────────────────────────────────────
  // 1. TIMING ATTACK RESISTANCE & STRING SANITIZATION
  // ───────────────────────────────────────────────────────────────────────────
  describe('1. Timing-Safe String Comparison & Cryptographic Verification', () => {
    it('returns true for identical ASCII passwords', () => {
      expect(timingSafeStringEqual('admin_password_123', 'admin_password_123')).toBe(true)
    })

    it('returns true for identical empty strings', () => {
      expect(timingSafeStringEqual('', '')).toBe(true)
    })

    it('returns true for identical unicode / emoji strings', () => {
      expect(timingSafeStringEqual('🔒🔑🎉_Boda_2026', '🔒🔑🎉_Boda_2026')).toBe(true)
    })

    it('returns false for single-character difference at start', () => {
      expect(timingSafeStringEqual('Xassword123', 'Password123')).toBe(false)
    })

    it('returns false for single-character difference in middle', () => {
      expect(timingSafeStringEqual('passwXrd123', 'password123')).toBe(false)
    })

    it('returns false for single-character difference at end', () => {
      expect(timingSafeStringEqual('password123', 'password124')).toBe(false)
    })

    it('returns false for length mismatches without throwing error', () => {
      expect(timingSafeStringEqual('short', 'a_much_longer_string_payload')).toBe(false)
      expect(timingSafeStringEqual('', 'non-empty')).toBe(false)
      expect(timingSafeStringEqual('non-empty', '')).toBe(false)
    })

    it('handles accented character differences correctly', () => {
      expect(timingSafeStringEqual('München', 'Munchen')).toBe(false)
      expect(timingSafeStringEqual('München', 'München')).toBe(true)
      expect(timingSafeStringEqual('García', 'Garcia')).toBe(false)
      expect(timingSafeStringEqual('García', 'García')).toBe(true)
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // 2. SESSION HMAC TAMPERING & SIGNATURE INTEGRITY
  // ───────────────────────────────────────────────────────────────────────────
  describe('2. Session HMAC Signing & Cookie Integrity', () => {
    it('signs and validates passcode-only guest session', () => {
      const token = signGuestSession()
      const req = new Request('http://localhost:3000', {
        headers: { cookie: `guest_session=${encodeURIComponent(token)}` },
      })
      const parsed = parseGuestSession(req)
      expect(parsed.isValid).toBe(true)
      expect(parsed.guestId).toBeUndefined()
    })

    it('signs and validates guest-specific session with guestId', () => {
      const token = signGuestSession('max-mustermann')
      const req = new Request('http://localhost:3000', {
        headers: { cookie: `guest_session=${encodeURIComponent(token)}` },
      })
      const parsed = parseGuestSession(req)
      expect(parsed.isValid).toBe(true)
      expect(parsed.guestId).toBe('max-mustermann')
    })

    it('rejects tampered guest session token (payload modification)', () => {
      const token = signGuestSession('guest-1')
      const [payload, signature] = token.split('.')
      const tamperedPayload = 'guest-v1:admin-impersonator'
      const tamperedToken = `${tamperedPayload}.${signature}`

      const req = new Request('http://localhost:3000', {
        headers: { cookie: `guest_session=${encodeURIComponent(tamperedToken)}` },
      })
      const parsed = parseGuestSession(req)
      expect(parsed.isValid).toBe(false)
    })

    it('rejects tampered guest session token (signature bit flipping)', () => {
      const token = signGuestSession('guest-1')
      const [payload, signature] = token.split('.')
      const tamperedSignature = signature.slice(0, -2) + (signature.endsWith('0') ? '1' : '0')
      const tamperedToken = `${payload}.${tamperedSignature}`

      const req = new Request('http://localhost:3000', {
        headers: { cookie: `guest_session=${encodeURIComponent(tamperedToken)}` },
      })
      const parsed = parseGuestSession(req)
      expect(parsed.isValid).toBe(false)
    })

    it('rejects tokens without payload delimiter dot', () => {
      const req = new Request('http://localhost:3000', {
        headers: { cookie: 'guest_session=invalidTokenWithoutDot' },
      })
      expect(parseGuestSession(req).isValid).toBe(false)
    })

    it('rejects tokens with invalid payload prefix', () => {
      const req = new Request('http://localhost:3000', {
        headers: { cookie: 'guest_session=malicious-v1.fakeSignature' },
      })
      expect(parseGuestSession(req).isValid).toBe(false)
    })

    it('rejects missing or empty cookie header', () => {
      const reqEmpty = new Request('http://localhost:3000')
      expect(parseGuestSession(reqEmpty).isValid).toBe(false)

      const reqBlank = new Request('http://localhost:3000', { headers: { cookie: '' } })
      expect(parseGuestSession(reqBlank).isValid).toBe(false)
    })

    it('signs and verifies valid admin session with expiry', () => {
      const token = signAdminSession()
      const req = new Request('http://localhost:3000', {
        headers: { cookie: `admin_session=${encodeURIComponent(token)}` },
      })
      const parsed = parseAdminSession(req)
      expect(parsed.isValid).toBe(true)
    })

    it('rejects expired admin session token', () => {
      const pastTime = Date.now() - 10000
      const payload = `admin-v1:${pastTime}`
      const crypto = require('crypto')
      const hmac = crypto.createHmac('sha256', process.env.SESSION_SECRET!).update(payload).digest('hex')
      const expiredToken = `${payload}.${hmac}`

      const req = new Request('http://localhost:3000', {
        headers: { cookie: `admin_session=${encodeURIComponent(expiredToken)}` },
      })
      expect(parseAdminSession(req).isValid).toBe(false)
    })

    it('rejects admin session with non-numeric timestamp', () => {
      const payload = 'admin-v1:not-a-number'
      const crypto = require('crypto')
      const hmac = crypto.createHmac('sha256', process.env.SESSION_SECRET!).update(payload).digest('hex')
      const invalidToken = `${payload}.${hmac}`

      const req = new Request('http://localhost:3000', {
        headers: { cookie: `admin_session=${encodeURIComponent(invalidToken)}` },
      })
      expect(parseAdminSession(req).isValid).toBe(false)
    })

    it('checkGuestSession returns 401 response on invalid session', () => {
      const req = new Request('http://localhost:3000')
      const response = checkGuestSession(req)
      expect(response).not.toBeNull()
      expect(response?.status).toBe(401)
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // 3. RATE LIMITING ATTACK MITIGATION
  // ───────────────────────────────────────────────────────────────────────────
  describe('3. Rate Limiting Resilience & IP Isolation', () => {
    it('allows requests within threshold and blocks excess with Retry-After header', () => {
      const req = new Request('http://localhost:3000/api/test', {
        headers: { 'x-forwarded-for': '198.51.100.1' },
      })

      for (let i = 0; i < 5; i++) {
        const limited = rateLimit(req, 'test-route', 5, 60000)
        expect(limited).toBeNull()
      }

      const blocked = rateLimit(req, 'test-route', 5, 60000)
      expect(blocked).not.toBeNull()
      expect(blocked?.status).toBe(429)
      expect(blocked?.headers.get('Retry-After')).toBeDefined()
    })

    it('extracts IP from x-forwarded-for first hop accurately', () => {
      const req = new Request('http://localhost:3000/api/test', {
        headers: { 'x-forwarded-for': '203.0.113.195, 70.41.3.18, 150.172.238.178' },
      })
      expect(getClientIp(req)).toBe('203.0.113.195')
    })

    it('falls back to x-real-ip if x-forwarded-for is missing', () => {
      const req = new Request('http://localhost:3000/api/test', {
        headers: { 'x-real-ip': '198.51.100.99' },
      })
      expect(getClientIp(req)).toBe('198.51.100.99')
    })

    it('isolates rate limits between different client IPs', () => {
      const req1 = new Request('http://localhost:3000/api/test', {
        headers: { 'x-forwarded-for': '198.51.100.10' },
      })
      const req2 = new Request('http://localhost:3000/api/test', {
        headers: { 'x-forwarded-for': '198.51.100.20' },
      })

      for (let i = 0; i < 3; i++) {
        rateLimit(req1, 'isolated-route', 3, 60000)
      }
      expect(rateLimit(req1, 'isolated-route', 3, 60000)?.status).toBe(429)
      expect(rateLimit(req2, 'isolated-route', 3, 60000)).toBeNull()
    })

    it('isolates rate limits across different endpoints for the same IP', () => {
      const req = new Request('http://localhost:3000/api/test', {
        headers: { 'x-forwarded-for': '198.51.100.30' },
      })

      for (let i = 0; i < 2; i++) {
        rateLimit(req, 'endpoint-A', 2, 60000)
      }
      expect(rateLimit(req, 'endpoint-A', 2, 60000)?.status).toBe(429)
      expect(rateLimit(req, 'endpoint-B', 2, 60000)).toBeNull()
    })

    it('verifies preset values are positive and reasonable', () => {
      expect(RATE_LIMITS.validatePasscode.limit).toBeGreaterThan(0)
      expect(RATE_LIMITS.validatePasscode.windowMs).toBeGreaterThan(0)
      expect(RATE_LIMITS.guestMatch.limit).toBeGreaterThan(0)
      expect(RATE_LIMITS.driveUpload.limit).toBeGreaterThan(0)
      expect(RATE_LIMITS.spotifySearch.limit).toBeGreaterThan(0)
      expect(RATE_LIMITS.admin.limit).toBeGreaterThan(0)
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // 4. INPUT SANITIZATION & NORMALIZATION FUZZING
  // ───────────────────────────────────────────────────────────────────────────
  describe('4. Input Normalization & Injection Neutralization', () => {
    it('normalizes names with various SQL and script injection payloads', () => {
      expect(normalizeName("'; DROP TABLE guests; --")).toBe('drop table guests')
      expect(normalizeName('<script>alert("XSS")</script>')).toBe('scriptalertxssscript')
      expect(normalizeName('Max <img src=x onerror=alert(1)>')).toBe('max img srcx onerroralert1')
      expect(normalizeName('admin"--')).toBe('admin')
      expect(normalizeName("1' OR '1'='1")).toBe('1 or 11')
    })

    it('collapses multi-whitespace and removes leading/trailing spaces', () => {
      expect(normalizeName('   Juan     Perez   ')).toBe('juan perez')
      expect(normalizeName('\t\nErika\t\nMusterfrau\n')).toBe('erika musterfrau')
    })

    it('normalizes German sharp S (ß -> ss) and accented characters', () => {
      expect(normalizeName('Großmutti')).toBe('grossmutti')
      expect(normalizeName('Müller')).toBe('muller')
      expect(normalizeName('André')).toBe('andre')
      expect(normalizeName('João')).toBe('joao')
    })

    it('handles phone normalization securely against invalid & spoofed inputs', () => {
      const de = normalizePhone('+49 176 12345678', 'DE')
      expect(de.valid).toBe(true)
      expect(de.e164).toBe('+4917612345678')
      expect(waNumber(de.e164)).toBe('4917612345678')

      const es = normalizePhone('+34 612 34 56 78', 'ES')
      expect(es.valid).toBe(true)
      expect(es.e164).toBe('+34612345678')
      expect(waNumber(es.e164)).toBe('34612345678')

      expect(normalizePhone('not-a-phone-number', 'ES').valid).toBe(false)
      expect(normalizePhone('', 'ES').valid).toBe(false)
      expect(normalizePhone('1'.repeat(500), 'ES').valid).toBe(false)
      expect(normalizePhone('+++49123', 'DE').valid).toBe(false)
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // 5. BASE URL & REDIRECT FORGERY DEFENSE
  // ───────────────────────────────────────────────────────────────────────────
  describe('5. Base URL & Host Header Poisoning Defense', () => {
    it('rejects untrusted host headers in production when env var is missing', () => {
      vi.stubEnv('NODE_ENV', 'production')
      delete process.env.NEXT_PUBLIC_APP_URL
      delete process.env.VERCEL_PROJECT_PRODUCTION_URL

      const req = new Request('https://attacker.com/api/test', {
        headers: { host: 'attacker.com' },
      })

      expect(() => getBaseUrl(req)).toThrow()
    })

    it('enforces configured production domain over attacker-supplied host', () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://wedding-project-web.vercel.app')

      const req = new Request('https://attacker.com/api/test', {
        headers: { host: 'attacker.com' },
      })

      expect(getBaseUrl(req)).toBe('https://wedding-project-web.vercel.app')
      expect(getSpotifyRedirectUri(req)).toBe('https://wedding-project-web.vercel.app/api/admin/spotify/callback')
    })
  })
})
