import { describe, expect, it } from 'vitest'
import { diffusionSigma, formatSigma } from '~/utils/diffusion'
import { scoreFields, tokenScore } from '~/utils/search'

describe('diffusionSigma', () => {
  it('spans σ_max → σ_min across 200 steps', () => {
    expect(diffusionSigma(0)).toBeCloseTo(160, 6)
    expect(diffusionSigma(200)).toBeCloseTo(0.0004, 8)
    expect(formatSigma(diffusionSigma(0))).toBe('160.0')
    expect(formatSigma(diffusionSigma(200))).toBe('0.0004')
  })

  it('is monotonically decreasing', () => {
    let prev = Infinity
    for (let i = 0; i <= 200; i += 10) {
      const s = diffusionSigma(i)
      expect(s).toBeLessThan(prev)
      prev = s
    }
  })
})

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
