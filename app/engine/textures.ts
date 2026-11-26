import * as THREE from 'three'
import type { MatrixStyle } from '~/types/architecture'
import { PLDDT_COLORS, plddtToCss } from './cifRibbon'

function seededNoise(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453
  return x - Math.floor(x)
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '')
  const num = Number.parseInt(clean, 16)
  if (Number.isNaN(num)) return { r: 99, g: 102, b: 241 }
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  }
}

export function createTensorMatrixTexture(
  style: MatrixStyle,
  baseColor: string,
  isDark: boolean
): THREE.CanvasTexture {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')

  if (!ctx) {
    const fallback = new THREE.CanvasTexture(canvas)
    return fallback
  }

  const { r, g, b } = hexToRgb(baseColor)
  const bg = isDark ? '#18181b' : '#f8fafc'
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, size, size)

  const gridLines = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)'

  if (style === 'pair') {
    const cells = 24
    const cell = size / cells
    for (let i = 0; i < cells; i++) {
      for (let j = 0; j < cells; j++) {
        const dist = Math.abs(i - j)
        const sym = i < j ? i * cells + j : j * cells + i
        const diagBoost = Math.exp(-dist * 0.22) * 0.65
        const contactCluster =
          Math.abs(i - 6) < 3 && Math.abs(j - 17) < 3
            ? 0.45
            : Math.abs(j - 6) < 3 && Math.abs(i - 17) < 3
              ? 0.45
              : 0
        const v = Math.min(1, diagBoost + contactCluster + seededNoise(sym + 11) * 0.25)
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${(0.12 + v * 0.78).toFixed(3)})`
        ctx.fillRect(i * cell + 1, j * cell + 1, cell - 2, cell - 2)
      }
    }
  } else if (style === 'sequence') {
    const cols = 16
    const rows = 28
    const cw = size / cols
    const ch = size / rows
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const v = seededNoise(y * 37 + x * 13 + 3)
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${(0.14 + v * 0.72).toFixed(3)})`
        ctx.fillRect(x * cw + 1, y * ch + 1, cw - 2, ch - 2)
      }
    }
  } else if (style === 'msa') {
    const cols = 28
    const rows = 20
    const cw = size / cols
    const ch = size / rows
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const isGap = seededNoise(y * 41 + x * 19) > 0.84
        if (isGap) {
          ctx.fillStyle = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(15,23,42,0.03)'
        } else {
          const conserved = x % 5 === 0 ? 0.45 : 0
          const v = Math.min(1, conserved + seededNoise(y * 17 + x * 29) * 0.5)
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${(0.16 + v * 0.74).toFixed(3)})`
        }
        ctx.fillRect(x * cw + 1, y * ch + 1, cw - 2, ch - 2)
      }
    }
  } else if (style === 'local-window') {
    const cells = 24
    const cell = size / cells
    for (let i = 0; i < cells; i++) {
      for (let j = 0; j < cells; j++) {
        const inWindow = Math.floor(i / 4) === Math.floor(j / 6) || Math.abs(i - j) <= 2
        const v = inWindow ? 0.45 + seededNoise(i * 31 + j) * 0.5 : 0.06
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${v.toFixed(3)})`
        ctx.fillRect(i * cell + 1, j * cell + 1, cell - 2, cell - 2)
      }
    }
  } else if (style === 'transformer') {
    const cols = 16
    const rows = 16
    const cw = size / cols
    const ch = size / rows
    for (let y = 0; y < rows; y++) {
      const band = y < 5 ? 0.6 : y < 11 ? 0.35 : 0.75
      for (let x = 0; x < cols; x++) {
        const headStripe = x % 4 === 0 ? 0.2 : 0
        const v = Math.min(1, band * 0.7 + headStripe + seededNoise(y * 23 + x * 7) * 0.3)
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${(0.15 + v * 0.72).toFixed(3)})`
        ctx.fillRect(x * cw + 1.5, y * ch + 1.5, cw - 3, ch - 3)
      }
    }
  } else if (style === 'heatmap') {
    const cells = 20
    const cell = size / cells
    for (let i = 0; i < cells; i++) {
      for (let j = 0; j < cells; j++) {
        const wave = 0.5 + 0.5 * Math.sin(i * 0.35 + j * 0.25)
        const v = Math.min(1, wave * 0.65 + seededNoise(i * 19 + j * 5) * 0.3)
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${(0.18 + v * 0.74).toFixed(3)})`
        ctx.fillRect(i * cell + 1, j * cell + 1, cell - 2, cell - 2)
      }
    }
  } else {
    // point-cloud subtle grid
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.25)`
    ctx.lineWidth = 2
    for (let k = 0; k <= 8; k++) {
      const pos = (size / 8) * k
      ctx.beginPath()
      ctx.moveTo(pos, 0)
      ctx.lineTo(pos, size)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(0, pos)
      ctx.lineTo(size, pos)
      ctx.stroke()
    }
  }

  // Subtle architectural border
  ctx.strokeStyle = gridLines
  ctx.lineWidth = 4
  ctx.strokeRect(2, 2, size - 4, size - 4)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  texture.needsUpdate = true
  return texture
}

function drawDimensionIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  color: string
) {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = 3.8
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  const hexAngles = [
    -Math.PI / 2,
    -Math.PI / 6,
    Math.PI / 6,
    Math.PI / 2,
    (5 * Math.PI) / 6,
    (-5 * Math.PI) / 6,
  ]
  ctx.beginPath()
  for (let i = 0; i < hexAngles.length; i++) {
    const a = hexAngles[i]!
    const px = cx + Math.cos(a) * radius
    const py = cy + Math.sin(a) * radius
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
  ctx.stroke()

  const innerAngles = [(-5 * Math.PI) / 6, -Math.PI / 6, Math.PI / 2]
  for (const a of innerAngles) {
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius)
    ctx.stroke()
  }
  ctx.restore()
}

export function createMsaAlignmentTexture(isDark: boolean): THREE.CanvasTexture {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')

  if (!ctx) return new THREE.CanvasTexture(canvas)

  ctx.fillStyle = isDark ? '#18181b' : '#f8fafc'
  ctx.fillRect(0, 0, size, size)

  const cols = 28
  const rows = 22
  const cw = size / cols
  const ch = size / rows
  const clustalPalette = [
    '#3b82f6',
    '#ef4444',
    '#22c55e',
    '#d946ef',
    '#eab308',
    '#06b6d4',
    '#f97316',
  ]
  const colColorIdx = Array.from({ length: cols }, (_, x) => {
    const n = seededNoise(x * 31 + 7)
    if (n > 0.38) return Math.floor(seededNoise(x * 17 + 3) * clustalPalette.length)
    return -1
  })

  for (let y = 0; y < rows; y++) {
    const leadGaps = Math.floor(seededNoise(y * 13 + 5) * 5)
    for (let x = 0; x < cols; x++) {
      const isGap = x < leadGaps || seededNoise(y * 41 + x * 19) > 0.88
      const px = x * cw + 1
      const py = y * ch + 1
      if (isGap) {
        ctx.fillStyle = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.04)'
        ctx.fillRect(px, py, cw - 2, ch - 2)
        ctx.fillStyle = isDark ? 'rgba(148,163,184,0.35)' : 'rgba(100,116,139,0.4)'
        ctx.fillRect(px + cw * 0.25, py + ch * 0.45, cw * 0.5 - 2, 2)
      } else {
        const paletteIdx = colColorIdx[x]!
        const match = paletteIdx >= 0 && seededNoise(y * 23 + x * 11) > 0.22
        if (match) {
          ctx.fillStyle = clustalPalette[paletteIdx]!
          ctx.globalAlpha = 0.85
          ctx.fillRect(px, py, cw - 2, ch - 2)
          ctx.globalAlpha = 1.0
        } else {
          const v = seededNoise(y * 29 + x * 7)
          ctx.fillStyle = `rgba(6, 182, 212, ${(0.12 + v * 0.28).toFixed(3)})`
          ctx.fillRect(px, py, cw - 2, ch - 2)
        }
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  texture.needsUpdate = true
  return texture
}

export function createLabelSprite(
  title: string,
  subtitle: string,
  accentColor: string,
  isDark: boolean,
  compact = false,
  borderColor?: string
): THREE.Sprite {
  const height = compact || !subtitle ? 136 : 200
  const titleFont = '700 56px Inter, system-ui, -apple-system, sans-serif'
  const subFont = '600 38px ui-monospace, SFMono-Regular, Menlo, monospace'

  const dimMatch = title.match(/^(.*)\s+\[(\d+)\]$/)
  const baseTitle = dimMatch ? `${dimMatch[1]} (${dimMatch[2]}` : title
  const closeParen = dimMatch ? ')' : ''
  const iconSpace = dimMatch ? 42 : 0

  const measureCanvas = document.createElement('canvas')
  const measureCtx = measureCanvas.getContext('2d')
  let textW = title.length * 32
  let baseTitleW = textW
  if (measureCtx) {
    measureCtx.font = titleFont
    baseTitleW = measureCtx.measureText(baseTitle).width
    textW = baseTitleW + iconSpace + (closeParen ? measureCtx.measureText(closeParen).width : 0)
    if (!compact && subtitle) {
      measureCtx.font = subFont
      textW = Math.max(textW, measureCtx.measureText(subtitle).width)
    }
  }

  const padX = 12
  const padY = 12
  const leftOffset = padX + 74
  const rightPad = 36
  const width = Math.max(240, Math.ceil(textW) + leftOffset + rightPad + padX)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')

  if (ctx) {
    ctx.clearRect(0, 0, width, height)

    const rw = width - padX * 2
    const rh = height - padY * 2
    const radius = 24

    ctx.beginPath()
    ctx.roundRect(padX, padY, rw, rh, radius)
    ctx.fillStyle = isDark ? 'rgba(30, 41, 59, 0.94)' : 'rgba(255, 255, 255, 0.95)'
    ctx.fill()
    ctx.lineWidth = borderColor ? 5 : 3.5
    ctx.strokeStyle = borderColor ?? (isDark ? '#64748b' : '#94a3b8')
    ctx.stroke()

    // Accent dot
    ctx.beginPath()
    ctx.arc(padX + 42, height / 2, 12, 0, Math.PI * 2)
    ctx.fillStyle = accentColor
    ctx.fill()

    const maxTextW = rw - 96
    const titleColor = isDark ? '#f8fafc' : '#0f172a'
    const titleY = compact || !subtitle ? height / 2 + 2 : height / 2 - 30

    ctx.fillStyle = titleColor
    ctx.font = titleFont
    ctx.textBaseline = 'middle'
    if (dimMatch) {
      ctx.fillText(baseTitle, leftOffset, titleY)
      drawDimensionIcon(ctx, leftOffset + baseTitleW + 22, titleY - 1, 15, titleColor)
      ctx.fillText(closeParen, leftOffset + baseTitleW + iconSpace, titleY)
    } else {
      ctx.fillText(title, leftOffset, titleY, maxTextW)
    }

    if (!compact && subtitle) {
      // Subtitle
      ctx.fillStyle = isDark ? '#cbd5e1' : '#334155'
      ctx.font = subFont
      ctx.fillText(subtitle, leftOffset, height / 2 + 34, maxTextW)
    }
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  texture.needsUpdate = true

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  })
  const sprite = new THREE.Sprite(material)
  const aspect = height / width
  sprite.userData.aspect = aspect
  sprite.userData.baseHeightRatio = height / 768
  sprite.scale.set(3.6, 3.6 * aspect, 1)
  return sprite
}

export function createEdgeLabelSprite(
  text: string,
  colorHex: number,
  isDark: boolean
): THREE.Sprite {
  const width = 640
  const height = 112
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')

  const accent = `#${colorHex.toString(16).padStart(6, '0')}`

  if (ctx) {
    ctx.clearRect(0, 0, width, height)

    const padX = 10
    const padY = 10
    const rw = width - padX * 2
    const rh = height - padY * 2
    const radius = 20

    ctx.beginPath()
    ctx.roundRect(padX, padY, rw, rh, radius)
    ctx.fillStyle = isDark ? 'rgba(30, 41, 59, 0.94)' : 'rgba(255, 255, 255, 0.95)'
    ctx.fill()
    ctx.lineWidth = 3
    ctx.strokeStyle = isDark ? '#64748b' : '#94a3b8'
    ctx.stroke()

    // Small accent indicator on left
    ctx.beginPath()
    ctx.arc(padX + 32, height / 2, 9, 0, Math.PI * 2)
    ctx.fillStyle = accent
    ctx.fill()

    ctx.fillStyle = isDark ? '#f8fafc' : '#0f172a'
    ctx.font = '700 38px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, width / 2 + 12, height / 2 + 1, rw - 64)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  texture.needsUpdate = true

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  })
  const sprite = new THREE.Sprite(material)
  sprite.scale.set(2.9, 2.9 * (height / width), 1)
  return sprite
}

export function createMiniLabelSprite(text: string, accentHex?: number): THREE.Sprite {
  const height = 76
  const font = '700 40px Inter, system-ui, -apple-system, sans-serif'
  const measureCanvas = document.createElement('canvas')
  const measureCtx = measureCanvas.getContext('2d')
  let textW = text.length * 24
  if (measureCtx) {
    measureCtx.font = font
    textW = measureCtx.measureText(text).width
  }

  const padX = 24
  const width = Math.max(96, Math.ceil(textW) + padX * 2)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')

  if (ctx) {
    ctx.clearRect(0, 0, width, height)
    const inset = 4
    const rw = width - inset * 2
    const rh = height - inset * 2
    const radius = 14

    ctx.beginPath()
    ctx.roundRect(inset, inset, rw, rh, radius)
    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)'
    ctx.fill()

    ctx.lineWidth = 2.5
    if (accentHex !== undefined) {
      const accent = `#${accentHex.toString(16).padStart(6, '0')}`
      ctx.strokeStyle = accent
    } else {
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)'
    }
    ctx.stroke()

    ctx.fillStyle = '#ffffff'
    ctx.font = font
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, width / 2, height / 2 + 1, rw - 16)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  texture.needsUpdate = true

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    fog: false,
    toneMapped: false,
  })
  const sprite = new THREE.Sprite(material)
  sprite.renderOrder = 21
  sprite.userData.aspect = width / height
  return sprite
}

export function createAxisTagSprite(text: string, theme: 'light' | 'dark' | boolean): THREE.Sprite {
  const isDark = theme === 'dark' || theme === true
  const width = 560
  const height = 96
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')

  if (ctx) {
    ctx.clearRect(0, 0, width, height)

    const padX = 10
    const padY = 10
    const rw = width - padX * 2
    const rh = height - padY * 2
    const radius = 16

    ctx.beginPath()
    ctx.roundRect(padX, padY, rw, rh, radius)
    ctx.fillStyle = isDark ? 'rgba(30, 41, 59, 0.9)' : 'rgba(248, 250, 252, 0.92)'
    ctx.fill()
    ctx.lineWidth = 2.5
    ctx.strokeStyle = isDark ? '#475569' : '#cbd5e1'
    ctx.stroke()

    ctx.fillStyle = isDark ? '#cbd5e1' : '#475569'
    ctx.font = '600 32px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, width / 2, height / 2 + 1, rw - 32)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  texture.needsUpdate = true

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    fog: false,
    toneMapped: false,
  })
  const sprite = new THREE.Sprite(material)
  sprite.renderOrder = 18
  sprite.scale.set(2.4, 0.42, 1)
  sprite.visible = false
  return sprite
}

export function createStageHeaderTexture(title: string, isDark: boolean): THREE.CanvasTexture {
  const width = 512
  const height = 96
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')

  if (ctx) {
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = isDark ? 'rgba(241, 245, 249, 0.92)' : 'rgba(30, 41, 59, 0.88)'
    ctx.font = '700 34px Inter, system-ui, -apple-system, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(title.toUpperCase(), width / 2, height / 2, width - 24)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  texture.needsUpdate = true
  return texture
}

export function createRecycleLoopBadgeSprite(text: string, isDark: boolean): THREE.Sprite {
  const height = 84
  const font = '700 44px Inter, system-ui, -apple-system, sans-serif'
  const measureCanvas = document.createElement('canvas')
  const measureCtx = measureCanvas.getContext('2d')
  let textW = text.length * 24
  if (measureCtx) {
    measureCtx.font = font
    textW = measureCtx.measureText(text).width
  }

  const padX = 16
  const width = Math.max(160, Math.ceil(textW) + padX * 2)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')

  if (ctx) {
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = isDark ? '#fbbf24' : '#d97706'
    ctx.font = font
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, width / 2, height / 2, width - padX)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  texture.needsUpdate = true

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    fog: false,
    toneMapped: false,
  })
  const sprite = new THREE.Sprite(material)
  sprite.renderOrder = 23
  sprite.userData.aspect = width / height
  return sprite
}

export function createPlddtPlotTexture(isDark: boolean): THREE.CanvasTexture {
  const width = 512
  const height = 360
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')

  if (ctx) {
    ctx.fillStyle = isDark ? '#0f172a' : '#ffffff'
    ctx.fillRect(0, 0, width, height)

    const padL = 52
    const padR = 64
    const padT = 36
    const padB = 44
    const plotW = width - padL - padR
    const plotH = height - padT - padB

    // Title
    ctx.fillStyle = isDark ? '#e2e8f0' : '#0f172a'
    ctx.font = '700 18px Inter, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('pLDDT Score Plot', padL + plotW / 2, 22)

    // Axes box
    ctx.strokeStyle = isDark ? '#475569' : '#64748b'
    ctx.lineWidth = 2
    ctx.strokeRect(padL, padT, plotW, plotH)

    // Y ticks (0, 20, 40, 60, 80, 100)
    ctx.fillStyle = isDark ? '#94a3b8' : '#475569'
    ctx.font = '500 12px ui-monospace, monospace'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    for (const v of [0, 20, 40, 60, 80, 100]) {
      const y = padT + plotH * (1 - v / 100)
      ctx.fillText(String(v), padL - 8, y)
      ctx.beginPath()
      ctx.moveTo(padL - 4, y)
      ctx.lineTo(padL, y)
      ctx.stroke()
    }

    // X label
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText('Residue Index', padL + plotW / 2, padT + plotH + 14)

    // Generate deterministic pLDDT profile matching the reference plot
    const nPts = 140
    const scores: number[] = []
    for (let i = 0; i < nPts; i++) {
      const x = i / (nPts - 1)
      let base = 20
      if (x > 0.48 && x < 0.56) {
        base = 20 + ((x - 0.48) / 0.08) * 74
      } else if (x >= 0.56 && x <= 0.8) {
        base = 94 - (x > 0.64 && x < 0.67 ? 8 : 0)
      } else if (x > 0.8 && x < 0.84) {
        base = 94 - ((x - 0.8) / 0.04) * 38
      } else if (x >= 0.84) {
        base = 56 + 4 * Math.sin(x * 40)
      }
      const jitter = Math.sin(i * 1.9) * 3.2 + Math.cos(i * 4.3) * 1.8
      scores.push(Math.max(5, Math.min(99, base + jitter)))
    }

    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    for (let i = 0; i < nPts - 1; i++) {
      const x0 = padL + (i / (nPts - 1)) * plotW
      const y0 = padT + plotH * (1 - scores[i]! / 100)
      const x1 = padL + ((i + 1) / (nPts - 1)) * plotW
      const y1 = padT + plotH * (1 - scores[i + 1]! / 100)
      ctx.strokeStyle = plddtToCss((scores[i]! + scores[i + 1]!) * 0.5)
      ctx.beginPath()
      ctx.moveTo(x0, y0)
      ctx.lineTo(x1, y1)
      ctx.stroke()
    }

    // Colorbar on right using canonical AlphaFold pLDDT bands
    const cbX = padL + plotW + 14
    const cbW = 14
    const grad = ctx.createLinearGradient(0, padT + plotH, 0, padT)
    grad.addColorStop(0, PLDDT_COLORS.veryLow)
    grad.addColorStop(0.499, PLDDT_COLORS.veryLow)
    grad.addColorStop(0.5, PLDDT_COLORS.low)
    grad.addColorStop(0.699, PLDDT_COLORS.low)
    grad.addColorStop(0.7, PLDDT_COLORS.confident)
    grad.addColorStop(0.899, PLDDT_COLORS.confident)
    grad.addColorStop(0.9, PLDDT_COLORS.veryHigh)
    grad.addColorStop(1, PLDDT_COLORS.veryHigh)
    ctx.fillStyle = grad
    ctx.fillRect(cbX, padT, cbW, plotH)
    ctx.strokeStyle = isDark ? '#475569' : '#64748b'
    ctx.lineWidth = 1.5
    ctx.strokeRect(cbX, padT, cbW, plotH)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  texture.needsUpdate = true
  return texture
}
