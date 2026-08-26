import { describe, it, expect, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'
import { rateLimit, resetRateLimitStore, getClientIp, RATE_LIMITS } from '../rate-limit'

function makeReq(ip = '1.2.3.4'): Request {
  return new Request('http://localhost/api/test', {
    headers: { 'x-forwarded-for': ip },
  })
}

describe('rateLimit — core behaviour', () => {
  beforeEach(() => {
    resetRateLimitStore()
  })

  it('allows up to `limit` requests and blocks the next one', () => {
    const limit = 3
    const window = 10_000

    for (let i = 0; i < limit; i++) {
      expect(rateLimit(makeReq(), 'test', limit, window)).toBeNull()
    }

    const blocked = rateLimit(makeReq(), 'test', limit, window)
    expect(blocked).toBeInstanceOf(NextResponse)
    expect(blocked!.status).toBe(429)
  })

  it('returns a Retry-After header on 429', () => {
    const limit = 1
    const window = 5_000

    rateLimit(makeReq(), 'test', limit, window)
    const blocked = rateLimit(makeReq(), 'test', limit, window)

    expect(blocked!.status).toBe(429)
    const retryAfter = blocked!.headers.get('Retry-After')
    expect(retryAfter).not.toBeNull()
    expect(Number(retryAfter)).toBeGreaterThan(0)
  })

  it('blocks subsequent requests after limit is reached', () => {
    const limit = 2
    const window = 10_000

    rateLimit(makeReq(), 'test', limit, window)
    rateLimit(makeReq(), 'test', limit, window)

    // All further requests should be blocked
    expect(rateLimit(makeReq(), 'test', limit, window)!.status).toBe(429)
    expect(rateLimit(makeReq(), 'test', limit, window)!.status).toBe(429)
  })
})

describe('rateLimit — isolation by IP and identifier', () => {
  beforeEach(() => {
    resetRateLimitStore()
  })

  it('different IPs are tracked independently', () => {
    const limit = 1
    const window = 10_000

    expect(rateLimit(makeReq('1.1.1.1'), 'test', limit, window)).toBeNull()
    expect(rateLimit(makeReq('2.2.2.2'), 'test', limit, window)).toBeNull()

    // First IP is now blocked
    expect(rateLimit(makeReq('1.1.1.1'), 'test', limit, window)!.status).toBe(429)
  })

  it('different identifiers are tracked independently', () => {
    const limit = 1
    const window = 10_000

    expect(rateLimit(makeReq(), 'endpointA', limit, window)).toBeNull()
    expect(rateLimit(makeReq(), 'endpointB', limit, window)).toBeNull()

    expect(rateLimit(makeReq(), 'endpointA', limit, window)!.status).toBe(429)
    expect(rateLimit(makeReq(), 'endpointB', limit, window)!.status).toBe(429)
  })
})

describe('rateLimit — window expiry', () => {
  beforeEach(() => {
    resetRateLimitStore()
  })

  it('resets after the window expires', async () => {
    const limit = 1
    const window = 30 // 30ms

    rateLimit(makeReq(), 'test', limit, window)
    expect(rateLimit(makeReq(), 'test', limit, window)!.status).toBe(429)

    // Wait for window to expire
    await new Promise((r) => setTimeout(r, 50))

    // Should be allowed again
    expect(rateLimit(makeReq(), 'test', limit, window)).toBeNull()
  })
})

describe('getClientIp', () => {
  it('extracts IP from x-forwarded-for', () => {
    const req = new Request('http://localhost/', {
      headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
    })
    expect(getClientIp(req)).toBe('1.2.3.4')
  })

  it('falls back to x-real-ip', () => {
    const req = new Request('http://localhost/', {
      headers: { 'x-real-ip': '9.9.9.9' },
    })
    expect(getClientIp(req)).toBe('9.9.9.9')
  })

  it('returns "unknown" when no headers present', () => {
    const req = new Request('http://localhost/')
    expect(getClientIp(req)).toBe('unknown')
  })
})

describe('RATE_LIMITS presets', () => {
  it('validatePasscode: 5 attempts / 15 min', () => {
    expect(RATE_LIMITS.validatePasscode.limit).toBe(5)
    expect(RATE_LIMITS.validatePasscode.windowMs).toBe(15 * 60 * 1000)
  })

  it('guestMatch: 10 attempts / 5 min', () => {
    expect(RATE_LIMITS.guestMatch.limit).toBe(10)
    expect(RATE_LIMITS.guestMatch.windowMs).toBe(5 * 60 * 1000)
  })

  it('driveUpload: 10 requests / 1 min', () => {
    expect(RATE_LIMITS.driveUpload.limit).toBe(10)
    expect(RATE_LIMITS.driveUpload.windowMs).toBe(60 * 1000)
  })

  it('spotifySearch: 20 requests / 1 min', () => {
    expect(RATE_LIMITS.spotifySearch.limit).toBe(20)
    expect(RATE_LIMITS.spotifySearch.windowMs).toBe(60 * 1000)
  })

  it('admin: 30 requests / 1 min', () => {
    expect(RATE_LIMITS.admin.limit).toBe(30)
    expect(RATE_LIMITS.admin.windowMs).toBe(60 * 1000)
  })
})
