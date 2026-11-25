<script setup lang="ts">
import { ref, useId } from 'vue'

const props = withDefaults(defineProps<{ title: string; defaultOpen?: boolean }>(), {
  defaultOpen: false,
})

const open = ref(props.defaultOpen)
const contentId = useId()
</script>

<template>
  <div class="py-[3px]">
    <button
      type="button"
      class="group flex w-full items-start gap-1 rounded py-[3px] pr-2 text-left hover:bg-n-hover"
      :aria-expanded="open"
      :aria-controls="contentId"
      @click="open = !open"
    >
      <span class="grid h-6 w-6 shrink-0 place-items-center">
        <span
          class="block h-0 w-0 border-y-[4.5px] border-l-[7px] border-y-transparent border-l-n-text transition-transform duration-150"
          :class="open && 'rotate-90'"
        ></span>
      </span>
      <span class="pt-[1px] text-[15px] font-medium leading-6 text-n-text">{{ props.title }}</span>
    </button>
    <div :id="contentId" class="n-collapse" :data-open="open">
      <div>
        <div class="pb-1 pl-7 pr-2 pt-0.5 text-[15px] leading-[1.65] text-n-text">
          <slot />
        </div>
      </div>
    </div>
  </div>
</template>
