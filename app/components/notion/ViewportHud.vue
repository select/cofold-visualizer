<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ATTENTION_PRESETS, resolveAttentionContext } from '~/engine/DetailedAttentionView'
import { useVisualizerStore } from '~/stores/useVisualizerStore'
import type { InteractiveHint } from '~/types/architecture'
import { diffusionSigma, formatSigma } from '~/utils/diffusion'

const store = useVisualizerStore()
const hudRef = ref<HTMLElement | null>(null)

const tabs: Array<{ id: InteractiveHint; label: string; icon: string }> = [
  { id: 'cycle', label: 'Recycle', icon: 'i-lucide-repeat' },
  { id: 'pairformerBlock', label: 'Pairformer', icon: 'i-lucide-grid-3x3' },
  { id: 'diffusionStep', label: 'Diffusion', icon: 'i-lucide-waves' },
]

const activeTab = ref<InteractiveHint>('cycle')
const slidersOpen = ref(false)

watch(
  () => store.activeStep?.interactiveHint,
  hint => {
    if (hint) {
      activeTab.value = hint
      slidersOpen.value = true
    } else {
      slidersOpen.value = false
    }
  },
  { immediate: true }
)

function selectTab(id: InteractiveHint) {
  if (activeTab.value === id && slidersOpen.value) {
    slidersOpen.value = false
    return
  }
  activeTab.value = id
  slidersOpen.value = true
}

const sigma = computed(() => formatSigma(diffusionSigma(store.diffusionStep)))

const slider = computed(() => {
  switch (activeTab.value) {
    case 'pairformerBlock':
      return {
        title: 'Pairformer block',
        min: 1,
        max: 48,
        value: store.pairformerBlock,
        display: `${store.pairformerBlock} / 48`,
        hint: 'Triangle updates + pair-biased single attention',
      }
    case 'diffusionStep':
      return {
        title: 'Diffusion step',
        min: 0,
        max: 200,
        value: store.diffusionStep,
        display: `${store.diffusionStep} / 200`,
        hint: `σ ≈ ${sigma.value} Å`,
      }
    default:
      return {
        title: 'Recycle cycle',
        min: 1,
        max: 10,
        value: store.recycleCycle,
        display: `${store.recycleCycle} / 10`,
        hint: 'Trunk outputs fed back into the next pass',
      }
  }
})

const fillPercent = computed(() => {
  const s = slider.value
  return `${((s.value - s.min) / (s.max - s.min)) * 100}%`
})

function onSlider(event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  if (activeTab.value === 'cycle') store.setRecycleCycle(value)
  else if (activeTab.value === 'pairformerBlock') store.setPairformerBlock(value)
  else store.setDiffusionStep(value)
}

const hovered = computed(() =>
  store.detailLevel === 'simplified' &&
  store.hoveredBlock &&
  store.hoveredBlock.id !== store.selectedBlockId
    ? store.hoveredBlock
    : null
)

const detailedPreset = computed(() => {
  const key = resolveAttentionContext(store.activeStep?.id, store.selectedBlockId)
  return ATTENTION_PRESETS[key]
})

const tooltipStyle = computed(() => {
  const ptr = store.hoverPointer
  if (!ptr) {
    return { left: '12px', top: '12px' }
  }
  const rect = hudRef.value?.getBoundingClientRect()
  const maxW = rect ? Math.max(12, rect.width - 316) : 600
  const maxH = rect ? Math.max(12, rect.height - 140) : 600
  const left = Math.min(maxW, Math.max(12, ptr.x + 14))
  const top = Math.min(maxH, Math.max(12, ptr.y + 14))
  return {
    left: `${Math.round(left)}px`,
    top: `${Math.round(top)}px`,
  }
})
</script>

<template>
  <div ref="hudRef" class="pointer-events-none absolute inset-0 z-10">
    <!-- Detailed attention heads badge -->
    <div
      v-if="store.detailLevel === 'detailed'"
      class="pointer-events-none absolute inset-x-0 top-3 flex justify-center px-3"
    >
      <div
        class="n-surface-float pointer-events-auto flex max-w-full items-center gap-2 px-3 py-1.5 text-[12px]"
      >
        <span
          class="h-2 w-2 shrink-0 rounded-full"
          :style="{ backgroundColor: detailedPreset.accentColor }"
        ></span>
        <span class="truncate font-medium text-n-text">{{ detailedPreset.badgeText }}</span>
        <div class="mx-0.5 h-3.5 w-px shrink-0 bg-n-border"></div>
        <button
          type="button"
          class="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11.5px] font-medium text-n-muted transition-colors hover:bg-n-hover hover:text-n-text"
          @click="store.setDetailLevel('simplified')"
        >
          <span class="i-lucide-layers h-3 w-3"></span>
          Back to Simplified
        </button>
      </div>
    </div>

    <!-- Hovered tensor tooltip -->
    <Transition name="n-pop">
      <div
        v-if="hovered"
        :key="hovered.id"
        class="n-surface-float absolute max-w-[min(320px,calc(100%-24px))] px-3 py-2.5"
        :style="tooltipStyle"
        role="status"
      >
        <div class="flex items-center gap-2">
          <span
            class="h-2 w-2 shrink-0 rounded-full"
            :style="{ backgroundColor: hovered.color }"
          ></span>
          <span class="truncate text-[13px] font-medium text-n-text">{{ hovered.label }}</span>
        </div>
        <div class="mt-1.5 flex items-center gap-2 pl-4">
          <code class="n-code !text-[11.5px]">{{ hovered.shape }}</code>
        </div>
        <p class="mt-1.5 flex items-center gap-1 pl-4 text-[11px] text-n-muted">
          <span class="i-lucide-mouse-pointer-click h-3 w-3"></span>Click to inspect
        </p>
      </div>
    </Transition>

    <!-- Bottom control dock -->
    <div class="absolute inset-x-0 bottom-3 flex justify-center px-3">
      <div class="n-surface-float pointer-events-auto w-full max-w-[460px] overflow-hidden">
        <div class="n-collapse" :data-open="slidersOpen">
          <div>
            <div class="border-b border-n-border px-3.5 pb-2.5 pt-3">
              <div class="flex items-baseline justify-between gap-3">
                <span class="text-[12px] font-medium text-n-text">{{ slider.title }}</span>
                <span class="n-mono text-[11.5px] tabular-nums text-n-muted">{{
                  slider.display
                }}</span>
              </div>
              <input
                class="n-range mt-2"
                type="range"
                :min="slider.min"
                :max="slider.max"
                step="1"
                :value="slider.value"
                :aria-label="slider.title"
                :style="{ '--n-range-fill': fillPercent }"
                @input="onSlider"
              />
              <p
                class="mt-1 text-[11px] text-n-muted"
                :class="activeTab === 'diffusionStep' && 'n-mono'"
              >
                {{ slider.hint }}
              </p>
            </div>
          </div>
        </div>

        <div class="flex items-center gap-0.5 px-1.5 py-1.5">
          <button
            type="button"
            class="n-btn n-btn-icon"
            aria-label="Previous step"
            title="Previous (←)"
            :disabled="store.activeStepIndex === 0"
            @click="store.prevStep()"
          >
            <span class="i-lucide-chevron-left h-4 w-4"></span>
          </button>
          <button
            type="button"
            class="n-btn n-btn-icon"
            :aria-label="store.isFlowPlaying ? 'Pause data flow' : 'Play data flow'"
            :title="store.isFlowPlaying ? 'Pause data flow' : 'Play data flow'"
            @click="store.toggleFlow()"
          >
            <span
              :class="store.isFlowPlaying ? 'i-lucide-pause' : 'i-lucide-play'"
              class="h-4 w-4"
            ></span>
          </button>
          <button
            type="button"
            class="n-btn n-btn-icon"
            aria-label="Next step"
            title="Next (→ / Space)"
            :disabled="store.activeStepIndex >= store.totalSteps - 1"
            @click="store.nextStep()"
          >
            <span class="i-lucide-chevron-right h-4 w-4"></span>
          </button>
          <span class="px-1.5 text-[12px] tabular-nums text-n-muted whitespace-nowrap">
            Step {{ store.activeStepIndex + 1 }} / {{ store.totalSteps }}
          </span>

          <div class="mx-1 h-4 w-px bg-n-border"></div>

          <div class="flex min-w-0 flex-1 items-center gap-0.5" role="tablist">
            <button
              v-for="tab in tabs"
              :key="tab.id"
              type="button"
              role="tab"
              :aria-selected="slidersOpen && activeTab === tab.id"
              class="n-btn !h-7 !gap-1 !px-1.5 !text-[12px]"
              :class="slidersOpen && activeTab === tab.id && '!bg-n-active !text-n-text'"
              :title="tab.label"
              @click="selectTab(tab.id)"
            >
              <span :class="tab.icon" class="h-3.5 w-3.5 shrink-0"></span>
              <span class="hidden sm:inline">{{ tab.label }}</span>
              <span
                v-if="store.activeStep?.interactiveHint === tab.id"
                class="h-1.5 w-1.5 rounded-full bg-n-accent"
              ></span>
            </button>
          </div>

          <button
            type="button"
            class="n-btn n-btn-icon"
            aria-label="Reset camera"
            title="Reset camera (R)"
            @click="store.resetCamera()"
          >
            <span class="i-lucide-scan h-4 w-4"></span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
