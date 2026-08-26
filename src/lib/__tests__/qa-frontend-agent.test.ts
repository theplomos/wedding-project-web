import { describe, it, expect } from 'vitest'
import { normalizeName } from '../normalize-name'
import { translations, Language } from '../translations'

/**
 * Helper replicating the frontend search validation logic in page.tsx:
 * - Trims input string
 * - Splits by whitespace runs (\s+)
 * - Rejects inputs with fewer than 2 words
 */
export function validateSearchNameInput(guestName: string): { isValid: boolean; words: string[]; trimmed: string } {
  const trimmed = guestName.trim()
  const words = trimmed.split(/\s+/).filter(w => w.length > 0)
  return {
    isValid: words.length >= 2,
    words,
    trimmed,
  }
}

describe('QA Frontend Agent: Search Validation, Name Parsing & Translation Dictionaries', () => {
  // 1. Single word input rejection ('Francisco')
  it('1. Rejects single-word input ("Francisco")', () => {
    const input = 'Francisco'
    const validation = validateSearchNameInput(input)
    expect(validation.isValid).toBe(false)
    expect(validation.words).toEqual(['Francisco'])
    expect(validation.words.length).toBe(1)

    const normalized = normalizeName(input)
    const normalizedWords = normalized.split(' ').filter(w => w.length > 0)
    expect(normalizedWords.length).toBe(1)
  })

  // 2. Two-word input acceptance ('Francisco Gomez')
  it('2. Accepts two-word input ("Francisco Gomez")', () => {
    const input = 'Francisco Gomez'
    const validation = validateSearchNameInput(input)
    expect(validation.isValid).toBe(true)
    expect(validation.words).toEqual(['Francisco', 'Gomez'])
    expect(validation.words.length).toBe(2)

    const normalized = normalizeName(input)
    expect(normalized).toBe('francisco gomez')
  })

  // 3. Inputs with extra spaces ('  Francisco    Barrientos  ')
  it('3. Handles inputs with leading, trailing, and internal extra spaces ("  Francisco    Barrientos  ")', () => {
    const input = '  Francisco    Barrientos  '
    const validation = validateSearchNameInput(input)
    expect(validation.isValid).toBe(true)
    expect(validation.words).toEqual(['Francisco', 'Barrientos'])
    expect(validation.trimmed).toBe('Francisco    Barrientos')

    const normalized = normalizeName(input)
    expect(normalized).toBe('francisco barrientos')
  })

  // 4. Accented character inputs ('José María Olazábal')
  it('4. Handles accented character inputs ("José María Olazábal")', () => {
    const input = 'José María Olazábal'
    const validation = validateSearchNameInput(input)
    expect(validation.isValid).toBe(true)
    expect(validation.words).toEqual(['José', 'María', 'Olazábal'])

    const normalized = normalizeName(input)
    expect(normalized).toBe('jose maria olazabal')
  })

  // 5. Special character inputs ('Denise+Yannic')
  it('5. Handles special character inputs ("Denise+Yannic")', () => {
    const inputNoSpace = 'Denise+Yannic'
    const validationNoSpace = validateSearchNameInput(inputNoSpace)
    // Without spaces, raw split treats it as 1 word token
    expect(validationNoSpace.isValid).toBe(false)
    expect(validationNoSpace.words).toEqual(['Denise+Yannic'])

    // normalizeName strips special characters such as '+'
    const normalizedNoSpace = normalizeName(inputNoSpace)
    expect(normalizedNoSpace).toBe('deniseyannic')

    // If spaces surround special character: 'Denise + Yannic'
    const inputWithSpace = 'Denise + Yannic'
    const validationWithSpace = validateSearchNameInput(inputWithSpace)
    expect(validationWithSpace.isValid).toBe(true)
    const normalizedWithSpace = normalizeName(inputWithSpace)
    expect(normalizedWithSpace).toBe('denise yannic')
  })

  // 6. Empty string / whitespace only inputs ('   ')
  it('6. Rejects empty string or whitespace-only inputs ("   ")', () => {
    const inputs = ['', '   ', '\t\n ']
    inputs.forEach(input => {
      const validation = validateSearchNameInput(input)
      expect(validation.isValid).toBe(false)
      expect(validation.words.length).toBe(0)
      expect(validation.trimmed).toBe('')

      const normalized = normalizeName(input)
      expect(normalized).toBe('')
    })
  })

  // 7. Multi-word compound surnames ('Juan de la Cruz')
  it('7. Accepts multi-word compound surnames ("Juan de la Cruz")', () => {
    const input = 'Juan de la Cruz'
    const validation = validateSearchNameInput(input)
    expect(validation.isValid).toBe(true)
    expect(validation.words).toEqual(['Juan', 'de', 'la', 'Cruz'])
    expect(validation.words.length).toBe(4)

    const normalized = normalizeName(input)
    expect(normalized).toBe('juan de la cruz')
  })

  // 8. Hyphenated surnames ('Anna-Lena Müller')
  it('8. Accepts hyphenated surnames ("Anna-Lena Müller")', () => {
    const input = 'Anna-Lena Müller'
    const validation = validateSearchNameInput(input)
    expect(validation.isValid).toBe(true)
    expect(validation.words).toEqual(['Anna-Lena', 'Müller'])

    const normalized = normalizeName(input)
    expect(normalized).toBe('annalena muller')
  })

  // 9. Translation dictionary lookup for all 4 languages (es, de, pt, en) for searchNeedFullName
  it('9. Verifies translation dictionary lookup for all 4 languages for searchNeedFullName', () => {
    const langCodes: Language[] = ['es', 'de', 'pt', 'en']

    langCodes.forEach(lang => {
      const translation = translations[lang].searchNeedFullName
      expect(translation).toBeDefined()
      expect(typeof translation).toBe('string')
      expect(translation.trim().length).toBeGreaterThan(0)
    })

    expect(translations.es.searchNeedFullName).toBe('Por favor, escribe tu nombre y apellido para que podamos encontrarte.')
    expect(translations.de.searchNeedFullName).toBe('Bitte geben Sie Ihren Vor- und Nachnamen ein, damit wir Sie finden können.')
    expect(translations.pt.searchNeedFullName).toBe('Por favor, escreva seu nome e sobrenome para que possamos encontrá-lo.')
    expect(translations.en.searchNeedFullName).toBe('Please enter your first and last name so we can find you.')
  })

  // 10. Translation dictionary lookup for all 4 languages for fuzzyMatchTitle and fuzzyMatchDesc
  it('10. Verifies translation dictionary lookup for all 4 languages for fuzzyMatchTitle and fuzzyMatchDesc', () => {
    const langCodes: Language[] = ['es', 'de', 'pt', 'en']

    langCodes.forEach(lang => {
      const title = translations[lang].fuzzyMatchTitle
      const desc = translations[lang].fuzzyMatchDesc

      expect(title).toBeDefined()
      expect(typeof title).toBe('string')
      expect(title.trim().length).toBeGreaterThan(0)

      expect(desc).toBeDefined()
      expect(typeof desc).toBe('string')
      expect(desc.trim().length).toBeGreaterThan(0)
    })

    // Spanish
    expect(translations.es.fuzzyMatchTitle).toBe('Casi te encontramos')
    expect(translations.es.fuzzyMatchDesc).toContain('Encontramos un nombre similar')

    // German
    expect(translations.de.fuzzyMatchTitle).toBe('Fast gefunden')
    expect(translations.de.fuzzyMatchDesc).toContain('Wir haben einen ähnlichen Namen gefunden')

    // Portuguese
    expect(translations.pt.fuzzyMatchTitle).toBe('Quase te encontramos')
    expect(translations.pt.fuzzyMatchDesc).toContain('Encontramos um nome similar')

    // English
    expect(translations.en.fuzzyMatchTitle).toBe('We almost found you')
    expect(translations.en.fuzzyMatchDesc).toContain('We found a similar name')
  })
})
