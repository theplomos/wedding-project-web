import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { POST } from '@/app/api/guest/match/route'
import { signGuestSession, parseGuestSession, GUEST_SESSION_COOKIE } from '@/lib/auth'
import { normalizeName } from '@/lib/normalize-name'
import { classifyMatch } from '@/lib/guest-match-classify'
import { resetRateLimitStore } from '@/lib/rate-limit'
import prisma from '@/lib/prisma'

vi.mock('@/lib/prisma', () => ({
  default: {
    $queryRaw: vi.fn(),
    guest: {
      findMany: vi.fn()
    }
  }
}))

describe('Subagent 2: Backend Security & Privacy Tests', () => {
  const SESSION_SECRET = 'backend-security-test-secret-123'

  beforeEach(() => {
    vi.stubEnv('SESSION_SECRET', SESSION_SECRET)
    vi.stubEnv('NODE_ENV', 'test')
    vi.clearAllMocks()
    resetRateLimitStore()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  function createMatchRequest(body: Record<string, unknown>, cookieToken?: string): Request {
    const token = cookieToken ?? signGuestSession()
    return new Request('http://localhost/api/guest/match', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'cookie': `${GUEST_SESSION_COOKIE}=${token}`
      },
      body: JSON.stringify(body)
    })
  }

  it('1. fuzzy match tier response payload contains NO match object', async () => {
    const mockGuest = {
      id: 'guest-fuzzy-1',
      partyName: 'Familia Garcia',
      partySizeMax: 4,
      status: 'PENDING',
      notPreloaded: false,
      similarityScore: 0.65
    }
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([mockGuest])

    const req = createMatchRequest({ name: 'Francisco Garcia' })
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.matchTier).toBe('fuzzy')
    expect(body.match).toBeUndefined()
    expect('match' in body).toBe(false)
  })

  it('2. fuzzy match tier response payload contains NO id or partyName fields', async () => {
    const mockGuest = {
      id: 'guest-fuzzy-2',
      partyName: 'Familia Martinez',
      partySizeMax: 2,
      status: 'PENDING',
      notPreloaded: false,
      similarityScore: 0.72
    }
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([mockGuest])

    const req = createMatchRequest({ name: 'Carlos Martinez' })
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.matchTier).toBe('fuzzy')
    expect(body.id).toBeUndefined()
    expect(body.partyName).toBeUndefined()
    expect(Object.keys(body)).not.toContain('id')
    expect(Object.keys(body)).not.toContain('partyName')
  })

  it('3. none match tier response payload contains NO match object', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([])

    const req = createMatchRequest({ name: 'Desconocido Total' })
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.matchTier).toBe('none')
    expect(body.match).toBeUndefined()
    expect('match' in body).toBe(false)
  })

  it('4. exact match tier response payload contains match object with required fields', async () => {
    const mockGuest = {
      id: 'guest-exact-1',
      partyName: 'Familia Barrientos',
      partySizeMax: 3,
      status: 'CONFIRMED',
      notPreloaded: false,
      similarityScore: 0.95
    }
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([mockGuest])

    const req = createMatchRequest({ name: 'Francisco Barrientos' })
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.matchTier).toBe('exact')
    expect(body.match).toBeDefined()
    expect(body.match.id).toBe('guest-exact-1')
    expect(body.match.partyName).toBe('Familia Barrientos')
    expect(body.match.partySizeMax).toBe(3)
    expect(body.match.status).toBe('CONFIRMED')
    expect(body.match.notPreloaded).toBe(false)
    expect(body.match.similarityScore).toBe(0.95)
  })

  it('5. 1-word input payload to route validation logic returns error NEED_FULL_NAME', async () => {
    const req = createMatchRequest({ name: 'Francisco' })
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.error).toBe('NEED_FULL_NAME')
  })

  it('6. 0-word empty input returns status 400 error', async () => {
    const reqEmpty = createMatchRequest({ name: '' })
    const resEmpty = await POST(reqEmpty)
    const bodyEmpty = await resEmpty.json()

    expect(resEmpty.status).toBe(400)
    expect(bodyEmpty.success).toBe(false)
    expect(bodyEmpty.error).toBe('Por favor, introduce tu nombre.')

    const reqSpaces = createMatchRequest({ name: '   ' })
    const resSpaces = await POST(reqSpaces)
    const bodySpaces = await resSpaces.json()

    expect(resSpaces.status).toBe(400)
    expect(bodySpaces.success).toBe(false)
    expect(bodySpaces.error).toBe('Por favor, introduce tu nombre.')
  })

  it("7. SQL injection attempts in name field (e.g. ' OR 1=1 --) are safely handled by normalizeName/classifyMatch without crash", async () => {
    const sqliInput = "' OR 1=1 --"
    const normalized = normalizeName(sqliInput)
    expect(normalized).toBe('or 11')

    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([])
    const req = createMatchRequest({ name: sqliInput })
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.matchTier).toBe('none')

    const dropsql = "'; DROP TABLE guests; --"
    expect(normalizeName(dropsql)).toBe('drop table guests')

    const tier = classifyMatch(null)
    expect(tier).toBe('none')
  })

  it('8. XSS payload strings in name field (e.g. <script>alert(1)</script>) are normalized safely', async () => {
    const xssInput = "<script>alert(1)</script> Garcia"
    const normalized = normalizeName(xssInput)
    expect(normalized).toBe('scriptalert1script garcia')
    expect(normalized).not.toContain('<')
    expect(normalized).not.toContain('>')

    const xssImg = "<img src=x onerror=alert('XSS')> Lopez"
    const normalizedImg = normalizeName(xssImg)
    expect(normalizedImg).toBe('img srcx onerroralertxss lopez')
    expect(normalizedImg).not.toContain('<')
    expect(normalizedImg).not.toContain('>')

    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([])
    const req = createMatchRequest({ name: xssInput })
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.matchTier).toBe('none')
  })

  it('9. Cookie session signing (signGuestSession) generates a valid non-empty signed string', () => {
    const generalToken = signGuestSession()
    expect(typeof generalToken).toBe('string')
    expect(generalToken.length).toBeGreaterThan(0)
    expect(generalToken).toContain('.')

    const [payload, hmac] = generalToken.split('.')
    expect(payload).toBe('guest-v1')
    expect(hmac).toHaveLength(64) // SHA256 hex string is 64 chars

    const reqGeneral = new Request('http://localhost/', {
      headers: { cookie: `${GUEST_SESSION_COOKIE}=${generalToken}` }
    })
    const sessionGeneral = parseGuestSession(reqGeneral)
    expect(sessionGeneral.isValid).toBe(true)
    expect(sessionGeneral.guestId).toBeUndefined()

    const guestId = 'guest-uuid-999'
    const guestToken = signGuestSession(guestId)
    expect(guestToken).toContain(`guest-v1:${guestId}.`)

    const reqGuest = new Request('http://localhost/', {
      headers: { cookie: `${GUEST_SESSION_COOKIE}=${guestToken}` }
    })
    const sessionGuest = parseGuestSession(reqGuest)
    expect(sessionGuest.isValid).toBe(true)
    expect(sessionGuest.guestId).toBe(guestId)
  })

  it('10. Privacy check: Ensure response shapes for fuzzy and none tiers strictly exclude sensitive guest attributes', async () => {
    // 1. Check fuzzy tier
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([
      {
        id: 'sensitive-id-1',
        partyName: 'Secret Party',
        partySizeMax: 5,
        status: 'PENDING',
        notPreloaded: false,
        similarityScore: 0.60
      }
    ])
    const reqFuzzy = createMatchRequest({ name: 'Secret Guest' })
    const resFuzzy = await POST(reqFuzzy)
    const bodyFuzzy = await resFuzzy.json()

    const fuzzyKeys = Object.keys(bodyFuzzy).sort()
    expect(fuzzyKeys).toEqual(['matchTier', 'success'])
    expect(bodyFuzzy).not.toHaveProperty('match')
    expect(bodyFuzzy).not.toHaveProperty('id')
    expect(bodyFuzzy).not.toHaveProperty('partyName')
    expect(bodyFuzzy).not.toHaveProperty('partySizeMax')
    expect(bodyFuzzy).not.toHaveProperty('status')
    expect(bodyFuzzy).not.toHaveProperty('notPreloaded')

    // 2. Check none tier
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([])
    const reqNone = createMatchRequest({ name: 'Unknown Guest' })
    const resNone = await POST(reqNone)
    const bodyNone = await resNone.json()

    const noneKeys = Object.keys(bodyNone).sort()
    expect(noneKeys).toEqual(['matchTier', 'success'])
    expect(bodyNone).not.toHaveProperty('match')
    expect(bodyNone).not.toHaveProperty('id')
    expect(bodyNone).not.toHaveProperty('partyName')
    expect(bodyNone).not.toHaveProperty('partySizeMax')
    expect(bodyNone).not.toHaveProperty('status')
    expect(bodyNone).not.toHaveProperty('notPreloaded')
  })
})
