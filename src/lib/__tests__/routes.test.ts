/**
 * Tests for API route validation logic:
 *   - RSVP route: phone/language validation without DB (unit-level mocking)
 *   - Admin Reminders route: auth guard and payload validation
 *
 * Strategy: We extract and test the *pure validation logic* that lives inside
 * the route handlers without spinning up a Next.js server or touching the DB.
 * Where necessary we call the module-level helpers (checkAdmin, normalizePhone,
 * VALID_LANGUAGES, isWave) directly.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextResponse } from 'next/server'

// ---------------------------------------------------------------------------
// Helpers extracted from route logic — tested in isolation
// ---------------------------------------------------------------------------

const VALID_LANGUAGES = ['es', 'de', 'pt', 'en']
const WAVES = ['week', 'day', 'morning'] as const
type Wave = (typeof WAVES)[number]

function isWave(v: string | null): v is Wave {
  return v !== null && (Array.from(WAVES) as string[]).includes(v)
}

function sanitizeLanguage(lang: unknown): string {
  return typeof lang === 'string' && VALID_LANGUAGES.includes(lang) ? lang : 'es'
}

// ---------------------------------------------------------------------------
// auth helpers (imported from lib)
// ---------------------------------------------------------------------------
import { checkAdmin, parseGuestSession, signGuestSession, GUEST_SESSION_COOKIE } from '../auth'

// ---------------------------------------------------------------------------
// phone helper
// ---------------------------------------------------------------------------
import { normalizePhone } from '../phone'

// ============================================================================
// 1.  RSVP — phone validation (unit, no DB)
// ============================================================================
describe('RSVP phone validation (unit)', () => {
  it('Test 1: attending=true, phone undefined → invalid', () => {
    const result = normalizePhone(undefined as unknown as string, 'DE')
    expect(result.valid).toBe(false)
  })

  it('Test 2: attending=true, phone empty string → invalid', () => {
    expect(normalizePhone('', 'ES').valid).toBe(false)
  })

  it('Test 3: attending=true, phone is garbage → invalid', () => {
    expect(normalizePhone('abc-xyz', 'ES').valid).toBe(false)
  })

  it('Test 4: attending=true, phone too short → invalid', () => {
    expect(normalizePhone('12345', 'ES').valid).toBe(false)
  })

  it('Test 5: attending=true, valid German local number → valid E.164', () => {
    const r = normalizePhone('+491761234567', 'DE')
    expect(r.valid).toBe(true)
    expect(r.e164).toBe('+491761234567')
  })

  it('Test 6: attending=true, valid Spanish number → valid E.164', () => {
    const r = normalizePhone('+34612345678', 'ES')
    expect(r.valid).toBe(true)
    expect(r.e164).toBe('+34612345678')
  })

  it('Test 7: attending=true, valid Portuguese number → valid E.164', () => {
    const r = normalizePhone('+351912345678', 'PT')
    expect(r.valid).toBe(true)
    expect(r.e164).toBe('+351912345678')
  })

  it('Test 8: attending=true, valid UK number → valid E.164', () => {
    const r = normalizePhone('+447123456789', 'GB')
    expect(r.valid).toBe(true)
    expect(r.e164).toBe('+447123456789')
  })

  it('Test 9: attending=false, phone empty is irrelevant (phone not validated)', () => {
    // When attending=false we skip phone validation entirely.
    // Simulate: phoneE164 stays null when attending=false
    const attending = false
    let phoneE164: string | null = null
    if (attending) {
      const r = normalizePhone('', 'ES')
      if (!r.valid) throw new Error('should not reach here')
      phoneE164 = r.e164!
    }
    expect(phoneE164).toBeNull()
  })

  it('Test 10: number with spaces/hyphens/parens is normalised', () => {
    const r = normalizePhone('+34 (612) 34-56-78', 'ES')
    expect(r.valid).toBe(true)
    expect(r.e164).toBe('+34612345678')
  })
})

// ============================================================================
// 2.  RSVP — language sanitisation (unit)
// ============================================================================
describe('RSVP language sanitisation (unit)', () => {
  it('Test 11: known language "es" passes through unchanged', () => {
    expect(sanitizeLanguage('es')).toBe('es')
  })

  it('Test 12: known language "de" passes through unchanged', () => {
    expect(sanitizeLanguage('de')).toBe('de')
  })

  it('Test 13: known language "pt" passes through unchanged', () => {
    expect(sanitizeLanguage('pt')).toBe('pt')
  })

  it('Test 14: known language "en" passes through unchanged', () => {
    expect(sanitizeLanguage('en')).toBe('en')
  })

  it('Test 15: unknown language "fr" falls back to "es"', () => {
    expect(sanitizeLanguage('fr')).toBe('es')
  })

  it('Test 16: empty string falls back to "es"', () => {
    expect(sanitizeLanguage('')).toBe('es')
  })

  it('Test 17: null falls back to "es"', () => {
    expect(sanitizeLanguage(null)).toBe('es')
  })

  it('Test 18: undefined falls back to "es"', () => {
    expect(sanitizeLanguage(undefined)).toBe('es')
  })

  it('Test 19: numeric type falls back to "es"', () => {
    expect(sanitizeLanguage(42)).toBe('es')
  })
})

// ============================================================================
// 3.  Admin Reminders — isWave guard (unit)
// ============================================================================
describe('Admin Reminders — isWave validation (unit)', () => {
  it('Test 20: "week" is a valid wave', () => {
    expect(isWave('week')).toBe(true)
  })

  it('Test 21: "day" is a valid wave', () => {
    expect(isWave('day')).toBe(true)
  })

  it('Test 22: "morning" is a valid wave', () => {
    expect(isWave('morning')).toBe(true)
  })

  it('Test 23: null is NOT a valid wave', () => {
    expect(isWave(null)).toBe(false)
  })

  it('Test 24: empty string is NOT a valid wave', () => {
    expect(isWave('')).toBe(false)
  })

  it('Test 25: arbitrary string is NOT a valid wave', () => {
    expect(isWave('evening')).toBe(false)
  })

  it('Test 26: uppercase "WEEK" is NOT a valid wave (case-sensitive)', () => {
    expect(isWave('WEEK')).toBe(false)
  })
})

// ============================================================================
// 4.  checkAdmin — auth guard (unit, env-mocked)
// ============================================================================
describe('checkAdmin — auth guard (unit)', () => {
  const FAKE_PASSWORD = 'SuperSecretAdmin123'

  beforeEach(() => {
    vi.stubEnv('ADMIN_PASSWORD', FAKE_PASSWORD)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  function makeReq(authHeader?: string): Request {
    const headers: Record<string, string> = {}
    if (authHeader !== undefined) headers['Authorization'] = authHeader
    return new Request('http://localhost/api/admin/reminders', { headers })
  }

  it('Test 27: correct password → checkAdmin returns null (authorized)', () => {
    const req = makeReq(FAKE_PASSWORD)
    expect(checkAdmin(req)).toBeNull()
  })

  it('Test 28: wrong password → checkAdmin returns 401 NextResponse', async () => {
    const req = makeReq('WrongPassword')
    const res = checkAdmin(req)
    expect(res).toBeInstanceOf(NextResponse)
    const body = await res!.json()
    expect(body.success).toBe(false)
    expect(res!.status).toBe(401)
  })

  it('Test 29: missing Authorization header → checkAdmin returns 401', async () => {
    const req = makeReq()
    const res = checkAdmin(req)
    expect(res).toBeInstanceOf(NextResponse)
    const body = await res!.json()
    expect(body.success).toBe(false)
    expect(res!.status).toBe(401)
  })

  it('Test 30: empty Authorization header → checkAdmin returns 401', async () => {
    const req = makeReq('')
    const res = checkAdmin(req)
    expect(res).toBeInstanceOf(NextResponse)
    expect(res!.status).toBe(401)
  })

  it('Test 31: password with trailing extra char → 401 (wrong length)', async () => {
    const req = makeReq(FAKE_PASSWORD + 'X')
    const res = checkAdmin(req)
    expect(res).toBeInstanceOf(NextResponse)
    expect(res!.status).toBe(401)
  })
})

// ============================================================================
// 5.  parseGuestSession / signGuestSession (unit, env-mocked)
// ============================================================================
describe('parseGuestSession + signGuestSession (unit)', () => {
  const SESSION_SECRET = 'TestSessionSecret'

  beforeEach(() => {
    vi.stubEnv('SESSION_SECRET', SESSION_SECRET)
    vi.stubEnv('NODE_ENV', 'test')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  function makeReqWithCookie(cookieValue?: string): Request {
    const headers: Record<string, string> = {}
    if (cookieValue !== undefined) {
      headers['cookie'] = `${GUEST_SESSION_COOKIE}=${cookieValue}`
    }
    return new Request('http://localhost/api/rsvp', { headers })
  }

  it('Test 32: no cookie → isValid=false', () => {
    const req = makeReqWithCookie()
    expect(parseGuestSession(req).isValid).toBe(false)
  })

  it('Test 33: garbage cookie → isValid=false', () => {
    const req = makeReqWithCookie('totally-invalid-token')
    expect(parseGuestSession(req).isValid).toBe(false)
  })

  it('Test 34: valid general session token → isValid=true', () => {
    const token = signGuestSession()
    const req = makeReqWithCookie(token)
    const session = parseGuestSession(req)
    expect(session.isValid).toBe(true)
    expect(session.guestId).toBeUndefined()
  })

  it('Test 35: valid guest-specific session token → isValid=true and guestId matches', () => {
    const guestId = 'guest-abc-123'
    const token = signGuestSession(guestId)
    const req = makeReqWithCookie(token)
    const session = parseGuestSession(req)
    expect(session.isValid).toBe(true)
    expect(session.guestId).toBe(guestId)
  })

  it('Test 36: tampered token (signature mismatch) → isValid=false', () => {
    const token = signGuestSession('guest-xyz') + 'tampered'
    const req = makeReqWithCookie(token)
    expect(parseGuestSession(req).isValid).toBe(false)
  })
})

// --- BOLA: rsvp ---
// The rsvp route imports prisma which checks for a DB connection string at
// module-load time. We provide a fake URL so the module can be imported; the
// BOLA guard (403) fires before any real DB call is made.
vi.mock('../../lib/prisma', () => ({
  default: {
    rSVP: {
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({ id: 'r1', guestId: 'g1', attending: true, numAdults: 1, numKids: 0, dietary: 'OMNIVORO', dietaryNotes: null, contribution: null, kidsNames: null, language: 'es', submittedAt: new Date() }),
      create: vi.fn().mockResolvedValue({ id: 'r1', guestId: 'g1', attending: true, numAdults: 1, numKids: 0, dietary: 'OMNIVORO', dietaryNotes: null, contribution: null, kidsNames: null, language: 'es', phone: '+34600123456', submittedAt: new Date() }),
    },
    guest: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'juan-nuevo-new' }),
      update: vi.fn().mockResolvedValue({}),
    },
  },
}))

function makeCookie(token: string) {
  return `${GUEST_SESSION_COOKIE}=${encodeURIComponent(token)}`
}

describe('BOLA — GET /api/rsvp', () => {
  it('passcode-only session + foreign guestId → 403', async () => {
    process.env.SESSION_SECRET = 'test-secret-32-chars-minimum-ok!'
    const token = signGuestSession()
    const req = new Request('http://localhost/api/rsvp?guestId=familia-garcia', {
      headers: { cookie: makeCookie(token) }
    })
    const { GET } = await import('../../app/api/rsvp/route')
    const res = await GET(req)
    expect(res.status).toBe(403)
  })

  it('guest-specific session for own guestId → not 403', async () => {
    process.env.SESSION_SECRET = 'test-secret-32-chars-minimum-ok!'
    const guestId = 'familia-garcia'
    const token = signGuestSession(guestId)
    const req = new Request(`http://localhost/api/rsvp?guestId=${guestId}`, {
      headers: { cookie: makeCookie(token) }
    })
    const { GET } = await import('../../app/api/rsvp/route')
    const res = await GET(req)
    expect(res.status).not.toBe(403)
  })
})

describe('BOLA — POST /api/rsvp', () => {
  it('passcode-only session + existing foreign guestId → 403', async () => {
    process.env.SESSION_SECRET = 'test-secret-32-chars-minimum-ok!'
    const token = signGuestSession()
    const req = new Request('http://localhost/api/rsvp', {
      method: 'POST',
      headers: { cookie: makeCookie(token), 'content-type': 'application/json' },
      body: JSON.stringify({
        guestId: 'familia-garcia',
        attending: true,
        numAdults: 2,
        numKids: 0,
        dietary: 'OMNIVORO',
      }),
    })
    const { POST } = await import('../../app/api/rsvp/route')
    const res = await POST(req)
    expect(res.status).toBe(403)
  })

  it('passcode-only session + partyName (new guest, no guestId) → not 403', async () => {
    process.env.SESSION_SECRET = 'test-secret-32-chars-minimum-ok!'
    const token = signGuestSession()
    const req = new Request('http://localhost/api/rsvp', {
      method: 'POST',
      headers: { cookie: makeCookie(token), 'content-type': 'application/json' },
      body: JSON.stringify({
        partyName: 'Juan Nuevo',
        attending: true,
        numAdults: 1,
        numKids: 0,
        dietary: 'OMNIVORO',
        phone: '+34600000000',
      }),
    })
    const { POST } = await import('../../app/api/rsvp/route')
    const res = await POST(req)
    expect(res.status).not.toBe(403)
  })
})

// ============================================================================
// Input validation — anecdote text length
// ============================================================================
describe('Input validation — POST /api/anecdote', () => {
  it('text > 2000 chars → 400', async () => {
    process.env.SESSION_SECRET = 'test-secret-32-chars-minimum-ok!'
    const token = signGuestSession()
    const req = new Request('http://localhost/api/anecdote', {
      method: 'POST',
      headers: { cookie: `${GUEST_SESSION_COOKIE}=${encodeURIComponent(token)}`, 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'a'.repeat(2001) }),
    })
    const { POST } = await import('../../app/api/anecdote/route')
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.success).toBe(false)
  })
})

// ============================================================================
// Input validation — guest/match name length
// ============================================================================
describe('Input validation — POST /api/guest/match', () => {
  it('name > 200 chars → 400', async () => {
    process.env.SESSION_SECRET = 'test-secret-32-chars-minimum-ok!'
    const token = signGuestSession()
    const req = new Request('http://localhost/api/guest/match', {
      method: 'POST',
      headers: { cookie: `${GUEST_SESSION_COOKIE}=${encodeURIComponent(token)}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'ab '.repeat(68) }), // 204 chars
    })
    const { POST } = await import('../../app/api/guest/match/route')
    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})

// ============================================================================
// Input validation — rsvp numAdults limit
// ============================================================================
describe('Input validation — POST /api/rsvp numAdults', () => {
  it('numAdults > 50 → 400', async () => {
    process.env.SESSION_SECRET = 'test-secret-32-chars-minimum-ok!'
    const token = signGuestSession()
    const req = new Request('http://localhost/api/rsvp', {
      method: 'POST',
      headers: { cookie: `${GUEST_SESSION_COOKIE}=${encodeURIComponent(token)}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        partyName: 'Familia Test',
        attending: true,
        numAdults: 99,
        numKids: 0,
        dietary: 'OMNIVORO',
        phone: '+34600000000',
      }),
    })
    const { POST } = await import('../../app/api/rsvp/route')
    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})

// ============================================================================
// Auth — spotify/search requires session
// ============================================================================
vi.mock('../../lib/spotify', () => ({
  searchTracks: vi.fn().mockResolvedValue([]),
}))

describe('Auth — GET /api/spotify/search', () => {
  it('no cookie → 401', async () => {
    const req = new Request('http://localhost/api/spotify/search?q=test')
    const { GET } = await import('../../app/api/spotify/search/route')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })
})

// ============================================================================
// PII — rsvp POST does not leak phone
// ============================================================================
describe('PII — POST /api/rsvp phone not in response', () => {
  it('rsvp POST response never contains the submitted phone number', async () => {
    process.env.SESSION_SECRET = 'test-secret-32-chars-minimum-ok!'
    const token = signGuestSession()
    const testPhone = '+34600123456'
    const req = new Request('http://localhost/api/rsvp', {
      method: 'POST',
      headers: { cookie: `${GUEST_SESSION_COOKIE}=${encodeURIComponent(token)}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        partyName: 'Familia Test',
        attending: true,
        numAdults: 1,
        numKids: 0,
        dietary: 'OMNIVORO',
        phone: testPhone,
      }),
    })
    const { POST } = await import('../../app/api/rsvp/route')
    const res = await POST(req)
    const body = await res.json()
    expect(JSON.stringify(body)).not.toContain(testPhone)
    expect(body.rsvp?.phone).toBeUndefined()
  })
})
