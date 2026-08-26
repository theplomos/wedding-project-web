import { describe, it, expect } from 'vitest'
import { classifyMatch, EXACT_THRESHOLD, FUZZY_THRESHOLD } from '../guest-match-classify'
import { normalizeName } from '../normalize-name'

describe('Guest Match Integration', () => {
  describe('name normalization before matching', () => {
    it('normalizes accented characters', () => {
      expect(normalizeName('Francisco García')).toBe('francisco garcia')
    })

    it('collapses extra spaces', () => {
      expect(normalizeName('  Francisco   Barrientos  ')).toBe('francisco barrientos')
    })

    it('removes special characters', () => {
      expect(normalizeName('Denise+Yannic')).toBe('deniseyannic')
    })
  })

  describe('two-word validation', () => {
    it('single word fails the 2-word check', () => {
      const normalized = normalizeName('Francisco')
      const words = normalized.split(' ').filter(w => w.length > 0)
      expect(words.length).toBe(1)
      expect(words.length < 2).toBe(true)
    })

    it('two words passes the 2-word check', () => {
      const normalized = normalizeName('Francisco Gomez')
      const words = normalized.split(' ').filter(w => w.length > 0)
      expect(words.length).toBe(2)
    })

    it('"Max Mustermann" passes with exactly 2 words', () => {
      const normalized = normalizeName('Max Mustermann')
      const words = normalized.split(' ').filter(w => w.length > 0)
      expect(words.length).toBe(2)
    })

    it('"Erika Musterfrau" passes with exactly 2 words', () => {
      const normalized = normalizeName('Erika Musterfrau')
      const words = normalized.split(' ').filter(w => w.length > 0)
      expect(words.length).toBe(2)
    })
  })

  describe('threshold constants are sane', () => {
    it('EXACT_THRESHOLD is 0.80', () => {
      expect(EXACT_THRESHOLD).toBe(0.80)
    })

    it('FUZZY_THRESHOLD is 0.50', () => {
      expect(FUZZY_THRESHOLD).toBe(0.50)
    })

    it('EXACT > FUZZY', () => {
      expect(EXACT_THRESHOLD).toBeGreaterThan(FUZZY_THRESHOLD)
    })
  })

  describe('tier classification for edge cases', () => {
    it('exactly 0.80 is exact', () => {
      expect(classifyMatch(0.80)).toBe('exact')
    })

    it('exactly 0.50 is fuzzy', () => {
      expect(classifyMatch(0.50)).toBe('fuzzy')
    })

    it('0.4999 is none', () => {
      expect(classifyMatch(0.4999)).toBe('none')
    })

    it('0.7999 is fuzzy (just below exact)', () => {
      expect(classifyMatch(0.7999)).toBe('fuzzy')
    })

    it('1.0 (perfect match) is exact', () => {
      expect(classifyMatch(1.0)).toBe('exact')
    })

    it('0.0 is none', () => {
      expect(classifyMatch(0.0)).toBe('none')
    })

    it('null (no candidates) is none', () => {
      expect(classifyMatch(null)).toBe('none')
    })
  })

  describe('privacy: fuzzy tier must not leak data', () => {
    it('fuzzy classification returns only a tier string, no guest data', () => {
      const tier = classifyMatch(0.65)
      expect(tier).toBe('fuzzy')
      expect(typeof tier).toBe('string')
    })
  })
})
