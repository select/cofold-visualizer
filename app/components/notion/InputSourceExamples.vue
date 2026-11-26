<script setup lang="ts">
import { computed, ref } from 'vue'
import SmilesViewer from '~/components/notion/SmilesViewer.vue'
import {
  A3M_EXAMPLE_ENTRIES,
  DNA_TRANSLATION_CODONS,
  SMILES_PRESETS,
  type CodonTranslation,
} from '~/models/inputExamples'
import type { InputSourceId } from '~/types/architecture'

const props = defineProps<{
  mode: InputSourceId
}>()

const showDnaTranslation = computed(
  () => props.mode === 'dna-sequence' || props.mode === 'protein-sequence'
)
const showSmiles = computed(() => props.mode === 'small-molecule')
const showA3m = computed(() => props.mode === 'msa-a3m')

// DNA -> AA interactive codon selection
const selectedCodonIndex = ref<number>(1)
const selectedCodon = computed<CodonTranslation>(
  () =>
    DNA_TRANSLATION_CODONS.find(c => c.index === selectedCodonIndex.value) ??
    DNA_TRANSLATION_CODONS[0]!
)

// SMILES state
const selectedPresetId = ref<string>(SMILES_PRESETS[0]!.id)
const customSmiles = ref<string>(SMILES_PRESETS[0]!.smiles)
const smilesDropdownOpen = ref(false)

const activePreset = computed(
  () => SMILES_PRESETS.find(p => p.id === selectedPresetId.value) ?? null
)

function selectPreset(id: string) {
  const preset = SMILES_PRESETS.find(p => p.id === id)
  if (!preset) return
  selectedPresetId.value = preset.id
  customSmiles.value = preset.smiles
  smilesDropdownOpen.value = false
}

function smilesPreview(smiles: string, maxLen = 22): string {
  return smiles.length > maxLen ? `${smiles.slice(0, maxLen)}…` : smiles
}

// A3M copy helper
const a3mCopied = ref(false)
const rawA3mText = computed(() =>
  A3M_EXAMPLE_ENTRIES.map(e => `${e.header}\n${e.sequence}`).join('\n')
)

async function copyA3m() {
  try {
    await navigator.clipboard.writeText(rawA3mText.value)
    a3mCopied.value = true
    setTimeout(() => {
      a3mCopied.value = false
    }, 1500)
  } catch {
    // ignore clipboard errors in restricted contexts
  }
}

interface A3mToken {
  char: string
  kind: 'match' | 'insertion' | 'gap'
}

function tokenizeA3mSeq(seq: string): A3mToken[] {
  return [...seq].map(char => {
    if (char === '-') return { char, kind: 'gap' }
    if (char >= 'a' && char <= 'z') return { char, kind: 'insertion' }
    return { char, kind: 'match' }
  })
}
</script>

<template>
  <div class="mt-6 space-y-4">
    <!-- ============ DNA -> AA SEQUENCE TRANSLATION ============ -->
    <section
      v-if="showDnaTranslation"
      class="overflow-hidden rounded-lg border border-n-border bg-[var(--n-callout-neutral)]"
    >
      <div
        class="flex flex-wrap items-center justify-between gap-2 border-b border-n-border px-4 py-2.5"
      >
        <div class="flex items-center gap-2">
          <span class="i-lucide-dna h-4 w-4 text-[#3b82f6]"></span>
          <h3 class="text-[13.5px] font-semibold text-n-text">
            DNA → mRNA → Amino Acid Translation
          </h3>
        </div>
        <span class="n-pill n-mono !text-[11px]">24 nt → 8 AA tokens</span>
      </div>

      <div class="space-y-3 p-4">
        <!-- 5'->3' DNA / Complement / Protein strip -->
        <div class="overflow-x-auto">
          <div class="inline-flex min-w-full gap-1.5">
            <button
              v-for="codon in DNA_TRANSLATION_CODONS"
              :key="codon.index"
              type="button"
              class="flex min-w-[54px] flex-1 flex-col items-center rounded-md border px-1.5 py-2 text-center transition-colors"
              :class="
                selectedCodonIndex === codon.index
                  ? 'border-n-text/40 bg-n-bg shadow-[0_1px_2px_rgba(15,15,15,0.08)]'
                  : 'border-n-border/70 bg-n-bg/40 hover:bg-n-hover'
              "
              @click="selectedCodonIndex = codon.index"
            >
              <span class="n-mono text-[10px] text-n-faint">#{{ codon.index }}</span>
              <span class="n-mono mt-0.5 text-[12px] font-semibold tracking-wider text-[#3b82f6]">
                {{ codon.dnaCodon }}
              </span>
              <span class="n-mono text-[10px] text-n-faint">{{ codon.complementCodon }}</span>
              <span class="my-1 h-px w-5 bg-n-border"></span>
              <span
                class="inline-flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-bold text-white"
                :style="{ backgroundColor: codon.color }"
              >
                {{ codon.aa1 }}
              </span>
              <span class="n-mono mt-0.5 text-[10.5px] text-n-muted">{{ codon.aa3 }}</span>
            </button>
          </div>
        </div>

        <!-- Selected codon detail bar -->
        <div
          class="flex flex-wrap items-center justify-between gap-2 rounded-md border border-n-border bg-n-bg px-3 py-2 text-[12.5px]"
        >
          <div class="flex flex-wrap items-center gap-2">
            <span
              class="h-2.5 w-2.5 rounded-full"
              :style="{ backgroundColor: selectedCodon.color }"
            ></span>
            <span class="font-medium text-n-text">{{ selectedCodon.name }}</span>
            <span class="n-pill n-mono !text-[11px]">
              DNA {{ selectedCodon.dnaCodon }} → mRNA {{ selectedCodon.rnaCodon }} →
              {{ selectedCodon.aa3 }} ({{ selectedCodon.aa1 }})
            </span>
          </div>
          <span class="n-mono text-[11px] capitalize text-n-muted">
            {{ selectedCodon.group }} · token {{ selectedCodon.index }}
          </span>
        </div>

        <p class="text-[12.5px] leading-[1.55] text-n-muted">
          Resulting polypeptide:
          <code class="n-code n-code-neutral">
            {{ DNA_TRANSLATION_CODONS.map(c => c.aa1).join('') }}
          </code>
          — each residue maps to a 32-class <code class="n-code">restype</code> one-hot vector
          inside <code class="n-code">f_token ∈ ℝ^{N_token × 65}</code>.
        </p>
      </div>
    </section>

    <!-- ============ SMILES + 2D STRUCTURE VISUALIZATION ============ -->
    <section
      v-if="showSmiles"
      class="overflow-hidden rounded-lg border border-n-border bg-[var(--n-callout-neutral)]"
    >
      <div
        class="flex flex-wrap items-center justify-between gap-2 border-b border-n-border px-4 py-2.5"
      >
        <div class="flex items-center gap-2">
          <span class="i-lucide-hexagon h-4 w-4 text-[#0ea5e9]"></span>
          <h3 class="text-[13.5px] font-semibold text-n-text">Ligand SMILES & 2D Structure</h3>
        </div>
        <span v-if="activePreset" class="n-pill n-mono !text-[11px]">
          {{ activePreset.formula }}
        </span>
      </div>

      <div class="space-y-3 p-4">
        <!-- Editable SMILES input with expandable known molecules list -->
        <div class="relative">
          <div class="mb-1 flex items-center justify-between">
            <label class="text-[11px] font-medium uppercase tracking-wide text-n-faint">
              SMILES String
            </label>
            <button
              type="button"
              class="inline-flex items-center gap-1 text-[11px] text-n-muted hover:text-n-text"
              @mousedown.prevent="smilesDropdownOpen = !smilesDropdownOpen"
            >
              <span>Known molecules ({{ SMILES_PRESETS.length }})</span>
              <span
                :class="smilesDropdownOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                class="h-3 w-3"
              ></span>
            </button>
          </div>
          <input
            v-model="customSmiles"
            type="text"
            spellcheck="false"
            aria-label="SMILES string"
            class="n-mono w-full rounded-md border border-n-border bg-n-bg px-3 py-1.5 text-[12.5px] text-n-text outline-none focus:border-[#0ea5e9]"
            placeholder="Click to pick a molecule or enter SMILES…"
            @focus="smilesDropdownOpen = true"
            @click="smilesDropdownOpen = true"
            @blur="smilesDropdownOpen = false"
            @keydown.escape="smilesDropdownOpen = false"
          />

          <div
            v-if="smilesDropdownOpen"
            class="mt-1.5 max-h-[240px] overflow-y-auto rounded-md border border-n-border bg-n-bg shadow-[0_8px_24px_rgba(15,15,15,0.12)]"
            role="listbox"
            aria-label="Known small molecules with medical use"
          >
            <button
              v-for="preset in SMILES_PRESETS"
              :key="preset.id"
              type="button"
              role="option"
              :aria-selected="customSmiles.trim() === preset.smiles"
              class="flex w-full items-center justify-between gap-3 border-b border-n-border/60 px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-n-hover"
              :class="{ 'bg-n-active/60': customSmiles.trim() === preset.smiles }"
              @mousedown.prevent="selectPreset(preset.id)"
            >
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5">
                  <span class="truncate text-[12.5px] font-medium text-n-text">
                    {{ preset.name }}
                  </span>
                  <span class="n-mono shrink-0 text-[10.5px] text-n-faint">
                    {{ preset.formula }}
                  </span>
                </div>
                <p class="truncate text-[11px] text-n-muted">
                  {{ preset.medicalUse }}
                </p>
              </div>
              <code
                class="n-mono shrink-0 rounded bg-n-hover px-1.5 py-0.5 text-[11px] text-n-muted"
              >
                {{ smilesPreview(preset.smiles) }}
              </code>
            </button>
          </div>
        </div>

        <!-- 2D SMILES SVG viewer (smiles-drawer) -->
        <div class="rounded-md border border-n-border bg-n-bg p-3">
          <SmilesViewer :smiles-string="customSmiles" :height="185" />
        </div>

        <p
          v-if="activePreset && customSmiles.trim() === activePreset.smiles"
          class="text-[12.5px] text-n-muted"
        >
          {{ activePreset.note }}
        </p>
      </div>
    </section>

    <!-- ============ .A3M FILE EXAMPLE ============ -->
    <section
      v-if="showA3m"
      class="overflow-hidden rounded-lg border border-n-border bg-[var(--n-callout-neutral)]"
    >
      <div
        class="flex flex-wrap items-center justify-between gap-2 border-b border-n-border px-4 py-2.5"
      >
        <div class="flex items-center gap-2">
          <span class="i-lucide-file-code-2 h-4 w-4 text-[#06b6d4]"></span>
          <h3 class="text-[13.5px] font-semibold text-n-text">
            Example <code class="n-code">.a3m</code> Alignment File
          </h3>
        </div>
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded border border-n-border bg-n-bg px-2 py-0.5 text-[11.5px] text-n-muted transition-colors hover:bg-n-hover hover:text-n-text"
          @click="copyA3m"
        >
          <span
            :class="a3mCopied ? 'i-lucide-check text-[#22c55e]' : 'i-lucide-copy'"
            class="h-3 w-3"
          ></span>
          {{ a3mCopied ? 'Copied' : 'Copy .a3m' }}
        </button>
      </div>

      <div class="space-y-3 p-4">
        <div class="overflow-x-auto rounded-md border border-n-border bg-n-bg p-3">
          <div v-for="entry in A3M_EXAMPLE_ENTRIES" :key="entry.header" class="mb-2 last:mb-0">
            <div
              class="n-mono text-[11.5px]"
              :class="entry.isQuery ? 'font-semibold text-[#06b6d4]' : 'text-n-faint'"
            >
              {{ entry.header }}
            </div>
            <div class="n-mono mt-0.5 whitespace-pre text-[12.5px] tracking-wide">
              <span
                v-for="(tok, idx) in tokenizeA3mSeq(entry.sequence)"
                :key="idx"
                :class="
                  tok.kind === 'insertion'
                    ? 'rounded-[2px] bg-[#f59e0b]/20 px-[1px] font-semibold text-[#d97706] dark:text-[#fbbf24]'
                    : tok.kind === 'gap'
                      ? 'text-n-faint'
                      : entry.isQuery
                        ? 'font-semibold text-n-text'
                        : 'text-n-text/85'
                "
                >{{ tok.char }}</span
              >
            </div>
          </div>
        </div>

        <div class="flex flex-wrap gap-2 text-[11.5px] text-n-muted">
          <span class="n-pill">
            <strong class="n-mono text-n-text">A-Z</strong>&nbsp;Match column (aligned to N_token)
          </span>
          <span class="n-pill">
            <strong class="n-mono text-[#d97706] dark:text-[#fbbf24]">a-z</strong>&nbsp;Insertion →
            deletion_mean
          </span>
          <span class="n-pill">
            <strong class="n-mono text-n-faint">-</strong>&nbsp;Deletion gap
          </span>
        </div>

        <p class="text-[12.5px] leading-[1.55] text-n-muted">
          Typically generated by
          <a
            href="https://github.com/sokrypton/colabfold"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1 font-medium text-n-text underline decoration-n-border underline-offset-3 hover:decoration-n-muted"
          >
            ColabFold
            <span class="i-lucide-arrow-up-right h-3 w-3 text-n-muted"></span>
          </a>
          , which uses fast MMseqs2 homology searches against UniRef and environmental databases to
          build <code class="n-code">.a3m</code> alignments for structure prediction.
        </p>
      </div>
    </section>
  </div>
</template>
