<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { MODELS } from '~/models/registry'
import { useVisualizerStore } from '~/stores/useVisualizerStore'
import type { WalkthroughStep } from '~/types/architecture'

const emit = defineEmits<{ navigate: [] }>()

const store = useVisualizerStore()

const switcherOpen = ref(false)
const switcherRef = ref<HTMLElement | null>(null)
onClickOutside(switcherRef, () => {
  switcherOpen.value = false
})

const isMac = ref(true)
onMounted(() => {
  isMac.value = /Mac|iPhone|iPad/.test(navigator.userAgent)
})

const groups = computed(() => {
  const map = new Map<string, WalkthroughStep[]>()
  for (const step of store.activeModel.steps) {
    const list = map.get(step.chapterGroup) ?? []
    list.push(step)
    map.set(step.chapterGroup, list)
  }
  return [...map.entries()].map(([name, steps]) => ({ name, steps }))
})

const collapsedGroups = reactive<Record<string, boolean>>({})
const blocksOpen = ref(false)
const chaptersOpen = ref(true)

function selectModel(id: string, available: boolean) {
  if (!available) return
  store.setModel(id)
  switcherOpen.value = false
}

function openStep(index: number) {
  store.goToStep(index)
  if (store.viewMode === 'canvas') store.setViewMode('split')
  emit('navigate')
}

function inspectBlock(id: string) {
  store.selectBlock(id)
  if (store.viewMode === 'canvas') store.setViewMode('split')
  emit('navigate')
}
</script>

<template>
  <aside class="flex h-full w-[260px] flex-col bg-n-sidebar border-r border-n-border select-none">
    <!-- Workspace / model switcher -->
    <div ref="switcherRef" class="relative px-2 pt-2">
      <button
        type="button"
        class="n-row w-full !text-n-text"
        :aria-expanded="switcherOpen"
        aria-haspopup="listbox"
        @click="switcherOpen = !switcherOpen"
      >
        <span
          class="grid h-5 w-5 shrink-0 place-items-center rounded bg-n-text text-[11px] font-semibold text-n-bg"
        >
          {{ store.activeModel.shortName.charAt(0) }}
        </span>
        <span class="truncate text-sm font-medium">{{ store.activeModel.name }}</span>
        <span class="n-pill !h-[18px] !px-1.5 !text-[10px]">{{
          store.activeModel.version.split('·')[0]?.trim()
        }}</span>
        <span class="i-lucide-chevrons-up-down ml-auto h-3.5 w-3.5 text-n-faint"></span>
      </button>

      <Transition name="n-pop">
        <div
          v-if="switcherOpen"
          class="n-surface-float absolute left-2 right-2 top-[calc(100%+4px)] z-30 p-1"
          role="listbox"
        >
          <p class="px-2 pb-1 pt-1.5 text-[11px] font-medium text-n-muted">Co-folding models</p>
          <button
            v-for="model in MODELS"
            :key="model.id"
            type="button"
            role="option"
            :aria-selected="model.id === store.activeModelId"
            :aria-disabled="model.status !== 'available'"
            class="n-row w-full text-left"
            :class="
              model.status !== 'available' && 'cursor-default! opacity-70 hover:bg-transparent!'
            "
            @click="selectModel(model.id, model.status === 'available')"
          >
            <span
              class="grid h-6 w-6 shrink-0 place-items-center rounded border border-n-border bg-n-bg text-[11px] font-semibold text-n-text"
            >
              {{ model.shortName.charAt(0) }}
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-[13px] text-n-text">{{ model.name }}</span>
              <span class="block truncate text-[11px] text-n-muted">{{ model.tagline }}</span>
            </span>
            <span v-if="model.status !== 'available'" class="n-pill !h-[18px] !text-[10px]"
              >Soon</span
            >
            <span
              v-else-if="model.id === store.activeModelId"
              class="i-lucide-check h-3.5 w-3.5 text-n-text"
            ></span>
          </button>
        </div>
      </Transition>
    </div>

    <!-- Quick find -->
    <div class="px-2 pt-1">
      <button type="button" class="n-row w-full" @click="store.setCommandPaletteOpen(true)">
        <span class="i-lucide-search h-4 w-4"></span>
        <span class="text-[13px]">Search</span>
        <span class="ml-auto flex gap-0.5">
          <kbd class="n-kbd">{{ isMac ? '⌘' : 'Ctrl' }}</kbd>
          <kbd class="n-kbd">K</kbd>
        </span>
      </button>
    </div>

    <nav class="mt-3 min-h-0 flex-1 overflow-y-auto px-2 pb-4" aria-label="Walkthrough chapters">
      <!-- Chapters -->
      <button
        type="button"
        class="group flex w-full items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-n-muted hover:bg-n-hover"
        @click="chaptersOpen = !chaptersOpen"
      >
        <span>Walkthrough</span>
        <span class="ml-1 tabular-nums text-n-faint"
          >{{ store.activeStepIndex + 1 }}/{{ store.totalSteps }}</span
        >
        <span
          class="i-lucide-chevron-right ml-auto h-3 w-3 opacity-0 transition-transform group-hover:opacity-100"
          :class="chaptersOpen && 'rotate-90'"
        ></span>
      </button>

      <div class="n-collapse" :data-open="chaptersOpen">
        <div>
          <div v-for="group in groups" :key="group.name" class="mt-1">
            <button
              type="button"
              class="group flex w-full items-center gap-1 rounded px-2 py-[3px] text-left text-[12px] text-n-faint hover:bg-n-hover hover:text-n-muted"
              @click="collapsedGroups[group.name] = !collapsedGroups[group.name]"
            >
              <span
                class="i-lucide-chevron-right h-3 w-3 shrink-0 transition-transform duration-150"
                :class="!collapsedGroups[group.name] && 'rotate-90'"
              ></span>
              <span class="truncate">{{ group.name }}</span>
            </button>
            <div class="n-collapse" :data-open="!collapsedGroups[group.name]">
              <ul>
                <li v-for="step in group.steps" :key="step.id">
                  <button
                    type="button"
                    class="n-row w-full pl-5 text-left"
                    :data-active="step.index === store.activeStepIndex && !store.selectedBlockId"
                    :aria-current="step.index === store.activeStepIndex ? 'step' : undefined"
                    @click="openStep(step.index)"
                  >
                    <span :class="step.icon" class="h-4 w-4 shrink-0 opacity-80"></span>
                    <span class="min-w-0 flex-1 truncate text-[13px]">{{ step.title }}</span>
                    <span
                      v-if="step.index < store.activeStepIndex"
                      class="h-1.5 w-1.5 shrink-0 rounded-full bg-[#4dab9a]"
                      title="Visited"
                    ></span>
                    <span class="w-4 shrink-0 text-right text-[11px] tabular-nums text-n-faint">{{
                      step.index + 1
                    }}</span>
                  </button>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <!-- Architecture blocks -->
      <button
        type="button"
        class="group mt-4 flex w-full items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-n-muted hover:bg-n-hover"
        @click="blocksOpen = !blocksOpen"
      >
        <span>Architecture blocks</span>
        <span class="ml-1 tabular-nums text-n-faint">{{ store.activeModel.blocks.length }}</span>
        <span
          class="i-lucide-chevron-right ml-auto h-3 w-3 transition-transform"
          :class="[blocksOpen && 'rotate-90', !blocksOpen && 'opacity-0 group-hover:opacity-100']"
        ></span>
      </button>
      <div class="n-collapse" :data-open="blocksOpen">
        <ul>
          <li v-for="block in store.activeModel.blocks" :key="block.id">
            <button
              type="button"
              class="n-row w-full text-left"
              :data-active="store.selectedBlockId === block.id"
              :title="`${block.label} · ${block.shape}`"
              @click="inspectBlock(block.id)"
              @mouseenter="store.hoverBlock(block.id)"
              @mouseleave="store.hoverBlock(null)"
            >
              <span
                class="h-2 w-2 shrink-0 rounded-sm"
                :style="{ backgroundColor: block.color }"
              ></span>
              <span class="min-w-0 flex-1 truncate text-[13px]">{{ block.shortLabel }}</span>
              <span class="text-[10px] text-n-faint">{{ block.category }}</span>
            </button>
          </li>
        </ul>
      </div>
    </nav>

    <!-- Footer -->
    <div class="border-t border-n-border px-2 py-2">
      <a
        :href="store.activeModel.repoUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="n-row text-[13px]"
      >
        <span class="i-mdi-github h-4 w-4"></span>
        <span class="truncate">aqlaboratory/openfold-3</span>
        <span class="i-lucide-arrow-up-right ml-auto h-3.5 w-3.5 text-n-faint"></span>
      </a>
      <a
        :href="store.activeModel.paperUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="n-row text-[13px]"
      >
        <span class="i-lucide-file-text h-4 w-4"></span>
        <span class="truncate">Read the paper</span>
        <span class="i-lucide-arrow-up-right ml-auto h-3.5 w-3.5 text-n-faint"></span>
      </a>
    </div>
  </aside>
</template>
