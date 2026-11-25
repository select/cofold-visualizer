import * as THREE from 'three'
import type { MatrixStyle } from '~/types/architecture'

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

export function createLabelSprite(
  title: string,
  subtitle: string,
  accentColor: string,
  isDark: boolean
): THREE.Sprite {
  const width = 512
  const height = 128
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')

  if (ctx) {
    ctx.clearRect(0, 0, width, height)

    // Pill background
    const padX = 16
    const padY = 14
    const rw = width - padX * 2
    const rh = height - padY * 2
    const radius = 22

    ctx.beginPath()
    ctx.roundRect(padX, padY, rw, rh, radius)
    ctx.fillStyle = isDark ? 'rgba(24, 24, 27, 0.88)' : 'rgba(255, 255, 255, 0.92)'
    ctx.fill()
    ctx.lineWidth = 3
    ctx.strokeStyle = accentColor
    ctx.stroke()

    // Accent dot
    ctx.beginPath()
    ctx.arc(padX + 28, height / 2, 8, 0, Math.PI * 2)
    ctx.fillStyle = accentColor
    ctx.fill()

    // Title
    ctx.fillStyle = isDark ? '#f4f4f5' : '#0f172a'
    ctx.font = '600 30px Inter, system-ui, -apple-system, sans-serif'
    ctx.textBaseline = 'middle'
    ctx.fillText(title, padX + 50, height / 2 - 14, rw - 68)

    // Subtitle
    ctx.fillStyle = isDark ? '#a1a1aa' : '#64748b'
    ctx.font = '500 22px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.fillText(subtitle, padX + 50, height / 2 + 20, rw - 68)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  })
  const sprite = new THREE.Sprite(material)
  sprite.scale.set(4.2, 1.05, 1)
  return sprite
}
