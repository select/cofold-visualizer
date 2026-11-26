<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    side: 'left' | 'right'
    open: boolean
    surface?: 'sidebar' | 'bg'
    label: string
  }>(),
  {
    surface: 'sidebar',
  }
)

const emit = defineEmits<{
  toggle: []
}>()

const iconClass = computed(() => {
  if (props.side === 'left') {
    return props.open ? 'i-lucide-chevron-left' : 'i-lucide-chevron-right'
  }
  return props.open ? 'i-lucide-chevron-right' : 'i-lucide-chevron-left'
})

const fillVar = computed(() => (props.surface === 'sidebar' ? 'var(--n-sidebar)' : 'var(--n-bg)'))
</script>

<template>
  <button
    type="button"
    class="group absolute top-1/2 z-30 flex h-[68px] w-[18px] -translate-y-1/2 cursor-pointer items-center justify-center border-0 bg-transparent p-0 focus-visible:outline-none"
    :aria-label="label"
    :aria-expanded="open"
    :title="label"
    @pointerdown.stop
    @click="emit('toggle')"
  >
    <svg
      viewBox="0 0 18 68"
      width="18"
      height="68"
      aria-hidden="true"
      class="pointer-events-none block h-full w-full"
      :class="side === 'right' && 'scale-x-[-1]'"
    >
      <path
        d="M 0 0 C 0 11, 16.5 13, 16.5 23 L 16.5 45 C 16.5 55, 0 57, 0 68 Z"
        class="transition-[fill] duration-150 ease-out group-hover:[fill:var(--n-hover-solid)] group-focus-visible:[fill:var(--n-hover-solid)]"
        :style="{ fill: fillVar }"
      />
      <path
        d="M 0 0 C 0 11, 16.5 13, 16.5 23 L 16.5 45 C 16.5 55, 0 57, 0 68"
        fill="none"
        stroke="var(--n-border)"
        stroke-width="1"
        class="transition-[stroke] duration-150 ease-out group-focus-visible:[stroke:var(--n-accent)]"
      />
    </svg>
    <span
      :class="[iconClass, side === 'left' ? '-ml-0.5' : '-mr-0.5']"
      class="pointer-events-none absolute h-3.5 w-3.5 text-n-faint transition-colors duration-150 group-hover:text-n-text group-focus-visible:text-n-text"
    ></span>
  </button>
</template>
