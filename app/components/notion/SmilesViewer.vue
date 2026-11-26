<script setup lang="ts">
import SmilesDrawer from 'smiles-drawer'
import { computed, onMounted, ref, useId, watch } from 'vue'
import { useVisualizerStore } from '~/stores/useVisualizerStore'

const props = withDefaults(
  defineProps<{
    smilesString: string
    height?: number
  }>(),
  { height: 190 }
)

const store = useVisualizerStore()
const svgId = `smiles-svg-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
const parseError = ref<string | null>(null)

const drawerTheme = computed(() => (store.theme === 'dark' ? 'dark' : 'light'))

function renderSmiles() {
  const trimmed = props.smilesString?.trim()
  if (!trimmed) {
    parseError.value = 'Enter a SMILES string to preview its 2D chemical structure.'
    return
  }

  const svgEl = document.getElementById(svgId)
  if (svgEl) {
    svgEl.innerHTML = ''
  }

  const svgDrawer = new SmilesDrawer.SvgDrawer({
    height: props.height,
    width: 340,
    bondThickness: 1.4,
    fontSizeLarge: 9,
    fontSizeSmall: 6,
  })

  SmilesDrawer.parse(
    trimmed,
    tree => {
      parseError.value = null
      svgDrawer.draw(tree, svgId, drawerTheme.value)
    },
    (error: unknown) => {
      parseError.value = error instanceof Error ? error.message : 'Invalid SMILES syntax'
    }
  )
}

onMounted(() => {
  renderSmiles()
})

watch(
  () => [props.smilesString, drawerTheme.value, props.height],
  () => {
    renderSmiles()
  }
)
</script>

<template>
  <div class="relative flex flex-col items-center justify-center">
    <svg
      :id="svgId"
      :height="height"
      class="w-full max-w-[360px]"
      :class="{ hidden: !smilesString?.trim() || Boolean(parseError) }"
      role="img"
      :aria-label="`2D molecular structure for ${smilesString}`"
    />
    <p v-if="parseError" class="py-6 text-center text-[12px] text-n-muted">
      {{ parseError }}
    </p>
  </div>
</template>
