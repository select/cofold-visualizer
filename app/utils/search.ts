export interface SearchField {
  text: string
  weight?: number
}

/**
 * Score how well a single query token matches a piece of text.
 * Returns 0 when there is no match. Contiguous substring matches beat
 * fuzzy subsequence matches; matches at word starts score higher.
 */
export function tokenScore(token: string, text: string): number {
  const q = token.toLowerCase()
  const t = text.toLowerCase()
  if (!q) return 1
  if (!t) return 0

  const idx = t.indexOf(q)
  if (idx >= 0) {
    const atWordStart = idx === 0 || /[\s\-_/·([,]/.test(t.charAt(idx - 1))
    let score = 100 - Math.min(idx, 40)
    if (atWordStart) score += 25
    if (idx === 0) score += 15
    return score
  }

  // Fuzzy subsequence match
  let ti = 0
  let score = 0
  let streak = 0
  for (const ch of q) {
    const found = t.indexOf(ch, ti)
    if (found < 0) return 0
    if (found === ti) {
      streak += 1
      score += 2 + streak
    } else {
      streak = 0
      score += 1
    }
    ti = found + 1
  }
  // Penalise very spread-out matches
  const spread = ti - q.length
  return Math.max(1, Math.min(45, score - spread * 0.15))
}

/** Every whitespace-separated token must match at least one field. */
export function scoreFields(query: string, fields: SearchField[]): number {
  const tokens = query.trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return 1
  let total = 0
  for (const token of tokens) {
    let best = 0
    for (const field of fields) {
      const s = tokenScore(token, field.text) * (field.weight ?? 1)
      if (s > best) best = s
    }
    if (best <= 0) return 0
    total += best
  }
  return total
}
