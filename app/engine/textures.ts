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
  isDark: boolean,
  compact = false
): THREE.Sprite {
  const width = 768
  const height = compact || !subtitle ? 136 : 200
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')

  if (ctx) {
    ctx.clearRect(0, 0, width, height)

    const padX = 12
    const padY = 12
    const rw = width - padX * 2
    const rh = height - padY * 2
    const radius = 24

    ctx.beginPath()
    ctx.roundRect(padX, padY, rw, rh, radius)
    ctx.fillStyle = isDark ? 'rgba(30, 41, 59, 0.94)' : 'rgba(255, 255, 255, 0.95)'
    ctx.fill()
    ctx.lineWidth = 3.5
    ctx.strokeStyle = isDark ? '#64748b' : '#94a3b8'
    ctx.stroke()

    // Accent dot
    ctx.beginPath()
    ctx.arc(padX + 42, height / 2, 12, 0, Math.PI * 2)
    ctx.fillStyle = accentColor
    ctx.fill()

    if (compact || !subtitle) {
      ctx.fillStyle = isDark ? '#f8fafc' : '#0f172a'
      ctx.font = '700 56px Inter, system-ui, -apple-system, sans-serif'
      ctx.textBaseline = 'middle'
      ctx.fillText(title, padX + 74, height / 2 + 2, rw - 96)
    } else {
      // Title
      ctx.fillStyle = isDark ? '#f8fafc' : '#0f172a'
      ctx.font = '700 56px Inter, system-ui, -apple-system, sans-serif'
      ctx.textBaseline = 'middle'
      ctx.fillText(title, padX + 74, height / 2 - 30, rw - 96)

      // Subtitle
      ctx.fillStyle = isDark ? '#cbd5e1' : '#334155'
      ctx.font = '600 38px ui-monospace, SFMono-Regular, Menlo, monospace'
      ctx.fillText(subtitle, padX + 74, height / 2 + 34, rw - 96)
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
  const height = 108
  const font = '800 44px Inter, system-ui, -apple-system, sans-serif'
  const measureCanvas = document.createElement('canvas')
  const measureCtx = measureCanvas.getContext('2d')
  let textW = text.length * 26
  if (measureCtx) {
    measureCtx.font = font
    textW = measureCtx.measureText(text).width
  }

  const padX = 44
  const width = Math.max(300, Math.ceil(textW) + padX * 2)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')

  if (ctx) {
    ctx.clearRect(0, 0, width, height)
    const inset = 6
    const rw = width - inset * 2
    const rh = height - inset * 2
    const radius = 24

    ctx.beginPath()
    ctx.roundRect(inset, inset, rw, rh, radius)
    ctx.fillStyle = isDark ? 'rgba(24, 24, 27, 0.95)' : 'rgba(255, 251, 235, 0.97)'
    ctx.fill()

    ctx.lineWidth = 4.5
    ctx.strokeStyle = isDark ? '#fbbf24' : '#d97706'
    ctx.stroke()

    ctx.fillStyle = isDark ? '#fef3c7' : '#92400e'
    ctx.font = font
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
  sprite.renderOrder = 23
  sprite.userData.aspect = width / height
  return sprite
}
