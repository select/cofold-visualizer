<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useEventListener, useMediaQuery } from '@vueuse/core'
import CommandPalette from '~/components/notion/CommandPalette.vue'
import NotionDocPanel from '~/components/notion/NotionDocPanel.vue'
import NotionSidebar from '~/components/notion/NotionSidebar.vue'
import NotionTopbar from '~/components/notion/NotionTopbar.vue'
import SidePanelHandle from '~/components/notion/SidePanelHandle.vue'
import ViewportHud from '~/components/notion/ViewportHud.vue'
import Viewport3D from '~/components/Viewport3D.vue'
import { useVisualizerStore } from '~/stores/useVisualizerStore'

const store = useVisualizerStore()

// Gate media queries behind mount so SSR and first client render match.
const mounted = ref(false)
const mobileQuery = useMediaQuery('(max-width: 767px)')
const narrowQuery = useMediaQuery('(max-width: 1023px)')
const isMobile = computed(() => mounted.value && mobileQuery.value)
const isNarrow = computed(() => mounted.value && narrowQuery.value)

onMounted(() => {
  mounted.value = true
  if (isMobile.value) store.sidebarOpen = false
})

watch(isMobile, mobile => {
  if (mobile) store.sidebarOpen = false
})

const effectiveMode = computed(() => store.viewMode)

/* ---------- Resizable split ---------- */
const mainRef = ref<HTMLElement | null>(null)
const docPercent = ref(38)
const dragging = ref(false)

function startResize(event: PointerEvent) {
  dragging.value = true
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

function onResize(event: PointerEvent) {
  if (!dragging.value || !mainRef.value) return
  const rect = mainRef.value.getBoundingClientRect()
  const pct = ((rect.right - event.clientX) / rect.width) * 100
  docPercent.value = Math.min(60, Math.max(26, pct))
}

function stopResize() {
  dragging.value = false
}

function onResizeKey(event: KeyboardEvent) {
  if (event.key === 'ArrowLeft') docPercent.value = Math.min(60, docPercent.value + 2)
  else if (event.key === 'ArrowRight') docPercent.value = Math.max(26, docPercent.value - 2)
  else return
  event.preventDefault()
  event.stopPropagation()
}

/* ---------- Global keyboard shortcuts ---------- */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return (
    target.isContentEditable ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    (tag === 'INPUT' && (target as HTMLInputElement).type !== 'range')
  )
}

useEventListener(window, 'keydown', (event: KeyboardEvent) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    store.setCommandPaletteOpen(!store.commandPaletteOpen)
    return
  }

  if (store.commandPaletteOpen) {
    if (event.key === 'Escape') store.setCommandPaletteOpen(false)
    return
  }

  if (event.metaKey || event.ctrlKey || event.altKey) return
  if (isTypingTarget(event.target)) return
  const onRange = event.target instanceof HTMLInputElement && event.target.type === 'range'

  switch (event.key) {
    case ' ':
    case 'Spacebar':
      event.preventDefault()
      store.nextStep()
      break
    case 'ArrowRight':
      if (onRange) return
      event.preventDefault()
      store.nextStep()
      break
    case 'ArrowLeft':
      if (onRange) return
      event.preventDefault()
      store.prevStep()
      break
    case 'Escape':
      if (store.selectedBlockId) store.selectBlock(null)
      else if (store.selectedInputSourceId) store.selectInputSource(null)
      else if (store.selectedOutputId) store.selectOutput(null)
      else if (isMobile.value && store.sidebarOpen) store.sidebarOpen = false
      break
    case 'r':
    case 'R':
      store.resetCamera()
      break
  }
})

function onSidebarNavigate() {
  if (isMobile.value) store.sidebarOpen = false
}
</script>

<template>
  <div class="flex h-full w-full overflow-hidden">
    <!-- Desktop sidebar -->
    <div v-if="!isMobile" class="relative h-full shrink-0">
      <div
        class="h-full overflow-hidden transition-[width] duration-200 ease-out"
        :style="{ width: store.sidebarOpen ? '260px' : '0px' }"
      >
        <NotionSidebar />
      </div>
      <SidePanelHandle
        side="left"
        :open="store.sidebarOpen"
        surface="sidebar"
        :label="store.sidebarOpen ? 'Retract sidebar' : 'Expand sidebar'"
        class="left-[calc(100%-1px)]"
        @toggle="store.toggleSidebar()"
      />
    </div>

    <!-- Mobile drawer -->
    <template v-else>
      <Transition name="n-fade">
        <div
          v-if="store.sidebarOpen"
          class="fixed inset-0 z-40 bg-[rgba(15,15,15,0.35)]"
          @click="store.sidebarOpen = false"
        ></div>
      </Transition>
      <Transition name="n-slide">
        <div v-if="store.sidebarOpen" class="fixed inset-y-0 left-0 z-40 shadow-[var(--n-shadow)]">
          <NotionSidebar @navigate="onSidebarNavigate" />
        </div>
      </Transition>
    </template>

    <!-- Main column -->
    <div class="flex min-h-0 min-w-0 flex-1 flex-col">
      <NotionTopbar />

      <main
        ref="mainRef"
        class="relative flex min-h-0 flex-1"
        :class="[isNarrow && effectiveMode === 'split' && 'flex-col', dragging && 'select-none']"
      >
        <!-- 3D viewport -->
        <div
          v-show="effectiveMode !== 'docs'"
          class="relative min-h-0 min-w-0 overflow-hidden bg-n-canvas"
          :class="isNarrow && effectiveMode === 'split' ? 'h-[48%] shrink-0' : 'flex-1'"
        >
          <ClientOnly>
            <Viewport3D />
            <template #fallback>
              <div class="grid h-full w-full place-items-center bg-n-canvas">
                <div class="flex flex-col items-center gap-3 text-n-muted">
                  <span class="i-lucide-box h-6 w-6 animate-pulse text-n-faint"></span>
                  <span class="text-[13px]">Preparing the 3D architecture…</span>
                </div>
              </div>
            </template>
          </ClientOnly>
          <ViewportHud />
        </div>

        <!-- Resize handle -->
        <div
          v-if="effectiveMode === 'split' && !isNarrow"
          class="group relative z-20 w-px shrink-0 cursor-col-resize bg-n-border"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize document panel"
          :aria-valuenow="Math.round(100 - docPercent)"
          tabindex="0"
          @pointerdown="startResize"
          @pointermove="onResize"
          @pointerup="stopResize"
          @pointercancel="stopResize"
          @keydown="onResizeKey"
          @dblclick="docPercent = 38"
        >
          <div
            class="absolute inset-y-0 -left-1 -right-1 transition-colors group-hover:bg-n-accent/30"
            :class="dragging && 'bg-n-accent/40'"
          ></div>
        </div>

        <!-- Document panel -->
        <div
          v-if="effectiveMode !== 'canvas'"
          class="relative min-h-0 min-w-0"
          :class="[
            effectiveMode === 'docs' && 'flex-1',
            effectiveMode === 'split' && isNarrow && 'flex-1 border-t border-n-border',
          ]"
          :style="
            effectiveMode === 'split' && !isNarrow
              ? { width: `${docPercent}%`, flex: '0 0 auto' }
              : undefined
          "
        >
          <NotionDocPanel :centered="effectiveMode === 'docs'" />
          <SidePanelHandle
            v-if="effectiveMode === 'split' && !isNarrow"
            side="right"
            :open="true"
            surface="bg"
            label="Retract document panel"
            class="right-[calc(100%-1px)]"
            @toggle="store.setViewMode('canvas')"
          />
        </div>

        <SidePanelHandle
          v-if="effectiveMode === 'canvas' && !isNarrow"
          side="right"
          :open="false"
          surface="bg"
          label="Expand document panel"
          class="right-[-1px]"
          @toggle="store.setViewMode('split')"
        />
      </main>
    </div>

    <ClientOnly>
      <CommandPalette />
    </ClientOnly>
  </div>
</template>
