import * as THREE from 'three'
import type { DetailedBlockSpec, MatrixStyle, TensorBlock3D } from '~/types/architecture'
import { createMiniLabelSprite, createTensorMatrixTexture } from './textures'

export interface DetailedBlockVisual {
  group: THREE.Group
  frameLine: THREE.LineSegments
  frameMat: THREE.LineBasicMaterial
  miniLabels: THREE.Sprite[]
  update: (dt: number, isFlowPlaying: boolean) => void
  setLabelsVisible: (visible: boolean) => void
  updateLabelScales: (camDist: number) => void
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

const ACT_GREEN = 0x22c55e
const WEIGHT_INDIGO = 0x818cf8
const COND_SKY = 0x38bdf8
const PARAM_AMBER = 0xf59e0b
const TEAL_OPM = 0x14b8a6

function buildFlatRibbonArrowGeometry(
  curve: THREE.CatmullRomCurve3,
  shaftWidth: number,
  headWidth: number,
  headLength: number,
  segments = 20
): THREE.BufferGeometry {
  const totalLen = Math.max(0.05, curve.getLength())
  const effectiveHeadLen = Math.min(headLength, totalLen * 0.44)
  const shaftEndFrac = Math.max(0.12, (totalLen - effectiveHeadLen) / totalLen)

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

  const sideAt = (t: number): THREE.Vector3 => {
    const tan = curve.getTangentAt(t).normalize()
    const side = new THREE.Vector3().crossVectors(tan, refNormal)
    if (side.lengthSq() < 1e-6) {
      side.set(1, 0, 0)
    } else {
      side.normalize()
    }
    return side
  }

  const positions: number[] = []
  const indices: number[] = []
  const halfShaft = shaftWidth * 0.5

  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * shaftEndFrac
    const pt = curve.getPointAt(t)
    const side = sideAt(t)
    const left = pt.clone().addScaledVector(side, halfShaft)
    const right = pt.clone().addScaledVector(side, -halfShaft)
    positions.push(left.x, left.y, left.z, right.x, right.y, right.z)

    if (i < segments) {
      const b = i * 2
      indices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2)
    }
  }

  // Oriented flat triangular arrowhead seamlessly integrated at tip
  const headBase = curve.getPointAt(shaftEndFrac)
  const headSide = sideAt(shaftEndFrac)
  const halfHead = headWidth * 0.5
  const headLeft = headBase.clone().addScaledVector(headSide, halfHead)
  const headRight = headBase.clone().addScaledVector(headSide, -halfHead)
  const tip = curve.getPointAt(1)

  const headBaseIdx = positions.length / 3
  positions.push(
    headLeft.x,
    headLeft.y,
    headLeft.z,
    headRight.x,
    headRight.y,
    headRight.z,
    tip.x,
    tip.y,
    tip.z
  )
  indices.push(headBaseIdx, headBaseIdx + 1, headBaseIdx + 2)

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
  private readonly beadGeo = new THREE.SphereGeometry(0.03, 7, 7)

  constructor(
    private readonly block: TensorBlock3D,
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
      opacity: this.isDark ? 0.62 : 0.56,
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
      opacity: this.isDark ? 0.32 : 0.38,
    })
    this.materials.push(lineMat)
    this.edgeMaterials.push(lineMat)
    mesh.add(new THREE.LineSegments(edges, lineMat))

    return mesh
  }

  public addMiniArrow(
    from: [number, number, number],
    to: [number, number, number],
    colorHex: number,
    width: number,
    controlPoints?: Array<[number, number, number]>,
    beadCount = 1,
    speed = 0.46
  ) {
    const pts = [from, ...(controlPoints ?? []), to].map(p => new THREE.Vector3(p[0], p[1], p[2]))
    const curve = new THREE.CatmullRomCurve3(pts)
    const headWidth = width * 2.05
    const headLength = Math.min(width * 2.5, Math.max(0.06, curve.getLength() * 0.4))
    const geo = buildFlatRibbonArrowGeometry(curve, width, headWidth, headLength)
    this.geometries.push(geo)

    const baseOpacity = 0.48
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
        opacity: 0.92,
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
    accentHex?: number,
    scaleMultiplier = 1
  ) {
    const sprite = createMiniLabelSprite(text, accentHex)
    if (sprite.material.map) {
      this.textures.push(sprite.material.map)
    }
    this.materials.push(sprite.material)

    const aspect = (sprite.userData.aspect as number) || 2.5
    const baseH = 0.22 * scaleMultiplier
    const baseW = baseH * aspect
    sprite.userData.baseSize = [baseW, baseH]
    sprite.scale.set(baseW, baseH, 1)
    sprite.position.set(pos[0], pos[1], pos[2])
    sprite.renderOrder = 21
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
  const normColor = isAda ? COND_SKY : 0x64748b
  const attnStyle: MatrixStyle = block.matrixStyle === 'local-window' ? 'local-window' : 'pair'
  const isLocal = block.matrixStyle === 'local-window'
  const arrowW = THREE.MathUtils.clamp(sz * 0.038, 0.036, 0.068)

  // Use 1-tier horizontal layout for wide blocks (Pairformer s: 6.4×1.5),
  // and 2-tier layout for compact blocks (AtomEnc 2.6×2.6, DiT 4.4×3.0) so no slab is a skinny pillar.
  const useTwoTier = sx / sy < 2.2

  if (!useTwoTier) {
    // --- 1-TIER WIDE LAYOUT (Pairformer s) ---
    const headCount = 3
    const zSpan = Math.max(sz * 0.64, 0.72)
    const headD = Math.max(0.065, sz * 0.095)

    // Entry stub (-0.5*sx -> LN)
    ctx.addMiniArrow([-0.5 * sx, 0, 0], [-0.435 * sx, 0, 0], ACT_GREEN, arrowW * 1.15, undefined, 1)

    // LN + γ, β parameter bars pointing into LN
    ctx.addSlab(
      [-0.405 * sx, 0, 0],
      [0.055 * sx, 0.54 * sy, 0.34 * sz],
      'sequence',
      block.color,
      normColor
    )
    ctx.addBar([-0.44 * sx, 0.32 * sy, -0.1 * sz], [0.018 * sx, 0.24 * sy, 0.06 * sz], PARAM_AMBER)
    ctx.addBar([-0.44 * sx, -0.32 * sy, 0.1 * sz], [0.018 * sx, 0.24 * sy, 0.06 * sz], COND_SKY)
    ctx.addMiniArrow(
      [-0.43 * sx, 0.28 * sy, -0.08 * sz],
      [-0.405 * sx, 0.22 * sy, -0.02 * sz],
      WEIGHT_INDIGO,
      arrowW * 0.75,
      undefined,
      0
    )
    ctx.addMiniArrow(
      [-0.43 * sx, -0.28 * sy, 0.08 * sz],
      [-0.405 * sx, -0.22 * sy, 0.02 * sz],
      COND_SKY,
      arrowW * 0.75,
      undefined,
      0
    )
    ctx.addMiniLabel(isAda ? 'AdaLN' : 'LN (γ,β)', [-0.41 * sx, 0.46 * sy, 0], normColor, 0.92)

    // Fanned parallel heads: Q/K/V Weights -> Q/K/V Vectors -> Attn Scores -> Softmax -> V Out
    const qkvY: [number, number, number] = [0.24 * sy, 0, -0.24 * sy]
    for (let h = 0; h < headCount; h++) {
      const z = (-0.5 + h / (headCount - 1)) * zSpan

      for (let r = 0; r < 3; r++) {
        const y = qkvY[r]!
        // Q/K/V Weight matrix (C × d_head)
        ctx.addSlab(
          [-0.29 * sx, y, z],
          [0.065 * sx, 0.15 * sy, headD],
          'transformer',
          '#6366f1',
          WEIGHT_INDIGO
        )
        // Q/K/V Vector (N × d_head)
        ctx.addSlab(
          [-0.175 * sx, y, z],
          [0.05 * sx, 0.15 * sy, headD],
          'sequence',
          block.color,
          accent
        )
        // Indigo weight-to-vector arrow
        ctx.addMiniArrow(
          [-0.255 * sx, y, z],
          [-0.205 * sx, y, z],
          WEIGHT_INDIGO,
          arrowW * 0.75,
          undefined,
          0
        )
        // Green activation from LN -> Q/K/V Vectors
        ctx.addMiniArrow(
          [-0.375 * sx, y * 0.45, z * 0.3],
          [-0.205 * sx, y, z],
          ACT_GREEN,
          arrowW * 0.7,
          [[-0.29 * sx, y * 0.85, z * 0.7]],
          h === 1 && r === 1 ? 1 : 0
        )
      }

      // Attn Scores (QK^T + b_ij) — true square N×N matrix
      ctx.addSlab(
        [-0.055 * sx, 0.1 * sy, z],
        [0.075 * sx, 0.34 * sy, headD],
        attnStyle,
        '#6366f1',
        WEIGHT_INDIGO
      )
      // Q & K -> Attn Scores
      ctx.addMiniArrow(
        [-0.148 * sx, qkvY[0], z],
        [-0.095 * sx, 0.16 * sy, z],
        ACT_GREEN,
        arrowW * 0.75,
        undefined,
        h === 0 ? 1 : 0
      )
      ctx.addMiniArrow(
        [-0.148 * sx, qkvY[1], z],
        [-0.095 * sx, 0.06 * sy, z],
        ACT_GREEN,
        arrowW * 0.75,
        undefined,
        0
      )

      // Pair Bias (b_ij) -> Attn Scores (indigo)
      ctx.addMiniArrow(
        [-0.055 * sx, -0.26 * sy, z * 0.4],
        [-0.055 * sx, -0.08 * sy, z],
        WEIGHT_INDIGO,
        arrowW * 0.75,
        undefined,
        h === 1 ? 1 : 0
      )

      // Explicit Softmax slab
      ctx.addSlab(
        [0.055 * sx, 0.1 * sy, z],
        [0.06 * sx, 0.3 * sy, headD],
        'heatmap',
        '#f59e0b',
        PARAM_AMBER
      )
      ctx.addMiniArrow(
        [-0.015 * sx, 0.1 * sy, z],
        [0.022 * sx, 0.1 * sy, z],
        ACT_GREEN,
        arrowW * 0.8,
        undefined,
        h === 1 ? 1 : 0
      )

      // V Out
      ctx.addSlab(
        [0.155 * sx, 0, z],
        [0.055 * sx, 0.34 * sy, headD],
        'sequence',
        block.color,
        accent
      )
      // Two clean arrows into V Out: Softmax -> V Out, and V Vectors -> V Out
      ctx.addMiniArrow(
        [0.088 * sx, 0.08 * sy, z],
        [0.125 * sx, 0.04 * sy, z],
        ACT_GREEN,
        arrowW * 0.8,
        undefined,
        h === 0 ? 1 : 0
      )
      ctx.addMiniArrow(
        [-0.148 * sx, qkvY[2], z],
        [0.125 * sx, -0.06 * sy, z],
        ACT_GREEN,
        arrowW * 0.72,
        [[0.0, -0.22 * sy, z]],
        h === 2 ? 1 : 0
      )

      // V Out -> Proj Weights
      ctx.addMiniArrow(
        [0.185 * sx, 0, z],
        [0.22 * sx, 0, z * 0.35],
        ACT_GREEN,
        arrowW * 0.75,
        undefined,
        0
      )
    }

    // Dedicated Pair Bias (b_ij) slab
    ctx.addSlab(
      [-0.055 * sx, -0.34 * sy, 0],
      [0.075 * sx, 0.18 * sy, 0.38 * sz],
      'pair',
      '#818cf8',
      WEIGHT_INDIGO
    )

    ctx.addMiniLabel('Q/K/V W', [-0.29 * sx, 0.44 * sy, zSpan * 0.25], WEIGHT_INDIGO, 0.88)
    ctx.addMiniLabel('Q/K/V', [-0.175 * sx, 0.44 * sy, zSpan * 0.25], accent, 0.88)
    ctx.addMiniLabel('Attn Scores', [-0.055 * sx, 0.42 * sy, zSpan * 0.25], WEIGHT_INDIGO, 0.88)
    ctx.addMiniLabel('Pair Bias b_ij', [-0.055 * sx, -0.52 * sy, 0], WEIGHT_INDIGO, 0.86)
    ctx.addMiniLabel('Softmax', [0.055 * sx, 0.4 * sy, zSpan * 0.25], PARAM_AMBER, 0.88)
    ctx.addMiniLabel('V Out', [0.155 * sx, -0.34 * sy, zSpan * 0.25], accent, 0.88)

    // Proj Weights (C×C) -> Attn Out
    ctx.addSlab(
      [0.24 * sx, 0, 0],
      [0.05 * sx, 0.48 * sy, 0.32 * sz],
      'transformer',
      '#6366f1',
      WEIGHT_INDIGO
    )
    ctx.addSlab(
      [0.31 * sx, 0, 0],
      [0.045 * sx, 0.48 * sy, 0.32 * sz],
      'sequence',
      block.color,
      accent
    )
    ctx.addMiniArrow(
      [0.268 * sx, 0, 0],
      [0.286 * sx, 0, 0],
      WEIGHT_INDIGO,
      arrowW * 0.9,
      undefined,
      1
    )
    ctx.addMiniLabel('Proj (C×C)', [0.24 * sx, 0.38 * sy, 0], WEIGHT_INDIGO, 0.86)
    ctx.addMiniLabel('Attn Out', [0.31 * sx, -0.38 * sy, 0], accent, 0.86)

    // Residual Skip 1: Entry -> Attn Out
    ctx.addMiniArrow(
      [-0.44 * sx, 0.32 * sy, 0],
      [0.31 * sx, 0.28 * sy, 0],
      ACT_GREEN,
      arrowW,
      [[-0.06 * sx, 0.56 * sy, 0]],
      2,
      0.38
    )

    // SwiGLU Transition: LN -> 4× W_gate/W_up (4C) -> SiLU ⊙ -> W_down (C)
    ctx.addMiniArrow([0.335 * sx, 0, 0], [0.355 * sx, 0, 0], ACT_GREEN, arrowW * 0.85, undefined, 0)
    ctx.addSlab(
      [0.368 * sx, 0, 0],
      [0.025 * sx, 0.42 * sy, 0.3 * sz],
      'sequence',
      block.color,
      normColor
    )
    ctx.addMiniArrow([0.382 * sx, 0, 0], [0.398 * sx, 0, 0], ACT_GREEN, arrowW * 0.85, undefined, 0)
    // 4× wider W_gate / W_up (4C)
    ctx.addSlab(
      [0.42 * sx, 0, 0],
      [0.042 * sx, 0.68 * sy, 0.82 * sz],
      'transformer',
      block.color,
      accent
    )
    ctx.addBar([0.452 * sx, 0, 0], [0.018 * sx, 0.58 * sy, 0.52 * sz], PARAM_AMBER)
    ctx.addMiniArrow([0.442 * sx, 0, 0], [0.468 * sx, 0, 0], ACT_GREEN, arrowW * 0.85, undefined, 0)
    ctx.addSlab(
      [0.48 * sx, 0, 0],
      [0.026 * sx, 0.42 * sy, 0.3 * sz],
      'sequence',
      block.color,
      accent
    )
    // Residual Skip 2: Attn Out -> W_down
    ctx.addMiniArrow(
      [0.31 * sx, 0.28 * sy, 0],
      [0.48 * sx, 0.25 * sy, 0],
      ACT_GREEN,
      arrowW * 0.9,
      [[0.4 * sx, 0.5 * sy, 0]],
      1,
      0.42
    )
    // Exit stub
    ctx.addMiniArrow([0.494 * sx, 0, 0], [0.5 * sx, 0, 0], ACT_GREEN, arrowW * 1.1, undefined, 1)

    ctx.addMiniLabel('SwiGLU 4× (4C)', [0.42 * sx, 0.48 * sy, 0], accent, 0.88)
    ctx.addMiniLabel('W_down', [0.48 * sx, -0.36 * sy, 0], accent, 0.84)
  } else {
    // --- 2-TIER LAYOUT (AtomEnc 3×, DiT 24×) ---
    const t1Y = 0.21 * sy
    const t2Y = -0.22 * sy
    const headCount = 3
    const zSpan = Math.max(sz * 0.66, 0.72)
    const headD = Math.max(0.06, sz * 0.085)

    // Entry stub (-0.5*sx -> LN on Tier 1)
    ctx.addMiniArrow(
      [-0.5 * sx, t1Y, 0],
      [-0.43 * sx, t1Y, 0],
      ACT_GREEN,
      arrowW * 1.1,
      undefined,
      1
    )

    // Tier 1: LN / AdaLN + γ, β bars
    ctx.addSlab(
      [-0.39 * sx, t1Y, 0],
      [0.075 * sx, 0.32 * sy, 0.34 * sz],
      'sequence',
      block.color,
      normColor
    )
    ctx.addBar(
      [-0.44 * sx, t1Y + 0.1 * sy, -0.1 * sz],
      [0.024 * sx, 0.16 * sy, 0.05 * sz],
      PARAM_AMBER
    )
    ctx.addBar([-0.44 * sx, t1Y - 0.1 * sy, 0.1 * sz], [0.024 * sx, 0.16 * sy, 0.05 * sz], COND_SKY)
    ctx.addMiniArrow(
      [-0.425 * sx, t1Y + 0.09 * sy, -0.08 * sz],
      [-0.39 * sx, t1Y + 0.08 * sy, -0.02 * sz],
      WEIGHT_INDIGO,
      arrowW * 0.75,
      undefined,
      0
    )
    ctx.addMiniArrow(
      [-0.425 * sx, t1Y - 0.09 * sy, 0.08 * sz],
      [-0.39 * sx, t1Y - 0.08 * sy, 0.02 * sz],
      COND_SKY,
      arrowW * 0.75,
      undefined,
      0
    )
    ctx.addMiniLabel(
      isAda ? 'AdaLN (γ,β)' : 'LN (γ,β)',
      [-0.39 * sx, t1Y + 0.24 * sy, 0],
      normColor,
      0.88
    )

    // Fanned heads on Tier 1
    for (let h = 0; h < headCount; h++) {
      const z = (-0.5 + h / (headCount - 1)) * zSpan

      // Q/K/V Weights
      ctx.addSlab(
        [-0.25 * sx, t1Y, z],
        [0.08 * sx, 0.28 * sy, headD],
        'transformer',
        '#6366f1',
        WEIGHT_INDIGO
      )
      // Q/K/V Vectors
      ctx.addSlab(
        [-0.12 * sx, t1Y, z],
        [0.075 * sx, 0.26 * sy, headD],
        'sequence',
        block.color,
        accent
      )
      ctx.addMiniArrow(
        [-0.205 * sx, t1Y, z],
        [-0.16 * sx, t1Y, z],
        WEIGHT_INDIGO,
        arrowW * 0.75,
        undefined,
        0
      )
      ctx.addMiniArrow(
        [-0.35 * sx, t1Y, z * 0.3],
        [-0.16 * sx, t1Y + 0.08 * sy, z],
        ACT_GREEN,
        arrowW * 0.7,
        [[-0.25 * sx, t1Y + 0.12 * sy, z * 0.7]],
        h === 1 ? 1 : 0
      )

      // Attn Scores (wide 32×128 for Local Window, square for DiT)
      ctx.addSlab(
        [0.03 * sx, t1Y, z],
        [isLocal ? 0.12 * sx : 0.095 * sx, isLocal ? 0.2 * sy : 0.26 * sy, headD],
        attnStyle,
        '#6366f1',
        WEIGHT_INDIGO
      )
      ctx.addMiniArrow(
        [-0.08 * sx, t1Y + 0.04 * sy, z],
        [isLocal ? -0.035 * sx : -0.02 * sx, t1Y + 0.04 * sy, z],
        ACT_GREEN,
        arrowW * 0.75,
        undefined,
        h === 0 ? 1 : 0
      )
      // Pair Bias -> Attn Scores
      ctx.addMiniArrow(
        [0.03 * sx, t1Y - 0.16 * sy, z * 0.4],
        [0.03 * sx, t1Y - 0.1 * sy, z],
        WEIGHT_INDIGO,
        arrowW * 0.7,
        undefined,
        0
      )

      // Softmax
      ctx.addSlab(
        [0.16 * sx, t1Y, z],
        [0.075 * sx, 0.24 * sy, headD],
        'heatmap',
        '#f59e0b',
        PARAM_AMBER
      )
      ctx.addMiniArrow(
        [isLocal ? 0.095 * sx : 0.08 * sx, t1Y, z],
        [0.12 * sx, t1Y, z],
        ACT_GREEN,
        arrowW * 0.75,
        undefined,
        h === 1 ? 1 : 0
      )

      // V Out
      ctx.addSlab(
        [0.27 * sx, t1Y, z],
        [0.07 * sx, 0.26 * sy, headD],
        'sequence',
        block.color,
        accent
      )
      ctx.addMiniArrow(
        [0.2 * sx, t1Y + 0.03 * sy, z],
        [0.233 * sx, t1Y + 0.03 * sy, z],
        ACT_GREEN,
        arrowW * 0.75,
        undefined,
        h === 0 ? 1 : 0
      )
      // V Vectors -> V Out bypass
      ctx.addMiniArrow(
        [-0.08 * sx, t1Y - 0.09 * sy, z],
        [0.233 * sx, t1Y - 0.07 * sy, z],
        ACT_GREEN,
        arrowW * 0.68,
        [[0.09 * sx, t1Y - 0.15 * sy, z]],
        h === 2 ? 1 : 0
      )
      ctx.addMiniArrow(
        [0.308 * sx, t1Y, z],
        [0.35 * sx, t1Y, z * 0.3],
        ACT_GREEN,
        arrowW * 0.72,
        undefined,
        0
      )
    }

    // Dedicated Pair Bias (b_ij) slab below Attn Scores
    ctx.addSlab(
      [0.03 * sx, t1Y - 0.19 * sy, 0],
      [0.09 * sx, 0.09 * sy, 0.34 * sz],
      'pair',
      '#818cf8',
      WEIGHT_INDIGO
    )

    // Proj Weights -> Attn Out on Tier 1
    ctx.addSlab(
      [0.37 * sx, t1Y, 0],
      [0.065 * sx, 0.3 * sy, 0.32 * sz],
      'transformer',
      '#6366f1',
      WEIGHT_INDIGO
    )
    ctx.addSlab(
      [0.44 * sx, t1Y, 0],
      [0.055 * sx, 0.3 * sy, 0.32 * sz],
      'sequence',
      block.color,
      accent
    )
    ctx.addMiniArrow(
      [0.405 * sx, t1Y, 0],
      [0.41 * sx, t1Y, 0],
      WEIGHT_INDIGO,
      arrowW * 0.85,
      undefined,
      0
    )

    // Residual Skip 1 over Tier 1
    ctx.addMiniArrow(
      [-0.43 * sx, t1Y + 0.16 * sy, 0],
      [0.44 * sx, t1Y + 0.16 * sy, 0],
      ACT_GREEN,
      arrowW,
      [[0, t1Y + 0.28 * sy, 0]],
      2,
      0.38
    )

    ctx.addMiniLabel('Q/K/V W', [-0.25 * sx, t1Y + 0.22 * sy, zSpan * 0.25], WEIGHT_INDIGO, 0.85)
    ctx.addMiniLabel('Q/K/V', [-0.12 * sx, t1Y + 0.22 * sy, zSpan * 0.25], accent, 0.85)
    ctx.addMiniLabel(
      isLocal ? 'Attn (32×128)' : 'Attn + b_ij',
      [0.03 * sx, t1Y + 0.22 * sy, zSpan * 0.25],
      WEIGHT_INDIGO,
      0.85
    )
    ctx.addMiniLabel('Pair Bias b_ij', [0.03 * sx, t1Y - 0.27 * sy, 0], WEIGHT_INDIGO, 0.82)
    ctx.addMiniLabel('Softmax', [0.16 * sx, t1Y + 0.2 * sy, zSpan * 0.25], PARAM_AMBER, 0.85)
    ctx.addMiniLabel('V Out', [0.27 * sx, t1Y - 0.22 * sy, zSpan * 0.25], accent, 0.85)
    ctx.addMiniLabel('Proj + Out', [0.4 * sx, t1Y + 0.22 * sy, 0], accent, 0.85)

    // Hop from Tier 1 Attn Out -> Tier 2 SwiGLU LN
    ctx.addMiniArrow(
      [0.44 * sx, t1Y - 0.15 * sy, 0],
      [-0.35 * sx, t2Y + 0.12 * sy, 0],
      ACT_GREEN,
      arrowW,
      [
        [0.18 * sx, 0.02 * sy, 0.22 * sz],
        [-0.18 * sx, -0.02 * sy, 0.22 * sz],
      ],
      2,
      0.42
    )

    // Tier 2: SwiGLU Transition: LN -> 4× W_gate/W_up (4C) -> SiLU ⊙ -> W_down (C) -> Exit stub
    ctx.addSlab(
      [-0.35 * sx, t2Y, 0],
      [0.075 * sx, 0.26 * sy, 0.3 * sz],
      'sequence',
      block.color,
      normColor
    )
    ctx.addMiniArrow([-0.31 * sx, t2Y, 0], [-0.19 * sx, t2Y, 0], ACT_GREEN, arrowW, undefined, 1)

    // 4× wider W_gate / W_up (4C)
    ctx.addSlab(
      [-0.08 * sx, t2Y, 0],
      [0.16 * sx, 0.34 * sy, 0.78 * sz],
      'transformer',
      block.color,
      accent
    )
    ctx.addBar([0.08 * sx, t2Y, 0], [0.04 * sx, 0.28 * sy, 0.52 * sz], PARAM_AMBER)
    ctx.addMiniArrow([0.01 * sx, t2Y, 0], [0.055 * sx, t2Y, 0], ACT_GREEN, arrowW, undefined, 0)
    ctx.addMiniArrow([0.105 * sx, t2Y, 0], [0.21 * sx, t2Y, 0], ACT_GREEN, arrowW, undefined, 1)

    ctx.addSlab(
      [0.27 * sx, t2Y, 0],
      [0.09 * sx, 0.26 * sy, 0.3 * sz],
      'sequence',
      block.color,
      accent
    )

    // Residual Skip 2 over SwiGLU
    ctx.addMiniArrow(
      [-0.35 * sx, t2Y - 0.14 * sy, 0],
      [0.27 * sx, t2Y - 0.14 * sy, 0],
      ACT_GREEN,
      arrowW,
      [[-0.04 * sx, t2Y - 0.25 * sy, 0]],
      1,
      0.42
    )

    // Exit stub (+0.5*sx)
    ctx.addMiniArrow([0.32 * sx, t2Y, 0], [0.5 * sx, t2Y, 0], ACT_GREEN, arrowW * 1.1, undefined, 1)

    ctx.addMiniLabel('SwiGLU LN', [-0.35 * sx, t2Y + 0.2 * sy, 0], normColor, 0.84)
    ctx.addMiniLabel('W_gate/up (4C)', [-0.08 * sx, t2Y + 0.23 * sy, 0], accent, 0.88)
    ctx.addMiniLabel('SiLU ⊙', [0.08 * sx, t2Y - 0.21 * sy, 0], PARAM_AMBER, 0.84)
    ctx.addMiniLabel('W_down (C)', [0.27 * sx, t2Y + 0.2 * sy, 0], accent, 0.86)
  }
}

function buildPairStack(ctx: DetailBuilderContext, block: TensorBlock3D, spec: DetailedBlockSpec) {
  const [sx, sy, sz] = block.size
  const accent = new THREE.Color(block.color).getHex()
  const triColor = 0xa855f7
  const zSpan = Math.max(sz * 0.66, 0.62)
  const headD = Math.max(0.055, sz * 0.08)
  const arrowW = THREE.MathUtils.clamp(sz * 0.04, 0.036, 0.068)

  // Entry stub (-0.5*sx -> TriMul Out)
  ctx.addMiniArrow(
    [-0.5 * sx, 0, 0],
    [-0.43 * sx, 0.15 * sy, -0.1 * sz],
    ACT_GREEN,
    arrowW,
    undefined,
    1
  )
  ctx.addMiniArrow(
    [-0.5 * sx, 0, 0],
    [-0.43 * sx, -0.15 * sy, 0.1 * sz],
    ACT_GREEN,
    arrowW,
    undefined,
    0
  )

  // 1. TriMul Out: 2 symmetric gated projection slabs (a_ik, b_jk) -> explicit ⊙ Out bar
  ctx.addSlab(
    [-0.38 * sx, 0.17 * sy, -0.12 * sz],
    [0.085 * sx, 0.26 * sy, 0.24 * sz],
    'pair',
    block.color,
    triColor
  )
  ctx.addSlab(
    [-0.38 * sx, -0.17 * sy, 0.12 * sz],
    [0.085 * sx, 0.26 * sy, 0.24 * sz],
    'pair',
    block.color,
    triColor
  )
  ctx.addBar([-0.28 * sx, 0, 0], [0.032 * sx, 0.48 * sy, 0.16 * sz], triColor)
  ctx.addMiniArrow(
    [-0.335 * sx, 0.16 * sy, -0.1 * sz],
    [-0.295 * sx, 0.06 * sy, 0],
    ACT_GREEN,
    arrowW * 0.85,
    undefined,
    1
  )
  ctx.addMiniArrow(
    [-0.335 * sx, -0.16 * sy, 0.1 * sz],
    [-0.295 * sx, -0.06 * sy, 0],
    ACT_GREEN,
    arrowW * 0.85,
    undefined,
    1
  )
  ctx.addMiniLabel('TriMul Out (a_ik⊙b_jk)', [-0.35 * sx, 0.4 * sy, 0], triColor, 0.88)

  // 2. TriMul In: structurally symmetric 2 gated slabs (a_ki, b_kj) -> explicit ⊙ In bar
  ctx.addMiniArrow(
    [-0.262 * sx, 0, 0],
    [-0.21 * sx, 0.15 * sy, -0.1 * sz],
    ACT_GREEN,
    arrowW * 0.85,
    undefined,
    1
  )
  ctx.addMiniArrow(
    [-0.262 * sx, 0, 0],
    [-0.21 * sx, -0.15 * sy, 0.1 * sz],
    ACT_GREEN,
    arrowW * 0.85,
    undefined,
    0
  )
  ctx.addSlab(
    [-0.165 * sx, 0.17 * sy, -0.12 * sz],
    [0.085 * sx, 0.26 * sy, 0.24 * sz],
    'pair',
    block.color,
    accent
  )
  ctx.addSlab(
    [-0.165 * sx, -0.17 * sy, 0.12 * sz],
    [0.085 * sx, 0.26 * sy, 0.24 * sz],
    'pair',
    block.color,
    accent
  )
  ctx.addBar([-0.065 * sx, 0, 0], [0.032 * sx, 0.48 * sy, 0.16 * sz], accent)
  ctx.addMiniArrow(
    [-0.12 * sx, 0.16 * sy, -0.1 * sz],
    [-0.08 * sx, 0.06 * sy, 0],
    ACT_GREEN,
    arrowW * 0.85,
    undefined,
    1
  )
  ctx.addMiniArrow(
    [-0.12 * sx, -0.16 * sy, 0.1 * sz],
    [-0.08 * sx, -0.06 * sy, 0],
    ACT_GREEN,
    arrowW * 0.85,
    undefined,
    1
  )
  ctx.addMiniLabel('TriMul In (a_ki⊙b_kj)', [-0.14 * sx, -0.4 * sy, 0], accent, 0.88)

  // 3. Separated 4× TriAttn Start (row) -> 4× TriAttn End (col)
  const heads = 4
  for (let h = 0; h < heads; h++) {
    const z = (-0.5 + h / (heads - 1)) * zSpan

    // TriAttn Start (row)
    ctx.addSlab([0.07 * sx, 0, z], [0.095 * sx, 0.44 * sy, headD], 'pair', '#6366f1', WEIGHT_INDIGO)
    ctx.addMiniArrow(
      [-0.048 * sx, 0, z * 0.25],
      [0.02 * sx, 0, z],
      ACT_GREEN,
      arrowW * 0.75,
      undefined,
      h % 2 === 0 ? 1 : 0
    )

    // TriAttn End (col)
    ctx.addSlab(
      [0.215 * sx, 0, z],
      [0.095 * sx, 0.44 * sy, headD],
      'pair',
      '#8b5cf6',
      WEIGHT_INDIGO
    )
    ctx.addMiniArrow(
      [0.12 * sx, 0, z],
      [0.165 * sx, 0, z],
      ACT_GREEN,
      arrowW * 0.75,
      undefined,
      h % 2 === 1 ? 1 : 0
    )

    // TriAttn End -> SwiGLU
    ctx.addMiniArrow(
      [0.265 * sx, 0, z],
      [0.315 * sx, 0, z * 0.3],
      ACT_GREEN,
      arrowW * 0.75,
      undefined,
      0
    )
  }
  ctx.addMiniLabel(
    `${spec.heads ?? 4}× TriAttn Start`,
    [0.07 * sx, 0.38 * sy, zSpan * 0.25],
    WEIGHT_INDIGO,
    0.86
  )
  ctx.addMiniLabel(
    `${spec.heads ?? 4}× TriAttn End`,
    [0.215 * sx, -0.38 * sy, zSpan * 0.25],
    WEIGHT_INDIGO,
    0.86
  )

  // 4. SwiGLU (4×: 128 -> 512 -> 128)
  ctx.addSlab(
    [0.36 * sx, 0, 0],
    [0.085 * sx, 0.68 * sy, 0.78 * sz],
    'transformer',
    block.color,
    accent
  )
  ctx.addSlab(
    [0.445 * sx, 0, 0],
    [0.055 * sx, 0.46 * sy, 0.34 * sz],
    'sequence',
    block.color,
    accent
  )
  ctx.addMiniArrow([0.405 * sx, 0, 0], [0.415 * sx, 0, 0], ACT_GREEN, arrowW * 0.9, undefined, 0)
  // Exit stub (+0.5*sx)
  ctx.addMiniArrow([0.475 * sx, 0, 0], [0.5 * sx, 0, 0], ACT_GREEN, arrowW * 1.1, undefined, 1)
  ctx.addMiniLabel('SwiGLU (4×)', [0.38 * sx, 0.44 * sy, 0], accent, 0.88)
}

function buildMsaBlock(ctx: DetailBuilderContext, block: TensorBlock3D, spec: DetailedBlockSpec) {
  const [sx, sy, sz] = block.size
  const accent = new THREE.Color(block.color).getHex()
  const zSpan = Math.max(sz * 0.64, 0.6)
  const headD = Math.max(0.055, sz * 0.085)
  const arrowW = THREE.MathUtils.clamp(sz * 0.04, 0.036, 0.065)

  // Entry stub (m_in)
  ctx.addMiniArrow(
    [-0.5 * sx, 0.2 * sy, 0],
    [-0.4 * sx, 0.2 * sy, 0],
    ACT_GREEN,
    arrowW * 1.1,
    undefined,
    1
  )

  // 1. OPM (c=32) receives m_in and updates Pair Stack (z += OPM(m))
  ctx.addBar([-0.33 * sx, -0.02 * sy, 0], [0.065 * sx, 0.3 * sy, 0.24 * sz], TEAL_OPM)
  ctx.addMiniArrow(
    [-0.4 * sx, 0.2 * sy, 0],
    [-0.33 * sx, 0.14 * sy, 0],
    ACT_GREEN,
    arrowW * 0.85,
    undefined,
    1
  )
  ctx.addMiniArrow(
    [-0.33 * sx, -0.18 * sy, 0],
    [-0.14 * sx, -0.26 * sy, 0],
    TEAL_OPM,
    arrowW,
    [[-0.28 * sx, -0.26 * sy, 0]],
    2,
    0.45
  )
  ctx.addMiniLabel('OPM (32) → z', [-0.33 * sx, -0.38 * sy, 0], TEAL_OPM, 0.88)

  // 2. Pair Stack (z): TriMul + TriAttn at bottom
  ctx.addSlab(
    [0.05 * sx, -0.26 * sy, 0],
    [0.38 * sx, 0.26 * sy, 0.46 * sz],
    'pair',
    '#8b5cf6',
    WEIGHT_INDIGO
  )
  ctx.addMiniLabel('Pair Stack (z)', [0.05 * sx, -0.46 * sy, 0], WEIGHT_INDIGO, 0.88)
  // Pair Stack exit stub -> Pair track
  ctx.addMiniArrow(
    [0.245 * sx, -0.26 * sy, 0],
    [0.5 * sx, -0.26 * sy, 0],
    ACT_GREEN,
    arrowW * 1.1,
    undefined,
    1
  )

  // 3. 8× PWA receives m_in (green) + pair-bias from Pair Stack z (indigo)
  const cols = 4
  for (let i = 0; i < cols; i++) {
    const z = (-0.5 + i / (cols - 1)) * zSpan
    ctx.addSlab([0.02 * sx, 0.2 * sy, z], [0.22 * sx, 0.3 * sy, headD], 'msa', block.color, accent)
    // m_in -> PWA
    ctx.addMiniArrow(
      [-0.4 * sx, 0.2 * sy, 0],
      [-0.095 * sx, 0.2 * sy, z],
      ACT_GREEN,
      arrowW * 0.85,
      [[-0.22 * sx, 0.22 * sy, z * 0.5]],
      i === 1 ? 1 : 0
    )
    // Pair Stack (z) -> PWA (indigo pair-bias!)
    ctx.addMiniArrow(
      [0.02 * sx, -0.12 * sy, z * 0.35],
      [0.02 * sx, 0.04 * sy, z],
      WEIGHT_INDIGO,
      arrowW * 0.8,
      undefined,
      i === 0 || i === 3 ? 1 : 0
    )
    // PWA -> MSA SwiGLU
    ctx.addMiniArrow(
      [0.135 * sx, 0.2 * sy, z],
      [0.255 * sx, 0.2 * sy, z * 0.3],
      ACT_GREEN,
      arrowW * 0.8,
      undefined,
      i === 2 ? 1 : 0
    )
  }
  ctx.addMiniLabel(`${spec.heads ?? 8}× PWA`, [0.02 * sx, 0.44 * sy, zSpan * 0.25], accent, 0.88)

  // 4. MSA SwiGLU -> Exit stub
  ctx.addSlab(
    [0.33 * sx, 0.2 * sy, 0],
    [0.14 * sx, 0.36 * sy, 0.4 * sz],
    'transformer',
    block.color,
    accent
  )
  ctx.addMiniLabel('MSA SwiGLU', [0.33 * sx, 0.46 * sy, 0], accent, 0.88)
  ctx.addMiniArrow(
    [0.405 * sx, 0.2 * sy, 0],
    [0.5 * sx, 0.2 * sy, 0],
    ACT_GREEN,
    arrowW * 1.1,
    undefined,
    1
  )
}

function buildConditioning(ctx: DetailBuilderContext, block: TensorBlock3D) {
  const [sx, sy, sz] = block.size
  const accent = new THREE.Color(block.color).getHex()
  const arrowW = THREE.MathUtils.clamp(sz * 0.04, 0.04, 0.07)

  // Entry stub
  ctx.addMiniArrow(
    [-0.5 * sx, 0.14 * sy, 0],
    [-0.39 * sx, 0.14 * sy, 0],
    ACT_GREEN,
    arrowW * 1.1,
    undefined,
    1
  )

  // Fourier Noise (256)
  ctx.addSlab(
    [-0.31 * sx, 0.14 * sy, 0],
    [0.15 * sx, 0.44 * sy, 0.42 * sz],
    'heatmap',
    '#ec4899',
    accent
  )
  ctx.addMiniLabel('Fourier (256)', [-0.31 * sx, 0.42 * sy, 0], accent, 0.9)

  // RelPos + Trunk fusion slab
  ctx.addSlab(
    [0, -0.05 * sy, 0],
    [0.18 * sx, 0.56 * sy, 0.48 * sz],
    'pair',
    '#8b5cf6',
    WEIGHT_INDIGO
  )
  ctx.addMiniLabel('RelPos + Trunk', [0, -0.4 * sy, 0], WEIGHT_INDIGO, 0.9)

  // Fourier -> RelPos + Trunk
  ctx.addMiniArrow(
    [-0.23 * sx, 0.12 * sy, 0],
    [-0.095 * sx, 0.02 * sy, 0],
    COND_SKY,
    arrowW,
    undefined,
    1
  )

  // AdaLN γ, β vertical projection bars
  ctx.addBar([0.3 * sx, 0.06 * sy, -0.14 * sz], [0.065 * sx, 0.56 * sy, 0.14 * sz], COND_SKY)
  ctx.addBar([0.36 * sx, -0.04 * sy, 0.14 * sz], [0.065 * sx, 0.56 * sy, 0.14 * sz], PARAM_AMBER)
  ctx.addMiniLabel('AdaLN γ', [0.28 * sx, 0.42 * sy, -0.14 * sz], COND_SKY, 0.88)
  ctx.addMiniLabel('AdaLN β', [0.36 * sx, -0.4 * sy, 0.14 * sz], PARAM_AMBER, 0.88)

  ctx.addMiniArrow(
    [0.095 * sx, 0.04 * sy, -0.04 * sz],
    [0.265 * sx, 0.06 * sy, -0.14 * sz],
    COND_SKY,
    arrowW,
    undefined,
    1
  )
  ctx.addMiniArrow(
    [0.095 * sx, -0.08 * sy, 0.04 * sz],
    [0.325 * sx, -0.04 * sy, 0.14 * sz],
    WEIGHT_INDIGO,
    arrowW,
    undefined,
    1
  )

  // Exit stubs
  ctx.addMiniArrow(
    [0.335 * sx, 0.06 * sy, -0.14 * sz],
    [0.5 * sx, 0, 0],
    COND_SKY,
    arrowW,
    undefined,
    1
  )
  ctx.addMiniArrow(
    [0.395 * sx, -0.04 * sy, 0.14 * sz],
    [0.5 * sx, 0, 0],
    COND_SKY,
    arrowW,
    undefined,
    0
  )
}

function buildAtomDec(ctx: DetailBuilderContext, block: TensorBlock3D, spec: DetailedBlockSpec) {
  const [sx, sy, sz] = block.size
  const accent = new THREE.Color(block.color).getHex()
  const zSpan = Math.max(sz * 0.66, 0.6)
  const headD = Math.max(0.055, sz * 0.085)
  const arrowW = THREE.MathUtils.clamp(sz * 0.04, 0.036, 0.065)

  // Entry stub -> Token->Atom
  ctx.addMiniArrow(
    [-0.5 * sx, 0.04 * sy, 0],
    [-0.42 * sx, 0.04 * sy, 0],
    ACT_GREEN,
    arrowW * 1.1,
    undefined,
    1
  )

  // Token->Atom broadcast
  ctx.addSlab(
    [-0.36 * sx, 0.04 * sy, 0],
    [0.1 * sx, 0.56 * sy, 0.4 * sz],
    'sequence',
    block.color,
    accent
  )
  ctx.addMiniLabel('Token→Atom', [-0.36 * sx, 0.4 * sy, 0], accent, 0.88)

  // AdaLN bar + arrow from Token->Atom + q_skip merge arrow
  ctx.addBar([-0.19 * sx, 0, 0], [0.05 * sx, 0.56 * sy, 0.24 * sz], COND_SKY)
  ctx.addMiniArrow(
    [-0.305 * sx, 0.04 * sy, 0],
    [-0.22 * sx, 0.02 * sy, 0],
    ACT_GREEN,
    arrowW,
    undefined,
    1
  )
  ctx.addMiniLabel('AdaLN', [-0.19 * sx, -0.38 * sy, 0], COND_SKY, 0.88)

  // 4 Fanned Local Attn heads (32×128 wide local-window bands)
  for (let h = 0; h < 4; h++) {
    const z = (-0.5 + h / 3) * zSpan
    ctx.addSlab(
      [0.06 * sx, 0, z],
      [0.24 * sx, 0.36 * sy, headD],
      'local-window',
      block.color,
      accent
    )
    ctx.addMiniArrow(
      [-0.16 * sx, 0, z * 0.3],
      [-0.065 * sx, 0, z],
      ACT_GREEN,
      arrowW * 0.8,
      undefined,
      h % 2 === 0 ? 1 : 0
    )
    ctx.addMiniArrow(
      [0.185 * sx, 0, z],
      [0.305 * sx, 0, z * 0.3],
      ACT_GREEN,
      arrowW * 0.8,
      undefined,
      h % 2 === 1 ? 1 : 0
    )
  }
  ctx.addMiniLabel(
    `${spec.heads ?? 4}× Local Attn (32×128)`,
    [0.06 * sx, 0.36 * sy, zSpan * 0.28],
    accent,
    0.86
  )

  // Output Δr [N_atom, 3]
  ctx.addSlab(
    [0.36 * sx, 0, 0],
    [0.1 * sx, 0.56 * sy, 0.4 * sz],
    'point-cloud',
    '#10b981',
    0x10b981
  )
  ctx.addMiniLabel('Δr [N_atom,3]', [0.36 * sx, -0.38 * sy, 0], 0x10b981, 0.88)

  // q_skip merge arrow into AdaLN + residual to Δr
  ctx.addMiniArrow(
    [-0.36 * sx, -0.34 * sy, 0],
    [-0.19 * sx, -0.28 * sy, 0],
    ACT_GREEN,
    arrowW * 0.9,
    undefined,
    1
  )
  ctx.addMiniArrow(
    [-0.36 * sx, -0.34 * sy, 0],
    [0.36 * sx, -0.3 * sy, 0],
    ACT_GREEN,
    arrowW,
    [[0, -0.44 * sy, 0]],
    2,
    0.42
  )
  ctx.addMiniLabel('q_skip', [0, -0.5 * sy, 0], ACT_GREEN, 0.84)

  // Exit stub
  ctx.addMiniArrow([0.415 * sx, 0, 0], [0.5 * sx, 0, 0], ACT_GREEN, arrowW * 1.1, undefined, 1)
}

function buildConfidenceHeads(ctx: DetailBuilderContext, block: TensorBlock3D) {
  const [sx, sy, sz] = block.size
  const arrowW = THREE.MathUtils.clamp(sz * 0.038, 0.036, 0.062)
  const heads: Array<{
    label: string
    color: string
    hex: number
    style: MatrixStyle
    is2D: boolean
  }> = [
    { label: 'pLDDT (50)', color: '#22c55e', hex: 0x22c55e, style: 'sequence', is2D: false },
    { label: 'PAE (64×64)', color: '#10b981', hex: 0x10b981, style: 'pair', is2D: true },
    { label: 'PDE (64×64)', color: '#14b8a6', hex: 0x14b8a6, style: 'heatmap', is2D: true },
    { label: 'Disto (64)', color: '#06b6d4', hex: 0x06b6d4, style: 'pair', is2D: true },
    { label: 'Exp.Res (2)', color: '#3b82f6', hex: 0x3b82f6, style: 'sequence', is2D: false },
  ]

  const zSpan = Math.max(sz * 0.82, 0.96)
  heads.forEach((h, i) => {
    const z = (-0.5 + i / (heads.length - 1)) * zSpan
    const x = -0.04 * sx + (i % 2 === 0 ? -0.05 * sx : 0.05 * sx)
    // 1D per-atom heads: narrow vertical strips; 2D pairwise heads: square 2D matrices
    const slabW = h.is2D ? 0.24 * sx : 0.08 * sx
    const slabH = h.is2D ? 0.32 * sy : 0.56 * sy
    const slabD = Math.max(0.055, sz * 0.08)

    ctx.addSlab([x, 0, z], [slabW, slabH, slabD], h.style, h.color, h.hex)

    // Entry stub fanning out to all 5 heads
    ctx.addMiniArrow(
      [-0.5 * sx, 0, 0],
      [x - slabW * 0.52, 0, z],
      ACT_GREEN,
      arrowW * 0.8,
      [[-0.34 * sx, 0, z * 0.5]],
      i % 2 === 0 ? 1 : 0
    )

    // Converging arrows into pTM / ipTM ranker
    ctx.addMiniArrow(
      [x + slabW * 0.52, 0, z],
      [0.31 * sx, 0, 0],
      h.hex,
      arrowW * 0.85,
      [[0.22 * sx, 0, z * 0.35]],
      1,
      0.48
    )

    // Label ALL 5 heads cleanly, staggered top/bottom so zero labels overlap
    const labelY = i % 2 === 0 ? 0.4 * sy : -0.4 * sy
    ctx.addMiniLabel(h.label, [x, labelY, z], h.hex, 0.86)
  })

  // Converging pTM / ipTM ranking node + Exit stub
  ctx.addBar([0.35 * sx, 0, 0], [0.09 * sx, 0.54 * sy, 0.32 * sz], 0x16a34a)
  ctx.addMiniLabel('pTM / ipTM', [0.35 * sx, 0.42 * sy, 0], 0x16a34a, 0.88)
  ctx.addMiniArrow([0.4 * sx, 0, 0], [0.5 * sx, 0, 0], ACT_GREEN, arrowW * 1.1, undefined, 1)
}

export function buildInPlaceDetailedBlock(
  block: TensorBlock3D,
  isDark: boolean
): DetailedBlockVisual | null {
  const spec = block.detailedSpec
  if (!spec) return null

  const ctx = new DetailBuilderContext(block, isDark)
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
    updateLabelScales: (camDist: number) => {
      const factor = THREE.MathUtils.clamp(camDist / 11, 0.72, 1.32)
      for (const sprite of ctx.miniLabels) {
        const base = sprite.userData.baseSize as [number, number] | undefined
        if (base) {
          sprite.scale.set(base[0] * factor, base[1] * factor, 1)
        }
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
