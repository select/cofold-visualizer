<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { SceneEngine } from '~/engine/SceneEngine'
import { useVisualizerStore } from '~/stores/useVisualizerStore'

const store = useVisualizerStore()
const containerRef = ref<HTMLElement | null>(null)
const webglError = ref<string | null>(null)
const pauseRemaining = ref(0)

const pauseCountdown = computed(() =>
  pauseRemaining.value > 0 ? Math.min(3, Math.max(1, Math.ceil(pauseRemaining.value))) : 0
)

let engine: SceneEngine | null = null
let resizeObserver: ResizeObserver | null = null

function syncStepCameraAndFocus() {
  if (!engine) return
  const step = store.activeStep
  if (!step) return
  engine.setFocus(step.focusBlockIds, step.highlightEdgeIds)
  engine.flyToCamera(step.camera.position, step.camera.target)
}

function handlePointerMove(e: PointerEvent) {
  const el = containerRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  store.setHoverPointer({
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
  })
}

function handlePointerLeave() {
  store.setHoverPointer(null)
}

onMounted(() => {
  const el = containerRef.value
  if (!el) return

  try {
    engine = new SceneEngine(el, {
      onSelectBlock: blockId => store.selectBlock(blockId),
      onHoverBlock: blockId => store.hoverBlock(blockId),
      onSelectInputSource: inputSourceId => store.selectInputSource(inputSourceId),
      onHoverInputSource: inputSourceId => store.hoverInputSource(inputSourceId),
      onSelectOutput: outputId => store.selectOutput(outputId),
      onHoverOutput: outputId => store.hoverOutput(outputId),
      onDoubleClickBlock: blockId => {
        if (blockId) store.toggleBlockExpanded(blockId)
      },
      onOverviewPauseChange: remaining => {
        pauseRemaining.value = remaining
      },
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
  engine.setSelectedBlock(store.selectedBlockId)
  engine.setExpandedBlocks(store.expandedBlockIds)
  engine.setDocsOpen(store.viewMode !== 'canvas')
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
  () => store.viewMode,
  mode => {
    engine?.setDocsOpen(mode !== 'canvas')
  }
)

watch(
  () => store.expandedBlockIds,
  ids => {
    engine?.setExpandedBlocks(ids)
  },
  { deep: true }
)

watch(
  () => store.selectedBlockId,
  id => {
    engine?.setSelectedBlock(id)
    if (id) {
      engine?.focusBlock(id)
    } else if (!store.selectedInputSourceId && !store.selectedOutputId && store.activeStep) {
      engine?.flyToCamera(store.activeStep.camera.position, store.activeStep.camera.target)
    }
  }
)

watch(
  () => store.selectedInputSource,
  src => {
    engine?.setSelectedInputSource(src?.id ?? null)
    if (src) {
      engine?.focusBlock(src.targetBlockId)
    } else if (!store.selectedBlockId && !store.selectedOutputId && store.activeStep) {
      engine?.flyToCamera(store.activeStep.camera.position, store.activeStep.camera.target)
    }
  }
)

watch(
  () => store.selectedOutput,
  out => {
    engine?.setSelectedOutput(out?.id ?? null)
    if (out) {
      engine?.focusOutput(out.id)
    } else if (!store.selectedBlockId && !store.selectedInputSourceId && store.activeStep) {
      engine?.flyToCamera(store.activeStep.camera.position, store.activeStep.camera.target)
    }
  }
)

watch(
  () => store.cifText,
  cifText => {
    engine?.setCifText(cifText)
  }
)

watch(
  () => store.hoveredBlockId,
  id => {
    engine?.setHoveredBlock(id)
  }
)

watch(
  () => store.hoveredInputSourceId,
  id => {
    engine?.setHoveredInputSource(id)
  }
)

watch(
  () => store.hoveredOutputId,
  id => {
    engine?.setHoveredOutput(id)
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

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  engine?.dispose()
  engine = null
})
</script>

<template>
  <div
    class="relative h-full w-full overflow-hidden"
    @pointermove="handlePointerMove"
    @pointerleave="handlePointerLeave"
  >
    <div ref="containerRef" class="h-full w-full"></div>

    <div
      v-if="pauseCountdown > 0"
      class="pointer-events-none absolute inset-0 flex items-start justify-center pt-8"
      aria-hidden="true"
    >
      <span
        :key="pauseCountdown"
        class="countdown-num n-mono select-none text-8xl font-black tracking-tight tabular-nums text-n-muted"
      >
        {{ pauseCountdown }}
      </span>
    </div>

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

<style scoped>
@keyframes countdown-pop {
  0% {
    opacity: 0;
    transform: scale(0.12);
  }
  100% {
    opacity: 0.5;
    transform: scale(1.15);
  }
}

.countdown-num {
  animation: countdown-pop 0.95s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}
</style>
