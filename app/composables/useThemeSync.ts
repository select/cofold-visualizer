import { onMounted, watch } from 'vue'
import { useVisualizerStore } from '~/stores/useVisualizerStore'
import type { VisualizerTheme } from '~/stores/useVisualizerStore'

export const THEME_STORAGE_KEY = 'cofold-theme'

function readStoredTheme(): VisualizerTheme | null {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY)
    return value === 'dark' || value === 'light' ? value : null
  } catch {
    return null
  }
}

function applyTheme(theme: VisualizerTheme) {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.style.backgroundColor = theme === 'dark' ? '#191919' : '#ffffff'
}

/** Keeps `store.theme`, the `<html class="dark">` flag and localStorage in sync. */
export function useThemeSync() {
  const store = useVisualizerStore()

  onMounted(() => {
    const stored = readStoredTheme()
    if (stored) store.setTheme(stored)
    applyTheme(store.theme)

    watch(
      () => store.theme,
      theme => {
        applyTheme(theme)
        try {
          localStorage.setItem(THEME_STORAGE_KEY, theme)
        } catch {
          // storage unavailable (private mode) — theme still applies for this session
        }
      }
    )
  })
}
