export interface LayoutBlockInput {
  id: string
  basePosition: [number, number, number]
  baseSize: [number, number, number]
  activeSize: [number, number, number]
  isExpanded: boolean
}

function rangesOverlap(aMin: number, aMax: number, bMin: number, bMax: number, pad = 0): boolean {
  return aMin - pad < bMax && aMax + pad > bMin
}

/**
 * Computes adjusted block positions when one or more blocks are expanded in-place
 * so that expanded blocks never overlap neighboring blocks, inserting space along X
 * (or Y for vertically stacked blocks) while preserving relative ordering.
 */
export function computeExpandedLayout(
  blocks: LayoutBlockInput[],
  minGap = 1.4
): Map<string, [number, number, number]> {
  const positions = new Map<string, [number, number, number]>()
  const byId = new Map<string, LayoutBlockInput>()

  for (const b of blocks) {
    positions.set(b.id, [...b.basePosition])
    byId.set(b.id, b)
  }

  const expanded = blocks.filter(
    b =>
      b.isExpanded &&
      (b.activeSize[0] > b.baseSize[0] + 0.01 ||
        b.activeSize[1] > b.baseSize[1] + 0.01 ||
        b.activeSize[2] > b.baseSize[2] + 0.01)
  )
  if (expanded.length === 0) return positions

  const yzOverlap = (a: LayoutBlockInput, b: LayoutBlockInput, pad = 0.5) => {
    const pa = positions.get(a.id)!
    const pb = positions.get(b.id)!
    return (
      rangesOverlap(
        pa[1] - a.activeSize[1] / 2,
        pa[1] + a.activeSize[1] / 2,
        pb[1] - b.activeSize[1] / 2,
        pb[1] + b.activeSize[1] / 2,
        pad
      ) &&
      rangesOverlap(
        pa[2] - a.activeSize[2] / 2,
        pa[2] + a.activeSize[2] / 2,
        pb[2] - b.activeSize[2] / 2,
        pb[2] + b.activeSize[2] / 2,
        pad
      )
    )
  }

  const xzOverlap = (a: LayoutBlockInput, b: LayoutBlockInput, pad = 0.5) => {
    const pa = positions.get(a.id)!
    const pb = positions.get(b.id)!
    return (
      rangesOverlap(
        pa[0] - a.activeSize[0] / 2,
        pa[0] + a.activeSize[0] / 2,
        pb[0] - b.activeSize[0] / 2,
        pb[0] + b.activeSize[0] / 2,
        pad
      ) &&
      rangesOverlap(
        pa[2] - a.activeSize[2] / 2,
        pa[2] + a.activeSize[2] / 2,
        pb[2] - b.activeSize[2] / 2,
        pb[2] + b.activeSize[2] / 2,
        pad
      )
    )
  }

  for (const exp of expanded) {
    const expPos = positions.get(exp.id)!

    // Vertically stacked blocks aligned in X (e.g. Pairformer Single/Pair): separate along Y if needed
    for (const b of blocks) {
      if (b.id === exp.id) continue
      const dxBase = Math.abs(b.basePosition[0] - exp.basePosition[0])
      if (dxBase < 0.6 && xzOverlap(exp, b, 0.4)) {
        const bPos = positions.get(b.id)!
        const dyBase = b.basePosition[1] - exp.basePosition[1]
        if (dyBase >= 0) {
          const minY = expPos[1] + exp.activeSize[1] / 2 + minGap + b.activeSize[1] / 2
          if (bPos[1] < minY) bPos[1] = minY
        } else {
          const maxY = expPos[1] - exp.activeSize[1] / 2 - minGap - b.activeSize[1] / 2
          if (bPos[1] > maxY) bPos[1] = maxY
        }
      }
    }

    // Leftward sweep: blocks strictly to the left of exp in base X
    const leftBlocks = blocks
      .filter(b => b.id !== exp.id && b.basePosition[0] < exp.basePosition[0] - 0.5)
      .sort((a, b) => b.basePosition[0] - a.basePosition[0])

    const rightObstaclesForLeft: LayoutBlockInput[] = [exp]
    for (const b of leftBlocks) {
      const bPos = positions.get(b.id)!
      let maxAllowedX = bPos[0]
      for (const obs of rightObstaclesForLeft) {
        if (!yzOverlap(b, obs, 0.4)) continue
        const obsPos = positions.get(obs.id)!
        const candidate = obsPos[0] - obs.activeSize[0] / 2 - minGap - b.activeSize[0] / 2
        if (candidate < maxAllowedX) {
          maxAllowedX = candidate
        }
      }
      bPos[0] = maxAllowedX
      rightObstaclesForLeft.push(b)
    }

    // Rightward sweep: blocks strictly to the right of exp in base X
    const rightBlocks = blocks
      .filter(b => b.id !== exp.id && b.basePosition[0] > exp.basePosition[0] + 0.5)
      .sort((a, b) => a.basePosition[0] - b.basePosition[0])

    const leftObstaclesForRight: LayoutBlockInput[] = [exp]
    for (const b of rightBlocks) {
      const bPos = positions.get(b.id)!
      let minAllowedX = bPos[0]
      for (const obs of leftObstaclesForRight) {
        if (!yzOverlap(b, obs, 0.4)) continue
        const obsPos = positions.get(obs.id)!
        const candidate = obsPos[0] + obs.activeSize[0] / 2 + minGap + b.activeSize[0] / 2
        if (candidate > minAllowedX) {
          minAllowedX = candidate
        }
      }
      bPos[0] = minAllowedX
      leftObstaclesForRight.push(b)
    }
  }

  return positions
}
