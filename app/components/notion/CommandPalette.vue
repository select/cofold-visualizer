<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useVisualizerStore } from '~/stores/useVisualizerStore'
import { scoreFields } from '~/utils/search'

interface PaletteItem {
  key: string
  kind: 'chapter' | 'block'
  title: string
  subtitle: string
  meta: string
  icon?: string
  color?: string
  run: () => void
  score: number
}

const store = useVisualizerStore()
const query = ref('')
const activeIndex = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)
const listRef = ref<HTMLElement | null>(null)

function close() {
  store.setCommandPaletteOpen(false)
}

const results = computed<{ chapters: PaletteItem[]; blocks: PaletteItem[] }>(() => {
  const q = query.value
  const model = store.activeModel

  const chapters: PaletteItem[] = model.steps
    .map(step => ({
      key: `step-${step.id}`,
      kind: 'chapter' as const,
      title: step.title,
      subtitle: step.subtitle,
      meta: `Step ${step.index + 1}`,
      icon: step.icon,
      run: () => {
        store.goToStep(step.index)
        if (store.viewMode === 'canvas') store.setViewMode('split')
      },
      score: scoreFields(q, [
        { text: step.title, weight: 3 },
        { text: step.subtitle, weight: 1.5 },
        { text: step.chapterGroup, weight: 1.2 },
        { text: step.summary, weight: 0.6 },
      ]),
    }))
    .filter(item => item.score > 0)

  const blocks: PaletteItem[] = model.blocks
    .map(block => ({
      key: `block-${block.id}`,
      kind: 'block' as const,
      title: block.label,
      subtitle: block.description,
      meta: block.shape,
      color: block.color,
      run: () => {
        store.selectBlock(block.id)
        if (store.viewMode === 'canvas') store.setViewMode('split')
      },
      score: scoreFields(q, [
        { text: block.label, weight: 3 },
        { text: block.shortLabel, weight: 2.5 },
        { text: block.shape, weight: 2 },
        { text: block.category, weight: 1.5 },
        { text: block.description, weight: 0.6 },
      ]),
    }))
    .filter(item => item.score > 0)

  if (q.trim()) {
    chapters.sort((a, b) => b.score - a.score)
    blocks.sort((a, b) => b.score - a.score)
  }
  return { chapters, blocks }
})

const flat = computed(() => [...results.value.chapters, ...results.value.blocks])

watch(query, () => {
  activeIndex.value = 0
})

watch(
  () => store.commandPaletteOpen,
  async open => {
    if (open) {
      query.value = ''
      activeIndex.value = 0
      await nextTick()
      inputRef.value?.focus()
    }
  }
)

function scrollActiveIntoView() {
  nextTick(() => {
    const el = listRef.value?.querySelector<HTMLElement>(`[data-index="${activeIndex.value}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  })
}

function runItem(item: PaletteItem | undefined) {
  if (!item) return
  item.run()
  close()
}

function onKeydown(event: KeyboardEvent) {
  const total = flat.value.length
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    if (total) activeIndex.value = (activeIndex.value + 1) % total
    scrollActiveIntoView()
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    if (total) activeIndex.value = (activeIndex.value - 1 + total) % total
    scrollActiveIntoView()
  } else if (event.key === 'Enter') {
    event.preventDefault()
    runItem(flat.value[activeIndex.value])
  } else if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    close()
  }
}

function indexOf(item: PaletteItem): number {
  return flat.value.indexOf(item)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="n-fade">
      <div
        v-if="store.commandPaletteOpen"
        class="fixed inset-0 z-50 flex items-start justify-center bg-[rgba(15,15,15,0.45)] px-4 pt-[12vh]"
        @mousedown.self="close"
      >
        <div
          class="n-surface-float flex max-h-[min(560px,72vh)] w-full max-w-[620px] flex-col overflow-hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Search chapters and tensor blocks"
        >
          <div class="flex items-center gap-2.5 border-b border-n-border px-4">
            <span class="i-lucide-search h-4 w-4 shrink-0 text-n-muted"></span>
            <input
              ref="inputRef"
              v-model="query"
              type="text"
              class="h-12 w-full bg-transparent text-[15px] text-n-text outline-none placeholder:text-n-faint"
              placeholder="Search chapters, tensors, shapes…"
              role="combobox"
              aria-expanded="true"
              aria-controls="n-palette-list"
              :aria-activedescendant="flat[activeIndex]?.key"
              autocomplete="off"
              spellcheck="false"
              @keydown="onKeydown"
            />
            <kbd class="n-kbd">Esc</kbd>
          </div>

          <div
            id="n-palette-list"
            ref="listRef"
            class="min-h-0 flex-1 overflow-y-auto p-1.5"
            role="listbox"
          >
            <template v-for="section in ['chapters', 'blocks'] as const" :key="section">
              <template v-if="results[section].length">
                <p class="px-2.5 pb-1 pt-2 text-[11px] font-medium text-n-muted">
                  {{ section === 'chapters' ? 'Walkthrough chapters' : '3D tensor blocks' }}
                </p>
                <button
                  v-for="item in results[section]"
                  :id="item.key"
                  :key="item.key"
                  type="button"
                  role="option"
                  :aria-selected="indexOf(item) === activeIndex"
                  :data-index="indexOf(item)"
                  class="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left"
                  :class="indexOf(item) === activeIndex && 'bg-n-hover'"
                  @mousemove="activeIndex = indexOf(item)"
                  @click="runItem(item)"
                >
                  <span
                    class="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-n-border bg-n-bg"
                  >
                    <span v-if="item.icon" :class="item.icon" class="h-4 w-4 text-n-muted"></span>
                    <span
                      v-else
                      class="h-2.5 w-2.5 rounded-sm"
                      :style="{ backgroundColor: item.color }"
                    ></span>
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-[14px] text-n-text">{{ item.title }}</span>
                    <span class="block truncate text-[12px] text-n-muted">{{ item.subtitle }}</span>
                  </span>
                  <span
                    class="max-w-[180px] shrink-0 truncate text-[11px] text-n-faint"
                    :class="item.kind === 'block' && 'n-mono'"
                    >{{ item.meta }}</span
                  >
                </button>
              </template>
            </template>

            <div v-if="flat.length === 0" class="px-3 py-10 text-center text-[13px] text-n-muted">
              No results for “{{ query }}”
            </div>
          </div>

          <div
            class="flex items-center gap-4 border-t border-n-border px-4 py-2 text-[11px] text-n-muted"
          >
            <span class="flex items-center gap-1"
              ><kbd class="n-kbd">↑</kbd><kbd class="n-kbd">↓</kbd> Navigate</span
            >
            <span class="flex items-center gap-1"><kbd class="n-kbd">↵</kbd> Open</span>
            <span class="ml-auto">{{ flat.length }} results</span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
