import { describe, expect, it } from 'vitest'
import { openfold3Model } from '~/models/openfold3'
import { MODELS, getModelById } from '~/models/registry'

describe('OpenFold3 architecture specification', () => {
  it('defines all 10 walkthrough steps in sequential order', () => {
    expect(openfold3Model.steps).toHaveLength(10)
    openfold3Model.steps.forEach((step, idx) => {
      expect(step.index).toBe(idx)
      expect(step.codeRef?.url).toContain('https://github.com/aqlaboratory/openfold-3/blob/main/')
    })
  })

  it('has valid focusBlockIds and highlightEdgeIds on every walkthrough step', () => {
    const blockIds = new Set(openfold3Model.blocks.map(b => b.id))
    const edgeIds = new Set(openfold3Model.edges.map(e => e.id))

    for (const step of openfold3Model.steps) {
      if (step.id !== 'overview') {
        expect(step.focusBlockIds.length).toBeGreaterThan(0)
      }
      for (const id of step.focusBlockIds) {
        expect(blockIds.has(id)).toBe(true)
      }
      for (const eid of step.highlightEdgeIds) {
        expect(edgeIds.has(eid)).toBe(true)
      }
    }
  })

  it('has valid from/to block references on every edge', () => {
    const blockIds = new Set(openfold3Model.blocks.map(b => b.id))

    for (const edge of openfold3Model.edges) {
      expect(blockIds.has(edge.from)).toBe(true)
      expect(blockIds.has(edge.to)).toBe(true)
    }
  })

  it('encodes faithful OpenFold3 dimensions and block counts', () => {
    const byId = new Map(openfold3Model.blocks.map(b => [b.id, b]))

    expect(byId.get('s-input')?.params?.c_s_input).toBe(449)
    expect(byId.get('s-init')?.params?.c_s).toBe(384)
    expect(byId.get('z-init')?.params?.c_z).toBe(128)
    expect(byId.get('trunk-recycle-gate')?.params?.num_cycles).toBe(10)
    expect(byId.get('template-embedder')?.stackCount).toBe(2)
    expect(byId.get('template-embedder')?.params?.c_t).toBe(64)
    expect(byId.get('msa-embedder')?.params?.c_m).toBe(64)
    expect(byId.get('msa-stack')?.stackCount).toBe(4)
    expect(byId.get('pairformer-pair')?.stackCount).toBe(48)
    expect(byId.get('pairformer-single')?.stackCount).toBe(48)
    expect(byId.get('diffusion-conditioning')?.params?.c_fourier).toBe(256)
    expect(byId.get('diffusion-transformer')?.stackCount).toBe(24)
    expect(byId.get('diffusion-transformer')?.params?.c_token_diffusion).toBe(768)
    expect(byId.get('denoised-coords')?.params?.steps).toBe(200)
    expect(byId.get('aux-pairformer')?.stackCount).toBe(4)
  })

  it('defines detailedSpec on all 11 expandable OpenFold3 blocks', () => {
    const expectedIds = [
      'atom-attn-encoder-init',
      'template-embedder',
      'msa-stack',
      'pairformer-pair',
      'pairformer-single',
      'diffusion-conditioning',
      'atom-attn-encoder-diff',
      'diffusion-transformer',
      'atom-attn-decoder',
      'aux-pairformer',
      'confidence-outputs',
    ]
    const detailedBlocks = openfold3Model.blocks.filter(b => Boolean(b.detailedSpec))
    expect(detailedBlocks).toHaveLength(11)
    expect(detailedBlocks.map(b => b.id)).toEqual(expectedIds)

    for (const block of detailedBlocks) {
      expect(block.detailedSpec?.subStages.length).toBeGreaterThanOrEqual(3)
    }
  })
})

describe('Model registry', () => {
  it('contains OpenFold3 as available and coming-soon placeholders', () => {
    expect(MODELS.length).toBeGreaterThanOrEqual(3)
    expect(getModelById('openfold3')?.status).toBe('available')
    expect(getModelById('boltz2')?.status).toBe('coming-soon')
    expect(getModelById('chai1')?.status).toBe('coming-soon')
    expect(getModelById('nonexistent')).toBeUndefined()
  })
})
