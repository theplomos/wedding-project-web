export type MatchTier = 'exact' | 'fuzzy' | 'none'

// Thresholds — tune these when the final guest list arrives
export const EXACT_THRESHOLD = 0.80
export const FUZZY_THRESHOLD = 0.50

/**
 * Classify a similarity score into a match tier.
 * @param similarity - The similarity score (0.0–1.0), or null if no candidates found.
 */
export function classifyMatch(similarity: number | null): MatchTier {
  if (similarity === null) return 'none'
  if (similarity >= EXACT_THRESHOLD) return 'exact'
  if (similarity >= FUZZY_THRESHOLD) return 'fuzzy'
  return 'none'
}
