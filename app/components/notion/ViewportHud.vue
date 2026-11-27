<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useVisualizerStore } from '~/stores/useVisualizerStore'

const store = useVisualizerStore()
const hudRef = ref<HTMLElement | null>(null)
const recycleOpen = ref(false)

watch(
  () => store.activeStep?.interactiveHint,
  hint => {
    recycleOpen.value = hint === 'cycle'
  },
  { immediate: true }
)

const fillPercent = computed(() => `${((store.recycleCycle - 1) / 9) * 100}%`)

function onSlider(event: Event) {
  store.setRecycleCycle(Number((event.target as HTMLInputElement).value))
}

const hovered = computed(() =>
  store.hoveredBlock &&
  store.hoveredBlock.id !== store.selectedBlockId &&
  !store.isBlockExpanded(store.hoveredBlock.id)
    ? store.hoveredBlock
    : null
)

const hoveredInput = computed(() =>
  !hovered.value &&
  store.hoveredInputSource &&
  store.hoveredInputSource.id !== store.selectedInputSourceId
    ? store.hoveredInputSource
    : null
)

const selectedExpandable = computed(() =>
  store.selectedBlock?.detailedSpec ? store.selectedBlock : null
)

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
    <!-- Selected expandable block action pill -->
    <div
      v-if="selectedExpandable"
      class="pointer-events-none absolute inset-x-0 top-3 flex justify-center px-3"
    >
      <div
        class="n-surface-float pointer-events-auto flex max-w-full items-center gap-2 px-3 py-1.5 text-[12px]"
      >
        <span
          class="h-2 w-2 shrink-0 rounded-full"
          :style="{ backgroundColor: selectedExpandable.color }"
        ></span>
        <span class="truncate font-medium text-n-text">{{ selectedExpandable.shortLabel }}</span>
        <div class="mx-0.5 h-3.5 w-px shrink-0 bg-n-border"></div>
        <button
          type="button"
          class="inline-flex shrink-0 items-center gap-1.5 rounded px-2 py-0.5 text-[11.5px] font-medium transition-colors"
          :class="
            store.isBlockExpanded(selectedExpandable.id)
              ? 'bg-n-active text-n-text hover:bg-n-hover'
              : 'text-n-muted hover:bg-n-hover hover:text-n-text'
          "
          @click="store.toggleBlockExpanded(selectedExpandable.id)"
        >
          <span
            :class="
              store.isBlockExpanded(selectedExpandable.id) ? 'i-lucide-layers' : 'i-lucide-cpu'
            "
            class="h-3.5 w-3.5"
          ></span>
          {{ store.isBlockExpanded(selectedExpandable.id) ? 'Simplify Block' : 'Expand Internals' }}
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
          <span class="i-lucide-mouse-pointer-click h-3 w-3"></span>
          {{
            hovered.detailedSpec
              ? 'Click to inspect · Double-click to toggle internals'
              : 'Click to inspect'
          }}
        </p>
      </div>
    </Transition>

    <!-- Hovered external input tooltip -->
    <Transition name="n-pop">
      <div
        v-if="hoveredInput"
        :key="hoveredInput.id"
        class="n-surface-float absolute max-w-[min(320px,calc(100%-24px))] px-3 py-2.5"
        :style="tooltipStyle"
        role="status"
      >
        <div class="flex items-center gap-2">
          <span
            class="h-2 w-2 shrink-0 rounded-full"
            :style="{ backgroundColor: hoveredInput.color }"
          ></span>
          <span class="truncate text-[13px] font-medium text-n-text">{{ hoveredInput.label }}</span>
        </div>
        <div class="mt-1.5 flex items-center gap-2 pl-4">
          <code class="n-code !text-[11.5px]">{{ hoveredInput.formatBadge }}</code>
        </div>
        <p class="mt-1.5 flex items-center gap-1 pl-4 text-[11px] text-n-muted">
          <span class="i-lucide-mouse-pointer-click h-3 w-3"></span>
          Click to inspect {{ hoveredInput.shortLabel }} example
        </p>
      </div>
    </Transition>

    <!-- Bottom control dock -->
    <div class="absolute inset-x-0 bottom-3 flex justify-center px-3">
      <div class="n-surface-float pointer-events-auto w-fit max-w-full overflow-hidden">
        <div class="n-collapse" :data-open="recycleOpen">
          <div>
            <div class="border-b border-n-border px-3.5 pb-2.5 pt-3">
              <div class="flex items-baseline justify-between gap-3">
                <span class="text-[12px] font-medium text-n-text">Recycle cycle</span>
                <span class="n-mono text-[11.5px] tabular-nums text-n-muted"
                  >{{ store.recycleCycle }} / 10</span
                >
              </div>
              <input
                class="n-range mt-2"
                type="range"
                :min="1"
                :max="10"
                step="1"
                :value="store.recycleCycle"
                aria-label="Recycle cycle"
                :style="{ '--n-range-fill': fillPercent }"
                @input="onSlider"
              />
              <p class="mt-1 text-[11px] text-n-muted">Trunk outputs fed back into the next pass</p>
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
            :class="
              store.isFlowPlaying
                ? '!bg-[var(--n-callout-blue)] !text-n-accent ring-1 ring-n-accent/30 hover:!bg-n-accent hover:!text-white'
                : '!bg-[var(--n-callout-amber)] !text-amber-600 dark:!text-amber-400 ring-1 ring-amber-500/35 hover:!bg-amber-500 hover:!text-white'
            "
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

          <button
            type="button"
            :aria-expanded="recycleOpen"
            class="n-btn !h-7 !gap-1 !px-1.5 !text-[12px]"
            :class="recycleOpen && '!bg-n-active !text-n-text'"
            title="Recycle"
            @click="recycleOpen = !recycleOpen"
          >
            <span class="i-lucide-repeat h-3.5 w-3.5 shrink-0"></span>
            <span class="hidden sm:inline">Recycle</span>
            <span
              v-if="store.activeStep?.interactiveHint === 'cycle'"
              class="h-1.5 w-1.5 rounded-full bg-n-accent"
            ></span>
          </button>

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
