<script setup lang="ts">
import { computed, ref } from 'vue'
import { parseMmCif, PLDDT_COLORS } from '~/engine/cifRibbon'
import { CIF_PRESETS, getCifPresetById } from '~/models/cifExamples'
import { useVisualizerStore } from '~/stores/useVisualizerStore'

const store = useVisualizerStore()

const dropdownOpen = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)
const loadError = ref<string | null>(null)

const activePreset = computed(() =>
  store.selectedCifId === 'custom' ? null : (getCifPresetById(store.selectedCifId) ?? null)
)

const displayLabel = computed(() => {
  if (store.selectedCifId === 'custom') {
    return store.customCifName || 'Custom mmCIF file'
  }
  return activePreset.value
    ? `${activePreset.value.pdbId} — ${activePreset.value.name}`
    : 'Select a structure…'
})

const parsedStats = computed(() => {
  const parsed = parseMmCif(store.cifText)
  const residues = parsed.segments.flat()
  const chains = [...new Set(residues.map(r => r.chainId))]
  const helices = residues.filter(r => r.kind === 'H').length
  const sheets = residues.filter(r => r.kind === 'E').length
  const ligandNames = [...new Set(parsed.ligandAtoms.map(a => a.compId))]
  return {
    chains,
    residueCount: residues.length,
    helices,
    sheets,
    ligandCount: parsed.ligandAtoms.length,
    bondCount: parsed.ligandBonds.length,
    ligandNames,
  }
})

function selectPreset(id: string) {
  loadError.value = null
  store.selectCifPreset(id)
  dropdownOpen.value = false
}

function triggerFileUpload() {
  fileInputRef.value?.click()
}

async function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  loadError.value = null
  try {
    const text = await file.text()
    const parsed = parseMmCif(text)
    if (parsed.segments.length === 0 && parsed.ligandAtoms.length === 0) {
      loadError.value = 'No polymer backbone or ligand atoms found in this file.'
      return
    }
    store.loadCustomCif(file.name, text)
    dropdownOpen.value = false
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : 'Failed to read .cif file'
  } finally {
    input.value = ''
  }
}
</script>

<template>
  <section
    class="mt-8 overflow-hidden rounded-lg border border-n-border bg-[var(--n-callout-neutral)]"
  >
    <div
      class="flex flex-wrap items-center justify-between gap-2 border-b border-n-border px-4 py-2.5"
    >
      <div class="flex items-center gap-2">
        <span class="i-lucide-box h-4 w-4 text-[#ea580c]"></span>
        <h3 class="text-[13.5px] font-semibold text-n-text">3D Structure (.cif) Loader</h3>
      </div>
      <div class="flex items-center gap-2">
        <span v-if="activePreset" class="n-pill n-mono !text-[11px]">
          {{ activePreset.pdbId }}
        </span>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md border border-n-border bg-n-bg px-2.5 py-1 text-[11.5px] font-medium text-n-text transition-colors hover:bg-n-hover"
          @click="triggerFileUpload"
        >
          <span class="i-lucide-upload h-3 w-3"></span>
          Load .cif file…
        </button>
        <input
          ref="fileInputRef"
          type="file"
          accept=".cif,.mmcif"
          class="hidden"
          aria-label="Upload mmCIF file"
          @change="handleFileChange"
        />
      </div>
    </div>

    <div class="space-y-3 p-4">
      <!-- Click-to-select mmCIF preset dropdown (mirrors SMILES selector) -->
      <div class="relative">
        <div class="mb-1 flex items-center justify-between">
          <label class="text-[11px] font-medium uppercase tracking-wide text-n-faint">
            Loaded Structure
          </label>
          <button
            type="button"
            class="inline-flex items-center gap-1 text-[11px] text-n-muted hover:text-n-text"
            @mousedown.prevent="dropdownOpen = !dropdownOpen"
          >
            <span>Example structures ({{ CIF_PRESETS.length }})</span>
            <span
              :class="dropdownOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
              class="h-3 w-3"
            ></span>
          </button>
        </div>

        <button
          type="button"
          class="flex w-full items-center justify-between gap-2 rounded-md border border-n-border bg-n-bg px-3 py-2 text-left text-[12.5px] text-n-text transition-colors hover:bg-n-hover focus:border-[#ea580c] focus:outline-none"
          aria-haspopup="listbox"
          :aria-expanded="dropdownOpen"
          @click="dropdownOpen = !dropdownOpen"
          @blur="dropdownOpen = false"
          @keydown.escape="dropdownOpen = false"
        >
          <span class="truncate font-medium">{{ displayLabel }}</span>
          <span
            :class="dropdownOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
            class="h-3.5 w-3.5 shrink-0 text-n-muted"
          ></span>
        </button>

        <div
          v-if="dropdownOpen"
          class="mt-1.5 max-h-[240px] overflow-y-auto rounded-md border border-n-border bg-n-bg shadow-[0_8px_24px_rgba(15,15,15,0.12)]"
          role="listbox"
          aria-label="Example mmCIF structures"
        >
          <button
            v-for="preset in CIF_PRESETS"
            :key="preset.id"
            type="button"
            role="option"
            :aria-selected="store.selectedCifId === preset.id"
            class="flex w-full items-center justify-between gap-3 border-b border-n-border/60 px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-n-hover"
            :class="{ 'bg-n-active/60': store.selectedCifId === preset.id }"
            @mousedown.prevent="selectPreset(preset.id)"
          >
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5">
                <span class="truncate text-[12.5px] font-medium text-n-text">
                  {{ preset.name }}
                </span>
              </div>
              <p class="truncate text-[11px] text-n-muted">
                {{ preset.subtitle }}
              </p>
            </div>
            <code class="n-mono shrink-0 rounded bg-n-hover px-1.5 py-0.5 text-[11px] text-n-muted">
              {{ preset.pdbId }}.cif
            </code>
          </button>
        </div>
      </div>

      <p v-if="loadError" class="text-[12px] text-red-500">
        {{ loadError }}
      </p>

      <!-- Parsed structure summary -->
      <div class="grid grid-cols-2 gap-2 rounded-md border border-n-border bg-n-bg p-3 text-[12px]">
        <div>
          <span class="text-n-faint">Chains:</span>
          <span class="n-mono ml-1 font-medium text-n-text">
            {{ parsedStats.chains.join(', ') || '—' }}
          </span>
        </div>
        <div>
          <span class="text-n-faint">Residues:</span>
          <span class="n-mono ml-1 font-medium text-n-text">{{ parsedStats.residueCount }}</span>
        </div>
        <div>
          <span class="text-n-faint">Helices / Sheets:</span>
          <span class="n-mono ml-1 font-medium text-n-text">
            {{ parsedStats.helices }} / {{ parsedStats.sheets }}
          </span>
        </div>
        <div>
          <span class="text-n-faint">Ligand:</span>
          <span class="n-mono ml-1 font-medium text-n-text">
            {{
              parsedStats.ligandCount > 0
                ? `${parsedStats.ligandNames.join(', ')} (${parsedStats.ligandCount} atoms, ${parsedStats.bondCount} bonds)`
                : 'None'
            }}
          </span>
        </div>
      </div>

      <!-- pLDDT color legend -->
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-n-muted">
        <span class="font-medium text-n-faint">pLDDT:</span>
        <span class="inline-flex items-center gap-1">
          <span
            class="h-2.5 w-2.5 rounded-sm"
            :style="{ backgroundColor: PLDDT_COLORS.veryHigh }"
          ></span>
          &gt; 90
        </span>
        <span class="inline-flex items-center gap-1">
          <span
            class="h-2.5 w-2.5 rounded-sm"
            :style="{ backgroundColor: PLDDT_COLORS.confident }"
          ></span>
          70–90
        </span>
        <span class="inline-flex items-center gap-1">
          <span
            class="h-2.5 w-2.5 rounded-sm"
            :style="{ backgroundColor: PLDDT_COLORS.low }"
          ></span>
          50–70
        </span>
        <span class="inline-flex items-center gap-1">
          <span
            class="h-2.5 w-2.5 rounded-sm"
            :style="{ backgroundColor: PLDDT_COLORS.veryLow }"
          ></span>
          &lt; 50
        </span>
      </div>

      <p v-if="activePreset" class="text-[12.5px] text-n-muted">
        {{ activePreset.note }}
      </p>
    </div>
  </section>
</template>
