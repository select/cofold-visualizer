<script setup lang="ts">
import { useThemeSync } from '~/composables/useThemeSync'

useThemeSync()
</script>

<template>
  <div class="h-screen w-screen overflow-hidden bg-n-bg text-n-text font-sans">
    <slot />
  </div>
</template>
