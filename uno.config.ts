import {
  defineConfig,
  presetIcons,
  presetTypography,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss'
import presetWind4 from '@unocss/preset-wind4'

export default defineConfig({
  presets: [
    presetWind4(),
    presetIcons({
      scale: 1.2,
      warn: true,
      collections: {
        lucide: () => import('@iconify-json/lucide/icons.json').then(i => i.default),
        mdi: () => import('@iconify-json/mdi/icons.json').then(i => i.default),
      },
    }),
    presetTypography(),
  ],
  theme: {
    colors: {
      n: {
        bg: 'var(--n-bg)',
        canvas: 'var(--n-canvas)',
        sidebar: 'var(--n-sidebar)',
        hover: 'var(--n-hover)',
        active: 'var(--n-active)',
        border: 'var(--n-border)',
        text: 'var(--n-text)',
        muted: 'var(--n-text-muted)',
        faint: 'var(--n-text-faint)',
        accent: 'var(--n-accent)',
        code: 'var(--n-code-bg)',
        codeink: 'var(--n-code-text)',
      },
    },
    font: {
      sans: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Helvetica, Arial, sans-serif",
      mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    },
  },
  content: {
    pipeline: {
      // Step & callout icons live as class strings inside the model specs (.ts).
      include: [/\.(vue|[jt]sx?|mdx?|html)($|\?)/],
    },
  },
  transformers: [transformerDirectives(), transformerVariantGroup()],
})
