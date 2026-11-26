<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import CodeSnippetViewer from '~/components/notion/CodeSnippetViewer.vue'
import CifOutputExamples from '~/components/notion/CifOutputExamples.vue'
import InputSourceExamples from '~/components/notion/InputSourceExamples.vue'
import NotionToggle from '~/components/notion/NotionToggle.vue'
import { useVisualizerStore } from '~/stores/useVisualizerStore'
import type {
  InputSourceId,
  InputSourceSpec,
  OutputSpec,
  TensorBlock3D,
  WalkthroughStep,
} from '~/types/architecture'

const props = withDefaults(defineProps<{ centered?: boolean }>(), { centered: false })

const store = useVisualizerStore()
const scrollRef = ref<HTMLElement | null>(null)

const step = computed<WalkthroughStep | null>(() => store.activeStep)
const block = computed<TensorBlock3D | null>(() => store.selectedBlock)
const inputSource = computed<InputSourceSpec | null>(() => store.selectedInputSource)
const outputSpec = computed<OutputSpec | null>(() => store.selectedOutput)

const outputSourceBlocks = computed<TensorBlock3D[]>(() => {
  if (!outputSpec.value) return []
  return outputSpec.value.sourceBlockIds
    .map(id => blockById.value.get(id))
    .filter((b): b is TensorBlock3D => Boolean(b))
})

const inputSourceTargetBlock = computed<TensorBlock3D | null>(() => {
  if (!inputSource.value) return null
  return blockById.value.get(inputSource.value.targetBlockId) ?? null
})

const blockInputExampleMode = computed<InputSourceId | null>(() => {
  const id = block.value?.id
  if (id === 'input-features') return 'dna-sequence'
  if (id === 'ref-conformers') return 'small-molecule'
  if (id === 'msa-embedder') return 'msa-a3m'
  return null
})

const blockById = computed(() => {
  const map = new Map<string, TensorBlock3D>()
  for (const b of store.activeModel.blocks) map.set(b.id, b)
  return map
})

const relatedBlocks = computed<TensorBlock3D[]>(() => {
  if (!step.value) return []
  return step.value.focusBlockIds
    .map(id => blockById.value.get(id))
    .filter((b): b is TensorBlock3D => Boolean(b))
})

const prevStep = computed(() => store.activeModel.steps[store.activeStepIndex - 1] ?? null)
const nextStepInfo = computed(() => store.activeModel.steps[store.activeStepIndex + 1] ?? null)

const blockChapters = computed<WalkthroughStep[]>(() => {
  const b = block.value
  if (!b) return []
  return store.activeModel.steps.filter(s => s.focusBlockIds.includes(b.id))
})

const blockNeighbours = computed(() => {
  const b = block.value
  if (!b) return { inputs: [], outputs: [] }
  const edges = store.activeModel.edges
  const pick = (ids: string[]) =>
    [...new Set(ids)]
      .map(id => blockById.value.get(id))
      .filter((x): x is TensorBlock3D => Boolean(x))
  return {
    inputs: pick(edges.filter(e => e.to === b.id).map(e => e.from)),
    outputs: pick(edges.filter(e => e.from === b.id).map(e => e.to)),
  }
})

const blockParams = computed(() => Object.entries(block.value?.params ?? {}))

const calloutToneClass: Record<string, string> = {
  neutral: 'text-n-muted',
  blue: 'text-[#337ea9] dark:text-[#5aa6d1]',
  purple: 'text-[#9065b0] dark:text-[#b18bd0]',
  green: 'text-[#448361] dark:text-[#6aae86]',
  amber: 'text-[#cb912f] dark:text-[#d9a74a]',
}

function categoryLabel(cat: string): string {
  return cat.charAt(0).toUpperCase() + cat.slice(1)
}

function formatSourcePath(path: string): string {
  const parts = path.split('/').filter(Boolean)
  if (parts.length <= 2) return path
  return `…/${parts.slice(-2).join('/')}`
}

watch(
  () => [
    store.activeStepIndex,
    store.selectedBlockId,
    store.selectedInputSourceId,
    store.selectedOutputId,
  ],
  async () => {
    await nextTick()
    scrollRef.value?.scrollTo({ top: 0 })
  }
)
</script>

<template>
  <section class="relative flex h-full min-h-0 flex-col bg-n-bg" aria-live="polite">
    <!-- Chapter progress -->
    <div class="h-[2px] w-full shrink-0 bg-n-border/60">
      <div
        class="h-full bg-n-text/70 transition-[width] duration-300 ease-out"
        :style="{ width: `${store.progressPercent}%` }"
      ></div>
    </div>

    <div ref="scrollRef" class="min-h-0 flex-1 overflow-y-auto">
      <article
        class="mx-auto w-full px-6 pb-16 pt-8 sm:px-10"
        :class="props.centered ? 'max-w-3xl sm:pt-16' : 'max-w-[720px]'"
      >
        <!-- ============ OUTPUT INSPECTOR ============ -->
        <template v-if="outputSpec">
          <button
            type="button"
            class="mb-6 inline-flex items-center gap-1.5 rounded-full border border-n-border px-2.5 py-1 text-[12px] text-n-muted transition-colors hover:bg-n-hover hover:text-n-text"
            @click="store.selectOutput(null)"
          >
            <span class="i-lucide-arrow-left h-3.5 w-3.5"></span>
            Back to chapter
            <span v-if="step" class="max-w-[200px] truncate text-n-faint">· {{ step.title }}</span>
          </button>

          <div
            class="mb-3 grid h-[52px] w-[52px] place-items-center rounded-lg border border-n-border"
          >
            <span
              class="h-6 w-6 rounded-[5px] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]"
              :style="{ backgroundColor: outputSpec.color }"
            ></span>
          </div>
          <h1 class="text-[32px] font-bold leading-[1.2] tracking-[-0.01em] text-n-text">
            {{ outputSpec.label }}
          </h1>
          <p class="mt-1.5 text-[15px] text-n-muted">
            {{ outputSpec.subtitle }}
          </p>

          <dl class="mt-6 border-y border-n-border py-2 text-[14px]">
            <div class="flex min-h-[34px] items-start py-1">
              <dt class="flex w-[150px] shrink-0 items-center gap-2 pt-[3px] text-n-muted">
                <span class="i-lucide-file-text h-3.5 w-3.5"></span>Format
              </dt>
              <dd class="pt-[2px]">
                <code class="n-code n-code-neutral">{{ outputSpec.formatBadge }}</code>
              </dd>
            </div>
            <div v-if="outputSourceBlocks.length" class="flex min-h-[34px] items-start py-1">
              <dt class="flex w-[150px] shrink-0 items-center gap-2 pt-[3px] text-n-muted">
                <span class="i-lucide-arrow-left h-3.5 w-3.5"></span>Produced by
              </dt>
              <dd class="flex flex-wrap gap-1.5 pt-[2px]">
                <button
                  v-for="src in outputSourceBlocks"
                  :key="src.id"
                  type="button"
                  class="inline-flex items-center gap-1.5 rounded-md border border-n-border px-2 py-0.5 text-[13px] text-n-text hover:bg-n-hover"
                  @click="store.selectBlock(src.id)"
                  @mouseenter="store.hoverBlock(src.id)"
                  @mouseleave="store.hoverBlock(null)"
                >
                  <span class="h-2 w-2 rounded-sm" :style="{ backgroundColor: src.color }"></span>
                  {{ src.label }}
                </button>
              </dd>
            </div>
          </dl>

          <p class="mt-6 text-[16px] leading-[1.7] text-n-text">{{ outputSpec.description }}</p>

          <CifOutputExamples v-if="outputSpec.id === 'cif-structure'" />
        </template>

        <!-- ============ INPUT SOURCE INSPECTOR ============ -->
        <template v-else-if="inputSource">
          <button
            type="button"
            class="mb-6 inline-flex items-center gap-1.5 rounded-full border border-n-border px-2.5 py-1 text-[12px] text-n-muted transition-colors hover:bg-n-hover hover:text-n-text"
            @click="store.selectInputSource(null)"
          >
            <span class="i-lucide-arrow-left h-3.5 w-3.5"></span>
            Back to chapter
            <span v-if="step" class="max-w-[200px] truncate text-n-faint">· {{ step.title }}</span>
          </button>

          <div
            class="mb-3 grid h-[52px] w-[52px] place-items-center rounded-lg border border-n-border"
          >
            <span
              class="h-6 w-6 rounded-[5px] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]"
              :style="{ backgroundColor: inputSource.color }"
            ></span>
          </div>
          <h1 class="text-[32px] font-bold leading-[1.2] tracking-[-0.01em] text-n-text">
            {{ inputSource.label }}
          </h1>
          <p class="mt-1.5 text-[15px] text-n-muted">
            {{ inputSource.subtitle }}
          </p>

          <dl class="mt-6 border-y border-n-border py-2 text-[14px]">
            <div class="flex min-h-[34px] items-start py-1">
              <dt class="flex w-[150px] shrink-0 items-center gap-2 pt-[3px] text-n-muted">
                <span class="i-lucide-file-text h-3.5 w-3.5"></span>Format
              </dt>
              <dd class="pt-[2px]">
                <code class="n-code n-code-neutral">{{ inputSource.formatBadge }}</code>
              </dd>
            </div>
            <div v-if="inputSourceTargetBlock" class="flex min-h-[34px] items-start py-1">
              <dt class="flex w-[150px] shrink-0 items-center gap-2 pt-[3px] text-n-muted">
                <span class="i-lucide-arrow-right h-3.5 w-3.5"></span>Feeds into
              </dt>
              <dd class="pt-[2px]">
                <button
                  type="button"
                  class="inline-flex items-center gap-1.5 rounded-md border border-n-border px-2 py-0.5 text-[13px] text-n-text hover:bg-n-hover"
                  @click="store.selectBlock(inputSourceTargetBlock.id)"
                  @mouseenter="store.hoverBlock(inputSourceTargetBlock.id)"
                  @mouseleave="store.hoverBlock(null)"
                >
                  <span
                    class="h-2 w-2 rounded-sm"
                    :style="{ backgroundColor: inputSourceTargetBlock.color }"
                  ></span>
                  {{ inputSourceTargetBlock.label }}
                </button>
              </dd>
            </div>
          </dl>

          <p class="mt-6 text-[16px] leading-[1.7] text-n-text">{{ inputSource.description }}</p>

          <InputSourceExamples :mode="inputSource.id" />
        </template>

        <!-- ============ BLOCK INSPECTOR ============ -->
        <template v-else-if="block">
          <button
            type="button"
            class="mb-6 inline-flex items-center gap-1.5 rounded-full border border-n-border px-2.5 py-1 text-[12px] text-n-muted transition-colors hover:bg-n-hover hover:text-n-text"
            @click="store.selectBlock(null)"
          >
            <span class="i-lucide-arrow-left h-3.5 w-3.5"></span>
            Back to chapter
            <span v-if="step" class="max-w-[200px] truncate text-n-faint">· {{ step.title }}</span>
          </button>

          <div
            class="mb-3 grid h-[52px] w-[52px] place-items-center rounded-lg border border-n-border"
          >
            <span
              class="h-6 w-6 rounded-[5px] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]"
              :style="{ backgroundColor: block.color }"
            ></span>
          </div>
          <h1 class="text-[32px] font-bold leading-[1.2] tracking-[-0.01em] text-n-text">
            {{ block.label }}
          </h1>
          <p class="mt-1.5 text-[15px] text-n-muted">
            {{ block.shortLabel }} · {{ categoryLabel(block.category) }} tensor
          </p>

          <!-- In-place detail mode toggle -->
          <div
            v-if="block.detailedSpec"
            class="mt-5 rounded-lg border border-n-border bg-[var(--n-callout-neutral)] p-3.5"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex items-center gap-2">
                <span class="i-lucide-cpu h-4 w-4 text-n-muted"></span>
                <span class="text-[13px] font-medium text-n-text">3D View mode</span>
              </div>
              <div
                class="flex items-center rounded-md bg-n-hover p-0.5"
                role="radiogroup"
                aria-label="Block 3D view mode"
              >
                <button
                  type="button"
                  role="radio"
                  :aria-checked="!store.isBlockExpanded(block.id)"
                  class="flex h-6 items-center gap-1.5 rounded px-2 text-[12px] transition-colors"
                  :class="
                    !store.isBlockExpanded(block.id)
                      ? 'bg-n-bg text-n-text shadow-[0_1px_2px_rgba(15,15,15,0.1),0_0_0_1px_var(--n-border)]'
                      : 'text-n-muted hover:text-n-text'
                  "
                  @click="store.setBlockExpanded(block.id, false)"
                >
                  <span class="i-lucide-layers h-3.5 w-3.5"></span>
                  Simplified
                </button>
                <button
                  type="button"
                  role="radio"
                  :aria-checked="store.isBlockExpanded(block.id)"
                  class="flex h-6 items-center gap-1.5 rounded px-2 text-[12px] transition-colors"
                  :class="
                    store.isBlockExpanded(block.id)
                      ? 'bg-n-bg text-n-text shadow-[0_1px_2px_rgba(15,15,15,0.1),0_0_0_1px_var(--n-border)]'
                      : 'text-n-muted hover:text-n-text'
                  "
                  @click="store.setBlockExpanded(block.id, true)"
                >
                  <span class="i-lucide-cpu h-3.5 w-3.5"></span>
                  Detailed Internals
                </button>
              </div>
            </div>
            <div class="mt-2.5 flex flex-wrap gap-1.5">
              <span
                v-for="stage in block.detailedSpec.subStages"
                :key="stage"
                class="n-pill n-mono !text-[11px]"
              >
                {{ stage }}
              </span>
            </div>
          </div>

          <!-- Properties -->
          <dl class="mt-6 border-y border-n-border py-2 text-[14px]">
            <div class="flex min-h-[34px] items-start py-1">
              <dt class="flex w-[150px] shrink-0 items-center gap-2 pt-[3px] text-n-muted">
                <span class="i-lucide-box h-3.5 w-3.5"></span>Shape
              </dt>
              <dd class="min-w-0 whitespace-normal break-words pt-[2px]">
                <code class="n-code n-code-neutral !whitespace-normal break-words">{{
                  block.shape
                }}</code>
              </dd>
            </div>
            <div class="flex min-h-[34px] items-start py-1">
              <dt class="flex w-[150px] shrink-0 items-center gap-2 pt-[3px] text-n-muted">
                <span class="i-lucide-tag h-3.5 w-3.5"></span>Category
              </dt>
              <dd class="flex items-center gap-1.5 pt-[3px] text-n-text">
                <span class="h-2 w-2 rounded-full" :style="{ backgroundColor: block.color }"></span>
                {{ categoryLabel(block.category) }}
                <span class="text-n-faint">· {{ block.matrixStyle }}</span>
              </dd>
            </div>
            <div class="flex min-h-[34px] items-start py-1">
              <dt class="flex w-[150px] shrink-0 items-center gap-2 pt-[3px] text-n-muted">
                <span class="i-lucide-ruler h-3.5 w-3.5"></span>Dimensions
              </dt>
              <dd class="flex min-w-0 flex-wrap gap-1 pt-[3px]">
                <span v-for="d in block.dims" :key="d" class="n-pill n-mono !text-[11px]">{{
                  d
                }}</span>
              </dd>
            </div>
            <div
              v-for="[key, value] in blockParams"
              :key="key"
              class="flex min-h-[34px] items-start py-1"
            >
              <dt class="flex w-[150px] shrink-0 items-center gap-2 pt-[3px] text-n-muted">
                <span class="i-lucide-hash h-3.5 w-3.5"></span>
                <span class="n-mono truncate text-[12px]">{{ key }}</span>
              </dt>
              <dd class="n-mono pt-[3px] text-[13px] text-n-text">{{ value }}</dd>
            </div>
            <div v-if="block.codeRef" class="flex min-h-[34px] items-start py-1">
              <dt class="flex w-[150px] shrink-0 items-center gap-2 pt-[3px] text-n-muted">
                <span class="i-lucide-code-2 h-3.5 w-3.5"></span>Source
              </dt>
              <dd class="min-w-0 flex-1 pt-[2px]">
                <a
                  :href="block.codeRef.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  :title="block.codeRef.file"
                  class="group inline-flex max-w-full items-center gap-1 text-n-text underline decoration-n-border underline-offset-3 hover:decoration-n-muted"
                >
                  <span class="n-mono truncate text-[12.5px]">{{
                    formatSourcePath(block.codeRef.file)
                  }}</span>
                  <span class="i-lucide-arrow-up-right h-3.5 w-3.5 shrink-0 text-n-muted"></span>
                </a>
                <p v-if="block.codeRef.symbol" class="mt-0.5 text-[12px] text-n-muted">
                  <code class="n-code">{{ block.codeRef.symbol }}</code>
                </p>
              </dd>
            </div>
          </dl>

          <CodeSnippetViewer v-if="block.codeRef?.snippet?.length" :code-ref="block.codeRef" />

          <p class="mt-6 text-[16px] leading-[1.7] text-n-text">{{ block.description }}</p>

          <div
            v-if="block.formula"
            class="mt-5 overflow-x-auto rounded-md border border-n-border bg-[var(--n-callout-neutral)] px-5 py-4"
          >
            <p class="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-n-faint">
              Equation
            </p>
            <code class="n-mono block whitespace-pre-wrap break-words text-[13.5px] text-n-text">{{
              block.formula
            }}</code>
          </div>

          <InputSourceExamples v-if="blockInputExampleMode" :mode="blockInputExampleMode" />

          <template v-if="blockNeighbours.inputs.length || blockNeighbours.outputs.length">
            <h3 class="mt-9 text-[18px] font-semibold text-n-text">Data flow</h3>
            <div class="mt-2 space-y-2 text-[14px]">
              <div v-if="blockNeighbours.inputs.length" class="flex flex-wrap items-center gap-1.5">
                <span class="w-16 text-n-muted">Reads</span>
                <button
                  v-for="b in blockNeighbours.inputs"
                  :key="b.id"
                  type="button"
                  class="inline-flex items-center gap-1.5 rounded-md border border-n-border px-2 py-1 text-[13px] text-n-text hover:bg-n-hover"
                  @click="store.selectBlock(b.id)"
                  @mouseenter="store.hoverBlock(b.id)"
                  @mouseleave="store.hoverBlock(null)"
                >
                  <span class="h-2 w-2 rounded-sm" :style="{ backgroundColor: b.color }"></span>
                  {{ b.shortLabel }}
                </button>
              </div>
              <div
                v-if="blockNeighbours.outputs.length"
                class="flex flex-wrap items-center gap-1.5"
              >
                <span class="w-16 text-n-muted">Feeds</span>
                <button
                  v-for="b in blockNeighbours.outputs"
                  :key="b.id"
                  type="button"
                  class="inline-flex items-center gap-1.5 rounded-md border border-n-border px-2 py-1 text-[13px] text-n-text hover:bg-n-hover"
                  @click="store.selectBlock(b.id)"
                  @mouseenter="store.hoverBlock(b.id)"
                  @mouseleave="store.hoverBlock(null)"
                >
                  <span class="h-2 w-2 rounded-sm" :style="{ backgroundColor: b.color }"></span>
                  {{ b.shortLabel }}
                </button>
              </div>
            </div>
          </template>

          <template v-if="blockChapters.length">
            <h3 class="mt-9 text-[18px] font-semibold text-n-text">Appears in chapters</h3>
            <ul class="mt-1.5">
              <li v-for="s in blockChapters" :key="s.id">
                <button
                  type="button"
                  class="n-row w-full !px-1.5 text-left !text-n-text"
                  @click="store.goToStep(s.index)"
                >
                  <span :class="s.icon" class="h-4 w-4 text-n-muted"></span>
                  <span class="underline decoration-n-border underline-offset-3">{{
                    s.title
                  }}</span>
                  <span class="ml-auto text-[12px] tabular-nums text-n-faint"
                    >Step {{ s.index + 1 }}</span
                  >
                </button>
              </li>
            </ul>
          </template>
        </template>

        <!-- ============ WALKTHROUGH CHAPTER ============ -->
        <template v-else-if="step">
          <p class="mb-5 flex items-center gap-2 text-[12px] text-n-muted">
            <span>{{ step.chapterGroup }}</span>
            <span class="text-n-faint">·</span>
            <span class="tabular-nums">Step {{ step.index + 1 }} of {{ store.totalSteps }}</span>
          </p>

          <div class="mb-3 grid h-[52px] w-[52px] place-items-center rounded-lg bg-n-hover">
            <span :class="step.icon" class="h-7 w-7 text-n-text"></span>
          </div>
          <h1 class="text-[32px] font-bold leading-[1.2] tracking-[-0.01em] text-n-text">
            {{ step.title }}
          </h1>
          <p class="mt-1.5 text-[15px] text-n-muted">{{ step.subtitle }}</p>

          <!-- Property table -->
          <dl
            v-if="step.properties.length || step.codeRef"
            class="mt-6 border-y border-n-border py-2 text-[14px]"
          >
            <div
              v-for="prop in step.properties"
              :key="prop.label"
              class="flex min-h-[34px] items-start py-1"
            >
              <dt class="flex w-[150px] shrink-0 items-center gap-2 pt-[3px] text-n-muted">
                <span class="i-lucide-list h-3.5 w-3.5"></span>
                <span class="truncate">{{ prop.label }}</span>
              </dt>
              <dd class="min-w-0 whitespace-normal break-words pt-[2px] text-n-text">
                <code
                  v-if="prop.mono"
                  class="n-code n-code-neutral !whitespace-normal break-words"
                  >{{ prop.value }}</code
                >
                <span v-else>{{ prop.value }}</span>
              </dd>
            </div>
            <div v-if="step.codeRef" class="flex min-h-[34px] items-start py-1">
              <dt class="flex w-[150px] shrink-0 items-center gap-2 pt-[3px] text-n-muted">
                <span class="i-lucide-code-2 h-3.5 w-3.5"></span>Source
              </dt>
              <dd class="min-w-0 pt-[2px]">
                <a
                  :href="step.codeRef.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  :title="step.codeRef.file"
                  class="inline-flex max-w-full items-center gap-1 text-n-text underline decoration-n-border underline-offset-3 hover:decoration-n-muted"
                >
                  <span class="i-mdi-github h-3.5 w-3.5 shrink-0 text-n-muted"></span>
                  <span class="n-mono truncate text-[12.5px]">{{
                    formatSourcePath(step.codeRef.file)
                  }}</span>
                  <span class="i-lucide-arrow-up-right h-3.5 w-3.5 shrink-0 text-n-muted"></span>
                </a>
              </dd>
            </div>
          </dl>

          <!-- Callout -->
          <div class="n-callout mt-6" :data-tone="step.callout.tone">
            <span
              :class="[step.callout.icon, calloutToneClass[step.callout.tone]]"
              class="mt-[2px] h-5 w-5 shrink-0"
            ></span>
            <p class="text-[15px] leading-[1.6] text-n-text">{{ step.callout.text }}</p>
          </div>

          <p class="mt-5 text-[16px] leading-[1.7] text-n-text">{{ step.summary }}</p>

          <div
            v-if="step.formula"
            class="mt-5 overflow-x-auto rounded-md border border-n-border bg-[var(--n-callout-neutral)] px-5 py-4"
          >
            <p class="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-n-faint">
              Equation
            </p>
            <code class="n-mono block whitespace-pre-wrap break-words text-[13.5px] text-n-text">{{
              step.formula
            }}</code>
          </div>

          <div v-if="step.details.length" class="mt-6">
            <NotionToggle
              v-for="(detail, i) in step.details"
              :key="`${step.id}-${i}`"
              :title="detail.title"
            >
              {{ detail.body }}
            </NotionToggle>
          </div>

          <template v-if="relatedBlocks.length">
            <h3 class="mt-9 flex items-center gap-2 text-[18px] font-semibold text-n-text">
              Related 3D blocks
              <span class="text-[12px] font-normal text-n-faint">click to inspect</span>
            </h3>
            <div class="mt-2.5 flex flex-wrap gap-1.5">
              <div
                v-for="b in relatedBlocks"
                :key="b.id"
                class="group inline-flex items-center rounded-md border border-n-border transition-colors hover:bg-n-hover"
              >
                <button
                  type="button"
                  class="inline-flex items-center gap-1.5 px-2 py-1 text-[13px] text-n-text"
                  :title="b.shape"
                  @click="store.selectBlock(b.id)"
                  @mouseenter="store.hoverBlock(b.id)"
                  @mouseleave="store.hoverBlock(null)"
                >
                  <span class="h-2 w-2 rounded-sm" :style="{ backgroundColor: b.color }"></span>
                  {{ b.shortLabel }}
                  <span class="n-mono hidden text-[11px] text-n-faint group-hover:inline">{{
                    b.shape
                  }}</span>
                </button>
                <button
                  v-if="b.detailedSpec"
                  type="button"
                  class="flex h-full items-center border-l border-n-border px-1.5 text-n-muted transition-colors hover:text-n-text"
                  :class="store.isBlockExpanded(b.id) && 'bg-n-active text-n-text'"
                  :title="
                    store.isBlockExpanded(b.id)
                      ? `Simplify ${b.shortLabel}`
                      : `Expand ${b.shortLabel} internals in 3D`
                  "
                  :aria-label="
                    store.isBlockExpanded(b.id)
                      ? `Simplify ${b.shortLabel}`
                      : `Expand ${b.shortLabel} internals`
                  "
                  @click.stop="store.toggleBlockExpanded(b.id)"
                >
                  <span
                    :class="store.isBlockExpanded(b.id) ? 'i-lucide-cpu' : 'i-lucide-layers'"
                    class="h-3.5 w-3.5"
                  ></span>
                </button>
              </div>
            </div>
          </template>
        </template>

        <div v-else class="py-24 text-center text-n-muted">
          <span class="i-lucide-file-question mx-auto mb-3 block h-8 w-8 text-n-faint"></span>
          This model has no walkthrough yet.
        </div>
      </article>
    </div>

    <!-- Sticky chapter footer -->
    <footer
      v-if="step && !block"
      class="shrink-0 border-t border-n-border bg-n-bg/95 px-4 py-3 backdrop-blur sm:px-6"
    >
      <div
        class="mx-auto grid grid-cols-2 gap-2"
        :class="props.centered ? 'max-w-3xl' : 'max-w-[720px]'"
      >
        <button
          type="button"
          class="group flex min-w-0 flex-col items-start rounded-md border border-n-border px-3 py-2 text-left transition-colors hover:bg-n-hover disabled:pointer-events-none disabled:opacity-40"
          :disabled="!prevStep"
          @click="store.prevStep()"
        >
          <span class="flex items-center gap-1 text-[11px] text-n-muted">
            <span class="i-lucide-arrow-left h-3 w-3"></span>Previous
          </span>
          <span class="w-full truncate text-[13px] text-n-text">{{
            prevStep?.title ?? 'Start'
          }}</span>
        </button>
        <button
          type="button"
          class="group flex min-w-0 flex-col items-end rounded-md border border-n-border px-3 py-2 text-right transition-colors hover:bg-n-hover disabled:pointer-events-none disabled:opacity-40"
          :disabled="!nextStepInfo"
          @click="store.nextStep()"
        >
          <span class="flex items-center gap-1 text-[11px] text-n-muted">
            Next<span class="i-lucide-arrow-right h-3 w-3"></span>
          </span>
          <span class="w-full truncate text-[13px] text-n-text">{{
            nextStepInfo?.title ?? 'End of walkthrough'
          }}</span>
        </button>
      </div>
      <p class="mt-2 hidden text-center text-[11px] text-n-faint sm:block">
        Press <kbd class="n-kbd">Space</kbd> or <kbd class="n-kbd">→</kbd> to continue
      </p>
    </footer>
  </section>
</template>
