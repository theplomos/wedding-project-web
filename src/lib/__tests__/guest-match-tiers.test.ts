import { describe, it, expect } from 'vitest'
import { classifyMatch } from '../guest-match-classify'

describe('classifyMatch', () => {
  it('returns "exact" when similarity >= 0.80', () => {
    expect(classifyMatch(0.80)).toBe('exact')
    expect(classifyMatch(0.95)).toBe('exact')
    expect(classifyMatch(1.0)).toBe('exact')
  })

  it('returns "fuzzy" when similarity is between 0.50 and 0.79', () => {
    expect(classifyMatch(0.50)).toBe('fuzzy')
    expect(classifyMatch(0.65)).toBe('fuzzy')
    expect(classifyMatch(0.79)).toBe('fuzzy')
  })

  it('returns "none" when similarity < 0.50', () => {
    expect(classifyMatch(0.49)).toBe('none')
    expect(classifyMatch(0.25)).toBe('none')
    expect(classifyMatch(0.0)).toBe('none')
  })

  it('returns "none" when similarity is null (no candidates)', () => {
    expect(classifyMatch(null)).toBe('none')
  })
})
