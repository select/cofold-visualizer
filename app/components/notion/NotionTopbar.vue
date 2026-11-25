<script setup lang="ts">
import { computed } from 'vue'
import { useVisualizerStore } from '~/stores/useVisualizerStore'
import type { VisualizerViewMode } from '~/stores/useVisualizerStore'

const store = useVisualizerStore()

const viewModes: Array<{ id: VisualizerViewMode; label: string; icon: string }> = [
  { id: 'split', label: 'Split', icon: 'i-lucide-columns-2' },
  { id: 'canvas', label: '3D Focus', icon: 'i-lucide-box' },
  { id: 'docs', label: 'Docs', icon: 'i-lucide-file-text' },
]

const leaf = computed(() => {
  if (store.selectedBlock) {
    return {
      icon: 'i-lucide-box',
      label: store.selectedBlock.label,
      color: store.selectedBlock.color,
    }
  }
  return {
    icon: store.activeStep?.icon ?? 'i-lucide-file',
    label: store.activeStep?.title ?? 'Untitled',
    color: null,
  }
})
</script>

<template>
  <header
    class="flex h-11 shrink-0 items-center gap-2 border-b border-n-border bg-n-bg px-2 sm:px-3"
  >
    <button
      type="button"
      class="n-btn n-btn-icon"
      :aria-label="store.sidebarOpen ? 'Close sidebar' : 'Open sidebar'"
      :title="store.sidebarOpen ? 'Close sidebar' : 'Open sidebar'"
      @click="store.toggleSidebar()"
    >
      <span
        :class="store.sidebarOpen ? 'i-lucide-panel-left-close' : 'i-lucide-panel-left-open'"
        class="h-4 w-4"
      ></span>
    </button>

    <nav class="flex min-w-0 flex-1 items-center text-[13px]" aria-label="Breadcrumb">
      <span class="hidden truncate rounded px-1.5 py-0.5 text-n-muted sm:inline">Co-Fold</span>
      <span class="hidden px-0.5 text-n-faint sm:inline">/</span>
      <button
        type="button"
        class="hidden shrink-0 truncate rounded px-1.5 py-0.5 text-n-muted hover:bg-n-hover sm:inline"
        @click="store.goToStep(0)"
      >
        {{ store.activeModel.name }}
      </button>
      <span class="hidden px-0.5 text-n-faint sm:inline">/</span>
      <template v-if="store.selectedBlock && store.activeStep">
        <button
          type="button"
          class="hidden max-w-[180px] shrink truncate rounded px-1.5 py-0.5 text-n-muted hover:bg-n-hover md:inline"
          @click="store.selectBlock(null)"
        >
          {{ store.activeStep.title }}
        </button>
        <span class="hidden px-0.5 text-n-faint md:inline">/</span>
      </template>
      <span class="flex min-w-0 items-center gap-1.5 rounded px-1.5 py-0.5 text-n-text">
        <span
          v-if="leaf.color"
          class="h-2 w-2 shrink-0 rounded-sm"
          :style="{ backgroundColor: leaf.color }"
        ></span>
        <span v-else :class="leaf.icon" class="h-3.5 w-3.5 shrink-0 text-n-muted"></span>
        <span class="truncate">{{ leaf.label }}</span>
      </span>
    </nav>

    <div
      class="hidden items-center rounded-md bg-n-hover p-0.5 md:flex"
      role="radiogroup"
      aria-label="View mode"
    >
      <button
        v-for="mode in viewModes"
        :key="mode.id"
        type="button"
        role="radio"
        :aria-checked="store.viewMode === mode.id"
        class="flex h-6 items-center gap-1.5 rounded px-2 text-[12px] transition-colors"
        :class="
          store.viewMode === mode.id
            ? 'bg-n-bg text-n-text shadow-[0_1px_2px_rgba(15,15,15,0.1),0_0_0_1px_var(--n-border)]'
            : 'text-n-muted hover:text-n-text'
        "
        @click="store.setViewMode(mode.id)"
      >
        <span :class="mode.icon" class="h-3.5 w-3.5"></span>
        {{ mode.label }}
      </button>
    </div>

    <button
      type="button"
      class="n-btn n-btn-icon md:hidden"
      aria-label="Cycle view mode"
      @click="
        store.setViewMode(
          store.viewMode === 'split' ? 'canvas' : store.viewMode === 'canvas' ? 'docs' : 'split'
        )
      "
    >
      <span :class="viewModes.find(m => m.id === store.viewMode)?.icon" class="h-4 w-4"></span>
    </button>

    <div class="mx-0.5 hidden h-4 w-px bg-n-border sm:block"></div>

    <button
      type="button"
      class="n-btn n-btn-icon"
      aria-label="Reset camera"
      title="Reset camera (R)"
      :disabled="store.viewMode === 'docs'"
      @click="store.resetCamera()"
    >
      <span class="i-lucide-scan h-4 w-4"></span>
    </button>
    <button
      type="button"
      class="n-btn n-btn-icon"
      :aria-label="store.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
      :title="store.theme === 'dark' ? 'Light mode' : 'Dark mode'"
      @click="store.toggleTheme()"
    >
      <span
        :class="store.theme === 'dark' ? 'i-lucide-sun' : 'i-lucide-moon'"
        class="h-4 w-4"
      ></span>
    </button>
  </header>
</template>
