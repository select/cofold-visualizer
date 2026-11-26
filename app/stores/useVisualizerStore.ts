import { defineStore } from 'pinia'
import { CIF_PRESETS, getCifPresetById } from '~/models/cifExamples'
import { getInputSourceById } from '~/models/inputExamples'
import { openfold3Model } from '~/models/openfold3'
import { getOutputSpecById } from '~/models/outputSpecs'
import { getModelById } from '~/models/registry'
import type {
  FoldingModelSpec,
  InputSourceId,
  InputSourceSpec,
  OutputId,
  OutputSpec,
  TensorBlock3D,
  WalkthroughStep,
} from '~/types/architecture'

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
    selectedInputSourceId: null as InputSourceId | null,
    hoveredInputSourceId: null as InputSourceId | null,
    selectedOutputId: null as OutputId | null,
    hoveredOutputId: null as OutputId | null,
    hoverPointer: null as { x: number; y: number } | null,
    theme: 'light' as VisualizerTheme,
    isFlowPlaying: true,
    recycleCycle: 4,
    cameraResetNonce: 0,
    viewMode: 'split' as VisualizerViewMode,
    expandedBlockIds: [] as string[],
    selectedCifId: CIF_PRESETS[0]!.id as string,
    customCifName: '' as string,
    cifText: CIF_PRESETS[0]!.cifText as string,
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

    selectedInputSource(state): InputSourceSpec | null {
      if (!state.selectedInputSourceId) return null
      return getInputSourceById(state.selectedInputSourceId)
    },

    hoveredInputSource(state): InputSourceSpec | null {
      if (!state.hoveredInputSourceId) return null
      return getInputSourceById(state.hoveredInputSourceId)
    },

    selectedOutput(state): OutputSpec | null {
      if (!state.selectedOutputId) return null
      return getOutputSpecById(state.selectedOutputId)
    },

    hoveredOutput(state): OutputSpec | null {
      if (!state.hoveredOutputId) return null
      return getOutputSpecById(state.hoveredOutputId)
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
      this.selectedInputSourceId = null
      this.hoveredInputSourceId = null
      this.selectedOutputId = null
      this.hoveredOutputId = null
      this.hoverPointer = null
      this.expandedBlockIds = []
      this.cameraResetNonce += 1
    },

    goToStep(index: number) {
      const total = this.totalSteps
      if (total === 0) return
      this.activeStepIndex = clampInt(index, 0, total - 1)
      this.selectedBlockId = null
      this.selectedInputSourceId = null
      this.selectedOutputId = null
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
        this.selectedInputSourceId = null
        this.selectedOutputId = null
      }
    },

    hoverBlock(id: string | null) {
      this.hoveredBlockId = id
      if (id !== null) {
        this.hoveredInputSourceId = null
        this.hoveredOutputId = null
      } else if (this.hoveredInputSourceId === null && this.hoveredOutputId === null) {
        this.hoverPointer = null
      }
    },

    selectInputSource(id: InputSourceId | null) {
      this.selectedInputSourceId = id
      if (id !== null) {
        this.selectedBlockId = null
        this.selectedOutputId = null
      }
    },

    hoverInputSource(id: InputSourceId | null) {
      this.hoveredInputSourceId = id
      if (id !== null) {
        this.hoveredBlockId = null
        this.hoveredOutputId = null
      } else if (this.hoveredBlockId === null && this.hoveredOutputId === null) {
        this.hoverPointer = null
      }
    },

    selectOutput(id: OutputId | null) {
      this.selectedOutputId = id
      if (id !== null) {
        this.selectedBlockId = null
        this.selectedInputSourceId = null
        if (this.viewMode === 'canvas') {
          this.viewMode = 'split'
        }
      }
    },

    selectCifPreset(id: string) {
      const preset = getCifPresetById(id)
      if (!preset) return
      this.selectedCifId = preset.id
      this.customCifName = ''
      this.cifText = preset.cifText
    },

    loadCustomCif(name: string, text: string) {
      this.selectedCifId = 'custom'
      this.customCifName = name
      this.cifText = text
    },

    hoverOutput(id: OutputId | null) {
      this.hoveredOutputId = id
      if (id !== null) {
        this.hoveredBlockId = null
        this.hoveredInputSourceId = null
      } else if (this.hoveredBlockId === null && this.hoveredInputSourceId === null) {
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
