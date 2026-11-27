export const OVERVIEW_CAMERA_FOLLOW_MAX_DIST = 28
export const DEFAULT_SCENE_WIDTH = 104

export function computeSceneFitDistance(
  sceneWidth: number,
  fovDeg: number,
  aspect: number
): number {
  if (sceneWidth <= 0 || fovDeg <= 0 || aspect <= 0) return OVERVIEW_CAMERA_FOLLOW_MAX_DIST
  const halfFovRad = (fovDeg * Math.PI) / 360
  const denom = 2 * Math.tan(halfFovRad) * Math.max(0.2, aspect)
  return sceneWidth / denom
}

export interface StagePlateWaveInput {
  index: number
  phase: number
  width: number
  x: number
  y: number
  z: number
}

export interface WeightedStagePlate {
  x: number
  y: number
  z: number
  glow: number
}

export interface FollowTargetPoint {
  x: number
  y: number
  z: number
  totalGlow: number
}

export function computeWaveGlow(activeWaveT: number, center: number, width = 0.085): number {
  if (activeWaveT < 0 || width <= 0) return 0
  const d = Math.abs(activeWaveT - center)
  return Math.exp(-Math.pow(d / width, 2))
}

export function computeCycleGlow(activeWaveT: number, center: number, width = 0.022): number {
  if (activeWaveT < 0) return 0
  let best = 0
  for (let k = 0; k < 3; k++) {
    const c = 0.26 + ((k + center) / 3) * 0.38
    const g = computeWaveGlow(activeWaveT, c, width)
    if (g > best) best = g
  }
  return best
}

export function computeStagePlateGlow(
  plateIndex: number,
  phase: number,
  width: number,
  activeWaveT: number
): number {
  let sGlow = computeWaveGlow(activeWaveT, phase, width)
  if (plateIndex === 2) {
    sGlow = Math.max(sGlow, computeCycleGlow(activeWaveT, 0.24, 0.032))
  } else if (plateIndex === 3) {
    sGlow = Math.max(sGlow, computeCycleGlow(activeWaveT, 0.52, 0.032))
  }
  return sGlow
}

export function computeActivePlateTarget(
  plates: readonly WeightedStagePlate[],
  minGlowThreshold = 0.02
): FollowTargetPoint | null {
  let weightSum = 0
  let wx = 0
  let wy = 0
  let wz = 0

  for (const plate of plates) {
    if (plate.glow < minGlowThreshold) continue
    // Square the glow so the primary active stage leads while adjacent stages blend smoothly.
    const w = plate.glow * plate.glow
    weightSum += w
    wx += plate.x * w
    wy += plate.y * w
    wz += plate.z * w
  }

  if (weightSum <= 0) return null

  return {
    x: wx / weightSum,
    y: wy / weightSum,
    z: wz / weightSum,
    totalGlow: weightSum,
  }
}

export function shouldFollowOverviewWave(params: {
  isOverviewWave: boolean
  targetDist: number
  cameraFlying: boolean
  isUserDraggingControls: boolean
  maxFollowDist?: number
}): boolean {
  const maxDist = params.maxFollowDist ?? OVERVIEW_CAMERA_FOLLOW_MAX_DIST
  return (
    params.isOverviewWave &&
    params.targetDist < maxDist &&
    !params.cameraFlying &&
    !params.isUserDraggingControls
  )
}

export function computeFollowAlpha(dt: number, speed = 3.0): number {
  if (dt <= 0 || speed <= 0) return 0
  return 1 - Math.exp(-speed * dt)
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

/**
 * Scales the overview wave speed down when zoomed in so close-up viewing
 * doesn't rush past individual stages. Returns 1.0 at or beyond maxFollowDist.
 */
export function computeZoomWaveTimeScale(
  targetDist: number,
  maxFollowDist = OVERVIEW_CAMERA_FOLLOW_MAX_DIST,
  minCloseDist = 8,
  minScale = 0.35
): number {
  if (targetDist >= maxFollowDist) return 1
  const t = clamp01((targetDist - minCloseDist) / (maxFollowDist - minCloseDist))
  const eased = t * t * (3 - 2 * t)
  return minScale + (1 - minScale) * eased
}

/**
 * Slows down wave progression in shorter-phase regions (inputs, diffusion,
 * and output/confidence heads) so every stage gets balanced screen time.
 */
export function computeAreaDwellScale(activeWaveT: number): number {
  if (activeWaveT < 0) return 1
  // Pre-trunk inputs & embedder (0..0.24) -> ~0.6x speed
  const enterTrunk = smoothstep(0.2, 0.28, activeWaveT)
  // Exit trunk into diffusion (0.62..0.69) -> ~0.75x speed
  const enterDiffusion = smoothstep(0.62, 0.69, activeWaveT)
  // Exit diffusion into CIF / Confidence / Outputs (0.81..0.87) -> ~0.48x speed
  const enterOutputs = smoothstep(0.81, 0.87, activeWaveT)

  const preToTrunk = 0.6 + (1.0 - 0.6) * enterTrunk
  const trunkToDiff = preToTrunk + (0.75 - preToTrunk) * enterDiffusion
  return trunkToDiff + (0.48 - trunkToDiff) * enterOutputs
}

export function computeEffectiveWaveSpeed(
  targetDist: number,
  activeWaveT: number,
  maxFollowDist = OVERVIEW_CAMERA_FOLLOW_MAX_DIST
): number {
  const zoomScale = computeZoomWaveTimeScale(targetDist, maxFollowDist)
  if (targetDist >= maxFollowDist) return zoomScale
  // Blend in area dwell scaling as the user zooms in
  const dwellBlend = 1 - clamp01((targetDist - 12) / (maxFollowDist - 12))
  const dwellScale = computeAreaDwellScale(activeWaveT)
  const effectiveDwell = 1 + (dwellScale - 1) * dwellBlend
  return zoomScale * effectiveDwell
}
