import { describe, it, expect } from 'vitest'
import { classifyMatch, EXACT_THRESHOLD, FUZZY_THRESHOLD } from '../guest-match-classify'

describe('QA Threshold Classification Tests', () => {
  it('1. Similarity score 0.8000 -> exact', () => {
    expect(classifyMatch(0.8000)).toBe('exact')
  })

  it('2. Similarity score 0.8001 -> exact', () => {
    expect(classifyMatch(0.8001)).toBe('exact')
  })

  it('3. Similarity score 0.7999 -> fuzzy', () => {
    expect(classifyMatch(0.7999)).toBe('fuzzy')
  })

  it('4. Similarity score 0.5000 -> fuzzy', () => {
    expect(classifyMatch(0.5000)).toBe('fuzzy')
  })

  it('5. Similarity score 0.5001 -> fuzzy', () => {
    expect(classifyMatch(0.5001)).toBe('fuzzy')
  })

  it('6. Similarity score 0.4999 -> none', () => {
    expect(classifyMatch(0.4999)).toBe('none')
  })

  it('7. Similarity score 0.0000 -> none', () => {
    expect(classifyMatch(0.0000)).toBe('none')
  })

  it('8. Similarity score 1.0000 -> exact', () => {
    expect(classifyMatch(1.0000)).toBe('exact')
  })

  it('9. Similarity score null -> none', () => {
    expect(classifyMatch(null)).toBe('none')
  })

  it('10. Threshold sanity check: EXACT_THRESHOLD (0.80) > FUZZY_THRESHOLD (0.50)', () => {
    expect(EXACT_THRESHOLD).toBe(0.80)
    expect(FUZZY_THRESHOLD).toBe(0.50)
    expect(EXACT_THRESHOLD).toBeGreaterThan(FUZZY_THRESHOLD)
  })
})
