import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js'
import type { ReminderLang } from './reminder-content'

export function normalizePhone(
  input: string,
  defaultCountry: CountryCode
): { valid: boolean; e164?: string } {
  const trimmed = (input || '').trim()
  if (!trimmed) return { valid: false }
  const parsed = parsePhoneNumberFromString(trimmed, defaultCountry)
  if (parsed && parsed.isValid()) return { valid: true, e164: parsed.number }
  return { valid: false }
}

export function waNumber(e164: string): string {
  return e164.replace(/\D/g, '')
}

export const LANG_DEFAULT_COUNTRY: Record<ReminderLang, CountryCode> = {
  es: 'ES',
  de: 'DE',
  pt: 'PT',
  en: 'GB',
}
