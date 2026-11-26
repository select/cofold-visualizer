import * as THREE from 'three'
import type { DetailedBlockSpec, MatrixStyle, TensorBlock3D } from '~/types/architecture'
import {
  createMiniLabelSprite,
  createRecycleLoopBadgeSprite,
  createTensorMatrixTexture,
} from './textures'

export interface DetailedBlockVisual {
  group: THREE.Group
  frameLine: THREE.LineSegments
  frameMat: THREE.LineBasicMaterial
  miniLabels: THREE.Sprite[]
  detailSize: [number, number, number]
  stackCount: number
  isStackMulti: boolean
  stackHitMeshes: THREE.Mesh[]
  setStackMulti: (multi: boolean) => void
  setHoveredSlice: (sliceIndex: number | null) => void
  update: (dt: number, isFlowPlaying: boolean) => void
  setLabelsVisible: (visible: boolean) => void
  updateLabelScales: (camDist: number) => void
  setHighlighted: (
    selected: boolean,
    hovered: boolean,
    isFocused: boolean,
    isDark: boolean,
    docActive?: boolean
  ) => void
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

interface SliceBucket {
  group: THREE.Group
  slabMaterials: THREE.MeshStandardMaterial[]
  edgeMaterials: THREE.LineBasicMaterial[]
  flowTracks: MiniFlowTrack[]
  frameMat: THREE.LineBasicMaterial | null
  hitMesh: THREE.Mesh | null
  opacityMul: number
}

const HOVER_RED = 0xef4444
const FRAME_GRAY = 0x94a3b8
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
  public readonly slices: SliceBucket[] = []
  public readonly stackHitMeshes: THREE.Mesh[] = []

  private currentSlice: SliceBucket
  private readonly geometries: THREE.BufferGeometry[] = []
  private readonly materials: THREE.Material[] = []
  private readonly textures: THREE.Texture[] = []
  private readonly texCache = new Map<string, THREE.CanvasTexture>()
  private readonly beadGeo = new THREE.SphereGeometry(0.03, 7, 7)
  private zOffset = 0
  private includeLabels = true

  constructor(
    private readonly block: TensorBlock3D,
    private readonly isDark: boolean
  ) {
    this.geometries.push(this.beadGeo)
    this.currentSlice = this.createSliceBucket(0)
    this.slices.push(this.currentSlice)
  }

  private createSliceBucket(zOffset: number): SliceBucket {
    const g = new THREE.Group()
    g.position.z = zOffset
    this.group.add(g)
    return {
      group: g,
      slabMaterials: [],
      edgeMaterials: [],
      flowTracks: [],
      frameMat: null,
      hitMesh: null,
      opacityMul: 1,
    }
  }

  public beginSlice(index: number, zOffset: number, includeLabels: boolean): SliceBucket {
    this.zOffset = 0
    this.includeLabels = includeLabels
    if (index === 0) {
      this.currentSlice.group.position.z = zOffset
      return this.currentSlice
    }
    const bucket = this.createSliceBucket(zOffset)
    this.slices.push(bucket)
    this.currentSlice = bucket
    return bucket
  }

  public setDefaultTarget() {
    this.zOffset = 0
    this.includeLabels = true
    this.currentSlice = this.slices[0]!
  }

  public addSliceFrame(size: [number, number, number], color: THREE.Color, sliceIndex: number) {
    const geo = new THREE.BoxGeometry(size[0], size[1], size[2])
    const edges = new THREE.EdgesGeometry(geo)
    this.geometries.push(geo, edges)
    const mat = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: this.isDark ? 0.24 : 0.22,
    })
    this.materials.push(mat)
    this.currentSlice.frameMat = mat
    const wire = new THREE.LineSegments(edges, mat)
    wire.userData = { blockId: this.block.id, stackSliceIndex: sliceIndex }
    this.currentSlice.group.add(wire)

    const hitMat = new THREE.MeshBasicMaterial({ visible: false })
    this.materials.push(hitMat)
    const hitMesh = new THREE.Mesh(geo, hitMat)
    hitMesh.userData = { blockId: this.block.id, stackSliceIndex: sliceIndex }
    this.currentSlice.group.add(hitMesh)
    this.currentSlice.hitMesh = hitMesh
    this.stackHitMeshes.push(hitMesh)
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
    const desatTex = this.getTexture(style, '#94a3b8')
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      color: 0xffffff,
      roughness: 0.36,
      metalness: 0.06,
      transparent: true,
      opacity,
    })
    mat.userData.origMap = tex
    mat.userData.desatMap = desatTex
    mat.userData.origColor = mat.color.clone()
    this.materials.push(mat)
    this.currentSlice.slabMaterials.push(mat)

    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(pos[0], pos[1], pos[2] + this.zOffset)
    mesh.userData = { blockId: this.block.id }
    this.currentSlice.group.add(mesh)

    const lineMat = new THREE.LineBasicMaterial({
      color: edgeColor,
      transparent: true,
      opacity: this.isDark ? 0.62 : 0.56,
    })
    lineMat.userData.origColor = lineMat.color.clone()
    this.materials.push(lineMat)
    this.currentSlice.edgeMaterials.push(lineMat)
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
    mat.userData.origColor = mat.color.clone()
    this.materials.push(mat)
    this.currentSlice.slabMaterials.push(mat)

    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(pos[0], pos[1], pos[2] + this.zOffset)
    mesh.userData = { blockId: this.block.id }
    this.currentSlice.group.add(mesh)

    const lineMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: this.isDark ? 0.32 : 0.38,
    })
    lineMat.userData.origColor = lineMat.color.clone()
    this.materials.push(lineMat)
    this.currentSlice.edgeMaterials.push(lineMat)
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
    const oz = this.zOffset
    const pts = [from, ...(controlPoints ?? []), to].map(
      p => new THREE.Vector3(p[0], p[1], p[2] + oz)
    )
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
    ribbonMat.userData.origColor = ribbonMat.color.clone()
    this.materials.push(ribbonMat)

    const mesh = new THREE.Mesh(geo, ribbonMat)
    mesh.renderOrder = 4
    mesh.userData = { blockId: this.block.id }
    this.currentSlice.group.add(mesh)

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
      this.currentSlice.group.add(bead)
      beads.push(bead)
      offsets.push(i / Math.max(1, beadCount))
    }

    this.currentSlice.flowTracks.push({ curve, ribbonMat, baseOpacity, beads, offsets, speed })
  }

  public addMiniLabel(
    text: string,
    pos: [number, number, number],
    accentHex?: number,
    scaleMultiplier = 1
  ) {
    const sprite = createMiniLabelSprite(text, accentHex)
    this.registerLabelSprite(sprite, pos, 0.22 * scaleMultiplier)
  }

  public addLoopBadge(text: string, pos: [number, number, number], scaleMultiplier = 1) {
    const sprite = createRecycleLoopBadgeSprite(text, this.isDark)
    this.registerLabelSprite(sprite, pos, 0.22 * scaleMultiplier)
  }

  private registerLabelSprite(
    sprite: THREE.Sprite,
    pos: [number, number, number],
    rawBaseH: number
  ) {
    if (!this.includeLabels) {
      if (sprite.material.map) sprite.material.map.dispose()
      sprite.material.dispose()
      return
    }
    if (sprite.material.map) {
      this.textures.push(sprite.material.map)
    }
    this.materials.push(sprite.material)

    const [sx] = this.block.size
    const sizeScale = THREE.MathUtils.clamp(sx / 4.8, 0.58, 1.0)
    const aspect = (sprite.userData.aspect as number) || 2.5
    const baseH = rawBaseH * sizeScale
    const baseW = baseH * aspect
    sprite.userData.baseSize = [baseW, baseH]
    sprite.scale.set(baseW, baseH, 1)
    sprite.position.set(pos[0], pos[1], pos[2] + this.zOffset)
    sprite.renderOrder = 21
    sprite.visible = false
    this.currentSlice.group.add(sprite)
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

  // Always use the spacious Left-to-Right layout (detail size is dynamically expanded on expansion)
  const headCount = Math.min(spec.heads ?? 4, 4)
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
  ctx.addMiniLabel(
    isAda ? 'Adaptive LayerNorm' : 'LayerNorm',
    [-0.41 * sx, 0.34 * sy, 0.14 * sz],
    normColor,
    0.86
  )

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
    ctx.addSlab([0.155 * sx, 0, z], [0.055 * sx, 0.34 * sy, headD], 'sequence', block.color, accent)
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

  const qkvNames = ['Query', 'Key', 'Value'] as const
  const qkvWeightNames = ['Query Weights', 'Key Weights', 'Value Weights'] as const
  const frontZ = zSpan * 0.5 + headD * 0.65
  for (let r = 0; r < 3; r++) {
    const y = qkvY[r]!
    ctx.addMiniLabel(qkvWeightNames[r]!, [-0.29 * sx, y, frontZ], WEIGHT_INDIGO, 0.68)
    ctx.addMiniLabel(qkvNames[r]!, [-0.175 * sx, y, frontZ], accent, 0.68)
  }
  ctx.addMiniLabel(
    isLocal ? 'Local Attention' : 'Attention + Pair Bias',
    [-0.055 * sx, 0.28 * sy, zSpan * 0.5],
    WEIGHT_INDIGO,
    0.76
  )
  ctx.addMiniLabel('Pair Bias', [-0.055 * sx, -0.32 * sy, 0.2 * sz], WEIGHT_INDIGO, 0.76)
  ctx.addMiniLabel('Softmax', [0.055 * sx, 0.26 * sy, zSpan * 0.5], PARAM_AMBER, 0.76)
  ctx.addMiniLabel('Value Output', [0.155 * sx, -0.26 * sy, zSpan * 0.5], accent, 0.76)

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
  ctx.addMiniLabel('Output Projection', [0.24 * sx, 0.3 * sy, 0.16 * sz], WEIGHT_INDIGO, 0.8)
  ctx.addMiniLabel('Attention Output', [0.31 * sx, -0.3 * sy, 0.16 * sz], accent, 0.8)

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
  ctx.addSlab([0.48 * sx, 0, 0], [0.026 * sx, 0.42 * sy, 0.3 * sz], 'sequence', block.color, accent)
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

  ctx.addMiniLabel('SwiGLU Feed-Forward', [0.42 * sx, 0.34 * sy, 0.18 * sz], accent, 0.82)
  ctx.addMiniLabel('Down Projection', [0.48 * sx, -0.3 * sy, 0.14 * sz], accent, 0.78)
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
  ctx.addMiniLabel(
    'Triangle Multiplication Outgoing',
    [-0.35 * sx, 0.28 * sy, 0.14 * sz],
    triColor,
    0.8
  )

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
  ctx.addMiniLabel(
    'Triangle Multiplication Incoming',
    [-0.14 * sx, -0.28 * sy, 0.14 * sz],
    accent,
    0.8
  )

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
      [0.305 * sx, 0, z * 0.3],
      ACT_GREEN,
      arrowW * 0.75,
      undefined,
      0
    )
  }
  ctx.addMiniLabel(
    `${spec.heads ?? 4}× Triangle Attention Starting`,
    [0.07 * sx, 0.28 * sy, zSpan * 0.5],
    WEIGHT_INDIGO,
    0.78
  )
  ctx.addMiniLabel(
    `${spec.heads ?? 4}× Triangle Attention Ending`,
    [0.215 * sx, -0.28 * sy, zSpan * 0.5],
    WEIGHT_INDIGO,
    0.78
  )

  // 4. SwiGLU (4×: 128 -> 512 -> 128)
  ctx.addSlab(
    [0.348 * sx, 0, 0],
    [0.078 * sx, 0.68 * sy, 0.78 * sz],
    'transformer',
    block.color,
    accent
  )
  ctx.addSlab(
    [0.456 * sx, 0, 0],
    [0.052 * sx, 0.46 * sy, 0.34 * sz],
    'sequence',
    block.color,
    accent
  )
  ctx.addMiniArrow([0.39 * sx, 0, 0], [0.428 * sx, 0, 0], ACT_GREEN, arrowW * 0.9, undefined, 0)
  // Exit stub (+0.5*sx)
  ctx.addMiniArrow([0.484 * sx, 0, 0], [0.5 * sx, 0, 0], ACT_GREEN, arrowW * 1.1, undefined, 1)
  ctx.addMiniLabel('SwiGLU Feed-Forward', [0.38 * sx, 0.3 * sy, 0.15 * sz], accent, 0.8)
}

function buildMsaBlock(ctx: DetailBuilderContext, block: TensorBlock3D, spec: DetailedBlockSpec) {
  const [sx, sy, sz] = block.size
  const accent = new THREE.Color(block.color).getHex()
  const zSpan = Math.max(sz * 0.64, 0.6)
  const headD = Math.max(0.055, sz * 0.085)
  const arrowW = THREE.MathUtils.clamp(sz * 0.04, 0.036, 0.065)

  // 1. OPM (c=32) receives m_in via smooth curve and updates Pair Stack (z += OPM(m))
  ctx.addBar([-0.33 * sx, -0.02 * sy, 0], [0.065 * sx, 0.3 * sy, 0.24 * sz], TEAL_OPM)
  ctx.addMiniArrow(
    [-0.5 * sx, 0.2 * sy, 0],
    [-0.33 * sx, 0.14 * sy, 0],
    ACT_GREEN,
    arrowW * 0.9,
    [
      [-0.41 * sx, 0.2 * sy, 0],
      [-0.36 * sx, 0.18 * sy, 0],
    ],
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
  ctx.addMiniLabel('Outer Product Mean', [-0.33 * sx, -0.28 * sy, 0.15 * sz], TEAL_OPM, 0.8)

  // 2. Pair Stack (z): TriMul + TriAttn at bottom
  ctx.addSlab(
    [0.05 * sx, -0.26 * sy, 0],
    [0.38 * sx, 0.26 * sy, 0.46 * sz],
    'pair',
    '#8b5cf6',
    WEIGHT_INDIGO
  )
  ctx.addMiniLabel('Pair Stack', [0.05 * sx, -0.36 * sy, 0.15 * sz], WEIGHT_INDIGO, 0.82)
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
    // m_in -> PWA (smooth tangential fan-out from entry)
    ctx.addMiniArrow(
      [-0.5 * sx, 0.2 * sy, 0],
      [-0.095 * sx, 0.2 * sy, z],
      ACT_GREEN,
      arrowW * 0.85,
      [
        [-0.38 * sx, 0.2 * sy, 0],
        [-0.24 * sx, 0.21 * sy, z * 0.45],
      ],
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
  ctx.addMiniLabel(
    `${spec.heads ?? 8}× Pair-Weighted Averaging`,
    [0.02 * sx, 0.34 * sy, zSpan * 0.5],
    accent,
    0.8
  )

  // 4. MSA SwiGLU -> Exit stub
  ctx.addSlab(
    [0.33 * sx, 0.2 * sy, 0],
    [0.14 * sx, 0.36 * sy, 0.4 * sz],
    'transformer',
    block.color,
    accent
  )
  ctx.addMiniLabel('MSA SwiGLU Feed-Forward', [0.33 * sx, 0.34 * sy, 0.15 * sz], accent, 0.8)
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
  ctx.addMiniArrow([-0.5 * sx, 0, 0], [-0.39 * sx, 0, 0], ACT_GREEN, arrowW * 1.1, undefined, 1)

  // Fourier Noise (256)
  ctx.addSlab([-0.31 * sx, 0, 0], [0.15 * sx, 0.44 * sy, 0.42 * sz], 'heatmap', '#ec4899', accent)
  ctx.addMiniLabel('Fourier Embedding', [-0.31 * sx, 0.28 * sy, 0.14 * sz], accent, 0.82)

  // RelPos + Trunk fusion slab
  ctx.addSlab([0, 0, 0], [0.18 * sx, 0.56 * sy, 0.48 * sz], 'pair', '#8b5cf6', WEIGHT_INDIGO)
  ctx.addMiniLabel('Relative Position + Trunk', [0, -0.32 * sy, 0.16 * sz], WEIGHT_INDIGO, 0.82)

  // Fourier -> RelPos + Trunk
  ctx.addMiniArrow([-0.23 * sx, 0, 0], [-0.095 * sx, 0, 0], COND_SKY, arrowW, undefined, 1)

  // AdaLN γ, β vertical projection bars (center-aligned along Y)
  ctx.addBar([0.3 * sx, 0, -0.14 * sz], [0.065 * sx, 0.56 * sy, 0.14 * sz], COND_SKY)
  ctx.addBar([0.36 * sx, 0, 0.14 * sz], [0.065 * sx, 0.56 * sy, 0.14 * sz], PARAM_AMBER)
  ctx.addMiniLabel('Adaptive LayerNorm Scale', [0.28 * sx, 0.32 * sy, -0.14 * sz], COND_SKY, 0.8)
  ctx.addMiniLabel('Adaptive LayerNorm Shift', [0.36 * sx, -0.32 * sy, 0.14 * sz], PARAM_AMBER, 0.8)

  ctx.addMiniArrow(
    [0.095 * sx, 0.04 * sy, -0.04 * sz],
    [0.265 * sx, 0, -0.14 * sz],
    COND_SKY,
    arrowW,
    undefined,
    1
  )
  ctx.addMiniArrow(
    [0.095 * sx, -0.04 * sy, 0.04 * sz],
    [0.325 * sx, 0, 0.14 * sz],
    WEIGHT_INDIGO,
    arrowW,
    undefined,
    1
  )

  // Exit stubs
  ctx.addMiniArrow([0.335 * sx, 0, -0.14 * sz], [0.5 * sx, 0, 0], COND_SKY, arrowW, undefined, 1)
  ctx.addMiniArrow([0.395 * sx, 0, 0.14 * sz], [0.5 * sx, 0, 0], COND_SKY, arrowW, undefined, 0)
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
  ctx.addMiniLabel('Token to Atom Broadcast', [-0.36 * sx, 0.3 * sy, 0.14 * sz], accent, 0.82)

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
  ctx.addMiniLabel('Adaptive LayerNorm', [-0.19 * sx, -0.3 * sy, 0.14 * sz], COND_SKY, 0.82)

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
    `${spec.heads ?? 4}× Local Attention`,
    [0.06 * sx, 0.26 * sy, zSpan * 0.5],
    accent,
    0.8
  )

  // Output Δr [N_atom, 3]
  ctx.addSlab(
    [0.36 * sx, 0, 0],
    [0.1 * sx, 0.56 * sy, 0.4 * sz],
    'point-cloud',
    '#10b981',
    0x10b981
  )
  ctx.addMiniLabel('Coordinate Update', [0.36 * sx, -0.3 * sy, 0.14 * sz], 0x10b981, 0.82)

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
  ctx.addMiniLabel('Skip Connection', [0, -0.36 * sy, 0.14 * sz], ACT_GREEN, 0.8)

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
    { label: 'Local Confidence', color: '#22c55e', hex: 0x22c55e, style: 'sequence', is2D: false },
    {
      label: 'Predicted Aligned Error',
      color: '#10b981',
      hex: 0x10b981,
      style: 'pair',
      is2D: true,
    },
    {
      label: 'Predicted Distance Error',
      color: '#14b8a6',
      hex: 0x14b8a6,
      style: 'heatmap',
      is2D: true,
    },
    { label: 'Distogram', color: '#06b6d4', hex: 0x06b6d4, style: 'pair', is2D: true },
    {
      label: 'Experimentally Resolved',
      color: '#3b82f6',
      hex: 0x3b82f6,
      style: 'sequence',
      is2D: false,
    },
  ]

  const zSpan = Math.max(sz * 0.82, 0.96)
  const xOffsets = [-0.22 * sx, -0.13 * sx, -0.04 * sx, 0.05 * sx, 0.14 * sx]
  const labelYOffsets = [0.32 * sy, -0.28 * sy, 0.28 * sy, -0.34 * sy, 0.2 * sy]
  heads.forEach((h, i) => {
    const z = (-0.5 + i / (heads.length - 1)) * zSpan
    const x = xOffsets[i]!
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
      [[-0.36 * sx, 0, z * 0.5]],
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

    // Label ALL 5 heads cleanly, fanned diagonally with distinct Y offsets so zero labels overlap
    const labelY = labelYOffsets[i]!
    ctx.addMiniLabel(h.label, [x, labelY, z], h.hex, 0.76)
  })

  // Converging pTM / ipTM ranking node + Exit stub
  ctx.addBar([0.35 * sx, 0, 0], [0.09 * sx, 0.54 * sy, 0.32 * sz], 0x16a34a)
  ctx.addMiniLabel('Template Modeling Score', [0.35 * sx, 0.32 * sy, 0.16 * sz], 0x16a34a, 0.82)
  ctx.addMiniArrow([0.4 * sx, 0, 0], [0.5 * sx, 0, 0], ACT_GREEN, arrowW * 1.1, undefined, 1)
}

function buildTokenFeatures(ctx: DetailBuilderContext, block: TensorBlock3D) {
  const [sx, sy, sz] = block.size
  const accent = new THREE.Color(block.color).getHex()
  const arrowW = THREE.MathUtils.clamp(sz * 0.04, 0.036, 0.065)

  // Three parallel token feature inputs: restype [32], profile [32], deletion_mean [1]
  const inputs: Array<{
    label: string
    y: number
    z: number
    h: number
    style: MatrixStyle
    color: string
    hex: number
  }> = [
    {
      label: 'Residue Type [32]',
      y: 0.28 * sy,
      z: -0.14 * sz,
      h: 0.22 * sy,
      style: 'sequence',
      color: block.color,
      hex: accent,
    },
    {
      label: 'MSA Profile [32]',
      y: 0,
      z: 0,
      h: 0.22 * sy,
      style: 'heatmap',
      color: '#6366f1',
      hex: WEIGHT_INDIGO,
    },
    {
      label: 'Deletion Mean [1]',
      y: -0.28 * sy,
      z: 0.14 * sz,
      h: 0.14 * sy,
      style: 'sequence',
      color: '#0ea5e9',
      hex: COND_SKY,
    },
  ]

  for (let i = 0; i < inputs.length; i++) {
    const inp = inputs[i]!
    ctx.addSlab(
      [-0.32 * sx, inp.y, inp.z],
      [0.16 * sx, inp.h, 0.28 * sz],
      inp.style,
      inp.color,
      inp.hex
    )
    ctx.addMiniArrow(
      [-0.23 * sx, inp.y, inp.z],
      [-0.04 * sx, inp.y * 0.25, 0],
      ACT_GREEN,
      arrowW * 0.85,
      undefined,
      1
    )
    ctx.addMiniLabel(
      inp.label,
      [-0.32 * sx, inp.y + (i === 2 ? -0.16 : 0.18) * sy, inp.z + 0.16 * sz],
      inp.hex,
      0.78
    )
  }

  // Concatenation bar
  ctx.addBar([0, 0, 0], [0.055 * sx, 0.62 * sy, 0.34 * sz], PARAM_AMBER)
  ctx.addMiniLabel('Concatenate', [0, 0.38 * sy, 0.16 * sz], PARAM_AMBER, 0.82)

  // Output f_token [N_token, 65]
  ctx.addMiniArrow([0.035 * sx, 0, 0], [0.17 * sx, 0, 0], ACT_GREEN, arrowW, undefined, 1)
  ctx.addSlab([0.28 * sx, 0, 0], [0.2 * sx, 0.64 * sy, 0.42 * sz], 'sequence', block.color, accent)
  ctx.addMiniLabel('Token Features [65]', [0.28 * sx, -0.38 * sy, 0.18 * sz], accent, 0.84)

  // Exit stub
  ctx.addMiniArrow([0.39 * sx, 0, 0], [0.5 * sx, 0, 0], ACT_GREEN, arrowW * 1.1, undefined, 1)
}

function buildRefConformers(ctx: DetailBuilderContext, block: TensorBlock3D) {
  const [sx, sy, sz] = block.size
  const accent = new THREE.Color(block.color).getHex()
  const arrowW = THREE.MathUtils.clamp(sz * 0.04, 0.036, 0.065)

  // 1. Ref 3D Pos (point-cloud), Element + Charge, Atom Name Chars
  ctx.addSlab(
    [-0.34 * sx, 0.24 * sy, -0.1 * sz],
    [0.16 * sx, 0.28 * sy, 0.32 * sz],
    'point-cloud',
    '#10b981',
    0x10b981
  )
  ctx.addMiniLabel('Ref Coords [3D]', [-0.34 * sx, 0.44 * sy, -0.02 * sz], 0x10b981, 0.78)

  ctx.addSlab(
    [-0.34 * sx, -0.22 * sy, 0.1 * sz],
    [0.16 * sx, 0.26 * sy, 0.32 * sz],
    'sequence',
    block.color,
    accent
  )
  ctx.addMiniLabel('Element & Charge', [-0.34 * sx, -0.42 * sy, 0.16 * sz], accent, 0.78)

  // 2. Covalent Bond Topology (local-window)
  ctx.addSlab(
    [-0.04 * sx, -0.18 * sy, 0.12 * sz],
    [0.18 * sx, 0.34 * sy, 0.36 * sz],
    'local-window',
    '#6366f1',
    WEIGHT_INDIGO
  )
  ctx.addMiniLabel('Bond Topology', [-0.04 * sx, -0.42 * sy, 0.18 * sz], WEIGHT_INDIGO, 0.8)

  // Atom feature projection bar
  ctx.addBar([-0.04 * sx, 0.2 * sy, -0.08 * sz], [0.06 * sx, 0.32 * sy, 0.28 * sz], COND_SKY)
  ctx.addMiniLabel('Atom Name Chars', [-0.04 * sx, 0.42 * sy, -0.02 * sz], COND_SKY, 0.78)

  // Arrows from inputs -> projection & topology
  ctx.addMiniArrow(
    [-0.25 * sx, 0.24 * sy, -0.1 * sz],
    [-0.08 * sx, 0.2 * sy, -0.08 * sz],
    ACT_GREEN,
    arrowW * 0.9,
    undefined,
    1
  )
  ctx.addMiniArrow(
    [-0.25 * sx, -0.22 * sy, 0.1 * sz],
    [-0.14 * sx, -0.18 * sy, 0.12 * sz],
    ACT_GREEN,
    arrowW * 0.9,
    undefined,
    1
  )

  // 3. Outputs: Atom Features [128] + Atom Pair [16]
  ctx.addSlab(
    [0.28 * sx, 0.18 * sy, -0.06 * sz],
    [0.18 * sx, 0.3 * sy, 0.34 * sz],
    'sequence',
    block.color,
    accent
  )
  ctx.addMiniLabel('Atom Features [128]', [0.28 * sx, 0.4 * sy, 0.04 * sz], accent, 0.8)

  ctx.addSlab(
    [0.28 * sx, -0.2 * sy, 0.08 * sz],
    [0.18 * sx, 0.28 * sy, 0.34 * sz],
    'pair',
    '#6366f1',
    WEIGHT_INDIGO
  )
  ctx.addMiniLabel('Atom Pair [16]', [0.28 * sx, -0.42 * sy, 0.18 * sz], WEIGHT_INDIGO, 0.8)

  ctx.addMiniArrow(
    [-0.005 * sx, 0.2 * sy, -0.08 * sz],
    [0.18 * sx, 0.18 * sy, -0.06 * sz],
    ACT_GREEN,
    arrowW,
    undefined,
    1
  )
  ctx.addMiniArrow(
    [0.055 * sx, -0.18 * sy, 0.12 * sz],
    [0.18 * sx, -0.2 * sy, 0.08 * sz],
    WEIGHT_INDIGO,
    arrowW,
    undefined,
    1
  )

  // Exit stubs
  ctx.addMiniArrow(
    [0.38 * sx, 0.18 * sy, -0.06 * sz],
    [0.5 * sx, 0.06 * sy, 0],
    ACT_GREEN,
    arrowW,
    undefined,
    1
  )
  ctx.addMiniArrow(
    [0.38 * sx, -0.2 * sy, 0.08 * sz],
    [0.5 * sx, -0.06 * sy, 0],
    WEIGHT_INDIGO,
    arrowW,
    undefined,
    0
  )
}

function buildSingleConcat(ctx: DetailBuilderContext, block: TensorBlock3D) {
  const [sx, sy, sz] = block.size
  const accent = new THREE.Color(block.color).getHex()
  const arrowW = THREE.MathUtils.clamp(sz * 0.04, 0.036, 0.065)

  // Two entry stubs: pooled atom embeddings (top) + f_token (bottom)
  ctx.addMiniArrow(
    [-0.5 * sx, 0.22 * sy, 0],
    [-0.39 * sx, 0.22 * sy, 0],
    ACT_GREEN,
    arrowW,
    undefined,
    1
  )
  ctx.addMiniArrow(
    [-0.5 * sx, -0.22 * sy, 0],
    [-0.39 * sx, -0.22 * sy, 0],
    COND_SKY,
    arrowW,
    undefined,
    1
  )

  // Atom Scatter Mean [384]
  ctx.addSlab(
    [-0.26 * sx, 0.22 * sy, -0.06 * sz],
    [0.22 * sx, 0.3 * sy, 0.36 * sz],
    'local-window',
    '#6366f1',
    WEIGHT_INDIGO
  )
  ctx.addMiniLabel('Atom Scatter Mean [384]', [-0.26 * sx, 0.44 * sy, 0.1 * sz], WEIGHT_INDIGO, 0.8)

  // Token Features [65]
  ctx.addSlab(
    [-0.26 * sx, -0.22 * sy, 0.06 * sz],
    [0.16 * sx, 0.26 * sy, 0.32 * sz],
    'sequence',
    '#3b82f6',
    COND_SKY
  )
  ctx.addMiniLabel('Token Features [65]', [-0.26 * sx, -0.42 * sy, 0.14 * sz], COND_SKY, 0.8)

  // Concatenation bar
  ctx.addBar([0.02 * sx, 0, 0], [0.06 * sx, 0.6 * sy, 0.32 * sz], PARAM_AMBER)
  ctx.addMiniLabel('Concat (384 + 65)', [0.02 * sx, 0.38 * sy, 0.16 * sz], PARAM_AMBER, 0.82)

  ctx.addMiniArrow(
    [-0.14 * sx, 0.22 * sy, -0.06 * sz],
    [-0.015 * sx, 0.08 * sy, 0],
    ACT_GREEN,
    arrowW,
    undefined,
    1
  )
  ctx.addMiniArrow(
    [-0.17 * sx, -0.22 * sy, 0.06 * sz],
    [-0.015 * sx, -0.08 * sy, 0],
    COND_SKY,
    arrowW,
    undefined,
    1
  )

  // Output s_input [N_token, 449]
  ctx.addMiniArrow([0.055 * sx, 0, 0], [0.18 * sx, 0, 0], ACT_GREEN, arrowW, undefined, 1)
  ctx.addSlab([0.3 * sx, 0, 0], [0.22 * sx, 0.64 * sy, 0.44 * sz], 'sequence', block.color, accent)
  ctx.addMiniLabel('s_input [449]', [0.3 * sx, -0.38 * sy, 0.18 * sz], accent, 0.84)

  // Exit stub
  ctx.addMiniArrow([0.42 * sx, 0, 0], [0.5 * sx, 0, 0], ACT_GREEN, arrowW * 1.1, undefined, 1)
}

function buildLinearProj(ctx: DetailBuilderContext, block: TensorBlock3D) {
  const [sx, sy, sz] = block.size
  const accent = new THREE.Color(block.color).getHex()
  const arrowW = THREE.MathUtils.clamp(sz * 0.04, 0.036, 0.065)

  // Entry stub
  ctx.addMiniArrow([-0.5 * sx, 0, 0], [-0.4 * sx, 0, 0], ACT_GREEN, arrowW * 1.1, undefined, 1)

  // Input s_input [449]
  ctx.addSlab([-0.3 * sx, 0, 0], [0.18 * sx, 0.62 * sy, 0.4 * sz], 'sequence', '#4f46e5', COND_SKY)
  ctx.addMiniLabel('s_input [449]', [-0.3 * sx, 0.38 * sy, 0.16 * sz], COND_SKY, 0.82)

  // LinearNoBias Weight Matrix (449 -> 384)
  ctx.addMiniArrow([-0.2 * sx, 0, 0], [-0.09 * sx, 0, 0], ACT_GREEN, arrowW, undefined, 1)
  ctx.addSlab([0, 0, 0], [0.16 * sx, 0.56 * sy, 0.44 * sz], 'transformer', '#6366f1', WEIGHT_INDIGO)
  ctx.addMiniLabel('LinearNoBias (449 → 384)', [0, -0.36 * sy, 0.18 * sz], WEIGHT_INDIGO, 0.82)

  // Output s_init [384]
  ctx.addMiniArrow([0.09 * sx, 0, 0], [0.2 * sx, 0, 0], WEIGHT_INDIGO, arrowW, undefined, 1)
  ctx.addSlab([0.3 * sx, 0, 0], [0.18 * sx, 0.56 * sy, 0.38 * sz], 'sequence', block.color, accent)
  ctx.addMiniLabel('s_init [384]', [0.3 * sx, 0.36 * sy, 0.16 * sz], accent, 0.84)

  // Exit stub
  ctx.addMiniArrow([0.4 * sx, 0, 0], [0.5 * sx, 0, 0], ACT_GREEN, arrowW * 1.1, undefined, 1)
}

function buildPairInit(ctx: DetailBuilderContext, block: TensorBlock3D) {
  const [sx, sy, sz] = block.size
  const accent = new THREE.Color(block.color).getHex()
  const arrowW = THREE.MathUtils.clamp(sz * 0.04, 0.036, 0.065)

  // Entry stub
  ctx.addMiniArrow(
    [-0.5 * sx, 0.14 * sy, 0],
    [-0.41 * sx, 0.14 * sy, 0],
    ACT_GREEN,
    arrowW,
    undefined,
    1
  )

  // 1. Symmetric Linear z_i (row) and Linear z_j (col)
  ctx.addSlab(
    [-0.33 * sx, 0.24 * sy, -0.1 * sz],
    [0.14 * sx, 0.22 * sy, 0.28 * sz],
    'sequence',
    '#6366f1',
    WEIGHT_INDIGO
  )
  ctx.addSlab(
    [-0.33 * sx, 0, 0.1 * sz],
    [0.14 * sx, 0.22 * sy, 0.28 * sz],
    'sequence',
    '#6366f1',
    WEIGHT_INDIGO
  )
  ctx.addMiniLabel('Linear z_i + z_j', [-0.33 * sx, 0.42 * sy, 0.06 * sz], WEIGHT_INDIGO, 0.8)

  // Outer Sum bar
  ctx.addBar([-0.14 * sx, 0.12 * sy, 0], [0.055 * sx, 0.4 * sy, 0.28 * sz], TEAL_OPM)
  ctx.addMiniLabel('Outer Sum', [-0.14 * sx, 0.38 * sy, 0.14 * sz], TEAL_OPM, 0.8)
  ctx.addMiniArrow(
    [-0.25 * sx, 0.24 * sy, -0.1 * sz],
    [-0.175 * sx, 0.16 * sy, 0],
    ACT_GREEN,
    arrowW * 0.85,
    undefined,
    1
  )
  ctx.addMiniArrow(
    [-0.25 * sx, 0, 0.1 * sz],
    [-0.175 * sx, 0.08 * sy, 0],
    ACT_GREEN,
    arrowW * 0.85,
    undefined,
    0
  )

  // 2. RelPosEnc + Token Bonds at bottom
  ctx.addSlab(
    [-0.24 * sx, -0.28 * sy, -0.06 * sz],
    [0.16 * sx, 0.22 * sy, 0.3 * sz],
    'heatmap',
    '#0ea5e9',
    COND_SKY
  )
  ctx.addMiniLabel('RelPos Enc (i, j)', [-0.24 * sx, -0.44 * sy, 0.12 * sz], COND_SKY, 0.78)

  ctx.addSlab(
    [0.02 * sx, -0.28 * sy, 0.08 * sz],
    [0.14 * sx, 0.22 * sy, 0.28 * sz],
    'local-window',
    '#f59e0b',
    PARAM_AMBER
  )
  ctx.addMiniLabel('Token Bonds', [0.02 * sx, -0.44 * sy, 0.16 * sz], PARAM_AMBER, 0.78)

  // 3. Pair Add + z_init [N, N, 128]
  ctx.addSlab(
    [0.04 * sx, 0.12 * sy, 0],
    [0.18 * sx, 0.36 * sy, 0.38 * sz],
    'pair',
    block.color,
    accent
  )
  ctx.addMiniArrow(
    [-0.105 * sx, 0.12 * sy, 0],
    [-0.055 * sx, 0.12 * sy, 0],
    TEAL_OPM,
    arrowW,
    undefined,
    1
  )
  ctx.addMiniArrow(
    [-0.15 * sx, -0.24 * sy, -0.04 * sz],
    [0, -0.06 * sy, 0],
    COND_SKY,
    arrowW * 0.85,
    undefined,
    1
  )
  ctx.addMiniArrow(
    [0.095 * sx, -0.24 * sy, 0.06 * sz],
    [0.22 * sx, -0.04 * sy, 0],
    PARAM_AMBER,
    arrowW * 0.85,
    undefined,
    0
  )

  // Final z_init slab
  ctx.addMiniArrow(
    [0.14 * sx, 0.12 * sy, 0],
    [0.23 * sx, 0.06 * sy, 0],
    ACT_GREEN,
    arrowW,
    undefined,
    1
  )
  ctx.addSlab(
    [0.33 * sx, 0.02 * sy, 0],
    [0.18 * sx, 0.56 * sy, 0.44 * sz],
    'pair',
    block.color,
    accent
  )
  ctx.addMiniLabel('z_init [128]', [0.33 * sx, 0.36 * sy, 0.18 * sz], accent, 0.84)

  // Exit stub
  ctx.addMiniArrow(
    [0.43 * sx, 0.02 * sy, 0],
    [0.5 * sx, 0.02 * sy, 0],
    ACT_GREEN,
    arrowW * 1.1,
    undefined,
    1
  )
}

function buildRecycleGate(ctx: DetailBuilderContext, block: TensorBlock3D) {
  const [sx, sy, sz] = block.size
  const accent = new THREE.Color(block.color).getHex()
  const arrowW = THREE.MathUtils.clamp(sz * 0.04, 0.036, 0.065)

  // Dual parallel tracks: Single s (top) and Pair z (bottom)
  const tracks: Array<{
    name: string
    y: number
    style: MatrixStyle
    color: string
    hex: number
  }> = [
    {
      name: 's_prev → LN → Linear',
      y: 0.22 * sy,
      style: 'sequence',
      color: '#a855f7',
      hex: 0xa855f7,
    },
    {
      name: 'z_prev → LN → Linear',
      y: -0.22 * sy,
      style: 'pair',
      color: '#9333ea',
      hex: WEIGHT_INDIGO,
    },
  ]

  for (const t of tracks) {
    // Entry stub
    ctx.addMiniArrow([-0.5 * sx, t.y, 0], [-0.4 * sx, t.y, 0], ACT_GREEN, arrowW, undefined, 1)

    // LayerNorm slab
    ctx.addSlab([-0.32 * sx, t.y, 0], [0.12 * sx, 0.28 * sy, 0.34 * sz], t.style, t.color, 0x64748b)
    // Recycle Linear gate
    ctx.addSlab(
      [-0.1 * sx, t.y, 0],
      [0.14 * sx, 0.28 * sy, 0.34 * sz],
      'transformer',
      '#f59e0b',
      PARAM_AMBER
    )
    // Residual Add bar (+ s_init / + z_init)
    ctx.addBar([0.11 * sx, t.y, 0], [0.055 * sx, 0.32 * sy, 0.28 * sz], accent)
    // Output slab
    ctx.addSlab([0.31 * sx, t.y, 0], [0.16 * sx, 0.3 * sy, 0.36 * sz], t.style, t.color, t.hex)

    ctx.addMiniArrow(
      [-0.25 * sx, t.y, 0],
      [-0.18 * sx, t.y, 0],
      ACT_GREEN,
      arrowW * 0.9,
      undefined,
      1
    )
    ctx.addMiniArrow(
      [-0.02 * sx, t.y, 0],
      [0.075 * sx, t.y, 0],
      PARAM_AMBER,
      arrowW * 0.9,
      undefined,
      1
    )
    ctx.addMiniArrow(
      [0.145 * sx, t.y, 0],
      [0.22 * sx, t.y, 0],
      ACT_GREEN,
      arrowW * 0.9,
      undefined,
      1
    )
    ctx.addMiniArrow([0.4 * sx, t.y, 0], [0.5 * sx, t.y, 0], ACT_GREEN, arrowW * 1.1, undefined, 1)
  }

  // Labels placed cleanly without overlap
  ctx.addMiniLabel('LayerNorm (s, z)', [-0.32 * sx, 0.42 * sy, 0.14 * sz], 0x64748b, 0.8)
  ctx.addMiniLabel('Recycle Linear', [-0.1 * sx, -0.42 * sy, 0.14 * sz], PARAM_AMBER, 0.8)
  ctx.addMiniLabel('Residual Add (+ init)', [0.11 * sx, 0.42 * sy, 0.14 * sz], accent, 0.8)
  ctx.addMiniLabel('10× Cycle Output', [0.31 * sx, -0.42 * sy, 0.14 * sz], WEIGHT_INDIGO, 0.82)
}

function buildMsaEmbed(ctx: DetailBuilderContext, block: TensorBlock3D) {
  const [sx, sy, sz] = block.size
  const accent = new THREE.Color(block.color).getHex()
  const arrowW = THREE.MathUtils.clamp(sz * 0.04, 0.036, 0.065)

  // Entry stubs: MSA rows (top), s_input (bottom)
  ctx.addMiniArrow(
    [-0.5 * sx, 0.2 * sy, 0],
    [-0.41 * sx, 0.2 * sy, 0],
    ACT_GREEN,
    arrowW,
    undefined,
    1
  )
  ctx.addMiniArrow(
    [-0.5 * sx, -0.22 * sy, 0],
    [-0.41 * sx, -0.22 * sy, 0],
    COND_SKY,
    arrowW,
    undefined,
    1
  )

  // 1. Subsample <= 1024 rows
  ctx.addSlab(
    [-0.32 * sx, 0.2 * sy, 0],
    [0.14 * sx, 0.3 * sy, 0.38 * sz],
    'msa',
    block.color,
    accent
  )
  ctx.addMiniLabel('Subsample (≤1024)', [-0.32 * sx, 0.42 * sy, 0.14 * sz], accent, 0.78)

  // 2. Linear MSA (34 -> 64)
  ctx.addMiniArrow(
    [-0.24 * sx, 0.2 * sy, 0],
    [-0.14 * sx, 0.2 * sy, 0],
    ACT_GREEN,
    arrowW * 0.9,
    undefined,
    1
  )
  ctx.addSlab(
    [-0.05 * sx, 0.2 * sy, 0],
    [0.15 * sx, 0.28 * sy, 0.34 * sz],
    'transformer',
    '#6366f1',
    WEIGHT_INDIGO
  )
  ctx.addMiniLabel('Linear MSA (34→64)', [-0.05 * sx, 0.42 * sy, 0.14 * sz], WEIGHT_INDIGO, 0.78)

  // 3. Linear s_input (449 -> 64) + Unsqueeze
  ctx.addSlab(
    [-0.18 * sx, -0.22 * sy, 0],
    [0.22 * sx, 0.26 * sy, 0.34 * sz],
    'sequence',
    '#4f46e5',
    COND_SKY
  )
  ctx.addMiniLabel('Linear s_input (449→64)', [-0.18 * sx, -0.42 * sy, 0.14 * sz], COND_SKY, 0.78)

  // 4. Broadcast Add bar -> m_0 [N_msa, N_token, 64]
  ctx.addBar([0.13 * sx, 0, 0], [0.055 * sx, 0.56 * sy, 0.3 * sz], TEAL_OPM)
  ctx.addMiniLabel('Broadcast Add', [0.13 * sx, -0.38 * sy, 0.16 * sz], TEAL_OPM, 0.8)

  ctx.addMiniArrow(
    [0.03 * sx, 0.2 * sy, 0],
    [0.095 * sx, 0.08 * sy, 0],
    ACT_GREEN,
    arrowW * 0.9,
    undefined,
    1
  )
  ctx.addMiniArrow(
    [-0.06 * sx, -0.22 * sy, 0],
    [0.095 * sx, -0.08 * sy, 0],
    COND_SKY,
    arrowW * 0.9,
    undefined,
    1
  )

  ctx.addMiniArrow([0.165 * sx, 0, 0], [0.24 * sx, 0, 0], ACT_GREEN, arrowW, undefined, 1)
  ctx.addSlab([0.34 * sx, 0, 0], [0.18 * sx, 0.58 * sy, 0.44 * sz], 'msa', block.color, accent)
  ctx.addMiniLabel('m_0 [N_msa, N, 64]', [0.34 * sx, 0.38 * sy, 0.16 * sz], accent, 0.82)

  // Exit stub
  ctx.addMiniArrow([0.44 * sx, 0, 0], [0.5 * sx, 0, 0], ACT_GREEN, arrowW * 1.1, undefined, 1)
}

function buildDiffusionSampler(ctx: DetailBuilderContext, block: TensorBlock3D) {
  const [sx, sy, sz] = block.size
  const accent = new THREE.Color(block.color).getHex()
  const arrowW = THREE.MathUtils.clamp(sz * 0.04, 0.036, 0.065)

  // Entry stub (from Atom Attention Decoder Δr)
  ctx.addMiniArrow([-0.5 * sx, 0, 0], [-0.41 * sx, 0, 0], ACT_GREEN, arrowW * 1.1, undefined, 1)

  // 1. EDM Noise Schedule (σ: 160 -> 4e-4)
  ctx.addSlab(
    [-0.33 * sx, 0, 0],
    [0.12 * sx, 0.46 * sy, 0.34 * sz],
    'heatmap',
    '#ec4899',
    PARAM_AMBER
  )
  ctx.addMiniLabel('EDM Schedule (200×)', [-0.33 * sx, -0.3 * sy, 0.16 * sz], PARAM_AMBER, 0.8)

  // 2. Centre Random Augmentation + Noisy Coords x_hat
  ctx.addSlab(
    [-0.12 * sx, 0, 0],
    [0.16 * sx, 0.52 * sy, 0.4 * sz],
    'point-cloud',
    '#0ea5e9',
    COND_SKY
  )
  ctx.addMiniLabel('Random Augment', [-0.12 * sx, 0.34 * sy, 0.16 * sz], COND_SKY, 0.8)

  ctx.addMiniArrow([-0.26 * sx, 0, 0], [-0.21 * sx, 0, 0], ACT_GREEN, arrowW * 0.9, undefined, 1)

  // 3. Score + Euler Step Update
  ctx.addBar([0.08 * sx, 0, 0], [0.06 * sx, 0.54 * sy, 0.3 * sz], WEIGHT_INDIGO)
  ctx.addMiniLabel(
    'Euler Step (x̂ − x_den)/t',
    [0.08 * sx, 0.42 * sy, 0.16 * sz],
    WEIGHT_INDIGO,
    0.8
  )
  ctx.addMiniArrow([-0.03 * sx, 0, 0], [0.045 * sx, 0, 0], ACT_GREEN, arrowW, undefined, 1)

  // Iterative 200× denoising loop arc from Euler back to Random Augment
  ctx.addMiniArrow(
    [0.08 * sx, -0.28 * sy, 0],
    [-0.12 * sx, -0.27 * sy, 0],
    PARAM_AMBER,
    arrowW * 0.85,
    [
      [0.05 * sx, -0.42 * sy, 0],
      [-0.09 * sx, -0.42 * sy, 0],
    ],
    1,
    0.4
  )
  ctx.addLoopBadge('200x loop', [-0.02 * sx, -0.46 * sy, 0.14 * sz], 0.9)

  // 4. Final 3D Complex [N_samples, N_atom, 3]
  ctx.addMiniArrow([0.115 * sx, 0, 0], [0.21 * sx, 0, 0], ACT_GREEN, arrowW, undefined, 1)
  ctx.addSlab(
    [0.32 * sx, 0, 0],
    [0.2 * sx, 0.62 * sy, 0.46 * sz],
    'point-cloud',
    block.color,
    accent
  )
  ctx.addMiniLabel('3D Complex [N_atom, 3]', [0.32 * sx, -0.38 * sy, 0.18 * sz], accent, 0.84)

  // Exit stub
  ctx.addMiniArrow([0.43 * sx, 0, 0], [0.5 * sx, 0, 0], ACT_GREEN, arrowW * 1.1, undefined, 1)
}

function buildDetailKind(
  ctx: DetailBuilderContext,
  detailBlock: TensorBlock3D,
  spec: DetailedBlockSpec
) {
  switch (spec.kind) {
    case 'multihead-attn':
      buildMultiheadAttn(ctx, detailBlock, spec)
      break
    case 'pair-stack':
      buildPairStack(ctx, detailBlock, spec)
      break
    case 'msa-block':
      buildMsaBlock(ctx, detailBlock, spec)
      break
    case 'conditioning':
      buildConditioning(ctx, detailBlock)
      break
    case 'atom-dec':
      buildAtomDec(ctx, detailBlock, spec)
      break
    case 'confidence-heads':
      buildConfidenceHeads(ctx, detailBlock)
      break
    case 'token-features':
      buildTokenFeatures(ctx, detailBlock)
      break
    case 'ref-conformers':
      buildRefConformers(ctx, detailBlock)
      break
    case 'single-concat':
      buildSingleConcat(ctx, detailBlock)
      break
    case 'linear-proj':
      buildLinearProj(ctx, detailBlock)
      break
    case 'pair-init':
      buildPairInit(ctx, detailBlock)
      break
    case 'recycle-gate':
      buildRecycleGate(ctx, detailBlock)
      break
    case 'msa-embed':
      buildMsaEmbed(ctx, detailBlock)
      break
    case 'diffusion-sampler':
      buildDiffusionSampler(ctx, detailBlock)
      break
  }
}

export function buildInPlaceDetailedBlock(
  block: TensorBlock3D,
  isDark: boolean
): DetailedBlockVisual | null {
  const spec = block.detailedSpec
  if (!spec) return null

  const [sx, sy, sz] = block.size
  const stackCount = Math.max(1, block.stackCount ?? 1)
  // Dynamically expand detail bounding box when needed so flows stay strictly Left-to-Right without squashing
  const baseW = spec.kind === 'multihead-attn' ? Math.max(sx, sy * 2.4, 6.2) : Math.max(sx, 4.8)
  const baseH = spec.kind === 'multihead-attn' ? Math.max(sy, 2.2) : Math.max(sy, 2.0)
  const baseD = Math.max(sz, 1.8)

  const sliceD =
    stackCount === 1 ? baseD : stackCount >= 12 ? 0.75 : Math.min(Math.max(sz * 0.85, 0.75), 1.1)
  const sliceGap = stackCount === 1 ? 0 : stackCount >= 12 ? 0.25 : 0.3
  const totalD = stackCount === 1 ? baseD : stackCount * sliceD + (stackCount - 1) * sliceGap
  // Align front-most slice front face with simplified block front face (+sz / 2); push backward (-Z) only
  const frontCenterZ = stackCount === 1 ? 0 : sz / 2 - sliceD / 2
  const multiCenterZ = stackCount === 1 ? 0 : sz / 2 - totalD / 2

  const singleSize: [number, number, number] = [baseW, baseH, baseD]
  const multiSize: [number, number, number] = [baseW, baseH, totalD]
  const detailBlock: TensorBlock3D = { ...block, size: singleSize }
  const ctx = new DetailBuilderContext(detailBlock, isDark)
  const baseColor = new THREE.Color(block.color)

  // Translucent outer architectural frame box (single view vs multi view)
  const singleFrameGeo = new THREE.BoxGeometry(baseW, baseH, stackCount === 1 ? baseD : sliceD)
  const frameEdgesGeo = new THREE.EdgesGeometry(singleFrameGeo)
  singleFrameGeo.dispose()
  const frameMat = new THREE.LineBasicMaterial({
    color: FRAME_GRAY,
    transparent: true,
    opacity: isDark ? 0.36 : 0.32,
  })
  const frameLine = new THREE.LineSegments(frameEdgesGeo, frameMat)
  frameLine.position.z = frontCenterZ
  frameLine.userData = { blockId: block.id }
  ctx.group.add(frameLine)

  const docFrameMat = new THREE.LineBasicMaterial({
    color: baseColor,
    transparent: true,
    opacity: 0.9,
  })
  const docFrameLine = new THREE.LineSegments(frameEdgesGeo, docFrameMat)
  docFrameLine.position.z = frontCenterZ
  docFrameLine.scale.set(1.012, 1.012, 1.012)
  docFrameLine.visible = false
  ctx.group.add(docFrameLine)

  let multiFrameEdgesGeo: THREE.EdgesGeometry | null = null
  let multiFrameLine: THREE.LineSegments | null = null
  let docMultiFrameLine: THREE.LineSegments | null = null
  const busBars: THREE.Mesh[] = []

  if (stackCount === 1) {
    buildDetailKind(ctx, detailBlock, spec)
  } else {
    const multiFrameGeo = new THREE.BoxGeometry(baseW, baseH, totalD)
    multiFrameEdgesGeo = new THREE.EdgesGeometry(multiFrameGeo)
    multiFrameGeo.dispose()
    multiFrameLine = new THREE.LineSegments(multiFrameEdgesGeo, frameMat)
    multiFrameLine.position.z = multiCenterZ
    multiFrameLine.visible = false
    multiFrameLine.userData = { blockId: block.id }
    ctx.group.add(multiFrameLine)

    docMultiFrameLine = new THREE.LineSegments(multiFrameEdgesGeo, docFrameMat)
    docMultiFrameLine.position.z = multiCenterZ
    docMultiFrameLine.scale.set(1.012, 1.012, 1.012)
    docMultiFrameLine.visible = false
    ctx.group.add(docMultiFrameLine)

    const sliceBlock: TensorBlock3D = { ...block, size: [baseW, baseH, sliceD] }
    const grayColor = new THREE.Color(FRAME_GRAY)
    for (let i = 0; i < stackCount; i++) {
      const zOffset = frontCenterZ - i * (sliceD + sliceGap)
      const isFrontSlice = i === 0
      ctx.beginSlice(i, zOffset, isFrontSlice)
      ctx.addSliceFrame([baseW, baseH, sliceD], grayColor, i)
      buildDetailKind(ctx, sliceBlock, spec)
    }
    ctx.setDefaultTarget()

    // Entry & exit Z-bus bars connecting all stacked copies front-to-back (visible in multi view)
    const busLen = Math.max(0.2, totalD - sliceD)
    const entryBus = ctx.addBar(
      [-0.5 * baseW, 0, multiCenterZ],
      [0.05, 0.08, busLen],
      ACT_GREEN,
      0.72
    )
    const exitBus = ctx.addBar(
      [0.5 * baseW, 0, multiCenterZ],
      [0.05, 0.08, busLen],
      ACT_GREEN,
      0.72
    )
    entryBus.visible = false
    exitBus.visible = false
    busBars.push(entryBus, exitBus)
  }

  let isStackMulti = false
  let hoveredSliceIndex: number | null = null
  let lastHighlight = {
    selected: false,
    hovered: false,
    isFocused: false,
    dark: isDark,
    docActive: false,
  }

  const applyHighlight = () => {
    const { selected, hovered, isFocused, dark, docActive } = lastHighlight
    const unfocusedOpacity = dark ? 0.42 : 0.16
    const targetOpacity = selected || hovered ? 1.0 : isFocused ? 0.95 : unfocusedOpacity
    const baseFrameOpacity = docActive
      ? 0.9
      : selected || hovered
        ? dark
          ? 0.85
          : 0.9
        : isFocused
          ? dark
            ? 0.4
            : 0.35
          : 0.12
    frameMat.opacity = baseFrameOpacity
    frameMat.color.copy(docActive ? baseColor : new THREE.Color(FRAME_GRAY))
    docFrameLine.visible = docActive && (!isStackMulti || stackCount === 1)
    if (docMultiFrameLine) docMultiFrameLine.visible = docActive && isStackMulti && stackCount > 1

    for (let i = 0; i < ctx.slices.length; i++) {
      const slice = ctx.slices[i]!
      const mul = slice.opacityMul
      const isFaded = mul < 0.99

      for (const mat of slice.slabMaterials) {
        mat.opacity = targetOpacity * mul
        if (mat.userData.origMap && mat.userData.desatMap) {
          const nextMap = isFaded
            ? (mat.userData.desatMap as THREE.Texture)
            : (mat.userData.origMap as THREE.Texture)
          if (mat.map !== nextMap) {
            mat.map = nextMap
            mat.needsUpdate = true
          }
        } else if (mat.userData.origColor) {
          const orig = mat.userData.origColor as THREE.Color
          if (isFaded) {
            const luma = orig.r * 0.299 + orig.g * 0.587 + orig.b * 0.114
            mat.color.setRGB(luma, luma, luma)
          } else {
            mat.color.copy(orig)
          }
        }
        if (selected && !isFaded) {
          mat.emissive.copy(baseColor)
          mat.emissiveIntensity = 0.24
        } else if (hovered && !isFaded) {
          mat.emissive.copy(baseColor)
          mat.emissiveIntensity = 0.14
        } else {
          mat.emissive.setHex(0x000000)
          mat.emissiveIntensity = 0
        }
      }

      for (const lm of slice.edgeMaterials) {
        lm.opacity = (selected || hovered ? 0.78 : isFocused ? 0.5 : 0.16) * mul
        if (lm.userData.origColor) {
          const orig = lm.userData.origColor as THREE.Color
          if (isFaded) {
            const luma = orig.r * 0.299 + orig.g * 0.587 + orig.b * 0.114
            lm.color.setRGB(luma, luma, luma)
          } else {
            lm.color.copy(orig)
          }
        }
      }

      for (const track of slice.flowTracks) {
        track.ribbonMat.opacity =
          (selected || hovered ? 0.62 : isFocused ? track.baseOpacity : 0.12) * mul
        if (track.ribbonMat.userData.origColor) {
          const orig = track.ribbonMat.userData.origColor as THREE.Color
          if (isFaded) {
            const luma = orig.r * 0.299 + orig.g * 0.587 + orig.b * 0.114
            track.ribbonMat.color.setRGB(luma, luma, luma)
          } else {
            track.ribbonMat.color.copy(orig)
          }
        }
      }

      if (slice.frameMat) {
        if (hoveredSliceIndex === i) {
          slice.frameMat.color.setHex(i === 0 ? ACT_GREEN : HOVER_RED)
          slice.frameMat.opacity = 1.0
        } else {
          slice.frameMat.color.setHex(FRAME_GRAY)
          slice.frameMat.opacity = (dark ? 0.28 : 0.24) * mul
        }
      }
    }
  }

  const applyStackVisibility = () => {
    if (stackCount <= 1) return
    frameLine.visible = !isStackMulti
    if (multiFrameLine) multiFrameLine.visible = isStackMulti
    for (const b of busBars) b.visible = isStackMulti

    for (let i = 0; i < ctx.slices.length; i++) {
      const slice = ctx.slices[i]!
      if (isStackMulti) {
        slice.group.visible = true
        slice.opacityMul = 1.0
        if (slice.hitMesh) slice.hitMesh.visible = true
      } else {
        slice.group.visible = i <= 2
        slice.opacityMul = i === 0 ? 1.0 : i === 1 ? 0.2 : 0.1
        if (slice.hitMesh) slice.hitMesh.visible = i <= 2
      }
    }
    applyHighlight()
  }

  applyStackVisibility()

  const scratch = new THREE.Vector3()

  const visual: DetailedBlockVisual = {
    group: ctx.group,
    frameLine,
    frameMat,
    miniLabels: ctx.miniLabels,
    detailSize: [...singleSize],
    stackCount,
    isStackMulti: false,
    stackHitMeshes: ctx.stackHitMeshes,
    setStackMulti: (multi: boolean) => {
      if (stackCount <= 1) return
      isStackMulti = multi
      visual.isStackMulti = multi
      visual.detailSize = multi ? [...multiSize] : [...singleSize]
      applyStackVisibility()
    },
    setHoveredSlice: (sliceIndex: number | null) => {
      if (hoveredSliceIndex === sliceIndex) return
      hoveredSliceIndex = sliceIndex
      applyHighlight()
    },
    update: (dt: number, isFlowPlaying: boolean) => {
      for (const slice of ctx.slices) {
        if (!slice.group.visible) continue
        for (const track of slice.flowTracks) {
          for (let i = 0; i < track.beads.length; i++) {
            const bead = track.beads[i]!
            bead.visible = isFlowPlaying
            if (!isFlowPlaying) continue
            track.offsets[i] = (track.offsets[i]! + dt * track.speed) % 1
            track.curve.getPointAt(track.offsets[i]!, scratch)
            bead.position.copy(scratch)
          }
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
    setHighlighted: (
      selected: boolean,
      hovered: boolean,
      isFocused: boolean,
      dark: boolean,
      docActive = false
    ) => {
      lastHighlight = { selected, hovered, isFocused, dark, docActive }
      applyHighlight()
    },
    dispose: () => {
      frameEdgesGeo.dispose()
      multiFrameEdgesGeo?.dispose()
      frameMat.dispose()
      docFrameMat.dispose()
      ctx.dispose()
    },
  }

  return visual
}
