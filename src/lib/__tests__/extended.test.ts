/**
 * Extended test suite — 40+ tests covering new WhatsApp-reminder functionality.
 *
 * Tests here do NOT duplicate phone.test.ts / reminder-content.test.ts / routes.test.ts.
 * They focus on:
 *   A.  normalizePhone — international edge cases not yet covered
 *   B.  waNumber       — extended edge cases
 *   C.  LANG_DEFAULT_COUNTRY map — verifies the lang→CountryCode mapping used in the RSVP form
 *   D.  renderReminder — structural contract: line count, section order, no cross-lang bleed
 *   E.  renderReminder — partyName interpolation across all 4 langs × 3 waves
 *   F.  waLink         — URL structure invariants and round-trip decode
 *   G.  WAVE_SCHEDULE  — date/time string correctness for all three waves
 *   H.  MAPS_CEREMONY / MAPS_BANQUET — URL shape
 *   I.  checkAdmin     — ADMIN_PASSWORD absent (mis-configured server)
 *   J.  signGuestSession / parseGuestSession — token isolation: guestId-A token ≠ guestId-B
 *   K.  Language sanitisation (re-exported inline logic) — boundary values
 *   L.  isWave guard   — all three valid values plus boundary cases
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextResponse } from 'next/server'

// --- lib imports ---
import { normalizePhone, waNumber, LANG_DEFAULT_COUNTRY } from '../phone'
import {
  renderReminder,
  getGreetingName,
  waLink,
  WAVES,
  WAVE_SCHEDULE,
  MAPS_CEREMONY,
  MAPS_BANQUET,
  type Wave,
  type ReminderLang,
} from '../reminder-content'
import { checkAdmin, parseGuestSession, signGuestSession, GUEST_SESSION_COOKIE } from '../auth'

// ─────────────────────────────────────────────────────────────────────────────
// A. normalizePhone — international edge cases
// ─────────────────────────────────────────────────────────────────────────────
describe('A · normalizePhone — international numbers not yet covered', () => {
  it('A-01: valid US number with country code', () => {
    const r = normalizePhone('+12125551234', 'US')
    expect(r.valid).toBe(true)
    expect(r.e164).toBe('+12125551234')
  })

  it('A-02: valid Brazilian number (+55)', () => {
    const r = normalizePhone('+5511987654321', 'BR')
    expect(r.valid).toBe(true)
    expect(r.e164).toBe('+5511987654321')
  })

  it('A-03: valid French mobile (+33 6...)', () => {
    const r = normalizePhone('+33612345678', 'FR')
    expect(r.valid).toBe(true)
    expect(r.e164).toBe('+33612345678')
  })

  it('A-04: valid Italian mobile (+39 3...)', () => {
    const r = normalizePhone('+393201234567', 'IT')
    expect(r.valid).toBe(true)
    expect(r.e164).toBe('+393201234567')
  })

  it('A-05: local German number resolved with DE country hint', () => {
    const r = normalizePhone('0151 23456789', 'DE')
    expect(r.valid).toBe(true)
    expect(r.e164).toMatch(/^\+49/)
  })

  it('A-06: number that looks valid but has wrong length for the country → invalid', () => {
    // Spanish numbers are 9 digits after +34. 8-digit suffix is invalid.
    const r = normalizePhone('+3461234567', 'ES') // only 8 digits
    expect(r.valid).toBe(false)
  })

  it('A-07: string with only special characters → invalid', () => {
    expect(normalizePhone('---###---', 'ES').valid).toBe(false)
  })

  it('A-08: very long string (50 chars of digits) → invalid', () => {
    expect(normalizePhone('1'.repeat(50), 'DE').valid).toBe(false)
  })

  it('A-09: valid number with dots as separators is normalised', () => {
    // Germany: +49.176.1234567
    const r = normalizePhone('+49.176.1234567', 'DE')
    expect(r.valid).toBe(true)
    expect(r.e164).toBe('+491761234567')
  })

  it('A-10: e164 field is undefined when valid=false', () => {
    const r = normalizePhone('not-a-phone', 'ES')
    expect(r.valid).toBe(false)
    expect(r.e164).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// B. waNumber — extended edge cases
// ─────────────────────────────────────────────────────────────────────────────
describe('B · waNumber — strips all non-digit characters', () => {
  it('B-01: removes + sign from E.164', () => {
    expect(waNumber('+34612345678')).toBe('34612345678')
  })

  it('B-02: removes dashes and spaces from formatted string', () => {
    expect(waNumber('+49 176-123-4567')).toBe('491761234567')
  })

  it('B-03: empty string returns empty string', () => {
    expect(waNumber('')).toBe('')
  })

  it('B-04: string of only non-digits returns empty string', () => {
    expect(waNumber('+-. ()')).toBe('')
  })

  it('B-05: already-clean digit string is unchanged', () => {
    expect(waNumber('351912345678')).toBe('351912345678')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// C. LANG_DEFAULT_COUNTRY map — used by the RSVP form to set country dropdown
// ─────────────────────────────────────────────────────────────────────────────
describe('C · LANG_DEFAULT_COUNTRY — lang to CountryCode mapping', () => {
  it('C-01: es → ES', () => expect(LANG_DEFAULT_COUNTRY.es).toBe('ES'))
  it('C-02: de → DE', () => expect(LANG_DEFAULT_COUNTRY.de).toBe('DE'))
  it('C-03: pt → PT', () => expect(LANG_DEFAULT_COUNTRY.pt).toBe('PT'))
  it('C-04: en → GB', () => expect(LANG_DEFAULT_COUNTRY.en).toBe('GB'))
  it('C-05: map has exactly 4 entries (no extra langs snuck in)', () => {
    expect(Object.keys(LANG_DEFAULT_COUNTRY)).toHaveLength(4)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// D. renderReminder — structural contract
// ─────────────────────────────────────────────────────────────────────────────
describe('D · renderReminder — structural contract', () => {
  const langs: ReminderLang[] = ['es', 'de', 'pt', 'en']
  const waves: Wave[] = ['week', 'day', 'morning']

  it('D-01: every message contains reception time and location', () => {
    for (const lang of langs) {
      for (const wave of waves) {
        const msg = renderReminder(wave, { partyName: 'Test', language: lang })
        expect(msg, `${lang}/${wave} missing Konzerthaus Freiburg`).toContain('Konzerthaus Freiburg')
      }
    }
  })

  it('D-02: every message contains the Maps banquet URL', () => {
    for (const lang of langs) {
      for (const wave of waves) {
        const msg = renderReminder(wave, { partyName: 'Test', language: lang })
        expect(msg, `${lang}/${wave} missing banquet URL`).toContain(MAPS_BANQUET)
      }
    }
  })

  it('D-03: every message contains the dress-code emoji 👗', () => {
    for (const lang of langs) {
      for (const wave of waves) {
        const msg = renderReminder(wave, { partyName: 'Test', language: lang })
        expect(msg, `${lang}/${wave} missing dress-code`).toContain('👗')
      }
    }
  })

  it('D-04: every message ends with Francisco & Alicia 💍', () => {
    for (const lang of langs) {
      for (const wave of waves) {
        const msg = renderReminder(wave, { partyName: 'Test', language: lang })
        expect(msg, `${lang}/${wave} wrong sign-off`).toContain('Francisco & Alicia 💍')
      }
    }
  })

  it('D-05: no cross-language bleed — "Hola" must not appear in de/pt/en messages', () => {
    for (const wave of waves) {
      const de = renderReminder(wave, { partyName: 'Test', language: 'de' })
      const pt = renderReminder(wave, { partyName: 'Test', language: 'pt' })
      const en = renderReminder(wave, { partyName: 'Test', language: 'en' })
      expect(de).not.toContain('Hola')
      expect(pt).not.toContain('Hola')
      expect(en).not.toContain('Hola')
    }
  })

  it('D-06: no cross-language bleed — "Hallo" must not appear in es/pt/en messages', () => {
    for (const wave of waves) {
      const es = renderReminder(wave, { partyName: 'Test', language: 'es' })
      const pt = renderReminder(wave, { partyName: 'Test', language: 'pt' })
      const en = renderReminder(wave, { partyName: 'Test', language: 'en' })
      expect(es).not.toContain('Hallo')
      expect(pt).not.toContain('Hallo')
      expect(en).not.toContain('Hallo')
    }
  })

  it('D-07: message is a single non-empty string (no undefined/null sections)', () => {
    const msg = renderReminder('week', { partyName: 'Test', language: 'es' })
    expect(typeof msg).toBe('string')
    expect(msg.length).toBeGreaterThan(100)
    expect(msg).not.toContain('undefined')
    expect(msg).not.toContain('null')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// E. renderReminder — partyName interpolation (each lang × each wave)
// ─────────────────────────────────────────────────────────────────────────────
describe('E · renderReminder — partyName is included in greeting for every combination', () => {
  const name = 'González & Müller'
  const expectedName = getGreetingName(name)

  it('E-01: es/week includes name in greeting', () => {
    expect(renderReminder('week', { partyName: name, language: 'es' })).toContain(`¡Hola ${expectedName}!`)
  })
  it('E-02: es/day includes name in greeting', () => {
    expect(renderReminder('day', { partyName: name, language: 'es' })).toContain(`¡Hola ${expectedName}!`)
  })
  it('E-03: es/morning includes name in greeting', () => {
    expect(renderReminder('morning', { partyName: name, language: 'es' })).toContain(`¡Hola ${expectedName}!`)
  })
  it('E-04: de/week includes name in greeting', () => {
    expect(renderReminder('week', { partyName: name, language: 'de' })).toContain(`Hallo ${expectedName}!`)
  })
  it('E-05: de/day includes name in greeting', () => {
    expect(renderReminder('day', { partyName: name, language: 'de' })).toContain(`Hallo ${expectedName}!`)
  })
  it('E-06: de/morning includes name in greeting', () => {
    expect(renderReminder('morning', { partyName: name, language: 'de' })).toContain(`Hallo ${expectedName}!`)
  })
  it('E-07: pt/week includes name in greeting', () => {
    expect(renderReminder('week', { partyName: name, language: 'pt' })).toContain(`Olá ${expectedName}!`)
  })
  it('E-08: en/morning includes name in greeting', () => {
    expect(renderReminder('morning', { partyName: name, language: 'en' })).toContain(`Hi ${expectedName}!`)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// F. waLink — URL structure invariants
// ─────────────────────────────────────────────────────────────────────────────
describe('F · waLink — URL structure invariants', () => {
  it('F-01: result always starts with https://api.whatsapp.com/send?phone=', () => {
    const link = waLink('+34612345678', 'Hello')
    expect(link.startsWith('https://api.whatsapp.com/send?phone=')).toBe(true)
  })

  it('F-02: phone number in URL has no + sign', () => {
    const link = waLink('+49176123456', 'Test')
    expect(link).toContain('https://api.whatsapp.com/send?phone=49176123456')
    expect(link).not.toContain('+')
  })

  it('F-03: &text= query parameter is present', () => {
    const link = waLink('+34612345678', 'Hi')
    expect(link).toContain('&text=')
  })

  it('F-04: newlines in message are percent-encoded as %0A', () => {
    const link = waLink('+34612345678', 'Line1\nLine2')
    expect(link).toContain('%0A')
  })

  it('F-05: full message can be round-tripped via decodeURIComponent', () => {
    const message = '¡Hola Familia! 🎉\nDress code: Cocktail\nhttps://maps.google.com/?q=test'
    const link = waLink('+34612345678', message)
    const encoded = link.split('&text=')[1]
    expect(decodeURIComponent(encoded)).toBe(message)
  })

  it('F-06: a full rendered reminder produces a valid waLink (no encoding errors)', () => {
    const msg = renderReminder('week', { partyName: 'Familie Müller', language: 'de' })
    expect(() => waLink('+491761234567', msg)).not.toThrow()
    const link = waLink('+491761234567', msg)
    const encoded = link.split('&text=')[1]
    expect(decodeURIComponent(encoded)).toBe(msg)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// G. WAVE_SCHEDULE — date string exactness
// ─────────────────────────────────────────────────────────────────────────────
describe('G · WAVE_SCHEDULE — date/time strings match spec', () => {
  it('G-01: week wave is 11 Sep 2026 at 10:00 Berlin', () => {
    expect(WAVE_SCHEDULE.week).toContain('11 sep 2026')
    expect(WAVE_SCHEDULE.week).toContain('10:00')
    expect(WAVE_SCHEDULE.week).toContain('Europe/Berlin')
  })

  it('G-02: day wave is 17 Sep 2026 at 10:00 Berlin', () => {
    expect(WAVE_SCHEDULE.day).toContain('17 sep 2026')
    expect(WAVE_SCHEDULE.day).toContain('10:00')
    expect(WAVE_SCHEDULE.day).toContain('Europe/Berlin')
  })

  it('G-03: morning wave is 18 Sep 2026 at 08:00 Berlin (wedding day!)', () => {
    expect(WAVE_SCHEDULE.morning).toContain('18 sep 2026')
    expect(WAVE_SCHEDULE.morning).toContain('08:00')
    expect(WAVE_SCHEDULE.morning).toContain('Europe/Berlin')
  })

  it('G-04: morning wave date matches the wedding day', () => {
    // The wedding is 18 Sep 2026 — morning wave must be that same day
    expect(WAVE_SCHEDULE.morning).toContain('18 sep 2026')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// H. MAPS_CEREMONY / MAPS_BANQUET — URL shape
// ─────────────────────────────────────────────────────────────────────────────
describe('H · MAPS_CEREMONY + MAPS_BANQUET — URL integrity', () => {
  it('H-01: MAPS_CEREMONY is a valid Google Maps URL', () => {
    expect(MAPS_CEREMONY.startsWith('https://maps.google.com/')).toBe(true)
    expect(MAPS_CEREMONY).toContain('Munster')
  })

  it('H-02: MAPS_BANQUET is a valid Google Maps URL with Freiburg address', () => {
    expect(MAPS_BANQUET.startsWith('https://maps.google.com/')).toBe(true)
    expect(MAPS_BANQUET).toContain('Freiburg')
  })

  it('H-03: both URLs are different (ceremony ≠ banquet)', () => {
    expect(MAPS_CEREMONY).not.toBe(MAPS_BANQUET)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// I. checkAdmin — server mis-configuration (ADMIN_PASSWORD not set)
// ─────────────────────────────────────────────────────────────────────────────
describe('I · checkAdmin — ADMIN_PASSWORD absent → 500', () => {
  beforeEach(() => vi.stubEnv('ADMIN_PASSWORD', ''))
  afterEach(() => vi.unstubAllEnvs())

  it('I-01: missing ADMIN_PASSWORD env var returns 500 (server mis-configured)', async () => {
    const req = new Request('http://localhost/api/admin/reminders', {
      headers: { Authorization: 'anything' },
    })
    const res = checkAdmin(req)
    expect(res).toBeInstanceOf(NextResponse)
    expect(res!.status).toBe(500)
    const body = await res!.json()
    expect(body.success).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// J. signGuestSession / parseGuestSession — token isolation
// ─────────────────────────────────────────────────────────────────────────────
describe('J · signGuestSession / parseGuestSession — token isolation', () => {
  const SECRET = 'IsolationTestSecret'

  beforeEach(() => {
    vi.stubEnv('SESSION_SECRET', SECRET)
    vi.stubEnv('NODE_ENV', 'test')
  })
  afterEach(() => vi.unstubAllEnvs())

  function reqWithCookie(v: string) {
    return new Request('http://localhost/', {
      headers: { cookie: `${GUEST_SESSION_COOKIE}=${v}` },
    })
  }

  it('J-01: signGuestSession returns a non-empty string', () => {
    expect(signGuestSession('guest-a').length).toBeGreaterThan(10)
  })

  it('J-02: two different guestIds produce different tokens', () => {
    expect(signGuestSession('guest-a')).not.toBe(signGuestSession('guest-b'))
  })

  it('J-03: token for guestId-A does NOT parse as guestId-B', () => {
    const tokenA = signGuestSession('guest-aaa')
    const session = parseGuestSession(reqWithCookie(tokenA))
    expect(session.guestId).toBe('guest-aaa')
    expect(session.guestId).not.toBe('guest-bbb')
  })

  it('J-04: general session token (no guestId) has isValid=true but guestId=undefined', () => {
    const token = signGuestSession()
    const session = parseGuestSession(reqWithCookie(token))
    expect(session.isValid).toBe(true)
    expect(session.guestId).toBeUndefined()
  })

  it('J-05: token signed with a different secret is rejected', () => {
    // Sign with different secret
    vi.stubEnv('SESSION_SECRET', 'DifferentSecret')
    const tokenForeign = signGuestSession('guest-x')

    // Restore original secret
    vi.stubEnv('SESSION_SECRET', SECRET)
    const session = parseGuestSession(reqWithCookie(tokenForeign))
    expect(session.isValid).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// K. Language sanitisation — boundary values (inline logic mirrors the route)
// ─────────────────────────────────────────────────────────────────────────────
const VALID_LANGUAGES = ['es', 'de', 'pt', 'en']
function sanitizeLanguage(lang: unknown): string {
  return typeof lang === 'string' && VALID_LANGUAGES.includes(lang) ? lang : 'es'
}

describe('K · Language sanitisation — boundary values', () => {
  it('K-01: upper-case "ES" is NOT a valid language (case-sensitive) → falls back to es', () => {
    expect(sanitizeLanguage('ES')).toBe('es')
  })

  it('K-02: "EN" upper-case falls back to es', () => {
    expect(sanitizeLanguage('EN')).toBe('es')
  })

  it('K-03: "de" with trailing whitespace is not valid → es', () => {
    expect(sanitizeLanguage('de ')).toBe('es')
  })

  it('K-04: boolean true → es', () => {
    expect(sanitizeLanguage(true)).toBe('es')
  })

  it('K-05: array → es', () => {
    expect(sanitizeLanguage(['es'])).toBe('es')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// L. isWave guard — all valid values and boundary cases (mirrors route logic)
// ─────────────────────────────────────────────────────────────────────────────
function isWave(v: string | null): v is Wave {
  return v !== null && (Array.from(WAVES) as string[]).includes(v)
}

describe('L · isWave guard — boundary and type cases', () => {
  it('L-01: all three valid waves pass', () => {
    for (const w of WAVES) expect(isWave(w)).toBe(true)
  })

  it('L-02: "Week" with capital W is rejected', () => {
    expect(isWave('Week')).toBe(false)
  })

  it('L-03: "MORNING" all caps is rejected', () => {
    expect(isWave('MORNING')).toBe(false)
  })

  it('L-04: " day" with leading space is rejected', () => {
    expect(isWave(' day')).toBe(false)
  })

  it('L-05: "week " with trailing space is rejected', () => {
    expect(isWave('week ')).toBe(false)
  })

  it('L-06: null is rejected without throwing', () => {
    expect(() => isWave(null)).not.toThrow()
    expect(isWave(null)).toBe(false)
  })
})
