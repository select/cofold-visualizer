import { describe, expect, it } from 'vitest'
import {
  OVERVIEW_CAMERA_FOLLOW_MAX_DIST,
  computeActivePlateTarget,
  computeAreaDwellScale,
  computeCycleGlow,
  computeEffectiveWaveSpeed,
  computeFollowAlpha,
  computeSceneFitDistance,
  computeStagePlateGlow,
  computeWaveGlow,
  computeZoomWaveTimeScale,
  shouldFollowOverviewWave,
} from '~/engine/overviewCameraFollow'

describe('overviewCameraFollow', () => {
  it('computes Gaussian wave glow and returns 0 when paused (activeWaveT < 0)', () => {
    expect(computeWaveGlow(-1, 0.5, 0.08)).toBe(0)
    expect(computeWaveGlow(0.5, 0.5, 0.08)).toBeCloseTo(1, 5)
    expect(computeWaveGlow(0.58, 0.5, 0.08)).toBeCloseTo(Math.exp(-1), 5)
  })

  it('computes 3x trunk cycle glow peaks across the recycling window', () => {
    expect(computeCycleGlow(-1, 0.24, 0.032)).toBe(0)
    // Cycle 0 peak: 0.26 + (0.24 / 3) * 0.38 = 0.2904
    const peak0 = 0.26 + (0.24 / 3) * 0.38
    const peak1 = 0.26 + (1.24 / 3) * 0.38
    expect(computeCycleGlow(peak0, 0.24, 0.032)).toBeCloseTo(1, 5)
    expect(computeCycleGlow(peak1, 0.24, 0.032)).toBeCloseTo(1, 5)
  })

  it('boosts stage plates 2 and 3 during trunk recycling cycles', () => {
    const cycle1Peak = 0.26 + (1.24 / 3) * 0.38
    const cycle2Peak = 0.26 + (1.52 / 3) * 0.38

    expect(computeStagePlateGlow(2, 0.45, 0.08, cycle1Peak)).toBeCloseTo(1, 5)
    expect(computeStagePlateGlow(3, 0.62, 0.08, cycle2Peak)).toBeCloseTo(1, 5)
    // Other plates use standard waveGlow
    expect(computeStagePlateGlow(0, 0.1, 0.08, 0.1)).toBeCloseTo(1, 5)
  })

  it('returns null target when no plate exceeds the glow threshold', () => {
    expect(
      computeActivePlateTarget([
        { x: 0, y: -1, z: 0, glow: 0 },
        { x: 10, y: -1, z: 2, glow: 0.01 },
      ])
    ).toBeNull()
  })

  it('computes weighted blend across active stage plates', () => {
    const single = computeActivePlateTarget([
      { x: -12, y: -1, z: 0, glow: 0.95 },
      { x: 20, y: -1, z: 4, glow: 0.01 },
    ])
    expect(single).not.toBeNull()
    expect(single!.x).toBeCloseTo(-12, 5)
    expect(single!.y).toBeCloseTo(-1, 5)
    expect(single!.z).toBeCloseTo(0, 5)

    // Equal glow on two plates blends halfway
    const blended = computeActivePlateTarget([
      { x: 10, y: -1, z: -2, glow: 0.6 },
      { x: 20, y: -1, z: 2, glow: 0.6 },
    ])
    expect(blended).not.toBeNull()
    expect(blended!.x).toBeCloseTo(15, 5)
    expect(blended!.z).toBeCloseTo(0, 5)
  })

  it('gates camera following on zoomed-in overview wave and user interaction', () => {
    expect(
      shouldFollowOverviewWave({
        isOverviewWave: true,
        targetDist: OVERVIEW_CAMERA_FOLLOW_MAX_DIST - 5,
        cameraFlying: false,
        isUserDraggingControls: false,
      })
    ).toBe(true)

    expect(
      shouldFollowOverviewWave({
        isOverviewWave: true,
        targetDist: OVERVIEW_CAMERA_FOLLOW_MAX_DIST,
        cameraFlying: false,
        isUserDraggingControls: false,
      })
    ).toBe(false)

    expect(
      shouldFollowOverviewWave({
        isOverviewWave: true,
        targetDist: 14,
        cameraFlying: true,
        isUserDraggingControls: false,
      })
    ).toBe(false)

    expect(
      shouldFollowOverviewWave({
        isOverviewWave: true,
        targetDist: 14,
        cameraFlying: false,
        isUserDraggingControls: true,
      })
    ).toBe(false)

    expect(
      shouldFollowOverviewWave({
        isOverviewWave: false,
        targetDist: 14,
        cameraFlying: false,
        isUserDraggingControls: false,
      })
    ).toBe(false)
  })

  it('computes frame-rate-independent exponential smoothing alpha', () => {
    expect(computeFollowAlpha(0, 3)).toBe(0)
    expect(computeFollowAlpha(-0.1, 3)).toBe(0)
    const a16 = computeFollowAlpha(1 / 60, 3)
    expect(a16).toBeGreaterThan(0)
    expect(a16).toBeLessThan(0.1)
    expect(computeFollowAlpha(0.05, 3)).toBeGreaterThan(a16)
  })

  it('slows wave speed smoothly when zoomed in and dwells longer on shorter regions', () => {
    expect(computeZoomWaveTimeScale(OVERVIEW_CAMERA_FOLLOW_MAX_DIST)).toBe(1)
    expect(computeZoomWaveTimeScale(60)).toBe(1)
    expect(computeZoomWaveTimeScale(8)).toBeCloseTo(0.35, 5)
    expect(computeZoomWaveTimeScale(18)).toBeGreaterThan(0.35)
    expect(computeZoomWaveTimeScale(18)).toBeLessThan(1)

    // Shorter regions (inputs & outputs) run slower than the 3x trunk loop
    const trunkDwell = computeAreaDwellScale(0.45)
    const inputDwell = computeAreaDwellScale(0.1)
    const outputDwell = computeAreaDwellScale(0.92)
    expect(trunkDwell).toBeCloseTo(1, 3)
    expect(inputDwell).toBeLessThan(trunkDwell)
    expect(outputDwell).toBeLessThan(inputDwell)

    // Full overview keeps 1.0x speed everywhere
    expect(computeEffectiveWaveSpeed(40, 0.1)).toBe(1)
    expect(computeEffectiveWaveSpeed(40, 0.92)).toBe(1)

    // Zoomed in slows down overall and gives output/input regions extra dwell time
    const zoomedTrunk = computeEffectiveWaveSpeed(12, 0.45)
    const zoomedOutput = computeEffectiveWaveSpeed(12, 0.92)
    expect(zoomedTrunk).toBeLessThan(0.6)
    expect(zoomedOutput).toBeLessThan(zoomedTrunk)
  })

  it('computes scene fit distance from scene width, fov, and aspect ratio', () => {
    const wideFit = computeSceneFitDistance(104, 44, 16 / 9)
    const narrowFit = computeSceneFitDistance(104, 46, 0.95)
    expect(wideFit).toBeGreaterThan(60)
    expect(wideFit).toBeLessThan(85)
    // Narrower viewport requires greater distance to fit the whole visualization
    expect(narrowFit).toBeGreaterThan(wideFit)

    // Follow activates whenever targetDist < fitDist (whole vis does not fit)
    expect(
      shouldFollowOverviewWave({
        isOverviewWave: true,
        targetDist: wideFit - 5,
        cameraFlying: false,
        isUserDraggingControls: false,
        maxFollowDist: wideFit,
      })
    ).toBe(true)
    expect(
      shouldFollowOverviewWave({
        isOverviewWave: true,
        targetDist: wideFit + 5,
        cameraFlying: false,
        isUserDraggingControls: false,
        maxFollowDist: wideFit,
      })
    ).toBe(false)
  })
})
