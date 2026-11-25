import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { DataFlowEdge, FoldingModelSpec, TensorBlock3D } from '~/types/architecture'
import { buildInPlaceDetailedBlock, type DetailedBlockVisual } from './InPlaceDetailBuilder'
import { MoleculeCloud } from './moleculeCloud'
import {
  createAxisTagSprite,
  createEdgeLabelSprite,
  createLabelSprite,
  createStageHeaderTexture,
  createTensorMatrixTexture,
} from './textures'

const OVERVIEW_LANDMARK_IDS = new Set([
  'inputs',
  'trunk-recycle-gate',
  'msa-stack',
  'pairformer-pair',
  'diffusion-transformer',
  'denoised-coords',
  'confidence-outputs',
])

export interface SceneEngineCallbacks {
  onSelectBlock?: (blockId: string | null) => void
  onHoverBlock?: (blockId: string | null) => void
  onDoubleClickBlock?: (blockId: string | null) => void
}

interface BlockVisual {
  spec: TensorBlock3D
  group: THREE.Group
  simplifiedGroup: THREE.Group
  detailedVisual: DetailedBlockVisual | null
  hitMesh: THREE.Mesh
  sliceMeshes: THREE.Mesh[]
  sliceMaterials: THREE.MeshStandardMaterial[]
  edgeLines: THREE.LineSegments[]
  labelSprite: THREE.Sprite
  compactLabelSprite: THREE.Sprite
  axisTagSprites: THREE.Sprite[]
  sweepMesh: THREE.Mesh | null
  sweepMat: THREE.MeshBasicMaterial | null
  sweepPhaseOffset: number
  baseColor: THREE.Color
}

interface EdgeVisual {
  spec: DataFlowEdge
  curve: THREE.CatmullRomCurve3
  ribbonMesh: THREE.Mesh
  ribbonMat: THREE.MeshBasicMaterial
  outlineLine: THREE.Line
  outlineMat: THREE.LineBasicMaterial
  labelSprite: THREE.Sprite | null
  beads: THREE.Mesh[]
  beadOffsets: number[]
  beadSpeed: number
  isHighlighted: boolean
}

export class SceneEngine {
  private readonly container: HTMLElement
  private readonly callbacks: SceneEngineCallbacks

  private readonly renderer: THREE.WebGLRenderer
  private readonly scene: THREE.Scene
  private readonly camera: THREE.PerspectiveCamera
  private readonly controls: OrbitControls

  private readonly hemiLight: THREE.HemisphereLight
  private readonly keyLight: THREE.DirectionalLight
  private readonly fillLight: THREE.DirectionalLight
  private gridHelper: THREE.GridHelper

  private readonly modelGroup = new THREE.Group()
  private expandedBlockIds = new Set<string>()
  private readonly blockVisuals = new Map<string, BlockVisual>()
  private readonly edgeVisuals: EdgeVisual[] = []
  private readonly hitTargets: THREE.Object3D[] = []
  private moleculeCloud: MoleculeCloud | null = null

  private readonly raycaster = new THREE.Raycaster()
  private readonly pointer = new THREE.Vector2(-999, -999)
  private pointerDownPos = { x: 0, y: 0 }

  private currentModel: FoldingModelSpec | null = null
  private isDark = false
  private isFlowPlaying = true
  private recycleCycle = 4
  private pairformerBlock = 24
  private diffusionStep = 160
  private selectedBlockId: string | null = null
  private hoveredBlockId: string | null = null
  private focusBlockIds = new Set<string>()
  private highlightEdgeIds = new Set<string>()
  private recyclePulseBoost = 0

  private cameraFlying = false
  private readonly baseCamPos = new THREE.Vector3(3, 22, 68)
  private readonly baseTarget = new THREE.Vector3(3, -0.5, 0)
  private readonly desiredCamPos = new THREE.Vector3(3, 22, 68)
  private readonly desiredTarget = new THREE.Vector3(3, -0.5, 0)

  private rafId: number | null = null
  private lastTime = performance.now()
  private disposed = false

  private readonly beadGeo = new THREE.SphereGeometry(0.085, 8, 8)
  private readonly scratchVec = new THREE.Vector3()
  private readonly disposableTextures: THREE.Texture[] = []
  private readonly disposableGeometries: THREE.BufferGeometry[] = []
  private readonly disposableMaterials: THREE.Material[] = []

  constructor(container: HTMLElement, callbacks: SceneEngineCallbacks = {}) {
    this.container = container
    this.callbacks = callbacks

    const width = Math.max(1, container.clientWidth)
    const height = Math.max(1, container.clientHeight)

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.setSize(width, height)
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    container.appendChild(this.renderer.domElement)

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(44, width / height, 0.2, 300)
    this.applyAspectFraming()
    this.camera.position.copy(this.desiredCamPos)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.zoomToCursor = true
    this.controls.minDistance = 4
    this.controls.maxDistance = 140
    this.controls.maxPolarAngle = Math.PI * 0.85
    this.controls.target.copy(this.desiredTarget)
    this.controls.addEventListener('start', this.handleControlsStart)

    this.hemiLight = new THREE.HemisphereLight(0xffffff, 0xcbd5e1, 0.9)
    this.keyLight = new THREE.DirectionalLight(0xffffff, 1.15)
    this.keyLight.position.set(18, 28, 24)
    this.fillLight = new THREE.DirectionalLight(0xe0e7ff, 0.55)
    this.fillLight.position.set(-22, 12, -18)
    this.scene.add(this.hemiLight, this.keyLight, this.fillLight)

    this.gridHelper = this.createGrid(false)
    this.scene.add(this.gridHelper)
    this.scene.add(this.modelGroup)

    this.applyThemeColors()

    const dom = this.renderer.domElement
    dom.addEventListener('pointermove', this.handlePointerMove)
    dom.addEventListener('pointerdown', this.handlePointerDown)
    dom.addEventListener('pointerup', this.handlePointerUp)
    dom.addEventListener('pointerleave', this.handlePointerLeave)
    dom.addEventListener('dblclick', this.handleDoubleClick)
    dom.addEventListener('wheel', this.handleWheel, { passive: true })

    this.lastTime = performance.now()
    this.animate()
  }

  private createGrid(dark: boolean): THREE.GridHelper {
    const grid = new THREE.GridHelper(
      110,
      55,
      dark ? 0x3f3f46 : 0xcbd5e1,
      dark ? 0x27272a : 0xe2e8f0
    )
    grid.position.y = -7.8
    const mat = grid.material
    if (Array.isArray(mat)) {
      mat.forEach(m => {
        m.transparent = true
        m.opacity = dark ? 0.42 : 0.55
      })
    } else {
      mat.transparent = true
      mat.opacity = dark ? 0.42 : 0.55
    }
    return grid
  }

  public setTheme(theme: 'light' | 'dark') {
    const nextDark = theme === 'dark'
    if (this.isDark === nextDark) return
    this.isDark = nextDark
    this.applyThemeColors()
    if (this.currentModel) {
      this.setModel(this.currentModel)
    }
  }

  public setExpandedBlocks(ids: string[]) {
    this.expandedBlockIds = new Set(ids)
    this.refreshVisualStates()
  }

  private applyThemeColors() {
    const bgHex = this.isDark ? 0x161618 : 0xfafaf9
    this.scene.background = new THREE.Color(bgHex)
    this.scene.fog = new THREE.Fog(bgHex, 100, 230)

    this.hemiLight.intensity = 0.95
    this.hemiLight.groundColor.setHex(this.isDark ? 0x18181b : 0xcbd5e1)
    this.keyLight.intensity = this.isDark ? 1.25 : 1.1

    this.scene.remove(this.gridHelper)
    this.gridHelper.dispose()
    this.gridHelper = this.createGrid(this.isDark)
    this.scene.add(this.gridHelper)
  }

  public setModel(model: FoldingModelSpec) {
    this.currentModel = model
    this.clearModelScene()

    this.buildStageFloorPlates()

    for (const block of model.blocks) {
      const visual = this.buildBlockVisual(block)
      this.blockVisuals.set(block.id, visual)
      this.modelGroup.add(visual.group)
      this.hitTargets.push(visual.hitMesh)
    }

    for (const edge of model.edges) {
      const edgeVisual = this.buildEdgeVisual(edge)
      if (edgeVisual) {
        this.edgeVisuals.push(edgeVisual)
        this.modelGroup.add(edgeVisual.ribbonMesh)
        this.modelGroup.add(edgeVisual.outlineLine)
        if (edgeVisual.labelSprite) {
          this.modelGroup.add(edgeVisual.labelSprite)
        }
        edgeVisual.beads.forEach(b => this.modelGroup.add(b))
      }
    }

    this.refreshVisualStates()
  }

  private buildStageFloorPlates() {
    const stages: Array<{
      title: string
      cx: number
      cz: number
      width: number
      depth: number
      color: number
    }> = [
      { title: 'Inputs & Embedder', cx: -24.0, cz: 0.2, width: 15.0, depth: 9.2, color: 0x3b82f6 },
      { title: 'Templates & MSA', cx: -6.0, cz: -0.2, width: 19.6, depth: 11.6, color: 0x14b8a6 },
      { title: 'Pairformer 48×', cx: 8.5, cz: -0.4, width: 8.0, depth: 9.2, color: 0x9333ea },
      { title: 'EDM Diffusion 200×', cx: 26.0, cz: 1.6, width: 24.0, depth: 5.4, color: 0xe11d48 },
      { title: 'Confidence Heads', cx: 20.5, cz: -5.0, width: 11.8, depth: 3.4, color: 0x16a34a },
    ]

    for (const st of stages) {
      const padGeo = new THREE.PlaneGeometry(st.width, st.depth)
      this.disposableGeometries.push(padGeo)

      const padMat = new THREE.MeshBasicMaterial({
        color: st.color,
        transparent: true,
        opacity: this.isDark ? 0.06 : 0.045,
        depthWrite: false,
      })
      this.disposableMaterials.push(padMat)

      const padMesh = new THREE.Mesh(padGeo, padMat)
      padMesh.rotation.x = -Math.PI / 2
      padMesh.position.set(st.cx, -7.75, st.cz)
      this.modelGroup.add(padMesh)

      const borderGeo = new THREE.EdgesGeometry(padGeo)
      this.disposableGeometries.push(borderGeo)
      const borderMat = new THREE.LineBasicMaterial({
        color: st.color,
        transparent: true,
        opacity: this.isDark ? 0.26 : 0.22,
      })
      this.disposableMaterials.push(borderMat)
      const border = new THREE.LineSegments(borderGeo, borderMat)
      border.rotation.x = -Math.PI / 2
      border.position.set(st.cx, -7.74, st.cz)
      this.modelGroup.add(border)

      const headerTex = createStageHeaderTexture(st.title, this.isDark)
      this.disposableTextures.push(headerTex)
      const headerGeo = new THREE.PlaneGeometry(Math.min(st.width - 0.8, 7.6), 1.4)
      this.disposableGeometries.push(headerGeo)
      const headerMat = new THREE.MeshBasicMaterial({
        map: headerTex,
        transparent: true,
        opacity: 0.82,
        depthWrite: false,
        toneMapped: false,
      })
      this.disposableMaterials.push(headerMat)
      const headerMesh = new THREE.Mesh(headerGeo, headerMat)
      headerMesh.rotation.x = -Math.PI / 2
      headerMesh.position.set(st.cx, -7.73, st.cz + st.depth / 2 - 0.85)
      this.modelGroup.add(headerMesh)
    }
  }

  private clearModelScene() {
    for (const visual of this.blockVisuals.values()) {
      visual.detailedVisual?.dispose()
    }
    for (const ev of this.edgeVisuals) {
      ev.ribbonMesh.geometry.dispose()
      ev.outlineLine.geometry.dispose()
    }
    this.blockVisuals.clear()
    this.edgeVisuals.length = 0
    this.hitTargets.length = 0

    if (this.moleculeCloud) {
      this.moleculeCloud.dispose()
      this.moleculeCloud = null
    }

    while (this.modelGroup.children.length > 0) {
      const child = this.modelGroup.children[0]!
      this.modelGroup.remove(child)
    }

    this.disposableTextures.forEach(t => t.dispose())
    this.disposableTextures.length = 0

    this.disposableGeometries.forEach(g => g.dispose())
    this.disposableGeometries.length = 0

    this.disposableMaterials.forEach(m => m.dispose())
    this.disposableMaterials.length = 0
  }

  private buildBlockVisual(block: TensorBlock3D): BlockVisual {
    const group = new THREE.Group()
    group.position.set(block.position[0], block.position[1], block.position[2])

    const simplifiedGroup = new THREE.Group()
    group.add(simplifiedGroup)

    const [sx, sy, sz] = block.size
    const baseColor = new THREE.Color(block.color)

    const sliceMeshes: THREE.Mesh[] = []
    const sliceMaterials: THREE.MeshStandardMaterial[] = []
    const edgeLines: THREE.LineSegments[] = []

    const hitGeo = new THREE.BoxGeometry(sx, sy, sz)
    this.disposableGeometries.push(hitGeo)
    const hitMat = new THREE.MeshBasicMaterial({ visible: false })
    this.disposableMaterials.push(hitMat)
    const hitMesh = new THREE.Mesh(hitGeo, hitMat)
    hitMesh.userData = { blockId: block.id }
    group.add(hitMesh)

    if (block.matrixStyle === 'point-cloud') {
      const frameGeo = new THREE.BoxGeometry(sx, sy, sz)
      const edgesGeo = new THREE.EdgesGeometry(frameGeo)
      frameGeo.dispose()
      this.disposableGeometries.push(edgesGeo)

      const lineMat = new THREE.LineBasicMaterial({
        color: baseColor,
        transparent: true,
        opacity: 0.65,
      })
      this.disposableMaterials.push(lineMat)
      const wire = new THREE.LineSegments(edgesGeo, lineMat)
      simplifiedGroup.add(wire)
      edgeLines.push(wire)

      this.moleculeCloud = new MoleculeCloud()
      this.moleculeCloud.setDiffusionStep(this.diffusionStep)
      simplifiedGroup.add(this.moleculeCloud.group)
    } else {
      const tex = createTensorMatrixTexture(block.matrixStyle, block.color, this.isDark)
      this.disposableTextures.push(tex)

      const rawCount = block.stackCount ?? 1
      const visualSlices = rawCount <= 1 ? 1 : Math.min(rawCount, rawCount >= 24 ? 14 : rawCount)
      const gapRatio = visualSlices > 1 ? 0.24 : 0
      const sliceWidth = (sx * (1 - gapRatio)) / visualSlices
      const stepX = visualSlices > 1 ? (sx - sliceWidth) / (visualSlices - 1) : 0
      const startX = visualSlices > 1 ? -sx / 2 + sliceWidth / 2 : 0

      for (let i = 0; i < visualSlices; i++) {
        const boxGeo = new THREE.BoxGeometry(sliceWidth, sy, sz)
        const edgesGeo = new THREE.EdgesGeometry(boxGeo)
        this.disposableGeometries.push(boxGeo, edgesGeo)

        const mat = new THREE.MeshStandardMaterial({
          map: tex,
          color: 0xffffff,
          roughness: 0.36,
          metalness: 0.08,
          transparent: true,
          opacity: 0.96,
        })
        this.disposableMaterials.push(mat)

        const mesh = new THREE.Mesh(boxGeo, mat)
        mesh.position.x = startX + i * stepX
        simplifiedGroup.add(mesh)
        sliceMeshes.push(mesh)
        sliceMaterials.push(mat)

        const lineMat = new THREE.LineBasicMaterial({
          color: baseColor,
          transparent: true,
          opacity: 0.55,
        })
        this.disposableMaterials.push(lineMat)
        const wire = new THREE.LineSegments(edgesGeo, lineMat)
        mesh.add(wire)
        edgeLines.push(wire)
      }
    }

    const labelSprite = createLabelSprite(block.shortLabel, block.shape, block.color, this.isDark)
    if (labelSprite.material.map) {
      this.disposableTextures.push(labelSprite.material.map)
    }
    this.disposableMaterials.push(labelSprite.material)

    const compactLabelSprite = createLabelSprite(
      block.shortLabel,
      '',
      block.color,
      this.isDark,
      true
    )
    if (compactLabelSprite.material.map) {
      this.disposableTextures.push(compactLabelSprite.material.map)
    }
    this.disposableMaterials.push(compactLabelSprite.material)
    compactLabelSprite.visible = false

    if (block.id === 'pairformer-pair') {
      labelSprite.position.set(0, -sy / 2 - 1.15, sz / 2 + 0.5)
      compactLabelSprite.position.copy(labelSprite.position)
    } else {
      const labelExtraY = block.id === 'denoised-coords' ? 1.35 : 0.98
      labelSprite.position.set(0, sy / 2 + labelExtraY, 0)
      compactLabelSprite.position.copy(labelSprite.position)
    }
    group.add(labelSprite)
    group.add(compactLabelSprite)

    const axisTagSprites: THREE.Sprite[] = []
    const tagOffsets: Array<[number, number, number]> = [
      [0, -sy / 2 - 0.36, sz / 2 + 0.25],
      [sx / 2 + 0.55, 0, sz / 2 + 0.25],
      [-sx / 2 - 0.55, -sy / 2 - 0.18, 0],
    ]
    const dimsToTag = block.dims.slice(0, 3)
    dimsToTag.forEach((dimText, idx) => {
      const tagSprite = createAxisTagSprite(dimText, this.isDark ? 'dark' : 'light')
      if (tagSprite.material.map) {
        this.disposableTextures.push(tagSprite.material.map)
      }
      this.disposableMaterials.push(tagSprite.material)
      const [ox, oy, oz] = tagOffsets[idx]!
      tagSprite.position.set(ox, oy, oz)
      group.add(tagSprite)
      axisTagSprites.push(tagSprite)
    })

    let sweepMesh: THREE.Mesh | null = null
    let sweepMat: THREE.MeshBasicMaterial | null = null
    if (
      block.matrixStyle !== 'point-cloud' &&
      (block.category === 'pair' || block.category === 'msa' || block.category === 'diffusion')
    ) {
      const sweepGeo = new THREE.BoxGeometry(sx * 0.99, Math.max(0.14, sy * 0.11), sz + 0.06)
      this.disposableGeometries.push(sweepGeo)
      sweepMat = new THREE.MeshBasicMaterial({
        color: baseColor,
        transparent: true,
        opacity: 0.22,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
      this.disposableMaterials.push(sweepMat)
      sweepMesh = new THREE.Mesh(sweepGeo, sweepMat)
      sweepMesh.renderOrder = 5
      sweepMesh.visible = false
      simplifiedGroup.add(sweepMesh)
    }

    const detailedVisual = buildInPlaceDetailedBlock(block, this.isDark)
    if (detailedVisual) {
      const isExpanded = this.expandedBlockIds.has(block.id)
      detailedVisual.group.visible = isExpanded
      simplifiedGroup.visible = !isExpanded
      group.add(detailedVisual.group)
    }

    return {
      spec: block,
      group,
      simplifiedGroup,
      detailedVisual,
      hitMesh,
      sliceMeshes,
      sliceMaterials,
      edgeLines,
      labelSprite,
      compactLabelSprite,
      axisTagSprites,
      sweepMesh,
      sweepMat,
      sweepPhaseOffset: this.blockVisuals.size * 0.23,
      baseColor,
    }
  }

  private anchorToBlockFace(block: BlockVisual, targetPos: THREE.Vector3): THREE.Vector3 {
    const center = block.group.position
    const [sx, sy, sz] = block.spec.size
    const dir = targetPos.clone().sub(center)
    if (dir.lengthSq() < 1e-6) return center.clone()

    const tx = Math.abs(dir.x) > 1e-5 ? sx / 2 / Math.abs(dir.x) : Infinity
    const ty = Math.abs(dir.y) > 1e-5 ? sy / 2 / Math.abs(dir.y) : Infinity
    const tz = Math.abs(dir.z) > 1e-5 ? sz / 2 / Math.abs(dir.z) : Infinity
    const t = Math.min(tx, ty, tz, 1)
    return center.clone().addScaledVector(dir, t)
  }

  private buildEdgeCurve(
    edge: DataFlowEdge,
    fromBlock: BlockVisual,
    toBlock: BlockVisual
  ): THREE.CatmullRomCurve3 {
    const hasCp = Boolean(edge.controlPoints && edge.controlPoints.length > 0)
    const firstTarget = hasCp
      ? new THREE.Vector3(...edge.controlPoints![0]!)
      : toBlock.group.position
    const lastTarget = hasCp
      ? new THREE.Vector3(...edge.controlPoints![edge.controlPoints!.length - 1]!)
      : fromBlock.group.position

    const start = this.anchorToBlockFace(fromBlock, firstTarget)
    const end = this.anchorToBlockFace(toBlock, lastTarget)

    const pts: THREE.Vector3[] = [start]
    if (hasCp) {
      for (const cp of edge.controlPoints!) {
        pts.push(new THREE.Vector3(cp[0], cp[1], cp[2]))
      }
    } else {
      const mid = start.clone().lerp(end, 0.5)
      if (edge.kind === 'pair-bias') {
        mid.z += 0.6
      } else if (edge.kind === 'residual') {
        mid.y -= 0.65
      }
      pts.push(mid)
    }
    pts.push(end)
    return new THREE.CatmullRomCurve3(pts)
  }

  private buildRibbonArrowGeometries(
    curve: THREE.CatmullRomCurve3,
    shaftWidth: number,
    headWidth: number,
    headLength: number,
    segments = 32
  ): { ribbonGeo: THREE.BufferGeometry; outlineGeo: THREE.BufferGeometry } {
    const totalLen = Math.max(0.5, curve.getLength())
    const effectiveHeadLen = Math.min(headLength, totalLen * 0.42)
    const shaftEndFrac = Math.max(0.15, (totalLen - effectiveHeadLen) / totalLen)

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
      const s = new THREE.Vector3().crossVectors(tan, refNormal)
      if (s.lengthSq() < 1e-6) {
        s.set(1, 0, 0)
      } else {
        s.normalize()
      }
      return s
    }

    const positions: number[] = []
    const indices: number[] = []
    const leftPts: THREE.Vector3[] = []
    const rightPts: THREE.Vector3[] = []

    const halfShaft = shaftWidth / 2
    for (let i = 0; i <= segments; i++) {
      const t = (i / segments) * shaftEndFrac
      const pt = curve.getPointAt(t)
      const side = sideAt(t)
      const left = pt.clone().addScaledVector(side, halfShaft)
      const right = pt.clone().addScaledVector(side, -halfShaft)
      leftPts.push(left)
      rightPts.push(right)
      positions.push(left.x, left.y, left.z, right.x, right.y, right.z)

      if (i < segments) {
        const b = i * 2
        indices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2)
      }
    }

    // Integrated flat triangular arrowhead
    const headBase = curve.getPointAt(shaftEndFrac)
    const headSide = sideAt(shaftEndFrac)
    const halfHead = headWidth / 2
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

    const ribbonGeo = new THREE.BufferGeometry()
    ribbonGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    ribbonGeo.setIndex(indices)
    ribbonGeo.computeVertexNormals()

    // Continuous perimeter outline along shaft borders + arrowhead
    const outlinePts: THREE.Vector3[] = [
      ...leftPts,
      headLeft,
      tip,
      headRight,
      ...rightPts.slice().reverse(),
    ]
    const outlineGeo = new THREE.BufferGeometry().setFromPoints(outlinePts)

    return { ribbonGeo, outlineGeo }
  }

  private buildEdgeVisual(edge: DataFlowEdge): EdgeVisual | null {
    const fromBlock = this.blockVisuals.get(edge.from)
    const toBlock = this.blockVisuals.get(edge.to)
    if (!fromBlock || !toBlock) return null

    const curve = this.buildEdgeCurve(edge, fromBlock, toBlock)
    const shaftWidth = this.getEdgeWidth(edge.kind)
    const headWidth = shaftWidth * 1.85
    const headLength = 0.95
    const { ribbonGeo, outlineGeo } = this.buildRibbonArrowGeometries(
      curve,
      shaftWidth,
      headWidth,
      headLength
    )

    const colorHex = this.getEdgeColor(edge.kind)
    const ribbonMat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    this.disposableMaterials.push(ribbonMat)
    const ribbonMesh = new THREE.Mesh(ribbonGeo, ribbonMat)
    ribbonMesh.renderOrder = 2

    const outlineMat = new THREE.LineBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.42,
    })
    this.disposableMaterials.push(outlineMat)
    const outlineLine = new THREE.Line(outlineGeo, outlineMat)
    outlineLine.renderOrder = 3

    let labelSprite: THREE.Sprite | null = null
    if (edge.label) {
      labelSprite = createEdgeLabelSprite(edge.label, colorHex, this.isDark)
      if (labelSprite.material.map) {
        this.disposableTextures.push(labelSprite.material.map)
      }
      this.disposableMaterials.push(labelSprite.material)
      const midPt = curve.getPointAt(0.5)
      const tan = curve.getTangentAt(0.5).normalize()
      const normal = new THREE.Vector3(-tan.y, tan.x, 0)
      if (normal.lengthSq() < 1e-4) normal.set(0, 1, 0)
      normal.normalize()
      if (normal.y < 0) normal.negate()
      const extraOffset =
        edge.id === 'e-diff-cond-to-atom-enc' || edge.id === 'e-diff-cond-to-dit' ? 0.9 : 0.65
      labelSprite.position.set(
        midPt.x + normal.x * extraOffset * 0.45,
        midPt.y + Math.max(0.55, normal.y * extraOffset),
        midPt.z + 0.25
      )
      labelSprite.visible = false
    }

    const isOpmEdge = edge.id === 'e-msa-stack-to-pf-pair'
    const beadCount = isOpmEdge ? 5 : edge.kind === 'recycle' ? 3 : 2
    const beads: THREE.Mesh[] = []
    const beadOffsets: number[] = []
    for (let i = 0; i < beadCount; i++) {
      const beadMat = new THREE.MeshBasicMaterial({
        color: isOpmEdge ? 0x2dd4bf : colorHex,
        transparent: true,
        opacity: isOpmEdge ? 0.92 : 0.75,
      })
      this.disposableMaterials.push(beadMat)
      const bead = new THREE.Mesh(this.beadGeo, beadMat)
      if (isOpmEdge) {
        bead.scale.setScalar(1.35)
      }
      beads.push(bead)
      beadOffsets.push(i / beadCount)
    }

    return {
      spec: edge,
      curve,
      ribbonMesh,
      ribbonMat,
      outlineLine,
      outlineMat,
      labelSprite,
      beads,
      beadOffsets,
      beadSpeed: isOpmEdge ? 0.44 : edge.kind === 'recycle' ? 0.28 : 0.36,
      isHighlighted: false,
    }
  }

  private getEdgeWidth(kind: DataFlowEdge['kind']): number {
    switch (kind) {
      case 'pair-bias':
      case 'recycle':
        return 0.48
      case 'conditioning':
        return 0.46
      default:
        return 0.62
    }
  }

  private getEdgeColor(kind: DataFlowEdge['kind']): number {
    switch (kind) {
      case 'recycle':
        return 0xfbbf24
      case 'pair-bias':
        return 0x818cf8
      case 'conditioning':
        return 0x38bdf8
      case 'residual':
        return 0x22c55e
      default:
        return 0x4ade80
    }
  }

  public setFocus(focusBlockIds: string[], highlightEdgeIds: string[]) {
    this.focusBlockIds = new Set(focusBlockIds)
    this.highlightEdgeIds = new Set(highlightEdgeIds)
    this.refreshVisualStates()
  }

  public setSelectedBlock(blockId: string | null) {
    this.selectedBlockId = blockId
    this.refreshVisualStates()
  }

  public setHoveredBlock(blockId: string | null) {
    if (this.hoveredBlockId === blockId) return
    this.hoveredBlockId = blockId
    this.refreshVisualStates()
  }

  public setFlowPlaying(playing: boolean) {
    this.isFlowPlaying = playing
    this.refreshVisualStates()
  }

  public setRecycleCycle(cycle: number) {
    if (this.recycleCycle !== cycle) {
      this.recycleCycle = cycle
      this.recyclePulseBoost = 1.0
    }
  }

  public setPairformerBlock(block: number) {
    this.pairformerBlock = block
    this.refreshVisualStates()
  }

  public setDiffusionStep(step: number) {
    this.diffusionStep = step
    this.moleculeCloud?.setDiffusionStep(step)
    this.refreshVisualStates()
  }

  private applyAspectFraming() {
    const nextFov = this.camera.aspect < 1.1 ? 46 : 44
    if (this.camera.fov !== nextFov) {
      this.camera.fov = nextFov
      this.camera.updateProjectionMatrix()
    }
    const aspectScale = Math.min(1.55, Math.max(1, 1.25 / Math.max(0.55, this.camera.aspect)))
    const offset = this.baseCamPos.clone().sub(this.baseTarget).multiplyScalar(aspectScale)
    this.desiredTarget.copy(this.baseTarget)
    this.desiredCamPos.copy(this.baseTarget).add(offset)
  }

  public flyToCamera(position: [number, number, number], target: [number, number, number]) {
    this.baseCamPos.set(position[0], position[1], position[2])
    this.baseTarget.set(target[0], target[1], target[2])
    this.applyAspectFraming()
    this.cameraFlying = true
  }

  public focusBlock(blockId: string) {
    const visual = this.blockVisuals.get(blockId)
    if (!visual) return
    const { x: bx, y: by, z: bz } = visual.group.position
    this.flyToCamera([bx + 3.5, by + 4.5, bz + 13.5], [bx, by, bz])
  }

  private updateDynamicPairBiasEdge() {
    const ev = this.edgeVisuals.find(e => e.spec.id === 'e-pf-pair-to-single')
    const pairVisual = this.blockVisuals.get('pairformer-pair')
    const singleVisual = this.blockVisuals.get('pairformer-single')
    if (!ev || !pairVisual || !singleVisual) return

    const sliceCount = pairVisual.sliceMeshes.length
    if (sliceCount === 0) return

    const activeIdx = Math.min(
      sliceCount - 1,
      Math.max(0, Math.round(((this.pairformerBlock - 1) / 47) * (sliceCount - 1)))
    )
    const activeMesh = pairVisual.sliceMeshes[activeIdx]!
    const activeX = pairVisual.group.position.x + activeMesh.position.x

    const start = new THREE.Vector3(
      activeX,
      pairVisual.group.position.y + pairVisual.spec.size[1] / 2 + 0.25,
      pairVisual.group.position.z + 0.85
    )
    const end = new THREE.Vector3(
      activeX,
      singleVisual.group.position.y - singleVisual.spec.size[1] / 2 + 0.25,
      singleVisual.group.position.z + 0.85
    )
    const mid = start.clone().lerp(end, 0.5)
    mid.z += 0.65

    ev.curve = new THREE.CatmullRomCurve3([start, mid, end])
    const { ribbonGeo, outlineGeo } = this.buildRibbonArrowGeometries(
      ev.curve,
      0.48,
      0.48 * 1.85,
      0.85,
      20
    )
    ev.ribbonMesh.geometry.dispose()
    ev.ribbonMesh.geometry = ribbonGeo
    ev.outlineLine.geometry.dispose()
    ev.outlineLine.geometry = outlineGeo

    if (ev.labelSprite) {
      const labelPt = ev.curve.getPointAt(0.5)
      ev.labelSprite.position.set(labelPt.x + 1.5, labelPt.y, labelPt.z + 0.3)
    }
  }

  private refreshVisualStates() {
    const hasFocus = this.focusBlockIds.size > 0
    const unfocusedOpacity = this.isDark ? 0.45 : 0.14
    const unfocusedLineOpacity = this.isDark ? 0.26 : 0.12
    const focusedLineOpacity = this.isDark ? 0.36 : 0.55
    const selectedLineOpacity = this.isDark ? 0.78 : 0.95
    const unfocusedLabelOpacity = this.isDark ? 0.35 : 0.08

    for (const [id, visual] of this.blockVisuals) {
      const isSelected = id === this.selectedBlockId
      const isHovered = id === this.hoveredBlockId
      const isFocused = !hasFocus || this.focusBlockIds.has(id)
      const isActiveLabel = isSelected || isHovered || isFocused

      const targetOpacity = isSelected || isHovered ? 1.0 : isFocused ? 0.96 : unfocusedOpacity
      const scaleBoost = isSelected ? 1.04 : isHovered ? 1.025 : 1.0
      visual.group.scale.setScalar(scaleBoost)

      const sliceCount = visual.sliceMaterials.length
      let activeSliceIdx = -1
      if (id === 'pairformer-pair' || id === 'pairformer-single') {
        activeSliceIdx = Math.min(
          sliceCount - 1,
          Math.max(0, Math.round(((this.pairformerBlock - 1) / 47) * (sliceCount - 1)))
        )
      } else if (id === 'diffusion-transformer') {
        activeSliceIdx = Math.min(
          sliceCount - 1,
          Math.max(0, Math.round((this.diffusionStep / 200) * (sliceCount - 1)))
        )
      }

      visual.sliceMeshes.forEach((mesh, idx) => {
        const isSliceActive = activeSliceIdx === idx
        if (id === 'pairformer-pair' || id === 'pairformer-single') {
          mesh.position.z = isSliceActive ? 0.85 : 0
          mesh.position.y = isSliceActive ? 0.25 : 0
        }
      })

      visual.sliceMaterials.forEach((mat, idx) => {
        mat.opacity = targetOpacity
        const isSliceActive = activeSliceIdx === idx
        if (isSelected || isSliceActive) {
          mat.emissive.copy(visual.baseColor)
          mat.emissiveIntensity = isSelected ? 0.35 : 0.48
        } else if (isHovered) {
          mat.emissive.copy(visual.baseColor)
          mat.emissiveIntensity = 0.22
        } else if (this.isDark && !isFocused) {
          mat.emissive.copy(visual.baseColor)
          mat.emissiveIntensity = 0.1
        } else {
          mat.emissive.setHex(0x000000)
          mat.emissiveIntensity = 0
        }
      })

      visual.edgeLines.forEach(line => {
        const lm = line.material as THREE.LineBasicMaterial
        lm.opacity =
          isSelected || isHovered
            ? selectedLineOpacity
            : isFocused
              ? focusedLineOpacity
              : unfocusedLineOpacity
      })

      const isOverviewMode = !hasFocus && this.selectedBlockId === null
      const showOverviewLabel = OVERVIEW_LANDMARK_IDS.has(id) || isHovered
      visual.labelSprite.visible = isOverviewMode ? showOverviewLabel : true
      visual.labelSprite.material.opacity = isActiveLabel ? 1.0 : unfocusedLabelOpacity
      visual.labelSprite.renderOrder = isActiveLabel ? 20 : 0
      visual.labelSprite.material.depthTest = !isActiveLabel

      visual.compactLabelSprite.visible = false
      visual.compactLabelSprite.material.opacity = isActiveLabel ? 1.0 : unfocusedLabelOpacity
      visual.compactLabelSprite.renderOrder = isActiveLabel ? 20 : 0
      visual.compactLabelSprite.material.depthTest = !isActiveLabel

      const showAxisTags =
        isSelected || isHovered || (hasFocus && isFocused && this.focusBlockIds.size <= 3)
      visual.axisTagSprites.forEach(tag => {
        tag.visible = showAxisTags
      })

      if (visual.sweepMesh) {
        visual.sweepMesh.visible = this.isFlowPlaying && (isSelected || isFocused)
      }

      if (visual.detailedVisual) {
        const isExpanded = this.expandedBlockIds.has(id)
        visual.simplifiedGroup.visible = !isExpanded
        visual.detailedVisual.group.visible = isExpanded
        if (isExpanded) {
          visual.detailedVisual.setHighlighted(isSelected, isHovered, isFocused, this.isDark)
          visual.detailedVisual.setLabelsVisible(isSelected || isHovered)
        }
      }
    }

    this.updateDynamicPairBiasEdge()

    const hasHighlightedEdges = this.highlightEdgeIds.size > 0
    const inspectingBlock = this.selectedBlockId !== null
    for (const ev of this.edgeVisuals) {
      const highlighted = !hasHighlightedEdges || this.highlightEdgeIds.has(ev.spec.id)
      const isIncident =
        inspectingBlock &&
        (ev.spec.from === this.selectedBlockId || ev.spec.to === this.selectedBlockId)
      const isDimmedRecycle =
        inspectingBlock &&
        ev.spec.kind === 'recycle' &&
        this.selectedBlockId !== 'trunk-recycle-gate'

      ev.isHighlighted = inspectingBlock ? isIncident && !isDimmedRecycle : highlighted

      if (isDimmedRecycle) {
        ev.ribbonMat.opacity = 0.1
        ev.outlineMat.opacity = 0.12
      } else if (inspectingBlock) {
        ev.ribbonMat.opacity = isIncident ? (this.isDark ? 0.56 : 0.62) : this.isDark ? 0.12 : 0.08
        ev.outlineMat.opacity = isIncident ? (this.isDark ? 0.62 : 0.72) : this.isDark ? 0.14 : 0.09
      } else if (!hasHighlightedEdges) {
        ev.ribbonMat.opacity = this.isDark ? 0.34 : 0.4
        ev.outlineMat.opacity = this.isDark ? 0.4 : 0.48
      } else if (highlighted) {
        ev.ribbonMat.opacity = this.isDark ? 0.56 : 0.62
        ev.outlineMat.opacity = this.isDark ? 0.62 : 0.72
      } else {
        ev.ribbonMat.opacity = this.isDark ? 0.16 : 0.11
        ev.outlineMat.opacity = this.isDark ? 0.18 : 0.12
      }

      if (ev.labelSprite) {
        const showEdgeLabel = inspectingBlock
          ? isIncident && !isDimmedRecycle
          : hasHighlightedEdges && highlighted
        ev.labelSprite.visible = showEdgeLabel
        ev.labelSprite.renderOrder = showEdgeLabel ? 22 : 0
        ev.labelSprite.material.depthTest = !showEdgeLabel
      }
      ev.beads.forEach(b => {
        b.visible = ev.isHighlighted
      })
    }
  }

  private readonly handleControlsStart = () => {
    this.cameraFlying = false
  }

  private readonly handleWheel = () => {
    this.cameraFlying = false
  }

  private readonly handlePointerMove = (e: PointerEvent) => {
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1

    this.raycaster.setFromCamera(this.pointer, this.camera)
    const hits = this.raycaster.intersectObjects(this.hitTargets, false)
    const hitId = (hits[0]?.object.userData?.blockId as string | undefined) ?? null

    this.renderer.domElement.style.cursor = hitId ? 'pointer' : 'grab'
    if (hitId !== this.hoveredBlockId) {
      this.setHoveredBlock(hitId)
      this.callbacks.onHoverBlock?.(hitId)
    }
  }

  private readonly handlePointerDown = (e: PointerEvent) => {
    this.pointerDownPos = { x: e.clientX, y: e.clientY }
  }

  private readonly handlePointerUp = (e: PointerEvent) => {
    const dx = e.clientX - this.pointerDownPos.x
    const dy = e.clientY - this.pointerDownPos.y
    if (Math.hypot(dx, dy) > 5) return

    const rect = this.renderer.domElement.getBoundingClientRect()
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1

    this.raycaster.setFromCamera(this.pointer, this.camera)
    const hits = this.raycaster.intersectObjects(this.hitTargets, false)
    const hitId = (hits[0]?.object.userData?.blockId as string | undefined) ?? null
    this.callbacks.onSelectBlock?.(hitId)
  }

  private readonly handlePointerLeave = () => {
    if (this.hoveredBlockId !== null) {
      this.setHoveredBlock(null)
      this.callbacks.onHoverBlock?.(null)
    }
  }

  private readonly handleDoubleClick = (e: MouseEvent) => {
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1

    this.raycaster.setFromCamera(this.pointer, this.camera)
    const hits = this.raycaster.intersectObjects(this.hitTargets, false)
    const hitId = (hits[0]?.object.userData?.blockId as string | undefined) ?? null
    if (hitId) {
      this.callbacks.onDoubleClickBlock?.(hitId)
    }
  }

  private readonly animate = () => {
    if (this.disposed) return
    this.rafId = requestAnimationFrame(this.animate)

    const now = performance.now()
    const dt = Math.min(0.05, (now - this.lastTime) / 1000)
    this.lastTime = now

    if (this.cameraFlying) {
      const alpha = 1 - Math.exp(-5.5 * dt)
      this.camera.position.lerp(this.desiredCamPos, alpha)
      this.controls.target.lerp(this.desiredTarget, alpha)
      if (
        this.camera.position.distanceTo(this.desiredCamPos) < 0.05 &&
        this.controls.target.distanceTo(this.desiredTarget) < 0.05
      ) {
        this.cameraFlying = false
      }
    }

    this.controls.update()

    this.moleculeCloud?.update(dt)

    const hasFocus = this.focusBlockIds.size > 0
    const isOverviewMode = !hasFocus && this.selectedBlockId === null
    for (const [id, visual] of this.blockVisuals) {
      if (visual.detailedVisual && visual.detailedVisual.group.visible) {
        visual.detailedVisual.update(dt, this.isFlowPlaying)
        visual.group.getWorldPosition(this.scratchVec)
        const camDist = this.camera.position.distanceTo(this.scratchVec)
        visual.detailedVisual.setLabelsVisible(
          id === this.selectedBlockId || id === this.hoveredBlockId || camDist < 16
        )
      }
      const isFocused = !hasFocus || this.focusBlockIds.has(id)
      const isActiveLabel = id === this.selectedBlockId || id === this.hoveredBlockId || isFocused
      const wantsVisible = isOverviewMode
        ? OVERVIEW_LANDMARK_IDS.has(id) || id === this.hoveredBlockId
        : true

      if (wantsVisible) {
        visual.labelSprite.getWorldPosition(this.scratchVec)
        const dist = this.camera.position.distanceTo(this.scratchVec)
        const useCompact = isOverviewMode && dist > 36 && id !== this.hoveredBlockId

        visual.labelSprite.visible = !useCompact
        visual.compactLabelSprite.visible = useCompact

        const activeSprite = useCompact ? visual.compactLabelSprite : visual.labelSprite
        const aspect = useCompact ? 136 / 768 : 200 / 768
        if (isActiveLabel) {
          const s = THREE.MathUtils.clamp(dist * 0.115, 3.4, 7.8)
          activeSprite.scale.set(s, s * aspect, 1)
        } else {
          activeSprite.scale.set(2.8, 2.8 * aspect, 1)
        }
      } else {
        visual.labelSprite.visible = false
        visual.compactLabelSprite.visible = false
      }

      if (visual.sweepMesh && visual.sweepMat && visual.sweepMesh.visible) {
        const sy = visual.spec.size[1]
        const phase = (now * 0.00065 + visual.sweepPhaseOffset) % 1
        visual.sweepMesh.position.y = -sy * 0.42 + phase * (sy * 0.84)
        visual.sweepMat.opacity = Math.sin(phase * Math.PI) * (this.isDark ? 0.26 : 0.2)
      }
    }

    this.deoverlapScreenLabels()

    if (this.recyclePulseBoost > 0) {
      this.recyclePulseBoost = Math.max(0, this.recyclePulseBoost - dt * 1.4)
    }

    const pos = new THREE.Vector3()
    for (const ev of this.edgeVisuals) {
      if (ev.labelSprite && ev.labelSprite.visible) {
        ev.labelSprite.getWorldPosition(this.scratchVec)
        const dist = this.camera.position.distanceTo(this.scratchVec)
        const es = THREE.MathUtils.clamp(dist * 0.085, 2.6, 5.2)
        ev.labelSprite.scale.set(es, es * 0.175, 1)
      }

      if (ev.spec.kind === 'recycle' && this.recyclePulseBoost > 0) {
        ev.ribbonMat.opacity = Math.min(0.85, 0.62 + this.recyclePulseBoost * 0.24)
      } else if (
        ev.isHighlighted &&
        this.isFlowPlaying &&
        this.selectedBlockId === null &&
        (ev.spec.id === 'e-msa-stack-to-pf-pair' ||
          (!this.isDark && this.highlightEdgeIds.size > 0))
      ) {
        const pulse = 0.5 + 0.5 * Math.sin(now * 0.0045)
        const baseR = this.isDark ? 0.56 : 0.62
        const baseO = this.isDark ? 0.62 : 0.72
        ev.ribbonMat.opacity =
          baseR + (ev.spec.id === 'e-msa-stack-to-pf-pair' ? 0.24 : 0.14) * pulse
        ev.outlineMat.opacity =
          baseO + (ev.spec.id === 'e-msa-stack-to-pf-pair' ? 0.22 : 0.12) * pulse
      }
      if (!this.isFlowPlaying) continue
      const speedMult = ev.spec.kind === 'recycle' ? 1 + this.recyclePulseBoost * 1.5 : 1
      for (let i = 0; i < ev.beads.length; i++) {
        ev.beadOffsets[i] = (ev.beadOffsets[i]! + dt * ev.beadSpeed * speedMult) % 1
        ev.curve.getPointAt(ev.beadOffsets[i]!, pos)
        ev.beads[i]!.position.copy(pos)
      }
    }

    this.renderer.render(this.scene, this.camera)
  }

  private deoverlapScreenLabels() {
    const width = Math.max(1, this.renderer.domElement.clientWidth)
    const height = Math.max(1, this.renderer.domElement.clientHeight)
    const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) * 0.5)

    type ScreenRect = { left: number; right: number; top: number; bottom: number }
    const placedRects: ScreenRect[] = []

    const computeRect = (sprite: THREE.Sprite, pad = 4): ScreenRect | null => {
      sprite.getWorldPosition(this.scratchVec)
      const dist = this.camera.position.distanceTo(this.scratchVec)
      if (dist < 0.5) return null

      const ndc = this.scratchVec.clone().project(this.camera)
      if (ndc.z < -1 || ndc.z > 1) return null

      const cx = (ndc.x * 0.5 + 0.5) * width
      const cy = (-ndc.y * 0.5 + 0.5) * height
      const viewH = 2 * dist * tanHalfFov
      const pxPerUnit = height / viewH
      const halfW = sprite.scale.x * pxPerUnit * 0.5 + pad
      const halfH = sprite.scale.y * pxPerUnit * 0.5 + pad
      return {
        left: cx - halfW,
        right: cx + halfW,
        top: cy - halfH,
        bottom: cy + halfH,
      }
    }

    const overlaps = (a: ScreenRect, b: ScreenRect) =>
      a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top

    for (const visual of this.blockVisuals.values()) {
      const activeSprite = visual.compactLabelSprite.visible
        ? visual.compactLabelSprite
        : visual.labelSprite
      if (!activeSprite.visible || activeSprite.material.opacity < 0.25) continue
      const rect = computeRect(activeSprite, 12)
      if (rect) placedRects.push(rect)
    }

    const hasHighlightedEdges = this.highlightEdgeIds.size > 0
    const inspectingBlock = this.selectedBlockId !== null
    for (const ev of this.edgeVisuals) {
      if (!ev.labelSprite) continue
      const shouldConsider = inspectingBlock
        ? ev.isHighlighted
        : hasHighlightedEdges && ev.isHighlighted
      if (!shouldConsider) {
        ev.labelSprite.visible = false
        continue
      }

      const rect = computeRect(ev.labelSprite, 12)
      if (!rect) {
        ev.labelSprite.visible = false
        continue
      }

      const collides = placedRects.some(r => overlaps(rect, r))
      ev.labelSprite.visible = !collides
      if (!collides) {
        placedRects.push(rect)
      }
    }
  }

  public resize() {
    if (this.disposed) return
    const width = Math.max(1, this.container.clientWidth)
    const height = Math.max(1, this.container.clientHeight)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
    this.applyAspectFraming()
    this.cameraFlying = true
  }

  public dispose() {
    this.disposed = true
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }

    const dom = this.renderer.domElement
    dom.removeEventListener('pointermove', this.handlePointerMove)
    dom.removeEventListener('pointerdown', this.handlePointerDown)
    dom.removeEventListener('pointerup', this.handlePointerUp)
    dom.removeEventListener('pointerleave', this.handlePointerLeave)
    dom.removeEventListener('dblclick', this.handleDoubleClick)
    dom.removeEventListener('wheel', this.handleWheel)

    this.controls.removeEventListener('start', this.handleControlsStart)
    this.controls.dispose()

    this.clearModelScene()
    this.beadGeo.dispose()
    this.gridHelper.dispose()
    this.renderer.dispose()

    if (dom.parentElement === this.container) {
      this.container.removeChild(dom)
    }
  }
}
