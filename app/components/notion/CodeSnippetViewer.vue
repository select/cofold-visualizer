<script setup lang="ts">
import { computed } from 'vue'
import type { CodeRef } from '~/types/architecture'

const props = defineProps<{
  codeRef: CodeRef
}>()

interface CodeLine {
  num: number
  text: string
  active: boolean
}

const codeLines = computed<CodeLine[]>(() => {
  const before = props.codeRef.contextBefore ?? []
  const snippet = props.codeRef.snippet ?? []
  const after = props.codeRef.contextAfter ?? []
  const start = props.codeRef.startLine ?? 1
  const firstNum = Math.max(1, start - before.length)

  const lines: CodeLine[] = []
  let idx = 0
  for (const text of before) {
    lines.push({ num: firstNum + idx++, text, active: false })
  }
  for (const text of snippet) {
    lines.push({ num: firstNum + idx++, text, active: true })
  }
  for (const text of after) {
    lines.push({ num: firstNum + idx++, text, active: false })
  }
  return lines
})

interface MinimapSeg {
  w: number
  cls: string
}

interface MinimapRow {
  indent: number
  segs: MinimapSeg[]
  active: boolean
}

function tokenSegClass(cls: string): string {
  if (cls.includes('purple')) return 'bg-purple-500/80 dark:bg-purple-400/85'
  if (cls.includes('emerald')) return 'bg-emerald-500/80 dark:bg-emerald-400/85'
  if (cls.includes('amber-600') || cls.includes('amber-300')) {
    return 'bg-amber-500/80 dark:bg-amber-300/85'
  }
  if (cls.includes('amber')) return 'bg-amber-600/75 dark:bg-amber-200/80'
  if (cls.includes('rose')) return 'bg-rose-500/80 dark:bg-rose-400/85'
  if (cls.includes('sky')) return 'bg-sky-500/80 dark:bg-sky-400/85'
  if (cls.includes('italic')) return 'bg-n-faint/55'
  return 'bg-n-muted/65'
}

function lineToMinimapRow(text: string, active: boolean): MinimapRow {
  const leading = Math.max(0, text.search(/\S|$/))
  const trimmed = text.trim()
  if (!trimmed) return { indent: 0, segs: [], active }

  const segs: MinimapSeg[] = []
  for (const tok of tokenizePython(trimmed)) {
    if (/^\s+$/.test(tok.text)) continue
    const w = Math.min(24, Math.max(1.5, tok.text.length * 1.15))
    segs.push({ w, cls: tokenSegClass(tok.cls) })
    if (segs.length >= 6) break
  }
  return {
    indent: Math.min(34, leading * 2.1),
    segs,
    active,
  }
}

function synthMinimapRows(count: number, seedOffset: number): MinimapRow[] {
  const palette = [
    'bg-purple-500/75 dark:bg-purple-400/80',
    'bg-sky-500/75 dark:bg-sky-400/80',
    'bg-n-muted/60',
    'bg-emerald-500/75 dark:bg-emerald-400/80',
    'bg-amber-500/75 dark:bg-amber-300/80',
    'bg-rose-500/75 dark:bg-rose-400/80',
  ]
  const rows: MinimapRow[] = []
  for (let i = 0; i < count; i++) {
    const r = Math.abs(Math.sin((i + seedOffset) * 12.9898) * 43758.5453)
    const frac = r - Math.floor(r)
    if (i % 9 === 5 || frac < 0.14) {
      rows.push({ indent: 0, segs: [], active: false })
      continue
    }
    const indent = i % 9 === 0 ? 0 : i % 3 === 0 ? 8 : 16
    const segCount = 2 + Math.floor(frac * 4)
    const segs: MinimapSeg[] = []
    for (let s = 0; s < segCount; s++) {
      const sr = Math.abs(Math.sin((i * 7 + s * 13 + seedOffset) * 78.233) * 19341.123)
      const sf = sr - Math.floor(sr)
      segs.push({
        w: 2 + Math.round(sf * 12),
        cls: palette[(i + s + seedOffset) % palette.length]!,
      })
    }
    rows.push({ indent, segs, active: false })
  }
  return rows
}

const TOP_PAD_COUNT = 34
const BOT_PAD_COUNT = 40

const minimapRows = computed<MinimapRow[]>(() => {
  const seed = props.codeRef.startLine ?? 17
  const top = synthMinimapRows(TOP_PAD_COUNT, seed)
  const real = codeLines.value.map(line => lineToMinimapRow(line.text, line.active))
  const bot = synthMinimapRows(BOT_PAD_COUNT, seed + 101)
  return [...top, ...real, ...bot]
})

const activeRange = computed(() => {
  const beforeLen = props.codeRef.contextBefore?.length ?? 0
  const snippetLen = props.codeRef.snippet?.length ?? 0
  const totalRows = minimapRows.value.length
  if (totalRows === 0 || snippetLen === 0) return { topPct: 32, heightPct: 16 }
  const startIdx = TOP_PAD_COUNT + beforeLen
  return {
    topPct: (startIdx / totalRows) * 100,
    heightPct: Math.max(8, (snippetLen / totalRows) * 100),
  }
})

interface TreeNode {
  name: string
  depth: number
  kind: 'dir' | 'file'
  fullPath?: string
  open?: boolean
}

const FILE_TREE: TreeNode[] = [
  { name: 'openfold3', depth: 0, kind: 'dir', open: true },
  { name: 'configs', depth: 1, kind: 'dir', open: false },
  { name: 'datasets', depth: 1, kind: 'dir', open: false },
  { name: 'projects', depth: 1, kind: 'dir', open: true },
  { name: 'of3_all_atom', depth: 2, kind: 'dir', open: true },
  {
    name: 'model.py',
    depth: 3,
    kind: 'file',
    fullPath: 'openfold3/projects/of3_all_atom/model.py',
  },
  {
    name: 'model_config.py',
    depth: 3,
    kind: 'file',
    fullPath: 'openfold3/projects/of3_all_atom/config/model_config.py',
  },
  { name: 'core', depth: 1, kind: 'dir', open: true },
  { name: 'model', depth: 2, kind: 'dir', open: true },
  {
    name: 'input_embedders.py',
    depth: 3,
    kind: 'file',
    fullPath: 'openfold3/core/model/feature_embedders/input_embedders.py',
  },
  { name: 'latent', depth: 3, kind: 'dir', open: true },
  {
    name: 'template_module.py',
    depth: 4,
    kind: 'file',
    fullPath: 'openfold3/core/model/latent/template_module.py',
  },
  {
    name: 'msa_module.py',
    depth: 4,
    kind: 'file',
    fullPath: 'openfold3/core/model/latent/msa_module.py',
  },
  {
    name: 'pairformer.py',
    depth: 4,
    kind: 'file',
    fullPath: 'openfold3/core/model/latent/pairformer.py',
  },
  {
    name: 'diffusion_module.py',
    depth: 3,
    kind: 'file',
    fullPath: 'openfold3/core/model/structure/diffusion_module.py',
  },
  {
    name: 'prediction_heads.py',
    depth: 3,
    kind: 'file',
    fullPath: 'openfold3/core/model/heads/prediction_heads.py',
  },
  { name: 'losses', depth: 2, kind: 'dir', open: false },
  { name: 'utils', depth: 2, kind: 'dir', open: false },
  { name: 'tests', depth: 1, kind: 'dir', open: false },
  { name: 'pyproject.toml', depth: 1, kind: 'file' },
  { name: 'README.md', depth: 1, kind: 'file' },
]

function isActiveFile(node: TreeNode): boolean {
  return node.kind === 'file' && node.fullPath === props.codeRef.file
}

const TREE_ROW_HEIGHT = 16
const treeTranslateY = computed(() => {
  const activeIdx = FILE_TREE.findIndex(n => isActiveFile(n))
  if (activeIdx < 0) return 0
  return Math.round(118 - activeIdx * TREE_ROW_HEIGHT - TREE_ROW_HEIGHT / 2)
})

interface Token {
  text: string
  cls: string
}

const PY_KEYWORDS = new Set([
  'class',
  'def',
  'return',
  'for',
  'in',
  'if',
  'else',
  'elif',
  'range',
  'with',
  'as',
  'None',
  'True',
  'False',
  'self',
  'super',
])

function tokenizePython(line: string): Token[] {
  const tokens: Token[] = []
  const commentIdx = line.indexOf('#')
  const codePart = commentIdx >= 0 ? line.slice(0, commentIdx) : line
  const commentPart = commentIdx >= 0 ? line.slice(commentIdx) : ''

  const regex =
    /('[^']*'|"[^"]*"|\b\d+(?:\.\d+)?\b|\b[A-Za-z_][A-Za-z0-9_]*\b|[^\sA-Za-z0-9_'"]+|\s+)/g
  let m: RegExpExecArray | null
  while ((m = regex.exec(codePart)) !== null) {
    const t = m[0]
    if (/^\s+$/.test(t)) {
      tokens.push({ text: t, cls: '' })
    } else if (t.startsWith("'") || t.startsWith('"')) {
      tokens.push({ text: t, cls: 'text-emerald-600 dark:text-emerald-400' })
    } else if (/^\d/.test(t)) {
      tokens.push({ text: t, cls: 'text-amber-600 dark:text-amber-300' })
    } else if (t === 'self') {
      tokens.push({ text: t, cls: 'text-rose-600 dark:text-rose-400' })
    } else if (PY_KEYWORDS.has(t)) {
      tokens.push({ text: t, cls: 'text-purple-600 dark:text-purple-400 font-medium' })
    } else if (/^[A-Z]/.test(t)) {
      tokens.push({ text: t, cls: 'text-amber-700 dark:text-amber-200' })
    } else if (codePart.slice(m.index + t.length).startsWith('(')) {
      tokens.push({ text: t, cls: 'text-sky-600 dark:text-sky-400' })
    } else {
      tokens.push({ text: t, cls: 'text-n-text' })
    }
  }

  if (commentPart) {
    tokens.push({ text: commentPart, cls: 'text-n-faint italic' })
  }
  return tokens
}
</script>

<template>
  <div
    v-if="codeLines.length"
    class="mt-3 flex h-[236px] overflow-hidden rounded-md border border-n-border bg-[var(--n-callout-neutral)]"
  >
    <!-- Code snippet -->
    <div class="n-mono min-w-0 flex-1 overflow-auto py-2 text-[11px] leading-[1.45]">
      <div
        v-for="line in codeLines"
        :key="line.num"
        class="flex min-w-max items-baseline pr-3 transition-opacity"
        :class="
          line.active
            ? 'border-l-2 border-l-[#337ea9] bg-[#337ea9]/[0.07] opacity-100 dark:border-l-[#5aa6d1] dark:bg-[#5aa6d1]/[0.09]'
            : 'border-l-2 border-l-transparent opacity-40'
        "
      >
        <span
          class="w-8 shrink-0 select-none pr-2 text-right text-[10px] tabular-nums text-n-faint"
          >{{ line.num }}</span
        >
        <span class="whitespace-pre">
          <template v-for="(tok, ti) in tokenizePython(line.text)" :key="ti">
            <span :class="tok.cls">{{ tok.text }}</span>
          </template>
        </span>
      </div>
    </div>

    <!-- Zed-style minimap -->
    <div
      class="relative flex w-[48px] shrink-0 select-none flex-col overflow-hidden border-l border-n-border bg-n-bg/50 px-1 py-1"
      aria-hidden="true"
    >
      <!-- Active viewport band -->
      <div
        class="pointer-events-none absolute inset-x-0 border-y border-n-text/15 bg-n-text/[0.08]"
        :style="{
          top: `${activeRange.topPct}%`,
          height: `${activeRange.heightPct}%`,
        }"
      >
        <div class="absolute inset-y-0 right-0 w-[2.5px] bg-n-muted/50"></div>
      </div>

      <!-- Dense multi-token code lines -->
      <div class="relative z-10 flex flex-1 flex-col gap-[1px] overflow-hidden pr-[3px]">
        <div
          v-for="(row, ri) in minimapRows"
          :key="ri"
          class="flex h-[1.5px] shrink-0 items-center gap-[1.5px]"
          :class="row.active ? 'opacity-95' : 'opacity-40'"
          :style="{ paddingLeft: `${row.indent}%` }"
        >
          <span
            v-for="(seg, si) in row.segs"
            :key="si"
            class="h-full shrink-0 rounded-[0.5px]"
            :class="seg.cls"
            :style="{ width: `${seg.w}px` }"
          ></span>
        </div>
      </div>
    </div>

    <!-- Mini file tree (same height as snippet & minimap, active file centered) -->
    <div
      class="relative flex w-[142px] shrink-0 select-none flex-col overflow-hidden border-l border-n-border bg-n-sidebar/60"
      aria-label="Repository file tree"
    >
      <div
        class="transition-transform duration-200 ease-out"
        :style="{ transform: `translateY(${treeTranslateY}px)` }"
      >
        <div
          v-for="(node, ni) in FILE_TREE"
          :key="ni"
          class="flex h-[16px] items-center gap-1 pr-2 text-[10px] leading-none"
          :class="
            isActiveFile(node)
              ? 'bg-n-hover font-medium text-n-text opacity-100'
              : 'text-n-muted opacity-40'
          "
          :style="{ paddingLeft: `${6 + node.depth * 8}px` }"
        >
          <span
            v-if="node.kind === 'dir'"
            class="h-2.5 w-2.5 shrink-0 text-n-muted"
            :class="node.open ? 'i-lucide-folder-open' : 'i-lucide-folder'"
          ></span>
          <span
            v-else
            class="h-2.5 w-2.5 shrink-0 rounded-[2px] text-center text-[8px] font-bold leading-[10px]"
            :class="
              isActiveFile(node)
                ? 'bg-[#337ea9]/20 text-[#337ea9] dark:bg-[#5aa6d1]/20 dark:text-[#5aa6d1]'
                : 'text-n-faint'
            "
            >{{ node.name.endsWith('.py') ? 'py' : '·' }}</span
          >
          <span class="truncate">{{ node.name }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
