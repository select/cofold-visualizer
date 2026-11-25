import * as THREE from 'three'
import type { DetailedBlockSpec, MatrixStyle, TensorBlock3D } from '~/types/architecture'
import { createEdgeLabelSprite, createTensorMatrixTexture } from './textures'

export interface DetailedBlockVisual {
  group: THREE.Group
  frameLine: THREE.LineSegments
  frameMat: THREE.LineBasicMaterial
  miniLabels: THREE.Sprite[]
  update: (dt: number, isFlowPlaying: boolean) => void
  setLabelsVisible: (visible: boolean) => void
  setHighlighted: (selected: boolean, hovered: boolean, isFocused: boolean, isDark: boolean) => void
  dispose: () => void
}

interface MiniFlowTrack {
  curve: THREE.CatmullRomCurve3
  ribbonMat: THREE.MeshBasicMaterial
  baseOpacity: number
  beads: THREE.Mesh[]
  offsets: number[]
  speed: number
}

function buildFlatRibbonGeometry(
  curve: THREE.CatmullRomCurve3,
  width: number,
  segments = 18
): THREE.BufferGeometry {
  const p0 = curve.getPointAt(0)
  const p1 = curve.getPointAt(1)
  const avgDir = p1.clone().sub(p0)
  if (avgDir.lengthSq() > 1e-6) {
    avgDir.normalize()
  } else {
    avgDir.set(1, 0, 0)
  }
  const refNormal =
    Math.abs(avgDir.z) < 0.88 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0)

  const positions: number[] = []
  const indices: number[] = []
  const half = width * 0.5

  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const pt = curve.getPointAt(t)
    const tan = curve.getTangentAt(t).normalize()
    const side = new THREE.Vector3().crossVectors(tan, refNormal)
    if (side.lengthSq() < 1e-6) {
      side.set(1, 0, 0)
    } else {
      side.normalize()
    }
    const left = pt.clone().addScaledVector(side, half)
    const right = pt.clone().addScaledVector(side, -half)
    positions.push(left.x, left.y, left.z, right.x, right.y, right.z)

    if (i < segments) {
      const b = i * 2
      indices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2)
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

class DetailBuilderContext {
  public readonly group = new THREE.Group()
  public readonly miniLabels: THREE.Sprite[] = []
  public readonly slabMaterials: THREE.MeshStandardMaterial[] = []
  public readonly edgeMaterials: THREE.LineBasicMaterial[] = []
  public readonly flowTracks: MiniFlowTrack[] = []

  private readonly geometries: THREE.BufferGeometry[] = []
  private readonly materials: THREE.Material[] = []
  private readonly textures: THREE.Texture[] = []
  private readonly texCache = new Map<string, THREE.CanvasTexture>()
  private readonly beadGeo = new THREE.SphereGeometry(0.036, 7, 7)

  constructor(
    private readonly block: TensorBlock3D,
    private readonly spec: DetailedBlockSpec,
    private readonly isDark: boolean
  ) {
    this.geometries.push(this.beadGeo)
  }

  private getTexture(style: MatrixStyle, color: string): THREE.CanvasTexture {
    const key = `${style}:${color}:${this.isDark ? 'd' : 'l'}`
    const cached = this.texCache.get(key)
    if (cached) return cached
    const tex = createTensorMatrixTexture(style, color, this.isDark)
    this.texCache.set(key, tex)
    this.textures.push(tex)
    return tex
  }

  public addSlab(
    pos: [number, number, number],
    size: [number, number, number],
    style: MatrixStyle,
    colorHex: string,
    edgeColor: number,
    opacity = 0.96
  ): THREE.Mesh {
    const geo = new THREE.BoxGeometry(size[0], size[1], size[2])
    const edges = new THREE.EdgesGeometry(geo)
    this.geometries.push(geo, edges)

    const tex = this.getTexture(style, colorHex)
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      color: 0xffffff,
      roughness: 0.36,
      metalness: 0.06,
      transparent: true,
      opacity,
    })
    this.materials.push(mat)
    this.slabMaterials.push(mat)

    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(pos[0], pos[1], pos[2])
    mesh.userData = { blockId: this.block.id }
    this.group.add(mesh)

    const lineMat = new THREE.LineBasicMaterial({
      color: edgeColor,
      transparent: true,
      opacity: this.isDark ? 0.58 : 0.52,
    })
    this.materials.push(lineMat)
    this.edgeMaterials.push(lineMat)
    const wire = new THREE.LineSegments(edges, lineMat)
    wire.userData = { blockId: this.block.id }
    mesh.add(wire)

    return mesh
  }

  public addBar(
    pos: [number, number, number],
    size: [number, number, number],
    colorHex: number,
    opacity = 0.92
  ): THREE.Mesh {
    const geo = new THREE.BoxGeometry(size[0], size[1], size[2])
    const edges = new THREE.EdgesGeometry(geo)
    this.geometries.push(geo, edges)

    const mat = new THREE.MeshStandardMaterial({
      color: colorHex,
      roughness: 0.32,
      metalness: 0.14,
      transparent: true,
      opacity,
    })
    this.materials.push(mat)
    this.slabMaterials.push(mat)

    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(pos[0], pos[1], pos[2])
    mesh.userData = { blockId: this.block.id }
    this.group.add(mesh)

    const lineMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: this.isDark ? 0.28 : 0.35,
    })
    this.materials.push(lineMat)
    this.edgeMaterials.push(lineMat)
    mesh.add(new THREE.LineSegments(edges, lineMat))

    return mesh
  }

  public addMiniRibbon(
    points: Array<[number, number, number]>,
    width: number,
    colorHex: number,
    beadCount = 1,
    speed = 0.45
  ) {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p[0], p[1], p[2])))
    const geo = buildFlatRibbonGeometry(curve, width)
    this.geometries.push(geo)

    const baseOpacity = this.isDark ? 0.46 : 0.42
    const ribbonMat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: baseOpacity,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    this.materials.push(ribbonMat)

    const mesh = new THREE.Mesh(geo, ribbonMat)
    mesh.renderOrder = 4
    mesh.userData = { blockId: this.block.id }
    this.group.add(mesh)

    const beads: THREE.Mesh[] = []
    const offsets: number[] = []
    for (let i = 0; i < beadCount; i++) {
      const beadMat = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.9,
      })
      this.materials.push(beadMat)
      const bead = new THREE.Mesh(this.beadGeo, beadMat)
      bead.renderOrder = 6
      bead.userData = { blockId: this.block.id }
      this.group.add(bead)
      beads.push(bead)
      offsets.push(i / Math.max(1, beadCount))
    }

    this.flowTracks.push({ curve, ribbonMat, baseOpacity, beads, offsets, speed })
  }

  public addMiniLabel(
    text: string,
    pos: [number, number, number],
    accentHex: number,
    scaleMultiplier = 1
  ) {
    const sprite = createEdgeLabelSprite(text, accentHex, this.isDark)
    if (sprite.material.map) {
      this.textures.push(sprite.material.map)
    }
    this.materials.push(sprite.material)
    const sx = this.block.size[0]
    const s = THREE.MathUtils.clamp(sx * 0.34, 0.85, 1.55) * scaleMultiplier
    const aspect = 112 / 640
    sprite.scale.set(s, s * aspect, 1)
    sprite.position.set(pos[0], pos[1], pos[2])
    sprite.renderOrder = 19
    sprite.material.depthTest = false
    sprite.visible = false
    this.group.add(sprite)
    this.miniLabels.push(sprite)
  }

  public dispose() {
    for (const t of this.textures) t.dispose()
    for (const g of this.geometries) g.dispose()
    for (const m of this.materials) m.dispose()
    this.textures.length = 0
    this.geometries.length = 0
    this.materials.length = 0
    this.texCache.clear()
  }
}

function buildMultiheadAttn(
  ctx: DetailBuilderContext,
  block: TensorBlock3D,
  spec: DetailedBlockSpec
) {
  const [sx, sy, sz] = block.size
  const accent = new THREE.Color(block.color).getHex()
  const isAda = spec.normType === 'AdaLN'
  const normColor = isAda ? 0x38bdf8 : 0x64748b
  const biasColor = 0x818cf8
  const resColor = 0x22c55e

  // Entry Norm + γ, β parameter bars
  ctx.addSlab(
    [-0.37 * sx, 0, 0],
    [0.09 * sx, 0.72 * sy, 0.42 * sz],
    'sequence',
    block.color,
    normColor
  )
  ctx.addBar([-0.29 * sx, 0, -0.07 * sz], [0.025 * sx, 0.66 * sy, 0.04 * sz], 0xf59e0b)
  ctx.addBar([-0.29 * sx, 0, 0.07 * sz], [0.025 * sx, 0.66 * sy, 0.04 * sz], 0x38bdf8)
  ctx.addMiniLabel(isAda ? 'AdaLN (γ,β)' : 'LN (γ,β)', [-0.35 * sx, 0.44 * sy, 0], normColor)

  // 4 Fanned Head Columns along Z
  const headCount = 4
  const zSpan = Math.max(sz * 0.7, 0.65)
  const attnStyle: MatrixStyle = block.matrixStyle === 'local-window' ? 'local-window' : 'pair'

  for (let h = 0; h < headCount; h++) {
    const z = (-0.5 + h / (headCount - 1)) * zSpan
    const headD = Math.max(0.06, sz * 0.085)

    // Q/K/V weights & vectors
    ctx.addSlab(
      [-0.14 * sx, 0.02 * sy, z],
      [0.13 * sx, 0.44 * sy, headD],
      'sequence',
      block.color,
      accent
    )
    // Attn (QK^T + b_ij)
    ctx.addSlab(
      [0.04 * sx, 0.02 * sy, z],
      [0.12 * sx, 0.4 * sy, headD],
      attnStyle,
      '#6366f1',
      biasColor
    )
    // V Out
    ctx.addSlab(
      [0.2 * sx, 0.02 * sy, z],
      [0.08 * sx, 0.38 * sy, headD],
      'transformer',
      block.color,
      accent
    )

    // Flow from Norm -> QKV -> Attn -> V Out -> Exit Proj
    ctx.addMiniRibbon(
      [
        [-0.27 * sx, 0.02 * sy, z * 0.35],
        [-0.2 * sx, 0.02 * sy, z * 0.75],
        [-0.14 * sx, 0.02 * sy, z],
      ],
      Math.max(0.04, sz * 0.045),
      accent,
      1,
      0.52
    )
    ctx.addMiniRibbon(
      [
        [0.24 * sx, 0.02 * sy, z],
        [0.3 * sx, 0.02 * sy, z * 0.45],
        [0.34 * sx, 0, 0],
      ],
      Math.max(0.04, sz * 0.045),
      accent,
      1,
      0.52
    )
    // Pair Bias mini-ribbon feeding each Attn matrix from bottom-front
    ctx.addMiniRibbon(
      [
        [-0.08 * sx, -0.34 * sy, zSpan * 0.45],
        [-0.01 * sx, -0.24 * sy, z * 0.85],
        [0.04 * sx, -0.18 * sy, z],
      ],
      Math.max(0.035, sz * 0.038),
      biasColor,
      h === 0 || h === headCount - 1 ? 1 : 0,
      0.42
    )
  }

  ctx.addMiniLabel(`${spec.heads ?? 4}× Q/K/V`, [-0.14 * sx, 0.38 * sy, zSpan * 0.35], accent)
  ctx.addMiniLabel('Attn + b_ij', [0.04 * sx, -0.34 * sy, zSpan * 0.4], biasColor)

  // Exit Proj + SwiGLU slab
  ctx.addSlab(
    [0.37 * sx, 0, 0],
    [0.11 * sx, 0.72 * sy, 0.46 * sz],
    'transformer',
    block.color,
    accent
  )
  ctx.addMiniLabel('Proj + SwiGLU', [0.36 * sx, 0.44 * sy, 0], accent)

  // Residual arc over the top
  ctx.addMiniRibbon(
    [
      [-0.37 * sx, 0.38 * sy, 0],
      [0, 0.47 * sy, 0],
      [0.37 * sx, 0.38 * sy, 0],
    ],
    Math.max(0.045, sz * 0.05),
    resColor,
    2,
    0.38
  )
}

function buildPairStack(ctx: DetailBuilderContext, block: TensorBlock3D, spec: DetailedBlockSpec) {
  const [sx, sy, sz] = block.size
  const accent = new THREE.Color(block.color).getHex()
  const triColor = 0xa855f7
  const biasColor = 0x818cf8
  const zSpan = Math.max(sz * 0.68, 0.6)

  // TriMul Outgoing (dual gated projection slabs + multiply bar)
  ctx.addSlab(
    [-0.38 * sx, 0.14 * sy, -0.12 * sz],
    [0.1 * sx, 0.34 * sy, 0.24 * sz],
    'pair',
    block.color,
    triColor
  )
  ctx.addSlab(
    [-0.38 * sx, -0.14 * sy, 0.12 * sz],
    [0.1 * sx, 0.34 * sy, 0.24 * sz],
    'pair',
    block.color,
    triColor
  )
  ctx.addBar([-0.28 * sx, 0, 0], [0.035 * sx, 0.56 * sy, 0.14 * sz], triColor)
  ctx.addMiniLabel('TriMul Out', [-0.34 * sx, 0.42 * sy, 0], triColor)

  // TriMul Incoming
  ctx.addSlab([-0.15 * sx, 0, 0], [0.11 * sx, 0.62 * sy, 0.4 * sz], 'pair', block.color, accent)
  ctx.addMiniLabel('TriMul In', [-0.15 * sx, -0.4 * sy, 0], accent)

  // 4 Fanned TriAttn Start / End slabs along Z
  const heads = 4
  for (let h = 0; h < heads; h++) {
    const z = (-0.5 + h / (heads - 1)) * zSpan
    ctx.addSlab(
      [0.11 * sx, 0, z],
      [0.15 * sx, 0.5 * sy, Math.max(0.06, sz * 0.09)],
      'pair',
      '#6366f1',
      biasColor
    )
    ctx.addMiniRibbon(
      [
        [-0.08 * sx, 0, z * 0.35],
        [0.02 * sx, 0, z],
      ],
      Math.max(0.035, sz * 0.042),
      biasColor,
      h % 2 === 0 ? 1 : 0,
      0.48
    )
    ctx.addMiniRibbon(
      [
        [0.19 * sx, 0, z],
        [0.3 * sx, 0, z * 0.3],
      ],
      Math.max(0.035, sz * 0.042),
      accent,
      h % 2 === 1 ? 1 : 0,
      0.48
    )
  }
  ctx.addMiniLabel(`${spec.heads ?? 4}× TriAttn`, [0.11 * sx, 0.4 * sy, zSpan * 0.32], biasColor)

  // SwiGLU exit slab
  ctx.addSlab(
    [0.37 * sx, 0, 0],
    [0.11 * sx, 0.68 * sy, 0.42 * sz],
    'transformer',
    block.color,
    accent
  )
  ctx.addMiniLabel('SwiGLU', [0.36 * sx, -0.42 * sy, 0], accent)

  // Main spine ribbon
  ctx.addMiniRibbon(
    [
      [-0.28 * sx, 0, 0],
      [-0.2 * sx, 0, 0],
    ],
    Math.max(0.05, sz * 0.06),
    triColor,
    1,
    0.5
  )
}

function buildMsaBlock(ctx: DetailBuilderContext, block: TensorBlock3D, spec: DetailedBlockSpec) {
  const [sx, sy, sz] = block.size
  const accent = new THREE.Color(block.color).getHex()
  const teal = 0x14b8a6
  const green = 0x22c55e
  const zSpan = Math.max(sz * 0.68, 0.6)

  // OPM (c=32) bar feeding down to Pair space
  ctx.addBar([-0.36 * sx, -0.12 * sy, 0], [0.06 * sx, 0.56 * sy, 0.24 * sz], teal)
  ctx.addMiniLabel('OPM (32) → z', [-0.32 * sx, -0.42 * sy, 0], teal)

  // 4 Fanned Pair-Weighted Avg (8 heads) MSA slabs
  const cols = 4
  for (let i = 0; i < cols; i++) {
    const z = (-0.5 + i / (cols - 1)) * zSpan
    ctx.addSlab(
      [-0.04 * sx, 0.16 * sy, z],
      [0.24 * sx, 0.36 * sy, Math.max(0.06, sz * 0.09)],
      'msa',
      block.color,
      accent
    )
  }
  ctx.addMiniLabel(`${spec.heads ?? 8}× PWA`, [-0.04 * sx, 0.44 * sy, zSpan * 0.3], accent)

  // MSA SwiGLU
  ctx.addSlab(
    [0.32 * sx, 0.18 * sy, 0],
    [0.14 * sx, 0.42 * sy, 0.42 * sz],
    'transformer',
    block.color,
    accent
  )
  ctx.addMiniLabel('MSA SwiGLU', [0.32 * sx, 0.46 * sy, 0], accent)

  // Pair Stack (TriMul/TriAttn) mini-slab at bottom
  ctx.addSlab(
    [0.18 * sx, -0.24 * sy, 0],
    [0.34 * sx, 0.26 * sy, 0.46 * sz],
    'pair',
    '#8b5cf6',
    0x8b5cf6
  )
  ctx.addMiniLabel('Pair Stack', [0.22 * sx, -0.44 * sy, 0], 0x8b5cf6)

  // Ribbons: OPM -> Pair Stack, Pair Stack -> PWA, PWA -> MSA SwiGLU
  ctx.addMiniRibbon(
    [
      [-0.33 * sx, -0.24 * sy, 0],
      [-0.12 * sx, -0.28 * sy, 0],
      [0.01 * sx, -0.24 * sy, 0],
    ],
    Math.max(0.05, sz * 0.06),
    teal,
    2,
    0.45
  )
  ctx.addMiniRibbon(
    [
      [-0.33 * sx, 0.14 * sy, 0],
      [-0.18 * sx, 0.16 * sy, 0],
    ],
    Math.max(0.045, sz * 0.05),
    green,
    1,
    0.5
  )
  ctx.addMiniRibbon(
    [
      [0.09 * sx, 0.16 * sy, 0],
      [0.24 * sx, 0.18 * sy, 0],
    ],
    Math.max(0.045, sz * 0.05),
    accent,
    1,
    0.5
  )
}

function buildConditioning(ctx: DetailBuilderContext, block: TensorBlock3D) {
  const [sx, sy, sz] = block.size
  const accent = new THREE.Color(block.color).getHex()
  const sky = 0x38bdf8

  // Fourier Noise (256)
  ctx.addSlab(
    [-0.32 * sx, 0.14 * sy, 0],
    [0.14 * sx, 0.56 * sy, 0.44 * sz],
    'heatmap',
    '#ec4899',
    accent
  )
  ctx.addMiniLabel('Fourier (256)', [-0.3 * sx, 0.48 * sy, 0], accent)

  // RelPos + Trunk fusion slab
  ctx.addSlab([0, -0.06 * sy, 0], [0.18 * sx, 0.68 * sy, 0.5 * sz], 'pair', '#8b5cf6', 0x8b5cf6)
  ctx.addMiniLabel('RelPos + Trunk', [0, -0.45 * sy, 0], 0x8b5cf6)

  // AdaLN γ, β projection bars
  ctx.addBar([0.3 * sx, 0.04 * sy, -0.14 * sz], [0.07 * sx, 0.66 * sy, 0.14 * sz], sky)
  ctx.addBar([0.38 * sx, 0.04 * sy, 0.14 * sz], [0.07 * sx, 0.66 * sy, 0.14 * sz], 0xf59e0b)
  ctx.addMiniLabel('AdaLN γ, β', [0.33 * sx, 0.44 * sy, 0], sky)

  ctx.addMiniRibbon(
    [
      [-0.24 * sx, 0.14 * sy, 0],
      [-0.1 * sx, 0.04 * sy, 0],
      [0.26 * sx, 0.06 * sy, -0.1 * sz],
    ],
    Math.max(0.05, sz * 0.055),
    sky,
    2,
    0.48
  )
  ctx.addMiniRibbon(
    [
      [0.09 * sx, -0.08 * sy, 0],
      [0.34 * sx, -0.02 * sy, 0.12 * sz],
    ],
    Math.max(0.045, sz * 0.05),
    accent,
    1,
    0.48
  )
}

function buildAtomDec(ctx: DetailBuilderContext, block: TensorBlock3D, spec: DetailedBlockSpec) {
  const [sx, sy, sz] = block.size
  const accent = new THREE.Color(block.color).getHex()
  const sky = 0x38bdf8
  const green = 0x22c55e
  const zSpan = Math.max(sz * 0.68, 0.6)

  // Token->Atom broadcast + q_skip
  ctx.addSlab(
    [-0.36 * sx, 0.04 * sy, 0],
    [0.1 * sx, 0.66 * sy, 0.42 * sz],
    'sequence',
    block.color,
    accent
  )
  ctx.addMiniLabel('Token→Atom', [-0.35 * sx, 0.44 * sy, 0], accent)

  // AdaLN bar
  ctx.addBar([-0.2 * sx, 0, 0], [0.045 * sx, 0.64 * sy, 0.24 * sz], sky)
  ctx.addMiniLabel('AdaLN', [-0.2 * sx, -0.4 * sy, 0], sky)

  // 4 Fanned Local Attn heads
  for (let h = 0; h < 4; h++) {
    const z = (-0.5 + h / 3) * zSpan
    ctx.addSlab(
      [0.06 * sx, 0, z],
      [0.22 * sx, 0.44 * sy, Math.max(0.06, sz * 0.09)],
      'local-window',
      block.color,
      accent
    )
    ctx.addMiniRibbon(
      [
        [-0.17 * sx, 0, z * 0.3],
        [-0.06 * sx, 0, z],
      ],
      Math.max(0.035, sz * 0.042),
      accent,
      h % 2 === 0 ? 1 : 0,
      0.5
    )
  }
  ctx.addMiniLabel(`${spec.heads ?? 4}× Local Attn`, [0.06 * sx, 0.38 * sy, zSpan * 0.32], accent)

  // Output Δr [N_atom, 3]
  ctx.addSlab(
    [0.37 * sx, 0, 0],
    [0.11 * sx, 0.66 * sy, 0.42 * sz],
    'point-cloud',
    '#10b981',
    0x10b981
  )
  ctx.addMiniLabel('Δr [N_atom,3]', [0.36 * sx, -0.42 * sy, 0], 0x10b981)

  // q_skip residual ribbon
  ctx.addMiniRibbon(
    [
      [-0.36 * sx, -0.34 * sy, 0],
      [0, -0.42 * sy, 0],
      [0.37 * sx, -0.34 * sy, 0],
    ],
    Math.max(0.045, sz * 0.05),
    green,
    2,
    0.42
  )
}

function buildConfidenceHeads(ctx: DetailBuilderContext, block: TensorBlock3D) {
  const [sx, sy, sz] = block.size
  const heads: Array<{ label: string; color: string; hex: number; style: MatrixStyle }> = [
    { label: 'pLDDT (50)', color: '#22c55e', hex: 0x22c55e, style: 'sequence' },
    { label: 'PAE (64×64)', color: '#10b981', hex: 0x10b981, style: 'pair' },
    { label: 'PDE (64×64)', color: '#14b8a6', hex: 0x14b8a6, style: 'heatmap' },
    { label: 'Disto (64)', color: '#06b6d4', hex: 0x06b6d4, style: 'pair' },
    { label: 'Exp.Res (2)', color: '#3b82f6', hex: 0x3b82f6, style: 'sequence' },
  ]

  const zSpan = Math.max(sz * 0.78, 0.8)
  heads.forEach((h, i) => {
    const z = (-0.5 + i / (heads.length - 1)) * zSpan
    const x = -0.14 * sx + (i % 2 === 0 ? -0.05 * sx : 0.05 * sx)
    ctx.addSlab(
      [x, 0, z],
      [0.28 * sx, 0.52 * sy, Math.max(0.06, sz * 0.08)],
      h.style,
      h.color,
      h.hex
    )
    ctx.addMiniRibbon(
      [
        [x + 0.14 * sx, 0, z],
        [0.24 * sx, 0, z * 0.35],
        [0.34 * sx, 0, 0],
      ],
      Math.max(0.035, sz * 0.042),
      h.hex,
      1,
      0.48
    )
    if (i === 0 || i === 2 || i === 4) {
      ctx.addMiniLabel(h.label, [x, i === 2 ? -0.38 * sy : 0.38 * sy, z], h.hex, 0.9)
    }
  })

  // Converging pTM / ipTM ranking node
  ctx.addBar([0.37 * sx, 0, 0], [0.1 * sx, 0.58 * sy, 0.34 * sz], 0x16a34a)
  ctx.addMiniLabel('pTM / ipTM', [0.36 * sx, 0.42 * sy, 0], 0x16a34a)
}

export function buildInPlaceDetailedBlock(
  block: TensorBlock3D,
  isDark: boolean
): DetailedBlockVisual | null {
  const spec = block.detailedSpec
  if (!spec) return null

  const ctx = new DetailBuilderContext(block, spec, isDark)
  const [sx, sy, sz] = block.size
  const baseColor = new THREE.Color(block.color)

  // Translucent outer architectural frame box preserving macro boundaries
  const frameBoxGeo = new THREE.BoxGeometry(sx, sy, sz)
  const frameEdgesGeo = new THREE.EdgesGeometry(frameBoxGeo)
  frameBoxGeo.dispose()
  const frameMat = new THREE.LineBasicMaterial({
    color: baseColor,
    transparent: true,
    opacity: isDark ? 0.36 : 0.32,
  })
  const frameLine = new THREE.LineSegments(frameEdgesGeo, frameMat)
  frameLine.userData = { blockId: block.id }
  ctx.group.add(frameLine)

  switch (spec.kind) {
    case 'multihead-attn':
      buildMultiheadAttn(ctx, block, spec)
      break
    case 'pair-stack':
      buildPairStack(ctx, block, spec)
      break
    case 'msa-block':
      buildMsaBlock(ctx, block, spec)
      break
    case 'conditioning':
      buildConditioning(ctx, block)
      break
    case 'atom-dec':
      buildAtomDec(ctx, block, spec)
      break
    case 'confidence-heads':
      buildConfidenceHeads(ctx, block)
      break
  }

  const scratch = new THREE.Vector3()

  return {
    group: ctx.group,
    frameLine,
    frameMat,
    miniLabels: ctx.miniLabels,
    update: (dt: number, isFlowPlaying: boolean) => {
      for (const track of ctx.flowTracks) {
        for (let i = 0; i < track.beads.length; i++) {
          const bead = track.beads[i]!
          bead.visible = isFlowPlaying
          if (!isFlowPlaying) continue
          track.offsets[i] = (track.offsets[i]! + dt * track.speed) % 1
          track.curve.getPointAt(track.offsets[i]!, scratch)
          bead.position.copy(scratch)
        }
      }
    },
    setLabelsVisible: (visible: boolean) => {
      for (const sprite of ctx.miniLabels) {
        sprite.visible = visible
      }
    },
    setHighlighted: (selected: boolean, hovered: boolean, isFocused: boolean, dark: boolean) => {
      const unfocusedOpacity = dark ? 0.42 : 0.16
      const targetOpacity = selected || hovered ? 1.0 : isFocused ? 0.95 : unfocusedOpacity
      frameMat.opacity =
        selected || hovered ? (dark ? 0.85 : 0.9) : isFocused ? (dark ? 0.4 : 0.35) : 0.12

      for (const mat of ctx.slabMaterials) {
        mat.opacity = targetOpacity
        if (selected) {
          mat.emissive.copy(baseColor)
          mat.emissiveIntensity = 0.24
        } else if (hovered) {
          mat.emissive.copy(baseColor)
          mat.emissiveIntensity = 0.14
        } else {
          mat.emissive.setHex(0x000000)
          mat.emissiveIntensity = 0
        }
      }

      for (const lm of ctx.edgeMaterials) {
        lm.opacity = selected || hovered ? 0.78 : isFocused ? 0.5 : 0.16
      }

      for (const track of ctx.flowTracks) {
        track.ribbonMat.opacity = selected || hovered ? 0.62 : isFocused ? track.baseOpacity : 0.12
      }
    },
    dispose: () => {
      frameEdgesGeo.dispose()
      frameMat.dispose()
      ctx.dispose()
    },
  }
}
