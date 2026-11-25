import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useVisualizerStore } from '~/stores/useVisualizerStore'

describe('useVisualizerStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('initializes with OpenFold3 and default simulation parameters', () => {
    const store = useVisualizerStore()
    expect(store.activeModelId).toBe('openfold3')
    expect(store.activeStepIndex).toBe(0)
    expect(store.totalSteps).toBe(10)
    expect(store.progressPercent).toBe(0)
    expect(store.recycleCycle).toBe(4)
    expect(store.pairformerBlock).toBe(24)
    expect(store.diffusionStep).toBe(160)
    expect(store.theme).toBe('light')
    expect(store.detailLevel).toBe('simplified')
  })

  it('navigates steps and clears selectedBlockId on step change', () => {
    const store = useVisualizerStore()
    store.selectBlock('pairformer-pair')
    expect(store.selectedBlock?.id).toBe('pairformer-pair')

    store.nextStep()
    expect(store.activeStepIndex).toBe(1)
    expect(store.selectedBlockId).toBeNull()

    store.goToStepById('diffusion-module')
    expect(store.activeStep?.id).toBe('diffusion-module')

    store.goToStep(999)
    expect(store.activeStepIndex).toBe(9)
    expect(store.progressPercent).toBe(100)

    store.prevStep()
    expect(store.activeStepIndex).toBe(8)

    store.goToStep(-5)
    expect(store.activeStepIndex).toBe(0)
  })

  it('clamps recycleCycle, pairformerBlock, and diffusionStep within bounds', () => {
    const store = useVisualizerStore()

    store.setRecycleCycle(0)
    expect(store.recycleCycle).toBe(1)
    store.setRecycleCycle(15)
    expect(store.recycleCycle).toBe(10)

    store.setPairformerBlock(-3)
    expect(store.pairformerBlock).toBe(1)
    store.setPairformerBlock(100)
    expect(store.pairformerBlock).toBe(48)

    store.setDiffusionStep(-10)
    expect(store.diffusionStep).toBe(0)
    store.setDiffusionStep(500)
    expect(store.diffusionStep).toBe(200)
  })

  it('toggles theme, flow, sidebar, and ignores coming-soon models', () => {
    const store = useVisualizerStore()

    store.toggleTheme()
    expect(store.theme).toBe('dark')
    store.setTheme('light')
    expect(store.theme).toBe('light')

    store.toggleFlow()
    expect(store.isFlowPlaying).toBe(false)

    store.toggleSidebar()
    expect(store.sidebarOpen).toBe(false)

    store.setModel('boltz2')
    expect(store.activeModelId).toBe('openfold3')

    const prevNonce = store.cameraResetNonce
    store.resetCamera()
    expect(store.cameraResetNonce).toBe(prevNonce + 1)
  })

  it('switches and toggles detailLevel between simplified and detailed', () => {
    const store = useVisualizerStore()
    expect(store.detailLevel).toBe('simplified')

    store.setDetailLevel('detailed')
    expect(store.detailLevel).toBe('detailed')

    store.toggleDetailLevel()
    expect(store.detailLevel).toBe('simplified')

    store.toggleDetailLevel()
    expect(store.detailLevel).toBe('detailed')
  })
})
