<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { SceneEngine } from '~/engine/SceneEngine'
import { useVisualizerStore } from '~/stores/useVisualizerStore'

const store = useVisualizerStore()
const containerRef = ref<HTMLElement | null>(null)
const webglError = ref<string | null>(null)

let engine: SceneEngine | null = null
let resizeObserver: ResizeObserver | null = null

function syncStepCameraAndFocus() {
  if (!engine) return
  const step = store.activeStep
  if (!step) return
  engine.setFocus(step.focusBlockIds, step.highlightEdgeIds)
  engine.flyToCamera(step.camera.position, step.camera.target)
}

onMounted(() => {
  const el = containerRef.value
  if (!el) return

  try {
    engine = new SceneEngine(el, {
      onSelectBlock: blockId => store.selectBlock(blockId),
      onHoverBlock: blockId => store.hoverBlock(blockId),
    })
  } catch (err) {
    webglError.value =
      err instanceof Error ? err.message : 'WebGL2 is unavailable in this browser environment.'
    return
  }

  engine.setTheme(store.theme)
  engine.setModel(store.activeModel)
  engine.setFlowPlaying(store.isFlowPlaying)
  engine.setRecycleCycle(store.recycleCycle)
  engine.setPairformerBlock(store.pairformerBlock)
  engine.setDiffusionStep(store.diffusionStep)
  engine.setSelectedBlock(store.selectedBlockId)
  syncStepCameraAndFocus()

  resizeObserver = new ResizeObserver(() => {
    engine?.resize()
  })
  resizeObserver.observe(el)
})

watch(
  () => store.activeModel,
  model => {
    engine?.setModel(model)
    syncStepCameraAndFocus()
  }
)

watch(
  () => store.activeStep,
  () => {
    syncStepCameraAndFocus()
  }
)

watch(
  () => store.cameraResetNonce,
  () => {
    syncStepCameraAndFocus()
  }
)

watch(
  () => store.selectedBlockId,
  id => {
    engine?.setSelectedBlock(id)
    if (id) {
      engine?.focusBlock(id)
    } else if (store.activeStep) {
      engine?.flyToCamera(store.activeStep.camera.position, store.activeStep.camera.target)
    }
  }
)

watch(
  () => store.hoveredBlockId,
  id => {
    engine?.setHoveredBlock(id)
  }
)

watch(
  () => store.theme,
  theme => {
    engine?.setTheme(theme)
  }
)

watch(
  () => store.isFlowPlaying,
  playing => {
    engine?.setFlowPlaying(playing)
  }
)

watch(
  () => store.recycleCycle,
  cycle => {
    engine?.setRecycleCycle(cycle)
  }
)

watch(
  () => store.pairformerBlock,
  block => {
    engine?.setPairformerBlock(block)
  }
)

watch(
  () => store.diffusionStep,
  step => {
    engine?.setDiffusionStep(step)
  }
)

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  engine?.dispose()
  engine = null
})
</script>

<template>
  <div class="relative h-full w-full overflow-hidden">
    <div ref="containerRef" class="h-full w-full"></div>

    <div
      v-if="webglError"
      class="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-n-canvas"
    >
      <div class="max-w-md space-y-2 rounded-lg border border-n-border bg-n-bg p-6">
        <p class="text-sm font-semibold text-n-text">3D Viewport Unavailable</p>
        <p class="text-xs text-n-muted">
          {{ webglError }}
        </p>
      </div>
    </div>
  </div>
</template>
