import { defineStore } from 'pinia'
import { openfold3Model } from '~/models/openfold3'
import { getModelById } from '~/models/registry'
import type { FoldingModelSpec, TensorBlock3D, WalkthroughStep } from '~/types/architecture'

export type VisualizerTheme = 'light' | 'dark'
export type VisualizerViewMode = 'split' | 'canvas' | 'docs'
export type DetailLevel = 'simplified' | 'mixed' | 'detailed'

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.round(value)))
}

export const useVisualizerStore = defineStore('visualizer', {
  state: () => ({
    activeModelId: 'openfold3',
    activeStepIndex: 0,
    selectedBlockId: null as string | null,
    hoveredBlockId: null as string | null,
    hoverPointer: null as { x: number; y: number } | null,
    theme: 'light' as VisualizerTheme,
    isFlowPlaying: true,
    recycleCycle: 4,
    pairformerBlock: 24,
    diffusionStep: 160,
    cameraResetNonce: 0,
    viewMode: 'split' as VisualizerViewMode,
    expandedBlockIds: [] as string[],
    sidebarOpen: true,
    commandPaletteOpen: false,
  }),

  getters: {
    activeModel(state): FoldingModelSpec {
      const found = getModelById(state.activeModelId)
      if (found && found.status === 'available') {
        return found
      }
      return openfold3Model
    },

    activeStep(): WalkthroughStep | null {
      const steps = this.activeModel.steps
      if (steps.length === 0) return null
      const idx = clampInt(this.activeStepIndex, 0, steps.length - 1)
      return steps[idx] ?? null
    },

    selectedBlock(state): TensorBlock3D | null {
      if (!state.selectedBlockId) return null
      return this.activeModel.blocks.find(b => b.id === state.selectedBlockId) ?? null
    },

    hoveredBlock(state): TensorBlock3D | null {
      if (!state.hoveredBlockId) return null
      return this.activeModel.blocks.find(b => b.id === state.hoveredBlockId) ?? null
    },

    totalSteps(): number {
      return this.activeModel.steps.length
    },

    progressPercent(): number {
      const total = this.totalSteps
      if (total <= 1) return total === 1 ? 100 : 0
      const idx = clampInt(this.activeStepIndex, 0, total - 1)
      return Math.round((idx / (total - 1)) * 100)
    },

    expandableBlockIds(): string[] {
      return this.activeModel.blocks.filter(b => Boolean(b.detailedSpec)).map(b => b.id)
    },

    isBlockExpanded(): (id: string) => boolean {
      return (id: string) => this.expandedBlockIds.includes(id)
    },

    expandedCount(state): number {
      return state.expandedBlockIds.length
    },

    detailLevel(state): DetailLevel {
      if (state.expandedBlockIds.length === 0) return 'simplified'
      const expandable = this.expandableBlockIds
      if (expandable.length > 0 && expandable.every(id => state.expandedBlockIds.includes(id))) {
        return 'detailed'
      }
      return 'mixed'
    },
  },

  actions: {
    setModel(id: string) {
      const target = getModelById(id)
      if (!target || target.status !== 'available') return
      this.activeModelId = target.id
      this.activeStepIndex = 0
      this.selectedBlockId = null
      this.hoveredBlockId = null
      this.hoverPointer = null
      this.expandedBlockIds = []
      this.cameraResetNonce += 1
    },

    goToStep(index: number) {
      const total = this.totalSteps
      if (total === 0) return
      this.activeStepIndex = clampInt(index, 0, total - 1)
      this.selectedBlockId = null
    },

    goToStepById(stepId: string) {
      const idx = this.activeModel.steps.findIndex(s => s.id === stepId)
      if (idx >= 0) {
        this.goToStep(idx)
      }
    },

    nextStep() {
      if (this.activeStepIndex < this.totalSteps - 1) {
        this.goToStep(this.activeStepIndex + 1)
      }
    },

    prevStep() {
      if (this.activeStepIndex > 0) {
        this.goToStep(this.activeStepIndex - 1)
      }
    },

    selectBlock(id: string | null) {
      if (id === null) {
        this.selectedBlockId = null
        return
      }
      const exists = this.activeModel.blocks.some(b => b.id === id)
      if (exists) {
        this.selectedBlockId = id
      }
    },

    hoverBlock(id: string | null) {
      this.hoveredBlockId = id
      if (id === null) {
        this.hoverPointer = null
      }
    },

    setHoverPointer(pos: { x: number; y: number } | null) {
      this.hoverPointer = pos
    },

    toggleFlow() {
      this.isFlowPlaying = !this.isFlowPlaying
    },

    setRecycleCycle(cycle: number) {
      this.recycleCycle = clampInt(cycle, 1, 10)
    },

    setPairformerBlock(block: number) {
      this.pairformerBlock = clampInt(block, 1, 48)
    },

    setDiffusionStep(step: number) {
      this.diffusionStep = clampInt(step, 0, 200)
    },

    resetCamera() {
      this.cameraResetNonce += 1
    },

    setTheme(theme: VisualizerTheme) {
      this.theme = theme
    },

    toggleTheme() {
      this.theme = this.theme === 'light' ? 'dark' : 'light'
    },

    setViewMode(mode: VisualizerViewMode) {
      this.viewMode = mode
    },

    toggleBlockExpanded(id: string) {
      const block = this.activeModel.blocks.find(b => b.id === id)
      if (!block?.detailedSpec) return
      if (this.expandedBlockIds.includes(id)) {
        this.expandedBlockIds = this.expandedBlockIds.filter(x => x !== id)
      } else {
        this.expandedBlockIds = [...this.expandedBlockIds, id]
      }
    },

    setBlockExpanded(id: string, expanded: boolean) {
      const block = this.activeModel.blocks.find(b => b.id === id)
      if (!block?.detailedSpec) return
      const has = this.expandedBlockIds.includes(id)
      if (expanded && !has) {
        this.expandedBlockIds = [...this.expandedBlockIds, id]
      } else if (!expanded && has) {
        this.expandedBlockIds = this.expandedBlockIds.filter(x => x !== id)
      }
    },

    expandAllBlocks() {
      this.expandedBlockIds = [...this.expandableBlockIds]
    },

    collapseAllBlocks() {
      this.expandedBlockIds = []
    },

    setDetailLevel(level: 'simplified' | 'detailed') {
      if (level === 'detailed') {
        this.expandAllBlocks()
      } else {
        this.collapseAllBlocks()
      }
    },

    toggleDetailLevel() {
      if (this.detailLevel === 'detailed') {
        this.collapseAllBlocks()
      } else {
        this.expandAllBlocks()
      }
    },

    toggleSidebar() {
      this.sidebarOpen = !this.sidebarOpen
    },

    setCommandPaletteOpen(open: boolean) {
      this.commandPaletteOpen = open
    },
  },
})
