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

  it('clamps recycleCycle within bounds', () => {
    const store = useVisualizerStore()

    store.setRecycleCycle(0)
    expect(store.recycleCycle).toBe(1)
    store.setRecycleCycle(15)
    expect(store.recycleCycle).toBe(10)
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

  it('switches and toggles per-block expansion and detailLevel (simplified | mixed | detailed)', () => {
    const store = useVisualizerStore()
    expect(store.detailLevel).toBe('simplified')
    expect(store.expandedBlockIds).toEqual([])
    expect(store.expandedCount).toBe(0)
    expect(store.expandableBlockIds).toHaveLength(19)

    // Non-expandable / unknown block should be ignored
    store.toggleBlockExpanded('nonexistent-block')
    expect(store.expandedCount).toBe(0)

    // Expand one block -> mixed
    store.toggleBlockExpanded('pairformer-single')
    expect(store.isBlockExpanded('pairformer-single')).toBe(true)
    expect(store.expandedCount).toBe(1)
    expect(store.detailLevel).toBe('mixed')

    // Expand another block -> still mixed
    store.setBlockExpanded('atom-attn-encoder-init', true)
    expect(store.isBlockExpanded('atom-attn-encoder-init')).toBe(true)
    expect(store.expandedCount).toBe(2)
    expect(store.detailLevel).toBe('mixed')

    // Expand all -> detailed
    store.expandAllBlocks()
    expect(store.expandedCount).toBe(19)
    expect(store.detailLevel).toBe('detailed')

    // Toggle one off -> mixed
    store.toggleBlockExpanded('msa-stack')
    expect(store.isBlockExpanded('msa-stack')).toBe(false)
    expect(store.expandedCount).toBe(18)
    expect(store.detailLevel).toBe('mixed')

    // Collapse all -> simplified
    store.collapseAllBlocks()
    expect(store.expandedCount).toBe(0)
    expect(store.detailLevel).toBe('simplified')

    // setDetailLevel / toggleDetailLevel delegate to expandAllBlocks / collapseAllBlocks
    store.setDetailLevel('detailed')
    expect(store.detailLevel).toBe('detailed')
    expect(store.expandedCount).toBe(19)

    store.toggleDetailLevel()
    expect(store.detailLevel).toBe('simplified')
    expect(store.expandedCount).toBe(0)

    store.toggleDetailLevel()
    expect(store.detailLevel).toBe('detailed')
    expect(store.expandedCount).toBe(19)
  })
})
