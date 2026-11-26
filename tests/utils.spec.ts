import { describe, expect, it } from 'vitest'
import { scoreFields, tokenScore } from '~/utils/search'

describe('search scoring', () => {
  it('prefers substring over fuzzy matches', () => {
    expect(tokenScore('pair', 'Pairformer')).toBeGreaterThan(tokenScore('pfr', 'Pairformer'))
    expect(tokenScore('pfr', 'Pairformer')).toBeGreaterThan(0)
    expect(tokenScore('xyz', 'Pairformer')).toBe(0)
  })

  it('requires all tokens to match some field', () => {
    const fields = [{ text: 'Pair representation' }, { text: '[N_token, N_token, 128]' }]
    expect(scoreFields('pair 128', fields)).toBeGreaterThan(0)
    expect(scoreFields('pair diffusion', fields)).toBe(0)
    expect(scoreFields('', fields)).toBe(1)
  })
})
