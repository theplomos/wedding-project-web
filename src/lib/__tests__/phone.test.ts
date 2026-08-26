import { describe, it, expect } from 'vitest'
import { normalizePhone, waNumber } from '../phone'

describe('normalizePhone', () => {
  // 1. Valid German numbers
  it('normaliza números alemanes válidos en formato local e internacional', () => {
    const local = normalizePhone('0176 1234567', 'DE')
    expect(local.valid).toBe(true)
    expect(local.e164).toBe('+491761234567')

    const intl = normalizePhone('+49 176 1234567', 'ES')
    expect(intl.valid).toBe(true)
    expect(intl.e164).toBe('+491761234567')
  })

  // 2. Valid Spanish numbers
  it('normaliza números españoles válidos en formato local e internacional', () => {
    const local = normalizePhone('612345678', 'ES')
    expect(local.valid).toBe(true)
    expect(local.e164).toBe('+34612345678')

    const intl = normalizePhone('+34 612 34 56 78', 'DE')
    expect(intl.valid).toBe(true)
    expect(intl.e164).toBe('+34612345678')
  })

  // 3. Valid Portuguese numbers
  it('normaliza números portugueses válidos en formato local e internacional', () => {
    const local = normalizePhone('912345678', 'PT')
    expect(local.valid).toBe(true)
    expect(local.e164).toBe('+351912345678')

    const intl = normalizePhone('+351 912 345 678', 'GB')
    expect(intl.valid).toBe(true)
    expect(intl.e164).toBe('+351912345678')
  })

  // 4. Valid UK numbers
  it('normaliza números del Reino Unido válidos en formato local e internacional', () => {
    const local = normalizePhone('07123 456789', 'GB')
    expect(local.valid).toBe(true)
    expect(local.e164).toBe('+447123456789')

    const intl = normalizePhone('+44 7123 456789', 'ES')
    expect(intl.valid).toBe(true)
    expect(intl.e164).toBe('+447123456789')
  })

  // 5. Invalid numbers: too short
  it('rechaza números que son demasiado cortos', () => {
    const r1 = normalizePhone('12', 'ES')
    expect(r1.valid).toBe(false)
    expect(r1.e164).toBeUndefined()

    const r2 = normalizePhone('0712', 'GB')
    expect(r2.valid).toBe(false)
  })

  // 6. Invalid numbers: invalid alphabetical characters
  it('rechaza números que contienen caracteres alfabéticos no válidos', () => {
    const r1 = normalizePhone('6123abc678', 'ES')
    expect(r1.valid).toBe(false)

    const r2 = normalizePhone('+34 612 345 67A', 'ES')
    expect(r2.valid).toBe(false)
  })

  // 7. Invalid numbers: unsupported or invalid country codes
  it('rechaza números con códigos de país inválidos o inexistentes', () => {
    const r1 = normalizePhone('+999999999999', 'ES')
    expect(r1.valid).toBe(false)
  })

  // 8. Numbers with leading zeros, spaces, parentheses, hyphens, and other formats
  it('normaliza números con formatos complejos (espacios, paréntesis, guiones, ceros a la izquierda)', () => {
    // UK local number with leading zero and hyphens
    const r1 = normalizePhone('07123-456-789', 'GB')
    expect(r1.valid).toBe(true)
    expect(r1.e164).toBe('+447123456789')

    // Spanish number with parentheses and spaces
    const r2 = normalizePhone('+34 (612) 34 56 78', 'DE')
    expect(r2.valid).toBe(true)
    expect(r2.e164).toBe('+34612345678')

    // Portuguese number with hyphens and spaces
    const r3 = normalizePhone('912-345-678', 'PT')
    expect(r3.valid).toBe(true)
    expect(r3.e164).toBe('+351912345678')
  })

  // 9. Numbers already in E.164 format
  it('acepta números que ya están en formato E.164 e ignora el país por defecto', () => {
    const r1 = normalizePhone('+34612345678', 'DE')
    expect(r1.valid).toBe(true)
    expect(r1.e164).toBe('+34612345678')

    const r2 = normalizePhone('+491761234567', 'ES')
    expect(r2.valid).toBe(true)
    expect(r2.e164).toBe('+491761234567')
  })

  // 10. edge cases: empty strings, null, undefined
  it('maneja de forma segura casos límite (cadenas vacías, espacios en blanco, null y undefined)', () => {
    expect(normalizePhone('', 'ES').valid).toBe(false)
    expect(normalizePhone('   ', 'ES').valid).toBe(false)
    expect(normalizePhone(null as any, 'ES').valid).toBe(false)
    expect(normalizePhone(undefined as any, 'ES').valid).toBe(false)
  })
})

describe('waNumber', () => {
  // 11. waNumber with clean E.164 strings
  it('genera el formato de número correcto para WhatsApp (waNumber) eliminando el signo más', () => {
    expect(waNumber('+34612345678')).toBe('34612345678')
    expect(waNumber('+491761234567')).toBe('491761234567')
    expect(waNumber('491761234567')).toBe('491761234567')
  })
})

