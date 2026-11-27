import { describe, expect, it } from 'vitest'
import { computeExpandedLayout, type LayoutBlockInput } from '~/engine/expandedLayout'

describe('computeExpandedLayout', () => {
  const sampleBlocks: LayoutBlockInput[] = [
    {
      id: 'left-outer',
      basePosition: [-10, 0, 0],
      baseSize: [2, 2, 2],
      activeSize: [2, 2, 2],
      isExpanded: false,
    },
    {
      id: 'left-inner',
      basePosition: [-6, 0, 0],
      baseSize: [2, 2, 2],
      activeSize: [2, 2, 2],
      isExpanded: false,
    },
    {
      id: 'center',
      basePosition: [0, 0, 0],
      baseSize: [2.6, 2.6, 2],
      activeSize: [8, 2.6, 2],
      isExpanded: true,
    },
    {
      id: 'right-inner',
      basePosition: [5, 0, 0],
      baseSize: [2, 2, 2],
      activeSize: [2, 2, 2],
      isExpanded: false,
    },
  ]

  it('keeps base positions when no blocks are expanded', () => {
    const unexpanded = sampleBlocks.map(b => ({
      ...b,
      activeSize: b.baseSize,
      isExpanded: false,
    }))
    const result = computeExpandedLayout(unexpanded, 1.4)
    for (const b of unexpanded) {
      expect(result.get(b.id)).toEqual(b.basePosition)
    }
  })

  it('pushes left and right neighbors outward with at least minGap and cascades without overlap', () => {
    const minGap = 1.4
    const result = computeExpandedLayout(sampleBlocks, minGap)

    const leftOuter = result.get('left-outer')!
    const leftInner = result.get('left-inner')!
    const center = result.get('center')!
    const rightInner = result.get('right-inner')!

    // Center expanded from width 2.6 to 8 -> half-width 4 -> [-4, 4]
    expect(center[0]).toBe(0)
    // leftInner right edge <= -4 - 1.4 = -5.4 -> center <= -6.4
    expect(leftInner[0] + 1).toBeLessThanOrEqual(center[0] - 4 - minGap + 1e-6)
    // leftOuter right edge <= leftInner left edge - 1.4
    expect(leftOuter[0] + 1).toBeLessThanOrEqual(leftInner[0] - 1 - minGap + 1e-6)
    // rightInner left edge >= 4 + 1.4 = 5.4 -> center >= 6.4
    expect(rightInner[0] - 1).toBeGreaterThanOrEqual(center[0] + 4 + minGap - 1e-6)
  })

  it('preserves space for intermediate external output obstacles and shifts downstream blocks right', () => {
    const minGap = 1.4
    const blocks: LayoutBlockInput[] = [
      {
        id: 'denoised-coords',
        basePosition: [35.0, 0.0, 1.8],
        baseSize: [3.8, 3.8, 3.8],
        activeSize: [12.0, 4.0, 4.0],
        isExpanded: true,
      },
      {
        id: '__external-cif-structure__',
        basePosition: [43.7, 0.0, 1.6],
        baseSize: [10.8, 5.8, 5.4],
        activeSize: [10.8, 5.8, 5.4],
        isExpanded: false,
      },
      {
        id: 'aux-pairformer',
        basePosition: [52.0, 0.0, 0.0],
        baseSize: [3.0, 2.4, 1.8],
        activeSize: [12.0, 4.0, 4.0],
        isExpanded: true,
      },
      {
        id: 'confidence-outputs',
        basePosition: [58.5, 0.0, 0.0],
        baseSize: [3.4, 2.6, 1.4],
        activeSize: [3.4, 2.6, 1.4],
        isExpanded: false,
      },
    ]

    const result = computeExpandedLayout(blocks, minGap)
    const denoised = result.get('denoised-coords')!
    const aux = result.get('aux-pairformer')!
    const conf = result.get('confidence-outputs')!

    const denoisedRight = denoised[0] + 12.0 / 2
    const auxLeft = aux[0] - 12.0 / 2
    const auxRight = aux[0] + 12.0 / 2
    const confLeft = conf[0] - 3.4 / 2

    expect(auxLeft - denoisedRight).toBeGreaterThanOrEqual(10.8 + 2 * minGap - 1e-6)
    expect(confLeft - auxRight).toBeGreaterThanOrEqual(minGap - 1e-6)
  })
})
