import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import sampleCifText from '~/assets/examples/7BEA.cif?raw'
import type {
  DataFlowEdge,
  FoldingModelSpec,
  InputSourceId,
  OutputId,
  TensorBlock3D,
} from '~/types/architecture'
import { buildCifComplex } from './cifRibbon'
import { computeExpandedLayout } from './expandedLayout'
import { buildInPlaceDetailedBlock, type DetailedBlockVisual } from './InPlaceDetailBuilder'
import {
  getBlockLabelState,
  getEdgeLabelState,
  getExternalLabelState,
  rectsOverlap,
  shouldShowAxisTags,
  shouldShowDetailMiniLabels,
  type ScreenRect,
} from './labelVisibility'
import { MoleculeCloud } from './moleculeCloud'
import {
  DEFAULT_SCENE_WIDTH,
  computeActivePlateTarget,
  computeCycleGlow,
  computeEffectiveWaveSpeed,
  computeFollowAlpha,
  computeSceneFitDistance,
  computeStagePlateGlow,
  computeWaveGlow,
  shouldFollowOverviewWave,
  type WeightedStagePlate,
} from './overviewCameraFollow'
import {
  createAxisTagSprite,
  createEdgeLabelSprite,
  createLabelSprite,
  createMsaAlignmentTexture,
  createPlddtPlotTexture,
  createRecycleLoopBadgeSprite,
  createStageHeaderTexture,
  createTensorMatrixTexture,
} from './textures'

const BOTTOM_LABEL_BLOCK_IDS = new Set([
  'ref-conformers',
  'atom-attn-encoder-init',
  'z-init',
  'template-embedder',
  'pairformer-pair',
  'atom-attn-encoder-diff',
  'atom-attn-decoder',
  'aux-pairformer',
])

const OVERVIEW_WAVE_PHASE: Record<string, number> = {
  'input-features': 0.13,
  'ref-conformers': 0.13,
  'atom-attn-encoder-init': 0.175,
  's-input': 0.175,
  's-init': 0.22,
  'z-init': 0.22,
  'trunk-recycle-gate': 0.26,
  'template-embedder': 0.31,
  'msa-embedder': 0.31,
  'msa-stack': 0.33,
  'pairformer-single': 0.46,
  'pairformer-pair': 0.46,
  'diffusion-conditioning': 0.68,
  'atom-attn-encoder-diff': 0.73,
  'diffusion-transformer': 0.78,
  'atom-attn-decoder': 0.83,
  'denoised-coords': 0.87,
  'aux-pairformer': 0.92,
  'confidence-outputs': 0.96,
}

const TRUNK_LOOP_BLOCK_PHASE: Record<string, number> = {
  'trunk-recycle-gate': 0.1,
  'template-embedder': 0.28,
  'msa-embedder': 0.28,
  'msa-stack': 0.32,
  'pairformer-single': 0.52,
  'pairformer-pair': 0.52,
}

const TRUNK_BLOCK_IDS = new Set([
  'input-features',
  'ref-conformers',
  'atom-attn-encoder-init',
  's-input',
  's-init',
  'z-init',
  'trunk-recycle-gate',
  'template-embedder',
  'msa-embedder',
  'msa-stack',
  'pairformer-pair',
  'pairformer-single',
])

export interface SceneEngineCallbacks {
  onSelectBlock?: (blockId: string | null) => void
  onHoverBlock?: (blockId: string | null) => void
  onDoubleClickBlock?: (blockId: string | null) => void
  onSelectInputSource?: (inputSourceId: InputSourceId | null) => void
  onHoverInputSource?: (inputSourceId: InputSourceId | null) => void
  onSelectOutput?: (outputId: OutputId | null) => void
  onHoverOutput?: (outputId: OutputId | null) => void
  onOverviewPauseChange?: (remainingSeconds: number, totalSeconds: number) => void
}

interface BlockVisual {
  spec: TensorBlock3D
  group: THREE.Group
  simplifiedGroup: THREE.Group
  docFrameLine: THREE.LineSegments
  externalInputGroup: THREE.Group | null
  detailedVisual: DetailedBlockVisual | null
  hitMesh: THREE.Mesh
  sliceMeshes: THREE.Mesh[]
  sliceMaterials: THREE.MeshStandardMaterial[]
  edgeLines: THREE.LineSegments[]
  labelSprite: THREE.Sprite
  compactLabelSprite: THREE.Sprite
  axisTagSprites: THREE.Sprite[]
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
  private recycleCycleScrubbed = false
  private selectedBlockId: string | null = null
  private hoveredBlockId: string | null = null
  private selectedInputSourceId: InputSourceId | null = null
  private hoveredInputSourceId: InputSourceId | null = null
  private selectedOutputId: OutputId | null = null
  private hoveredOutputId: OutputId | null = null
  private docsOpen = true
  private hoveredSliceBlockId: string | null = null
  private focusBlockIds = new Set<string>()
  private highlightEdgeIds = new Set<string>()
  private recyclePulseBoost = 0
  private recycleBadgeSprite: THREE.Sprite | null = null
  private recycleBadgeText = ''
  private recycleBadgeWantsVisible = false
  private externalLabelSprites: THREE.Sprite[] = []
  private overviewWaveTime = 0
  private overviewPauseRemaining = 0
  private readonly overviewPauseDuration = 3.0
  private lastReportedPause = 0
  private wasOverviewWave = false
  private lastOverviewPfSlice = -1
  private stageFloorPlates: Array<{
    title: string
    padMesh: THREE.Mesh
    border: THREE.LineSegments
    headerMesh: THREE.Mesh
    padMat: THREE.MeshBasicMaterial
    borderMat: THREE.LineBasicMaterial
    headerMat: THREE.MeshBasicMaterial
    phase: number
    width: number
    baseWidth: number
    blockIds?: string[]
    followRightOfBlockId?: string
  }> = []
  private externalOutputVisuals = new Map<
    OutputId,
    {
      group: THREE.Group
      docFrameLine: THREE.LineSegments
      materials: THREE.Material[]
      phase: number
      arrow: {
        ribbonMesh: THREE.Mesh
        outlineLine: THREE.Line
        ribbonMat: THREE.MeshBasicMaterial
        outlineMat: THREE.LineBasicMaterial
      } | null
    }
  >()
  private cifComplexGroup: THREE.Group | null = null
  private cifComplexGeometries: THREE.BufferGeometry[] = []
  private cifComplexMaterials: THREE.Material[] = []
  private externalInputVisuals = new Map<
    string,
    {
      materials: Array<THREE.MeshStandardMaterial | THREE.LineBasicMaterial>
      arrows: Array<{
        ribbonMat: THREE.MeshBasicMaterial
        outlineMat: THREE.LineBasicMaterial
      }>
      phase: number
    }
  >()

  private cameraFlying = false
  private isUserDraggingControls = false
  private readonly followScratchDelta = new THREE.Vector3()
  private readonly baseCamPos = new THREE.Vector3(11, 36, 96)
  private readonly baseTarget = new THREE.Vector3(13.5, -1, 0)
  private readonly desiredCamPos = new THREE.Vector3(11, 36, 96)
  private readonly desiredTarget = new THREE.Vector3(13.5, -1, 0)

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
    this.camera = new THREE.PerspectiveCamera(44, width / height, 0.2, 600)
    this.applyAspectFraming()
    this.camera.position.copy(this.desiredCamPos)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.28
    this.controls.zoomToCursor = true
    this.controls.minDistance = 4
    this.controls.maxDistance = 320
    this.controls.maxPolarAngle = Math.PI * 0.85
    this.controls.target.copy(this.desiredTarget)
    this.controls.addEventListener('start', this.handleControlsStart)
    this.controls.addEventListener('end', this.handleControlsEnd)

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
      140,
      70,
      dark ? 0x3f3f46 : 0xcbd5e1,
      dark ? 0x27272a : 0xe2e8f0
    )
    grid.position.set(13, -7.8, 0)
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
    this.applyExpandedLayout()
    this.refreshVisualStates()
  }

  private applyThemeColors() {
    const bgHex = this.isDark ? 0x161618 : 0xfafaf9
    this.scene.background = new THREE.Color(bgHex)
    this.scene.fog = new THREE.Fog(bgHex, 220, 520)

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

    const portOffsets = this.computeEdgePortOffsets(model.edges)
    for (const edge of model.edges) {
      const ports = portOffsets.get(edge.id) ?? { startDy: 0, endDy: 0 }
      const edgeVisual = this.buildEdgeVisual(edge, ports.startDy, ports.endDy)
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

    if (model.edges.some(e => e.kind === 'recycle')) {
      this.buildRecycleLoopBadge('10x loop')
    }

    this.buildOutputVisual()
    this.syncStageFloorPlatesAndOutput()
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
      phase: number
      waveWidth: number
      blockIds?: string[]
      followRightOfBlockId?: string
    }> = [
      {
        title: 'External Inputs',
        cx: -38.0,
        cz: 1.0,
        width: 4.6,
        depth: 8.6,
        color: 0xea580c,
        phase: 0.08,
        waveWidth: 0.07,
      },
      {
        title: 'Inputs & Embedder',
        cx: -26.0,
        cz: 0.2,
        width: 19.0,
        depth: 9.2,
        color: 0x3b82f6,
        phase: 0.18,
        waveWidth: 0.075,
      },
      {
        title: 'Templates & MSA',
        cx: -6.0,
        cz: -0.2,
        width: 19.6,
        depth: 11.6,
        color: 0x14b8a6,
        phase: 0.31,
        waveWidth: 0.1,
      },
      {
        title: 'Pairformer 48×',
        cx: 8.5,
        cz: -0.4,
        width: 8.0,
        depth: 9.2,
        color: 0x9333ea,
        phase: 0.45,
        waveWidth: 0.1,
      },
      {
        title: 'EDM Diffusion 200×',
        cx: 26.0,
        cz: 1.6,
        width: 24.0,
        depth: 5.4,
        color: 0xe11d48,
        phase: 0.73,
        waveWidth: 0.13,
        blockIds: [
          'diffusion-conditioning',
          'atom-attn-encoder-diff',
          'diffusion-transformer',
          'atom-attn-decoder',
          'denoised-coords',
        ],
      },
      {
        title: 'Confidence Heads',
        cx: 55.2,
        cz: 0.0,
        width: 12.5,
        depth: 7.5,
        color: 0x16a34a,
        phase: 0.92,
        waveWidth: 0.09,
        blockIds: ['aux-pairformer', 'confidence-outputs'],
      },
      {
        title: 'External Output · CIF',
        cx: 41.7,
        cz: 1.6,
        width: 4.8,
        depth: 5.4,
        color: 0xea580c,
        phase: 0.85,
        waveWidth: 0.08,
        followRightOfBlockId: 'denoised-coords',
      },
      {
        title: 'External Outputs',
        cx: 60.4,
        cz: 0.0,
        width: 5.2,
        depth: 6.4,
        color: 0xea580c,
        phase: 0.96,
        waveWidth: 0.08,
        followRightOfBlockId: 'confidence-outputs',
      },
    ]

    this.stageFloorPlates = []

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

      this.stageFloorPlates.push({
        title: st.title,
        padMesh,
        border,
        headerMesh,
        padMat,
        borderMat,
        headerMat,
        phase: st.phase,
        width: st.waveWidth,
        baseWidth: st.width,
        blockIds: st.blockIds,
        followRightOfBlockId: st.followRightOfBlockId,
      })
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
    this.recycleBadgeSprite = null
    this.recycleBadgeText = ''
    this.externalLabelSprites = []
    this.stageFloorPlates = []
    this.externalInputVisuals.clear()
    this.externalOutputVisuals.clear()
    this.cifComplexGroup = null
    this.cifComplexGeometries = []
    this.cifComplexMaterials = []

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
      this.moleculeCloud.setDiffusionStep(160)
      simplifiedGroup.add(this.moleculeCloud.group)
    } else {
      const tex = createTensorMatrixTexture(block.matrixStyle, block.color, this.isDark)
      this.disposableTextures.push(tex)

      const rawCount = block.stackCount ?? 1
      const visualSlices = rawCount <= 1 ? 1 : Math.min(rawCount, rawCount >= 24 ? 14 : rawCount)
      const gap = visualSlices > 1 ? Math.min(0.18, (sx * 0.28) / (visualSlices - 1)) : 0
      const sliceWidth = (sx - gap * (visualSlices - 1)) / visualSlices
      const stepX = visualSlices > 1 ? sliceWidth + gap : 0
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

    if (BOTTOM_LABEL_BLOCK_IDS.has(block.id)) {
      const labelExtraY = block.id === 'pairformer-pair' ? 1.05 : 0.95
      labelSprite.position.set(
        0,
        -sy / 2 - labelExtraY,
        block.id === 'pairformer-pair' ? sz / 2 + 0.5 : 0
      )
      compactLabelSprite.position.copy(labelSprite.position)
    } else {
      const labelExtraY = block.id === 'denoised-coords' ? 1.2 : 0.9
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

    let externalInputGroup: THREE.Group | null = null
    if (
      block.id === 'input-features' ||
      block.id === 'ref-conformers' ||
      block.id === 'msa-embedder'
    ) {
      externalInputGroup = new THREE.Group()
      this.buildInputSourceVisual(block.id, sx, sy, sz, externalInputGroup)
      group.add(externalInputGroup)
    }

    const detailedVisual = buildInPlaceDetailedBlock(block, this.isDark)
    if (detailedVisual) {
      const isExpanded = this.expandedBlockIds.has(block.id)
      detailedVisual.group.visible = isExpanded
      simplifiedGroup.visible = !isExpanded
      group.add(detailedVisual.group)
    }

    const docFrameBoxGeo = new THREE.BoxGeometry(sx, sy, sz)
    const docFrameEdgesGeo = new THREE.EdgesGeometry(docFrameBoxGeo)
    docFrameBoxGeo.dispose()
    this.disposableGeometries.push(docFrameEdgesGeo)
    const docFrameMat = new THREE.LineBasicMaterial({
      color: baseColor,
      transparent: true,
      opacity: 0.9,
    })
    this.disposableMaterials.push(docFrameMat)
    const docFrameLine = new THREE.LineSegments(docFrameEdgesGeo, docFrameMat)
    docFrameLine.scale.set(1.016, 1.016, 1.016)
    docFrameLine.visible = false
    simplifiedGroup.add(docFrameLine)

    return {
      spec: block,
      group,
      simplifiedGroup,
      docFrameLine,
      externalInputGroup,
      detailedVisual,
      hitMesh,
      sliceMeshes,
      sliceMaterials,
      edgeLines,
      labelSprite,
      compactLabelSprite,
      axisTagSprites,
      baseColor,
    }
  }

  private getActiveBlockSize(block: BlockVisual): [number, number, number] {
    if (this.expandedBlockIds.has(block.spec.id) && block.detailedVisual) {
      return block.detailedVisual.detailSize
    }
    return block.spec.size
  }

  private applyExpandedLayout() {
    if (this.blockVisuals.size === 0) return
    const inputs = Array.from(this.blockVisuals.values()).map(v => ({
      id: v.spec.id,
      basePosition: v.spec.position,
      baseSize: v.spec.size,
      activeSize: this.getActiveBlockSize(v),
      isExpanded: this.expandedBlockIds.has(v.spec.id) && Boolean(v.detailedVisual),
    }))
    if (this.externalOutputVisuals.has('cif-structure')) {
      inputs.push({
        id: '__external-cif-structure__',
        basePosition: [43.7, 0.0, 1.6],
        baseSize: [10.8, 5.8, 5.4],
        activeSize: [10.8, 5.8, 5.4],
        isExpanded: false,
      })
    }
    const positions = computeExpandedLayout(inputs)
    for (const [id, pos] of positions) {
      const visual = this.blockVisuals.get(id)
      if (visual) {
        visual.group.position.set(pos[0], pos[1], pos[2])
        if (visual.externalInputGroup) {
          const [activeSx] = this.getActiveBlockSize(visual)
          visual.externalInputGroup.position.x = -(activeSx - visual.spec.size[0]) / 2
        }
      }
    }
    this.rebuildAllEdgeGeometries()
    this.syncStageFloorPlatesAndOutput()
  }

  private buildOutputVisual() {
    const extBorderColor = this.isDark ? '#fb923c' : '#ea580c'
    const extArrowColor = this.isDark ? 0xfb923c : 0xea580c

    const makeArrow = (from: THREE.Vector3, to: THREE.Vector3) => {
      const ribbonMat = new THREE.MeshBasicMaterial({
        color: extArrowColor,
        transparent: true,
        opacity: this.isDark ? 0.34 : 0.4,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
      const outlineMat = new THREE.LineBasicMaterial({
        color: extArrowColor,
        transparent: true,
        opacity: this.isDark ? 0.4 : 0.48,
      })
      this.disposableMaterials.push(ribbonMat, outlineMat)
      const curve = new THREE.CatmullRomCurve3([from, from.clone().lerp(to, 0.5), to])
      const shaftWidth = 0.42
      const headWidth = shaftWidth * 1.85
      const headLength = Math.min(0.82, from.distanceTo(to) * 0.45)
      const { ribbonGeo, outlineGeo } = this.buildRibbonArrowGeometries(
        curve,
        shaftWidth,
        headWidth,
        headLength,
        24,
        true
      )
      this.disposableGeometries.push(ribbonGeo, outlineGeo)
      const ribbonMesh = new THREE.Mesh(ribbonGeo, ribbonMat)
      ribbonMesh.renderOrder = 3
      const outlineLine = new THREE.Line(outlineGeo, outlineMat)
      outlineLine.renderOrder = 4
      this.modelGroup.add(ribbonMesh, outlineLine)
      return { ribbonMesh, outlineLine, ribbonMat, outlineMat }
    }

    const addOutputLabel = (title: string, sub: string, parent: THREE.Group, y: number) => {
      const label = createLabelSprite(title, sub, '#ea580c', this.isDark, true, extBorderColor)
      if (label.material.map) this.disposableTextures.push(label.material.map)
      this.disposableMaterials.push(label.material)
      const aspect = (label.userData.aspect as number | undefined) ?? 136 / 768
      const baseHeightRatio = (label.userData.baseHeightRatio as number | undefined) ?? 136 / 768
      const h = 7.8 * baseHeightRatio
      label.scale.set(h / aspect, h, 1)
      label.position.set(0, y, 0)
      parent.add(label)
      this.externalLabelSprites.push(label)
    }

    // 1. External Output: Predicted 3D Protein Structure (.cif) after SampleDiffusion
    {
      const group = new THREE.Group()
      group.position.set(37.6, 0, 1.6)
      this.modelGroup.add(group)

      const materials: Array<THREE.MeshStandardMaterial | THREE.LineBasicMaterial> = []
      const frameGeo = new THREE.BoxGeometry(6.2, 5.8, 5.4)
      const frameEdges = new THREE.EdgesGeometry(frameGeo)
      this.disposableGeometries.push(frameGeo, frameEdges)

      const frameMat = new THREE.LineBasicMaterial({
        color: extArrowColor,
        transparent: true,
        opacity: 0.55,
      })
      materials.push(frameMat)
      this.disposableMaterials.push(frameMat)
      const frameWire = new THREE.LineSegments(frameEdges, frameMat)
      group.add(frameWire)

      const docFrameMat = new THREE.LineBasicMaterial({
        color: extArrowColor,
        transparent: true,
        opacity: 0.9,
      })
      this.disposableMaterials.push(docFrameMat)
      const docFrameLine = new THREE.LineSegments(frameEdges, docFrameMat)
      docFrameLine.scale.set(1.024, 1.024, 1.024)
      docFrameLine.visible = false
      group.add(docFrameLine)

      // Real 3D protein ribbon + bound ligand (7BEA PD-L1 dimer + TK2 inhibitor) inside the frame
      const cifComplex = buildCifComplex(sampleCifText, {
        maxXY: 5.5,
        maxZ: 5.0,
        isDark: this.isDark,
      })
      this.cifComplexGeometries = [...cifComplex.geometries]
      this.cifComplexMaterials = [...cifComplex.materials]
      this.disposableGeometries.push(...cifComplex.geometries)
      materials.push(...cifComplex.materials)
      this.disposableMaterials.push(...cifComplex.materials)
      group.add(cifComplex.complexGroup)
      this.cifComplexGroup = cifComplex.complexGroup

      const hitGeo = new THREE.BoxGeometry(6.6, 6.2, 5.8)
      const hitMat = new THREE.MeshBasicMaterial({ visible: false })
      this.disposableGeometries.push(hitGeo)
      this.disposableMaterials.push(hitMat)
      const hitMesh = new THREE.Mesh(hitGeo, hitMat)
      hitMesh.userData = { outputId: 'cif-structure' }
      group.add(hitMesh)
      this.hitTargets.push(hitMesh)

      addOutputLabel('3D Structure (.cif)', 'All-atom coordinates', group, 3.8)

      const arrow = makeArrow(new THREE.Vector3(33.5, 0, 0), new THREE.Vector3(34.4, 0, 1.6))
      materials.forEach(m => {
        m.userData.baseOpacity = m.opacity
      })
      this.externalOutputVisuals.set('cif-structure', {
        group,
        docFrameLine,
        materials,
        phase: 0.89,
        arrow,
      })
    }

    // 2. External Output: Confidence Score Plot (pLDDT / PAE) after Confidence Heads
    {
      const group = new THREE.Group()
      group.position.set(54.4, 0, 0)
      this.modelGroup.add(group)

      const materials: THREE.Material[] = []
      const plotTex = createPlddtPlotTexture(this.isDark)
      this.disposableTextures.push(plotTex)

      const cardGeo = new THREE.BoxGeometry(3.2, 2.3, 0.06)
      const cardEdges = new THREE.EdgesGeometry(cardGeo)
      this.disposableGeometries.push(cardGeo, cardEdges)

      const sideMat = new THREE.MeshBasicMaterial({
        color: this.isDark ? 0x1e293b : 0xffffff,
        transparent: true,
        opacity: 0.98,
        toneMapped: false,
      })
      const frontMat = new THREE.MeshBasicMaterial({
        map: plotTex,
        color: 0xffffff,
        transparent: true,
        opacity: 1.0,
        toneMapped: false,
      })
      materials.push(sideMat, frontMat)
      this.disposableMaterials.push(sideMat, frontMat)
      const cardMesh = new THREE.Mesh(cardGeo, [
        sideMat,
        sideMat,
        sideMat,
        sideMat,
        frontMat,
        frontMat,
      ])
      group.add(cardMesh)

      const edgeMat = new THREE.LineBasicMaterial({
        color: extArrowColor,
        transparent: true,
        opacity: 0.72,
      })
      materials.push(edgeMat)
      this.disposableMaterials.push(edgeMat)
      cardMesh.add(new THREE.LineSegments(cardEdges, edgeMat))

      const docFrameMat = new THREE.LineBasicMaterial({
        color: extArrowColor,
        transparent: true,
        opacity: 0.9,
      })
      this.disposableMaterials.push(docFrameMat)
      const docFrameLine = new THREE.LineSegments(cardEdges, docFrameMat)
      docFrameLine.scale.set(1.024, 1.024, 1.05)
      docFrameLine.visible = false
      cardMesh.add(docFrameLine)

      const hitGeo = new THREE.BoxGeometry(3.6, 2.8, 1.0)
      const hitMat = new THREE.MeshBasicMaterial({ visible: false })
      this.disposableGeometries.push(hitGeo)
      this.disposableMaterials.push(hitMat)
      const hitMesh = new THREE.Mesh(hitGeo, hitMat)
      hitMesh.userData = { outputId: 'confidence-scores' }
      group.add(hitMesh)
      this.hitTargets.push(hitMesh)

      addOutputLabel('pLDDT / PAE Scores', 'Confidence metrics (.json)', group, 1.95)

      const arrow = makeArrow(new THREE.Vector3(50.2, 0, 0), new THREE.Vector3(52.7, 0, 0))
      materials.forEach(m => {
        m.userData.baseOpacity = m.opacity
      })
      this.externalOutputVisuals.set('confidence-scores', {
        group,
        docFrameLine,
        materials,
        phase: 0.98,
        arrow,
      })
    }
  }

  private syncStageFloorPlatesAndOutput() {
    for (const plate of this.stageFloorPlates) {
      if (plate.blockIds && plate.blockIds.length > 0) {
        let minX = Infinity
        let maxX = -Infinity
        for (const id of plate.blockIds) {
          const v = this.blockVisuals.get(id)
          if (!v) continue
          const [activeSx] = this.getActiveBlockSize(v)
          minX = Math.min(minX, v.group.position.x - activeSx / 2)
          maxX = Math.max(maxX, v.group.position.x + activeSx / 2)
        }
        if (Number.isFinite(minX) && Number.isFinite(maxX)) {
          const pad = 1.4
          const desiredWidth = Math.max(plate.baseWidth, maxX - minX + pad * 2)
          const cx = (minX + maxX) / 2
          const scaleX = desiredWidth / plate.baseWidth
          plate.padMesh.position.x = cx
          plate.padMesh.scale.x = scaleX
          plate.border.position.x = cx
          plate.border.scale.x = scaleX
          plate.headerMesh.position.x = cx
        }
      } else if (plate.followRightOfBlockId === 'denoised-coords') {
        const v = this.blockVisuals.get('denoised-coords')
        const auxV = this.blockVisuals.get('aux-pairformer')
        if (v) {
          const [activeSx, activeSy] = this.getActiveBlockSize(v)
          const denoisedRight = v.group.position.x + activeSx / 2
          const auxLeft = auxV
            ? auxV.group.position.x - this.getActiveBlockSize(auxV)[0] / 2
            : denoisedRight + 9.6
          const cx = (denoisedRight + auxLeft) / 2
          const cz = 1.6
          plate.padMesh.position.set(cx, -7.75, cz)
          plate.border.position.set(cx, -7.74, cz)
          plate.headerMesh.position.set(cx, -7.73, cz + 5.4 / 2 - 0.85)

          const cifOut = this.externalOutputVisuals.get('cif-structure')
          if (cifOut) {
            const centerY = v.group.position.y
            cifOut.group.position.set(cx, centerY, cz)
            if (cifOut.arrow) {
              const start = new THREE.Vector3(
                denoisedRight + 0.12,
                centerY - activeSy * 0.12,
                v.group.position.z
              )
              const end = new THREE.Vector3(cx - 3.2, centerY, cz)
              const mid = start.clone().lerp(end, 0.5)
              const curve = new THREE.CatmullRomCurve3([start, mid, end])
              const shaftWidth = 0.42
              const headWidth = shaftWidth * 1.85
              const headLength = Math.min(0.82, start.distanceTo(end) * 0.45)
              const { ribbonGeo, outlineGeo } = this.buildRibbonArrowGeometries(
                curve,
                shaftWidth,
                headWidth,
                headLength,
                24,
                true
              )
              cifOut.arrow.ribbonMesh.geometry.dispose()
              cifOut.arrow.outlineLine.geometry.dispose()
              cifOut.arrow.ribbonMesh.geometry = ribbonGeo
              cifOut.arrow.outlineLine.geometry = outlineGeo
              this.disposableGeometries.push(ribbonGeo, outlineGeo)
            }
          }
        }
      } else if (plate.followRightOfBlockId === 'confidence-outputs') {
        const v = this.blockVisuals.get('confidence-outputs')
        if (v) {
          const [activeSx] = this.getActiveBlockSize(v)
          const rightX = v.group.position.x + activeSx / 2
          const cx = rightX + 4.4
          plate.padMesh.position.x = cx
          plate.border.position.x = cx
          plate.headerMesh.position.x = cx

          const confOut = this.externalOutputVisuals.get('confidence-scores')
          if (confOut) {
            confOut.group.position.set(cx, 0, 0)
            if (confOut.arrow) {
              const start = new THREE.Vector3(rightX + 0.12, v.group.position.y, v.group.position.z)
              const end = new THREE.Vector3(cx - 1.75, 0, 0)
              const mid = start.clone().lerp(end, 0.5)
              const curve = new THREE.CatmullRomCurve3([start, mid, end])
              const shaftWidth = 0.42
              const headWidth = shaftWidth * 1.85
              const headLength = Math.min(0.82, start.distanceTo(end) * 0.45)
              const { ribbonGeo, outlineGeo } = this.buildRibbonArrowGeometries(
                curve,
                shaftWidth,
                headWidth,
                headLength,
                24,
                true
              )
              confOut.arrow.ribbonMesh.geometry.dispose()
              confOut.arrow.outlineLine.geometry.dispose()
              confOut.arrow.ribbonMesh.geometry = ribbonGeo
              confOut.arrow.outlineLine.geometry = outlineGeo
              this.disposableGeometries.push(ribbonGeo, outlineGeo)
            }
          }
        }
      }
    }
  }

  private rebuildAllEdgeGeometries() {
    if (!this.currentModel) return
    const edgePorts = this.computeEdgePortOffsets(this.currentModel.edges)
    for (const ev of this.edgeVisuals) {
      if (ev.spec.id === 'e-pf-pair-to-single') continue
      const fromBlock = this.blockVisuals.get(ev.spec.from)
      const toBlock = this.blockVisuals.get(ev.spec.to)
      if (!fromBlock || !toBlock) continue
      const ports = edgePorts.get(ev.spec.id) ?? { startDy: 0, endDy: 0 }
      ev.curve = this.buildEdgeCurve(ev.spec, fromBlock, toBlock, ports.startDy, ports.endDy)
      const shaftWidth = this.getEdgeWidth(ev.spec.kind)
      const headWidth = shaftWidth * 1.85
      const headLength = 0.95
      const segments = ev.spec.kind === 'recycle' ? 96 : 64
      const hasArrowhead = ev.spec.id !== 'e-recycle-arc-pair'
      const { ribbonGeo, outlineGeo } = this.buildRibbonArrowGeometries(
        ev.curve,
        shaftWidth,
        headWidth,
        headLength,
        segments,
        hasArrowhead
      )
      ev.ribbonMesh.geometry.dispose()
      ev.ribbonMesh.geometry = ribbonGeo
      ev.outlineLine.geometry.dispose()
      ev.outlineLine.geometry = outlineGeo

      if (ev.labelSprite) {
        const midPt = ev.curve.getPointAt(0.5)
        const tan = ev.curve.getTangentAt(0.5).normalize()
        const normal = new THREE.Vector3(-tan.y, tan.x, 0)
        if (normal.lengthSq() < 1e-4) normal.set(0, 1, 0)
        normal.normalize()
        if (normal.y < 0) normal.negate()
        const extraOffset =
          ev.spec.id === 'e-diff-cond-to-atom-enc' || ev.spec.id === 'e-diff-cond-to-dit'
            ? 0.9
            : 0.65
        ev.labelSprite.position.set(
          midPt.x + normal.x * extraOffset * 0.45,
          midPt.y + Math.max(0.55, normal.y * extraOffset),
          midPt.z + 0.25
        )
      }
    }
    this.updateDynamicPairBiasEdge()
  }

  private anchorToBlockFace(block: BlockVisual, targetPos: THREE.Vector3): THREE.Vector3 {
    const center = block.group.position
    const [sx, sy, sz] = this.getActiveBlockSize(block)
    const dir = targetPos.clone().sub(center)
    if (dir.lengthSq() < 1e-6) return center.clone()

    const tx = Math.abs(dir.x) > 1e-5 ? sx / 2 / Math.abs(dir.x) : Infinity
    const ty = Math.abs(dir.y) > 1e-5 ? sy / 2 / Math.abs(dir.y) : Infinity
    const tz = Math.abs(dir.z) > 1e-5 ? sz / 2 / Math.abs(dir.z) : Infinity
    const t = Math.min(tx, ty, tz, 1)
    return center.clone().addScaledVector(dir, t)
  }

  private addSmallArrow(
    parent: THREE.Group,
    from: THREE.Vector3,
    to: THREE.Vector3,
    colorHex: number
  ): { ribbonMat: THREE.MeshBasicMaterial; outlineMat: THREE.LineBasicMaterial } | null {
    if (from.distanceToSquared(to) < 0.01) return null
    const pts = SceneEngine.sampleEaseInOutCubic(from, to, 16)
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal')
    const shaftWidth = 0.36
    const headWidth = shaftWidth * 1.8
    const headLength = Math.min(0.65, from.distanceTo(to) * 0.45)
    const { ribbonGeo, outlineGeo } = this.buildRibbonArrowGeometries(
      curve,
      shaftWidth,
      headWidth,
      headLength,
      24
    )
    const ribbonMat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: this.isDark ? 0.34 : 0.4,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    const outlineMat = new THREE.LineBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: this.isDark ? 0.4 : 0.48,
    })
    this.disposableGeometries.push(ribbonGeo, outlineGeo)
    this.disposableMaterials.push(ribbonMat, outlineMat)

    const ribbonMesh = new THREE.Mesh(ribbonGeo, ribbonMat)
    ribbonMesh.renderOrder = 2
    const outlineLine = new THREE.Line(outlineGeo, outlineMat)
    outlineLine.renderOrder = 3
    parent.add(ribbonMesh, outlineLine)
    return { ribbonMat, outlineMat }
  }

  private buildInputSourceVisual(
    blockId: 'input-features' | 'ref-conformers' | 'msa-embedder',
    sx: number,
    sy: number,
    sz: number,
    parent: THREE.Group
  ) {
    const extMaterials: Array<THREE.MeshStandardMaterial | THREE.LineBasicMaterial> = []
    const extArrows: Array<{
      ribbonMat: THREE.MeshBasicMaterial
      outlineMat: THREE.LineBasicMaterial
    }> = []
    const trackMat = <T extends THREE.MeshStandardMaterial | THREE.LineBasicMaterial>(m: T): T => {
      m.transparent = true
      extMaterials.push(m)
      return m
    }
    const trackArrow = (
      a: { ribbonMat: THREE.MeshBasicMaterial; outlineMat: THREE.LineBasicMaterial } | null
    ) => {
      if (a) extArrows.push(a)
    }

    const bondColor = this.isDark ? 0x94a3b8 : 0x475569
    const bondMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: bondColor,
        roughness: 0.5,
        metalness: 0.1,
      })
    )
    this.disposableMaterials.push(bondMat)

    const addBond = (a: THREE.Vector3, b: THREE.Vector3, radius = 0.038) => {
      const d = b.clone().sub(a)
      const len = d.length()
      if (len < 1e-4) return
      const geo = new THREE.CylinderGeometry(radius, radius, len, 8)
      this.disposableGeometries.push(geo)
      const mesh = new THREE.Mesh(geo, bondMat)
      mesh.position.copy(a).lerp(b, 0.5)
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())
      parent.add(mesh)
    }

    const externalBorderColor = this.isDark ? '#fb923c' : '#ea580c'
    const externalArrowColor = this.isDark ? 0xfb923c : 0xea580c

    const addInputHitBox = (
      inputSourceId: InputSourceId,
      center: THREE.Vector3,
      size: [number, number, number]
    ) => {
      const geo = new THREE.BoxGeometry(size[0], size[1], size[2])
      const mat = new THREE.MeshBasicMaterial({ visible: false })
      this.disposableGeometries.push(geo)
      this.disposableMaterials.push(mat)
      const hitMesh = new THREE.Mesh(geo, mat)
      hitMesh.position.copy(center)
      hitMesh.userData = { inputSourceId }
      parent.add(hitMesh)
      this.hitTargets.push(hitMesh)
    }

    const addExternalLabel = (text: string, accent: string, pos: THREE.Vector3) => {
      const sprite = createLabelSprite(text, '', accent, this.isDark, true, externalBorderColor)
      if (sprite.material.map) {
        this.disposableTextures.push(sprite.material.map)
      }
      this.disposableMaterials.push(sprite.material)
      const aspect = (sprite.userData.aspect as number | undefined) ?? 136 / 768
      const baseHeightRatio = (sprite.userData.baseHeightRatio as number | undefined) ?? 136 / 768
      const h = 7.8 * baseHeightRatio
      sprite.scale.set(h / aspect, h, 1)
      sprite.position.copy(pos)
      parent.add(sprite)
      this.externalLabelSprites.push(sprite)
    }

    if (blockId === 'input-features') {
      const aaColors = [0xef4444, 0x3b82f6, 0x22c55e, 0xeab308, 0xa855f7, 0xf97316, 0x06b6d4]

      // Color-coded AA feature matrix along the left face of Inputs (rows = tokens, cols = feature dims)
      const slotH = (sy * 0.82) / aaColors.length
      const cols = 8
      const totalD = sz * 0.92
      const colW = totalD / cols
      const baseCellGeo = new THREE.BoxGeometry(0.14, slotH * 0.78, colW * 0.8)
      this.disposableGeometries.push(baseCellGeo)
      const bgMix = new THREE.Color(this.isDark ? 0x0f172a : 0xe2e8f0)
      for (let i = 0; i < aaColors.length; i++) {
        const y = (0.5 - (i + 0.5) / aaColors.length) * (sy * 0.82)
        const rowColor = new THREE.Color(aaColors[i]!)
        for (let c = 0; c < cols; c++) {
          const z = (c + 0.5) * colW - totalD / 2
          const seed = Math.sin((i * 17 + c * 31 + 7) * 12.9898) * 43758.5453
          const intensity = 0.25 + 0.75 * (seed - Math.floor(seed))
          const cellColor = bgMix.clone().lerp(rowColor, intensity)
          const slotMat = trackMat(
            new THREE.MeshStandardMaterial({
              color: cellColor,
              roughness: 0.35,
              metalness: 0.1,
            })
          )
          this.disposableMaterials.push(slotMat)
          const cell = new THREE.Mesh(baseCellGeo, slotMat)
          cell.position.set(-sx / 2 - 0.04, y, z)
          parent.add(cell)
        }
      }

      // 3D Amino Acid chain + connector arrows to matching colored border slots
      const aaGeo = new THREE.SphereGeometry(0.19, 14, 14)
      this.disposableGeometries.push(aaGeo)
      const aaPts: THREE.Vector3[] = []
      for (let i = 0; i < aaColors.length; i++) {
        const y = (0.5 - (i + 0.5) / aaColors.length) * (sy * 0.82)
        const x = -2.85 + Math.sin(i * 1.1) * 0.28
        const z = Math.cos(i * 1.1) * 0.35
        const pt = new THREE.Vector3(x, y, z)
        aaPts.push(pt)

        const aaMat = trackMat(
          new THREE.MeshStandardMaterial({
            color: aaColors[i]!,
            roughness: 0.3,
            metalness: 0.12,
          })
        )
        this.disposableMaterials.push(aaMat)
        const sphere = new THREE.Mesh(aaGeo, aaMat)
        sphere.position.copy(pt)
        parent.add(sphere)

        if (i > 0) {
          addBond(aaPts[i - 1]!, pt, 0.042)
        }

        // Thin colored mapping line into the matching slot on the border
        const lineGeo = new THREE.BufferGeometry().setFromPoints([
          pt,
          new THREE.Vector3(-sx / 2 - 0.12, y, 0),
        ])
        const lineMat = trackMat(
          new THREE.LineBasicMaterial({
            color: aaColors[i]!,
            transparent: true,
            opacity: 0.72,
          })
        )
        this.disposableGeometries.push(lineGeo)
        this.disposableMaterials.push(lineMat)
        parent.add(new THREE.Line(lineGeo, lineMat))
      }

      // 3D DNA Double Helix (vertical) on the far left
      const helixSteps = 18
      const strandA: THREE.Vector3[] = []
      const strandB: THREE.Vector3[] = []
      const baseColors = [0x22c55e, 0xeab308, 0xec4899, 0x3b82f6]
      const dnaX = -5.2
      for (let i = 0; i <= helixSteps; i++) {
        const t = i / helixSteps
        const hy = -1.35 + t * 2.7
        const angle = t * Math.PI * 3.0
        const rH = 0.55
        const pA = new THREE.Vector3(dnaX + Math.sin(angle) * rH, hy, Math.cos(angle) * rH)
        const pB = new THREE.Vector3(
          dnaX + Math.sin(angle + Math.PI) * rH,
          hy,
          Math.cos(angle + Math.PI) * rH
        )
        strandA.push(pA)
        strandB.push(pB)

        if (i % 2 === 1 && i < helixSteps) {
          const c = baseColors[i % baseColors.length]!
          const rungMat = trackMat(new THREE.MeshStandardMaterial({ color: c, roughness: 0.4 }))
          this.disposableMaterials.push(rungMat)
          const d = pB.clone().sub(pA)
          const rungGeo = new THREE.CylinderGeometry(0.045, 0.045, d.length(), 8)
          this.disposableGeometries.push(rungGeo)
          const rung = new THREE.Mesh(rungGeo, rungMat)
          rung.position.copy(pA).lerp(pB, 0.5)
          rung.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())
          parent.add(rung)
        }
      }
      const tubeA = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(strandA), 32, 0.06, 8, false)
      const tubeB = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(strandB), 32, 0.06, 8, false)
      const strandMatA = trackMat(
        new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.45 })
      )
      const strandMatB = trackMat(
        new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.45 })
      )
      this.disposableGeometries.push(tubeA, tubeB)
      this.disposableMaterials.push(strandMatA, strandMatB)
      parent.add(new THREE.Mesh(tubeA, strandMatA), new THREE.Mesh(tubeB, strandMatB))

      // Left-to-right arrow: DNA -> AA chain
      trackArrow(
        this.addSmallArrow(
          parent,
          new THREE.Vector3(-4.55, 0, 0),
          new THREE.Vector3(-3.3, 0, 0),
          externalArrowColor
        )
      )
      // Left-to-right arrow: AA chain -> Inputs
      trackArrow(
        this.addSmallArrow(
          parent,
          new THREE.Vector3(-2.35, 0, 0),
          new THREE.Vector3(-sx / 2 - 0.12, 0, 0),
          externalArrowColor
        )
      )
      addExternalLabel('DNA', '#3b82f6', new THREE.Vector3(dnaX, 2.05, 0))
      addExternalLabel('Protein Seq', '#22c55e', new THREE.Vector3(-2.85, 2.25, 0))
      addInputHitBox('dna-sequence', new THREE.Vector3(dnaX, 0.25, 0), [1.7, 4.2, 1.7])
      addInputHitBox('protein-sequence', new THREE.Vector3(-2.85, 0.3, 0), [1.5, 4.4, 1.5])
    } else if (blockId === 'ref-conformers') {
      // Small molecule 3D ligand + element feature matrix on Ref Atoms
      const elemColors = [0x64748b, 0x3b82f6, 0xef4444, 0xeab308]
      const slotH = (sy * 0.8) / elemColors.length
      const cols = 6
      const totalD = sz * 0.88
      const colW = totalD / cols
      const refCellGeo = new THREE.BoxGeometry(0.14, slotH * 0.76, colW * 0.8)
      this.disposableGeometries.push(refCellGeo)
      const refBgMix = new THREE.Color(this.isDark ? 0x0f172a : 0xe2e8f0)
      for (let i = 0; i < elemColors.length; i++) {
        const y = (0.5 - (i + 0.5) / elemColors.length) * (sy * 0.8)
        const rowColor = new THREE.Color(elemColors[i]!)
        for (let c = 0; c < cols; c++) {
          const z = (c + 0.5) * colW - totalD / 2
          const seed = Math.sin((i * 23 + c * 19 + 5) * 12.9898) * 43758.5453
          const intensity = 0.25 + 0.75 * (seed - Math.floor(seed))
          const cellColor = refBgMix.clone().lerp(rowColor, intensity)
          const slotMat = trackMat(
            new THREE.MeshStandardMaterial({
              color: cellColor,
              roughness: 0.35,
            })
          )
          this.disposableMaterials.push(slotMat)
          const cell = new THREE.Mesh(refCellGeo, slotMat)
          cell.position.set(-sx / 2 - 0.04, y, z)
          parent.add(cell)
        }
      }

      const atoms: Array<{ pos: THREE.Vector3; color: number; r: number }> = []
      const cx = -3.8
      const ringR = 0.62
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2
        atoms.push({
          pos: new THREE.Vector3(cx + Math.cos(a) * ringR, Math.sin(a) * ringR, (i % 2) * 0.14),
          color: i === 2 ? 0x3b82f6 : 0x64748b,
          r: 0.16,
        })
      }
      // Functional groups (O, S, C)
      atoms.push(
        { pos: new THREE.Vector3(cx + 1.15, 0.45, 0.2), color: 0xef4444, r: 0.17 },
        { pos: new THREE.Vector3(cx - 1.15, -0.35, -0.15), color: 0xeab308, r: 0.18 },
        { pos: new THREE.Vector3(cx - 1.65, 0.2, 0.1), color: 0xef4444, r: 0.16 }
      )

      for (const atom of atoms) {
        const geo = new THREE.SphereGeometry(atom.r, 14, 14)
        const mat = trackMat(
          new THREE.MeshStandardMaterial({
            color: atom.color,
            roughness: 0.3,
            metalness: 0.15,
          })
        )
        this.disposableGeometries.push(geo)
        this.disposableMaterials.push(mat)
        const mesh = new THREE.Mesh(geo, mat)
        mesh.position.copy(atom.pos)
        parent.add(mesh)
      }

      for (let i = 0; i < 6; i++) {
        addBond(atoms[i]!.pos, atoms[(i + 1) % 6]!.pos)
      }
      addBond(atoms[0]!.pos, atoms[6]!.pos)
      addBond(atoms[3]!.pos, atoms[7]!.pos)
      addBond(atoms[7]!.pos, atoms[8]!.pos)

      // Left-to-right arrow: Small molecule -> Ref Atoms
      trackArrow(
        this.addSmallArrow(
          parent,
          new THREE.Vector3(-2.5, 0, 0),
          new THREE.Vector3(-sx / 2 - 0.12, 0, 0),
          externalArrowColor
        )
      )
      addExternalLabel('Small Molecule', '#0ea5e9', new THREE.Vector3(cx, -1.55, 0))
      addInputHitBox('small-molecule', new THREE.Vector3(cx - 0.2, -0.15, 0), [3.1, 3.2, 1.4])
    } else if (blockId === 'msa-embedder') {
      // External ClustalX-style MSA alignment sheet feeding into MSA Embed
      const msaTex = createMsaAlignmentTexture(this.isDark)
      this.disposableTextures.push(msaTex)
      const sheetGeo = new THREE.BoxGeometry(2.2, 1.35, 0.14)
      const sheetEdges = new THREE.EdgesGeometry(sheetGeo)
      const sheetMat = trackMat(
        new THREE.MeshStandardMaterial({
          map: msaTex,
          color: 0xffffff,
          roughness: 0.4,
          metalness: 0.05,
        })
      )
      const wireMat = trackMat(
        new THREE.LineBasicMaterial({
          color: 0x06b6d4,
          transparent: true,
          opacity: 0.7,
        })
      )
      this.disposableGeometries.push(sheetGeo, sheetEdges)
      this.disposableMaterials.push(sheetMat, wireMat)

      const sheet = new THREE.Mesh(sheetGeo, sheetMat)
      sheet.position.set(-4.3, 1.9, 0)
      sheet.add(new THREE.LineSegments(sheetEdges, wireMat))
      parent.add(sheet)

      trackArrow(
        this.addSmallArrow(
          parent,
          new THREE.Vector3(-3.15, 1.45, 0),
          new THREE.Vector3(-sx / 2 - 0.04, sy * 0.35, 0),
          externalArrowColor
        )
      )
      addExternalLabel('MSA', '#06b6d4', new THREE.Vector3(-4.3, 3.0, 0))
      addInputHitBox('msa-a3m', new THREE.Vector3(-4.3, 2.15, 0), [2.5, 2.3, 0.8])
    }

    this.externalInputVisuals.set(blockId, {
      materials: extMaterials,
      arrows: extArrows,
      phase: blockId === 'msa-embedder' ? 0.31 : 0.08,
    })
  }

  private getBlockRightFaceX(block: BlockVisual): number {
    if (this.expandedBlockIds.has(block.spec.id) && block.detailedVisual) {
      return block.group.position.x + block.detailedVisual.detailSize[0] / 2
    }
    if (block.sliceMeshes.length > 0) {
      const lastSlice = block.sliceMeshes[block.sliceMeshes.length - 1]!
      const sx = block.spec.size[0]
      const rawCount = block.spec.stackCount ?? 1
      const visualSlices = rawCount <= 1 ? 1 : Math.min(rawCount, rawCount >= 24 ? 14 : rawCount)
      const gap = visualSlices > 1 ? Math.min(0.18, (sx * 0.28) / (visualSlices - 1)) : 0
      const sliceWidth = (sx - gap * (visualSlices - 1)) / visualSlices
      return block.group.position.x + lastSlice.position.x + sliceWidth / 2
    }
    return block.group.position.x + block.spec.size[0] / 2
  }

  private computeEdgePortOffsets(
    edges: DataFlowEdge[]
  ): Map<string, { startDy: number; endDy: number }> {
    const result = new Map<string, { startDy: number; endDy: number }>()
    for (const edge of edges) {
      result.set(edge.id, { startDy: 0, endDy: 0 })
    }

    const outgoingByBlock = new Map<string, DataFlowEdge[]>()
    const incomingByBlock = new Map<string, DataFlowEdge[]>()
    for (const edge of edges) {
      if (edge.kind === 'pair-bias') continue
      const outList = outgoingByBlock.get(edge.from) ?? []
      outList.push(edge)
      outgoingByBlock.set(edge.from, outList)

      if (edge.id === 'e-recycle-arc-pair') continue
      const inList = incomingByBlock.get(edge.to) ?? []
      inList.push(edge)
      incomingByBlock.set(edge.to, inList)
    }

    const assignOffsets = (list: DataFlowEdge[], blockId: string, isOutgoing: boolean): void => {
      if (list.length <= 1) return
      const block = this.blockVisuals.get(blockId)
      if (!block) return

      const sorted = [...list].sort((a, b) => {
        const getSortY = (e: DataFlowEdge): number => {
          if (isOutgoing) {
            if (e.kind === 'recycle') return 10
            if (e.id === 'e-pf-pair-to-aux') return -5
            return this.blockVisuals.get(e.to)?.group.position.y ?? 0
          }
          if (e.id === 'e-recycle-arc-single') return 10
          if (e.id === 'e-pf-pair-to-aux') return -5
          return this.blockVisuals.get(e.from)?.group.position.y ?? 0
        }
        return getSortY(b) - getSortY(a)
      })

      const sy = block.spec.size[1]
      const spread = Math.min(sy * 0.64, (sorted.length - 1) * 0.8)
      for (let i = 0; i < sorted.length; i++) {
        const dy = (0.5 - i / (sorted.length - 1)) * spread
        const entry = result.get(sorted[i]!.id)!
        if (isOutgoing) {
          entry.startDy = dy
        } else {
          entry.endDy = dy
        }
      }
    }

    for (const [blockId, list] of outgoingByBlock) {
      assignOffsets(list, blockId, true)
    }
    for (const [blockId, list] of incomingByBlock) {
      assignOffsets(list, blockId, false)
    }
    return result
  }

  private getSingleRecycleSegments(
    fromBlock: BlockVisual,
    toBlock: BlockVisual,
    startDy = 0,
    endDy = 0
  ): THREE.CubicBezierCurve3[] {
    const start = new THREE.Vector3(
      this.getBlockRightFaceX(fromBlock),
      fromBlock.group.position.y + startDy,
      fromBlock.group.position.z
    )
    const end = new THREE.Vector3(
      toBlock.group.position.x - toBlock.spec.size[0] / 2,
      toBlock.group.position.y + endDy,
      toBlock.group.position.z - 0.1
    )
    return [
      new THREE.CubicBezierCurve3(
        start,
        new THREE.Vector3(start.x + 3.1, start.y, -1.9),
        new THREE.Vector3(start.x + 3.6, 9.4, -2.5),
        new THREE.Vector3(0.0, 9.4, -2.5)
      ),
      new THREE.CubicBezierCurve3(
        new THREE.Vector3(0.0, 9.4, -2.5),
        new THREE.Vector3(-12.0, 9.4, -2.2),
        new THREE.Vector3(-17.2, 9.4, -1.2),
        new THREE.Vector3(-17.2, 2.4, -0.5)
      ),
      new THREE.CubicBezierCurve3(
        new THREE.Vector3(-17.2, 2.4, -0.5),
        new THREE.Vector3(-17.2, end.y, end.z),
        new THREE.Vector3(-16.0, end.y, end.z),
        end
      ),
    ]
  }

  private buildRecycleCurve(
    edge: DataFlowEdge,
    fromBlock: BlockVisual,
    toBlock: BlockVisual,
    startDy = 0,
    endDy = 0
  ): THREE.CatmullRomCurve3 {
    const isSingle = edge.id === 'e-recycle-arc-single'
    let beziers: THREE.CubicBezierCurve3[]

    if (isSingle) {
      beziers = this.getSingleRecycleSegments(fromBlock, toBlock, startDy, endDy)
    } else {
      const singleFrom = this.blockVisuals.get('pairformer-single') ?? fromBlock
      const singleSegs = this.getSingleRecycleSegments(singleFrom, toBlock, 0.325, 0.8)
      const mergeSeg = singleSegs[0]!
      const mergeU = 0.46
      const mergePt = mergeSeg.getPoint(mergeU)
      const mergeTan = mergeSeg.getTangent(mergeU).normalize()

      const start = new THREE.Vector3(
        this.getBlockRightFaceX(fromBlock),
        fromBlock.group.position.y + startDy,
        fromBlock.group.position.z
      )
      beziers = [
        new THREE.CubicBezierCurve3(
          start,
          new THREE.Vector3(start.x + 3.2, start.y, 0.2),
          mergePt.clone().addScaledVector(mergeTan, -2.6),
          mergePt
        ),
      ]
    }

    const pts: THREE.Vector3[] = []
    const samplesPerSeg = 16
    for (let s = 0; s < beziers.length; s++) {
      const seg = beziers[s]!
      const startIdx = s === 0 ? 0 : 1
      for (let i = startIdx; i <= samplesPerSeg; i++) {
        pts.push(seg.getPoint(i / samplesPerSeg))
      }
    }
    return new THREE.CatmullRomCurve3(pts, false, 'centripetal')
  }

  private static easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
  }

  private static sampleEaseInOutCubic(
    start: THREE.Vector3,
    end: THREE.Vector3,
    samples = 24,
    axis: 'x' | 'y' = 'x'
  ): THREE.Vector3[] {
    const pts: THREE.Vector3[] = []
    for (let i = 0; i <= samples; i++) {
      const t = i / samples
      const e = SceneEngine.easeInOutCubic(t)
      pts.push(
        new THREE.Vector3(
          THREE.MathUtils.lerp(start.x, end.x, axis === 'x' ? t : e),
          THREE.MathUtils.lerp(start.y, end.y, axis === 'y' ? t : e),
          THREE.MathUtils.lerp(start.z, end.z, e)
        )
      )
    }
    return pts
  }

  private static sampleUShapeEaseInOutCubic(
    start: THREE.Vector3,
    midStart: THREE.Vector3,
    midEnd: THREE.Vector3,
    end: THREE.Vector3
  ): THREE.Vector3[] {
    const seg1 = SceneEngine.sampleEaseInOutCubic(start, midStart, 16)
    const seg2: THREE.Vector3[] = []
    for (let i = 1; i < 4; i++) {
      seg2.push(midStart.clone().lerp(midEnd, i / 4))
    }
    const seg3 = SceneEngine.sampleEaseInOutCubic(midEnd, end, 16)
    return [...seg1, ...seg2, ...seg3]
  }

  private buildEdgeCurve(
    edge: DataFlowEdge,
    fromBlock: BlockVisual,
    toBlock: BlockVisual,
    startDy = 0,
    endDy = 0
  ): THREE.CatmullRomCurve3 {
    if (edge.kind === 'recycle') {
      return this.buildRecycleCurve(edge, fromBlock, toBlock, startDy, endDy)
    }

    const rightCenter = new THREE.Vector3(
      this.getBlockRightFaceX(fromBlock),
      fromBlock.group.position.y + startDy,
      fromBlock.group.position.z
    )
    const leftCenter = new THREE.Vector3(
      toBlock.group.position.x - this.getActiveBlockSize(toBlock)[0] / 2,
      toBlock.group.position.y + endDy,
      toBlock.group.position.z
    )

    if (edge.id === 'e-pf-pair-to-aux') {
      const enterX = rightCenter.x + 5.8
      const exitX = leftCenter.x - 5.2
      const lowY = -4.6
      const lowZ = -0.4
      const p1 = new THREE.Vector3(enterX, lowY, lowZ)
      const p2 = new THREE.Vector3(exitX, lowY, lowZ)

      const startBezier = new THREE.CubicBezierCurve3(
        rightCenter,
        new THREE.Vector3(rightCenter.x + 2.4, rightCenter.y, rightCenter.z),
        new THREE.Vector3(enterX - 2.4, lowY, lowZ),
        p1
      )
      const endBezier = new THREE.CubicBezierCurve3(
        p2,
        new THREE.Vector3(leftCenter.x - 2.2, lowY, lowZ),
        new THREE.Vector3(leftCenter.x - 1.6, leftCenter.y, leftCenter.z),
        leftCenter
      )

      const pts: THREE.Vector3[] = []
      for (let i = 0; i <= 14; i++) pts.push(startBezier.getPoint(i / 14))
      for (let i = 1; i < 6; i++) pts.push(p1.clone().lerp(p2, i / 6))
      for (let i = 0; i <= 16; i++) pts.push(endBezier.getPoint(i / 16))
      return new THREE.CatmullRomCurve3(pts, false, 'centripetal')
    }

    if (edge.id === 'e-coords-to-aux') {
      const archY = Math.max(rightCenter.y, leftCenter.y) + 6.4
      const bezier = new THREE.CubicBezierCurve3(
        rightCenter,
        new THREE.Vector3(rightCenter.x + 2.6, archY, rightCenter.z),
        new THREE.Vector3(leftCenter.x - 2.6, archY, leftCenter.z),
        leftCenter
      )
      const pts: THREE.Vector3[] = []
      for (let i = 0; i <= 28; i++) {
        pts.push(bezier.getPoint(i / 28))
      }
      return new THREE.CatmullRomCurve3(pts, false, 'centripetal')
    }

    if (edge.id === 'e-atom-enc-skip-dec') {
      const pts = SceneEngine.sampleEaseInOutCubic(rightCenter, leftCenter, 16)
      return new THREE.CatmullRomCurve3(pts, false, 'centripetal')
    }

    if (edge.id === 'e-recycle-to-msa-stack') {
      const bezier = new THREE.CubicBezierCurve3(
        rightCenter,
        new THREE.Vector3(-6.5, rightCenter.y, rightCenter.z),
        new THREE.Vector3(-5.5, leftCenter.y, leftCenter.z),
        leftCenter
      )
      const pts: THREE.Vector3[] = []
      const samples = 24
      for (let i = 0; i <= samples; i++) {
        pts.push(bezier.getPoint(i / samples))
      }
      return new THREE.CatmullRomCurve3(pts, false, 'centripetal')
    }

    if (leftCenter.x - rightCenter.x > 0.8) {
      const pts = SceneEngine.sampleEaseInOutCubic(rightCenter, leftCenter, 24)
      return new THREE.CatmullRomCurve3(pts, false, 'centripetal')
    }

    const start = this.anchorToBlockFace(fromBlock, toBlock.group.position)
    const end = this.anchorToBlockFace(toBlock, fromBlock.group.position)
    const axis = Math.abs(end.y - start.y) > Math.abs(end.x - start.x) ? 'y' : 'x'
    const pts = SceneEngine.sampleEaseInOutCubic(start, end, 20, axis)
    return new THREE.CatmullRomCurve3(pts, false, 'centripetal')
  }

  private buildRibbonArrowGeometries(
    curve: THREE.CatmullRomCurve3,
    shaftWidth: number,
    headWidth: number,
    headLength: number,
    segments = 32,
    hasArrowhead = true
  ): { ribbonGeo: THREE.BufferGeometry; outlineGeo: THREE.BufferGeometry } {
    const totalLen = Math.max(0.5, curve.getLength())
    const effectiveHeadLen = hasArrowhead ? Math.min(headLength, totalLen * 0.42) : 0
    const shaftEndFrac = hasArrowhead
      ? Math.max(0.15, (totalLen - effectiveHeadLen) / totalLen)
      : 1.0

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

    if (hasArrowhead) {
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

    const ribbonGeo = new THREE.BufferGeometry()
    ribbonGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    ribbonGeo.setIndex(indices)
    ribbonGeo.computeVertexNormals()

    const outlinePts: THREE.Vector3[] = [...leftPts, ...rightPts.slice().reverse()]
    const outlineGeo = new THREE.BufferGeometry().setFromPoints(outlinePts)
    return { ribbonGeo, outlineGeo }
  }

  private buildEdgeVisual(edge: DataFlowEdge, startDy = 0, endDy = 0): EdgeVisual | null {
    const fromBlock = this.blockVisuals.get(edge.from)
    const toBlock = this.blockVisuals.get(edge.to)
    if (!fromBlock || !toBlock) return null

    const curve = this.buildEdgeCurve(edge, fromBlock, toBlock, startDy, endDy)
    const shaftWidth = this.getEdgeWidth(edge.kind)
    const headWidth = shaftWidth * 1.85
    const headLength = 0.95
    const segments = edge.kind === 'recycle' ? 96 : 64
    const hasArrowhead = edge.id !== 'e-recycle-arc-pair'
    const { ribbonGeo, outlineGeo } = this.buildRibbonArrowGeometries(
      curve,
      shaftWidth,
      headWidth,
      headLength,
      segments,
      hasArrowhead
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

    const beadCount = edge.kind === 'recycle' ? 3 : 2
    const beads: THREE.Mesh[] = []
    const beadOffsets: number[] = []
    for (let i = 0; i < beadCount; i++) {
      const beadMat = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.75,
      })
      this.disposableMaterials.push(beadMat)
      const bead = new THREE.Mesh(this.beadGeo, beadMat)
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
      beadSpeed: edge.kind === 'recycle' ? 0.28 : 0.36,
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
    if (blockId !== null) {
      this.selectedInputSourceId = null
      this.selectedOutputId = null
    }
    this.refreshVisualStates()
  }

  public setHoveredBlock(blockId: string | null) {
    if (this.hoveredBlockId === blockId) return
    this.hoveredBlockId = blockId
    if (blockId !== null) {
      this.hoveredInputSourceId = null
      this.hoveredOutputId = null
    }
    this.refreshVisualStates()
  }

  public setSelectedInputSource(inputSourceId: InputSourceId | null) {
    this.selectedInputSourceId = inputSourceId
    if (inputSourceId !== null) {
      this.selectedBlockId = null
      this.selectedOutputId = null
    }
    this.refreshVisualStates()
  }

  public setHoveredInputSource(inputSourceId: InputSourceId | null) {
    if (this.hoveredInputSourceId === inputSourceId) return
    this.hoveredInputSourceId = inputSourceId
    if (inputSourceId !== null) {
      this.hoveredBlockId = null
      this.hoveredOutputId = null
    }
    this.refreshVisualStates()
  }

  public setSelectedOutput(outputId: OutputId | null) {
    this.selectedOutputId = outputId
    if (outputId !== null) {
      this.selectedBlockId = null
      this.selectedInputSourceId = null
    }
    this.refreshVisualStates()
  }

  public focusOutput(outputId: OutputId) {
    const outVis = this.externalOutputVisuals.get(outputId)
    if (!outVis) return
    const { x, y, z } = outVis.group.position
    if (outputId === 'cif-structure') {
      this.flyToCamera([x + 2.0, y + 3.2, z + 17.0], [x, y, z])
    } else {
      this.flyToCamera([x + 2.5, y + 2.5, z + 16.5], [x, y, z])
    }
  }

  public setCifText(cifText: string) {
    const cifOut = this.externalOutputVisuals.get('cif-structure')
    if (!cifOut) return

    const prevRotY = this.cifComplexGroup?.rotation.y ?? 0
    if (this.cifComplexGroup) {
      cifOut.group.remove(this.cifComplexGroup)
    }

    const oldGeos = new Set(this.cifComplexGeometries)
    const oldMats = new Set(this.cifComplexMaterials)
    this.cifComplexGeometries.forEach(g => g.dispose())
    this.cifComplexMaterials.forEach(m => m.dispose())
    for (let i = this.disposableGeometries.length - 1; i >= 0; i--) {
      if (oldGeos.has(this.disposableGeometries[i]!)) this.disposableGeometries.splice(i, 1)
    }
    for (let i = this.disposableMaterials.length - 1; i >= 0; i--) {
      if (oldMats.has(this.disposableMaterials[i]!)) this.disposableMaterials.splice(i, 1)
    }
    for (let i = cifOut.materials.length - 1; i >= 0; i--) {
      if (oldMats.has(cifOut.materials[i]!)) cifOut.materials.splice(i, 1)
    }

    const cifComplex = buildCifComplex(cifText, {
      maxXY: 5.5,
      maxZ: 5.0,
      isDark: this.isDark,
    })
    cifComplex.complexGroup.rotation.y = prevRotY
    this.cifComplexGeometries = [...cifComplex.geometries]
    this.cifComplexMaterials = [...cifComplex.materials]
    cifComplex.materials.forEach(m => {
      m.userData.baseOpacity = m.opacity
    })
    this.disposableGeometries.push(...cifComplex.geometries)
    this.disposableMaterials.push(...cifComplex.materials)
    cifOut.materials.push(...cifComplex.materials)
    cifOut.group.add(cifComplex.complexGroup)
    this.cifComplexGroup = cifComplex.complexGroup
  }

  public setHoveredOutput(outputId: OutputId | null) {
    if (this.hoveredOutputId === outputId) return
    this.hoveredOutputId = outputId
    if (outputId !== null) {
      this.hoveredBlockId = null
      this.hoveredInputSourceId = null
    }
    this.refreshVisualStates()
  }

  public setDocsOpen(open: boolean) {
    if (this.docsOpen === open) return
    this.docsOpen = open
    this.refreshVisualStates()
  }

  public setFlowPlaying(playing: boolean) {
    this.isFlowPlaying = playing
    this.refreshVisualStates()
  }

  public setRecycleCycle(cycle: number) {
    if (this.recycleCycle !== cycle) {
      this.recycleCycle = cycle
      this.recycleCycleScrubbed = true
      this.recyclePulseBoost = 1.0
      this.updateRecycleBadge()
    }
  }

  private applyAspectFraming() {
    const nextFov = this.camera.aspect < 1.1 ? 46 : 44
    if (this.camera.fov !== nextFov) {
      this.camera.fov = nextFov
      this.camera.updateProjectionMatrix()
    }
    const aspectScale = Math.min(2.2, Math.max(1, 1.45 / Math.max(0.45, this.camera.aspect)))
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
    const [sx, sy] = visual.spec.size
    if (this.expandedBlockIds.has(blockId) && visual.detailedVisual) {
      const [dsx, dsy, dsz] = visual.detailedVisual.detailSize
      const dist = Math.max(8.5, Math.max(dsx * 1.35, dsy * 2.35))
      const zDist = Math.max(dist, dsz * 0.72 + 6.0)
      this.flyToCamera([bx + zDist * 0.22, by + dist * 0.28, bz + zDist], [bx, by, bz])
    } else if (this.expandedBlockIds.has(blockId) && sx < 3.5) {
      const dist = Math.max(5.8, Math.max(sx, sy) * 2.35)
      this.flyToCamera([bx + dist * 0.24, by + dist * 0.32, bz + dist], [bx, by, bz])
    } else {
      this.flyToCamera([bx + 3.5, by + 4.5, bz + 13.5], [bx, by, bz])
    }
  }

  private updateDynamicPairBiasEdge(pairformerBlock = 24) {
    const ev = this.edgeVisuals.find(e => e.spec.id === 'e-pf-pair-to-single')
    const pairVisual = this.blockVisuals.get('pairformer-pair')
    const singleVisual = this.blockVisuals.get('pairformer-single')
    if (!ev || !pairVisual || !singleVisual) return

    const sliceCount = pairVisual.sliceMeshes.length
    if (sliceCount === 0) return

    const activeIdx = Math.min(
      sliceCount - 1,
      Math.max(0, Math.round(((pairformerBlock - 1) / 47) * (sliceCount - 1)))
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
          Math.max(0, Math.round((23 / 47) * (sliceCount - 1)))
        )
      } else if (id === 'diffusion-transformer') {
        activeSliceIdx = Math.min(
          sliceCount - 1,
          Math.max(0, Math.round((160 / 200) * (sliceCount - 1)))
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

      const isExpanded = this.expandedBlockIds.has(id)
      const isDocTarget = this.docsOpen && id === this.selectedBlockId
      visual.docFrameLine.visible = isDocTarget && !isExpanded

      const hideTitleForHudPill = isSelected && Boolean(visual.spec.detailedSpec)
      visual.labelSprite.visible = !hideTitleForHudPill
      visual.labelSprite.material.opacity = isActiveLabel ? 1.0 : unfocusedLabelOpacity
      visual.labelSprite.renderOrder = isActiveLabel ? 20 : 0
      visual.labelSprite.material.depthTest = !isActiveLabel

      visual.compactLabelSprite.visible = false
      visual.compactLabelSprite.material.opacity = isActiveLabel ? 1.0 : unfocusedLabelOpacity
      visual.compactLabelSprite.renderOrder = isActiveLabel ? 20 : 0
      visual.compactLabelSprite.material.depthTest = !isActiveLabel

      const showAxisTags =
        !isExpanded &&
        (isSelected || isHovered || (hasFocus && isFocused && this.focusBlockIds.size <= 3))
      visual.axisTagSprites.forEach(tag => {
        tag.visible = showAxisTags
      })

      if (visual.detailedVisual) {
        visual.simplifiedGroup.visible = !isExpanded
        visual.detailedVisual.group.visible = isExpanded
        if (isExpanded) {
          visual.detailedVisual.setHighlighted(
            isSelected,
            isHovered,
            isFocused,
            this.isDark,
            isDocTarget
          )
          visual.detailedVisual.setLabelsVisible(
            isExpanded && (isSelected || isHovered || isFocused)
          )
        }
      }
    }

    for (const [outId, outVis] of this.externalOutputVisuals) {
      outVis.docFrameLine.visible = this.docsOpen && this.selectedOutputId === outId
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

    this.updateRecycleBadge()
  }

  private buildRecycleLoopBadge(text: string) {
    if (this.recycleBadgeSprite) {
      this.modelGroup.remove(this.recycleBadgeSprite)
      this.recycleBadgeSprite.material.map?.dispose()
      this.recycleBadgeSprite.material.dispose()
      this.recycleBadgeSprite = null
    }

    const sprite = createRecycleLoopBadgeSprite(text, this.isDark)
    sprite.position.set(-1.0, 10.2, -2.5)
    if (sprite.material.map) {
      this.disposableTextures.push(sprite.material.map)
    }
    this.disposableMaterials.push(sprite.material)
    this.modelGroup.add(sprite)
    this.recycleBadgeSprite = sprite
    this.recycleBadgeText = text
  }

  private updateRecycleBadge() {
    if (!this.recycleBadgeSprite) return

    const hasFocus = this.focusBlockIds.size > 0
    const isOverviewMode = !hasFocus && this.selectedBlockId === null
    const isRecyclingChapter =
      this.highlightEdgeIds.has('e-recycle-arc-single') ||
      this.highlightEdgeIds.has('e-recycle-arc-pair')
    const isRecycleBlockSelected = this.selectedBlockId === 'trunk-recycle-gate'

    let isTrunkChapter = false
    if (this.selectedBlockId !== null) {
      isTrunkChapter = TRUNK_BLOCK_IDS.has(this.selectedBlockId)
    } else if (hasFocus) {
      for (const id of this.focusBlockIds) {
        if (TRUNK_BLOCK_IDS.has(id)) {
          isTrunkChapter = true
          break
        }
      }
    }

    const nextText =
      (isRecyclingChapter || isRecycleBlockSelected) && this.recycleCycleScrubbed
        ? `10x loop (${this.recycleCycle}/10)`
        : '10x loop'

    if (nextText !== this.recycleBadgeText) {
      this.buildRecycleLoopBadge(nextText)
    }

    const sprite = this.recycleBadgeSprite
    if (!sprite) return

    if (isOverviewMode || isRecyclingChapter || isRecycleBlockSelected) {
      this.recycleBadgeWantsVisible = true
      sprite.visible = true
      sprite.material.opacity = 1.0
    } else if (isTrunkChapter) {
      this.recycleBadgeWantsVisible = true
      sprite.visible = true
      sprite.material.opacity = this.isDark ? 0.48 : 0.55
    } else {
      this.recycleBadgeWantsVisible = false
      sprite.visible = false
    }
  }

  private updateLabelScales(targetDist: number) {
    if (!this.recycleBadgeSprite) return
    const showForZoom =
      this.recycleBadgeWantsVisible &&
      (targetDist >= 14 || this.selectedBlockId === 'trunk-recycle-gate')
    this.recycleBadgeSprite.visible = showForZoom
    if (!showForZoom) return
    this.recycleBadgeSprite.getWorldPosition(this.scratchVec)
    const dist = this.camera.position.distanceTo(this.scratchVec)
    const aspect = (this.recycleBadgeSprite.userData.aspect as number | undefined) ?? 2.6
    const s = THREE.MathUtils.clamp(dist * 0.054, 0.9, 4.3)
    this.recycleBadgeSprite.scale.set(s, s / aspect, 1)
  }

  private readonly handleControlsStart = () => {
    this.cameraFlying = false
    this.isUserDraggingControls = true
  }

  private readonly handleControlsEnd = () => {
    this.isUserDraggingControls = false
  }

  private readonly handleWheel = () => {
    this.cameraFlying = false
  }

  private getVisibleStackHitTargets(): THREE.Object3D[] {
    const targets: THREE.Object3D[] = []
    for (const id of this.expandedBlockIds) {
      const v = this.blockVisuals.get(id)
      if (!v?.detailedVisual || v.detailedVisual.stackCount <= 1) continue
      for (const m of v.detailedVisual.stackHitMeshes) {
        if (m.visible) targets.push(m)
      }
    }
    return targets
  }

  private clearHoveredSlice() {
    if (!this.hoveredSliceBlockId) return
    this.blockVisuals.get(this.hoveredSliceBlockId)?.detailedVisual?.setHoveredSlice(null)
    this.hoveredSliceBlockId = null
  }

  private isObjectVisibleInHierarchy(obj: THREE.Object3D): boolean {
    let cur: THREE.Object3D | null = obj
    while (cur) {
      if (!cur.visible) return false
      cur = cur.parent
    }
    return true
  }

  private readonly handlePointerMove = (e: PointerEvent) => {
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1

    this.raycaster.setFromCamera(this.pointer, this.camera)
    const stackTargets = this.getVisibleStackHitTargets()
    const stackHits =
      stackTargets.length > 0 ? this.raycaster.intersectObjects(stackTargets, false) : []
    const sliceHit = stackHits[0]
    if (sliceHit) {
      const hitId = sliceHit.object.userData?.blockId as string | undefined
      const sliceIdx = sliceHit.object.userData?.stackSliceIndex as number | undefined
      if (hitId && typeof sliceIdx === 'number') {
        if (this.hoveredSliceBlockId && this.hoveredSliceBlockId !== hitId) {
          this.clearHoveredSlice()
        }
        this.hoveredSliceBlockId = hitId
        this.blockVisuals.get(hitId)?.detailedVisual?.setHoveredSlice(sliceIdx)
        this.renderer.domElement.style.cursor = 'pointer'
        if (hitId !== this.hoveredBlockId) {
          this.setHoveredBlock(hitId)
          this.callbacks.onHoverBlock?.(hitId)
        }
        return
      }
    }

    this.clearHoveredSlice()
    const hits = this.raycaster
      .intersectObjects(this.hitTargets, false)
      .filter(h => this.isObjectVisibleInHierarchy(h.object))
    const topHit = hits[0]?.object
    const hitInputId = (topHit?.userData?.inputSourceId as InputSourceId | undefined) ?? null
    const hitOutputId = (topHit?.userData?.outputId as OutputId | undefined) ?? null
    const hitId =
      hitInputId || hitOutputId ? null : ((topHit?.userData?.blockId as string | undefined) ?? null)

    this.renderer.domElement.style.cursor = hitId || hitInputId || hitOutputId ? 'pointer' : 'grab'
    if (hitInputId !== this.hoveredInputSourceId) {
      this.setHoveredInputSource(hitInputId)
      this.callbacks.onHoverInputSource?.(hitInputId)
    }
    if (hitOutputId !== this.hoveredOutputId) {
      this.setHoveredOutput(hitOutputId)
      this.callbacks.onHoverOutput?.(hitOutputId)
    }
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
    const stackTargets = this.getVisibleStackHitTargets()
    const stackHits =
      stackTargets.length > 0 ? this.raycaster.intersectObjects(stackTargets, false) : []
    const sliceHit = stackHits[0]
    if (sliceHit) {
      const hitId = sliceHit.object.userData?.blockId as string | undefined
      const sliceIdx = sliceHit.object.userData?.stackSliceIndex as number | undefined
      if (hitId && typeof sliceIdx === 'number') {
        if (sliceIdx === 0) {
          this.callbacks.onSelectBlock?.(hitId)
          return
        }
        const dv = this.blockVisuals.get(hitId)?.detailedVisual
        if (dv && dv.stackCount > 1) {
          dv.setStackMulti(!dv.isStackMulti)
          dv.setHoveredSlice(null)
          this.hoveredSliceBlockId = null
          this.applyExpandedLayout()
          this.refreshVisualStates()
          return
        }
      }
    }

    const hits = this.raycaster
      .intersectObjects(this.hitTargets, false)
      .filter(h => this.isObjectVisibleInHierarchy(h.object))
    const topHit = hits[0]?.object
    const hitInputId = (topHit?.userData?.inputSourceId as InputSourceId | undefined) ?? null
    if (hitInputId) {
      this.callbacks.onSelectInputSource?.(hitInputId)
      return
    }
    const hitOutputId = (topHit?.userData?.outputId as OutputId | undefined) ?? null
    if (hitOutputId) {
      this.callbacks.onSelectOutput?.(hitOutputId)
      return
    }
    const hitId = (topHit?.userData?.blockId as string | undefined) ?? null
    if (hitId) {
      this.callbacks.onSelectBlock?.(hitId)
    } else {
      this.callbacks.onSelectBlock?.(null)
      this.callbacks.onSelectInputSource?.(null)
      this.callbacks.onSelectOutput?.(null)
    }
  }

  private readonly handlePointerLeave = () => {
    this.clearHoveredSlice()
    if (this.hoveredBlockId !== null) {
      this.setHoveredBlock(null)
      this.callbacks.onHoverBlock?.(null)
    }
    if (this.hoveredInputSourceId !== null) {
      this.setHoveredInputSource(null)
      this.callbacks.onHoverInputSource?.(null)
    }
    if (this.hoveredOutputId !== null) {
      this.setHoveredOutput(null)
      this.callbacks.onHoverOutput?.(null)
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
    if (this.cifComplexGroup) {
      this.cifComplexGroup.rotation.y += dt * 0.18
    }

    const targetDist = this.camera.position.distanceTo(this.controls.target)
    let sceneWidth = DEFAULT_SCENE_WIDTH
    if (this.stageFloorPlates.length > 0) {
      let minX = Infinity
      let maxX = -Infinity
      for (const plate of this.stageFloorPlates) {
        const halfW = (plate.baseWidth * plate.padMesh.scale.x) / 2
        const cx = plate.padMesh.position.x
        minX = Math.min(minX, cx - halfW)
        maxX = Math.max(maxX, cx + halfW)
      }
      if (Number.isFinite(minX) && Number.isFinite(maxX)) {
        sceneWidth = maxX - minX
      }
    }
    const fitDist = computeSceneFitDistance(sceneWidth, this.camera.fov, this.camera.aspect)
    const hasFocus = this.focusBlockIds.size > 0
    const isOverviewMode =
      !hasFocus &&
      this.selectedBlockId === null &&
      this.selectedInputSourceId === null &&
      this.selectedOutputId === null
    const isOverviewWave = isOverviewMode && this.isFlowPlaying

    if (isOverviewWave) {
      if (this.overviewPauseRemaining > 0) {
        this.overviewPauseRemaining = Math.max(0, this.overviewPauseRemaining - dt)
        this.lastReportedPause = this.overviewPauseRemaining
        this.callbacks.onOverviewPauseChange?.(
          this.overviewPauseRemaining,
          this.overviewPauseDuration
        )
      } else {
        if (this.lastReportedPause > 0) {
          this.lastReportedPause = 0
          this.callbacks.onOverviewPauseChange?.(0, this.overviewPauseDuration)
        }
        this.overviewWaveTime +=
          (dt / 16.0) * computeEffectiveWaveSpeed(targetDist, this.overviewWaveTime, fitDist)
        if (this.overviewWaveTime >= 1.0) {
          this.overviewWaveTime = 0
          this.overviewPauseRemaining = this.overviewPauseDuration
          this.lastReportedPause = this.overviewPauseRemaining
          this.callbacks.onOverviewPauseChange?.(
            this.overviewPauseRemaining,
            this.overviewPauseDuration
          )
        }
      }
    } else if (this.wasOverviewWave) {
      this.overviewPauseRemaining = 0
      if (this.lastReportedPause > 0) {
        this.lastReportedPause = 0
        this.callbacks.onOverviewPauseChange?.(0, this.overviewPauseDuration)
      }
      this.moleculeCloud?.setDiffusionStep(160)
      for (const plate of this.stageFloorPlates) {
        plate.padMat.opacity = this.isDark ? 0.06 : 0.045
        plate.borderMat.opacity = this.isDark ? 0.26 : 0.22
        plate.headerMat.opacity = 0.82
      }
      for (const ext of this.externalInputVisuals.values()) {
        for (const m of ext.materials) m.opacity = 1.0
        for (const a of ext.arrows) {
          a.ribbonMat.opacity = this.isDark ? 0.34 : 0.4
          a.outlineMat.opacity = this.isDark ? 0.4 : 0.48
        }
      }
      for (const out of this.externalOutputVisuals.values()) {
        for (const m of out.materials) {
          m.opacity = (m.userData.baseOpacity as number | undefined) ?? 1.0
        }
        if (out.arrow) {
          out.arrow.ribbonMat.opacity = this.isDark ? 0.34 : 0.4
          out.arrow.outlineMat.opacity = this.isDark ? 0.4 : 0.48
        }
      }
      this.refreshVisualStates()
    }
    this.wasOverviewWave = isOverviewWave

    const activeWaveT = this.overviewPauseRemaining > 0 ? -1 : this.overviewWaveTime
    const waveGlow = (center: number, width = 0.085): number =>
      computeWaveGlow(activeWaveT, center, width)

    const inTrunkLoop = activeWaveT >= 0.26 && activeWaveT <= 0.64
    const trunkU = inTrunkLoop ? ((activeWaveT - 0.26) / 0.38) * 3 : 0
    const cycleU = inTrunkLoop ? trunkU - Math.floor(trunkU) : 0
    const cycleGlow = (center: number, width = 0.022): number =>
      computeCycleGlow(activeWaveT, center, width)

    if (isOverviewWave) {
      const weightedPlates: WeightedStagePlate[] = []
      for (let pi = 0; pi < this.stageFloorPlates.length; pi++) {
        const plate = this.stageFloorPlates[pi]!
        const sGlow = computeStagePlateGlow(pi, plate.phase, plate.width, activeWaveT)
        weightedPlates.push({
          x: plate.padMesh.position.x,
          y: -1,
          z: plate.padMesh.position.z,
          glow: sGlow,
        })
        plate.padMat.opacity = THREE.MathUtils.lerp(
          this.isDark ? 0.05 : 0.04,
          this.isDark ? 0.72 : 0.68,
          sGlow
        )
        plate.borderMat.opacity = THREE.MathUtils.lerp(this.isDark ? 0.18 : 0.15, 0.98, sGlow)
        plate.headerMat.opacity = THREE.MathUtils.lerp(0.55, 1.0, sGlow)
      }

      if (
        shouldFollowOverviewWave({
          isOverviewWave,
          targetDist,
          cameraFlying: this.cameraFlying,
          isUserDraggingControls: this.isUserDraggingControls,
          maxFollowDist: fitDist,
        })
      ) {
        const followTarget = computeActivePlateTarget(weightedPlates)
        if (followTarget) {
          const alpha = computeFollowAlpha(dt, 3.0)
          this.followScratchDelta
            .set(
              followTarget.x - this.controls.target.x,
              followTarget.y - this.controls.target.y,
              followTarget.z - this.controls.target.z
            )
            .multiplyScalar(alpha)
          this.controls.target.add(this.followScratchDelta)
          this.camera.position.add(this.followScratchDelta)
        }
      }
      for (const [extId, ext] of this.externalInputVisuals) {
        const xGlow =
          extId === 'msa-embedder'
            ? Math.max(waveGlow(ext.phase, 0.07), cycleGlow(0.22, 0.024))
            : waveGlow(ext.phase, 0.07)
        const matOp = THREE.MathUtils.lerp(this.isDark ? 0.3 : 0.24, 1.0, xGlow)
        const arrOp = THREE.MathUtils.lerp(
          this.isDark ? 0.1 : 0.09,
          this.isDark ? 0.84 : 0.86,
          xGlow
        )
        const outOp = THREE.MathUtils.lerp(
          this.isDark ? 0.14 : 0.14,
          this.isDark ? 0.92 : 0.95,
          xGlow
        )
        for (const m of ext.materials) m.opacity = matOp
        for (const a of ext.arrows) {
          a.ribbonMat.opacity = arrOp
          a.outlineMat.opacity = outOp
        }
      }
      for (const out of this.externalOutputVisuals.values()) {
        const oGlow = waveGlow(out.phase, 0.07)
        const matScale = THREE.MathUtils.lerp(this.isDark ? 0.28 : 0.22, 1.0, oGlow)
        const arrOp = THREE.MathUtils.lerp(
          this.isDark ? 0.1 : 0.09,
          this.isDark ? 0.84 : 0.86,
          oGlow
        )
        const outOp = THREE.MathUtils.lerp(
          this.isDark ? 0.14 : 0.14,
          this.isDark ? 0.92 : 0.95,
          oGlow
        )
        for (const m of out.materials) {
          const baseOp = (m.userData.baseOpacity as number | undefined) ?? 1.0
          m.opacity = baseOp * matScale
        }
        if (out.arrow) {
          out.arrow.ribbonMat.opacity = arrOp
          out.arrow.outlineMat.opacity = outOp
        }
      }
    }

    const animPfFrac = inTrunkLoop
      ? THREE.MathUtils.clamp((cycleU - 0.32) / 0.36, 0, 1)
      : activeWaveT > 0.64
        ? 1
        : 0
    const animDiffFrac =
      activeWaveT < 0 ? 0 : THREE.MathUtils.clamp((activeWaveT - 0.69) / 0.18, 0, 1)
    if (isOverviewWave) {
      this.moleculeCloud?.setDiffusionStep(Math.round(animDiffFrac * 200))
    }

    for (const [id, visual] of this.blockVisuals) {
      const isFocused = !hasFocus || this.focusBlockIds.has(id)
      if (isOverviewWave && id !== this.hoveredBlockId) {
        const trunkPhase = TRUNK_LOOP_BLOCK_PHASE[id]
        const glow =
          trunkPhase !== undefined
            ? Math.max(cycleGlow(trunkPhase, 0.026), waveGlow(OVERVIEW_WAVE_PHASE[id] ?? 0.5, 0.07))
            : waveGlow(OVERVIEW_WAVE_PHASE[id] ?? 0.5, 0.07)
        const blockOp = THREE.MathUtils.lerp(this.isDark ? 0.3 : 0.24, 1.0, glow)
        const lineOp = THREE.MathUtils.lerp(
          this.isDark ? 0.14 : 0.12,
          this.isDark ? 0.85 : 0.9,
          glow
        )
        visual.group.scale.setScalar(1 + glow * 0.045)
        const sliceCount = visual.sliceMaterials.length
        let activeSliceIdx = -1
        if (id === 'pairformer-pair' || id === 'pairformer-single') {
          activeSliceIdx = Math.min(
            sliceCount - 1,
            Math.max(0, Math.round(animPfFrac * (sliceCount - 1)))
          )
          if (id === 'pairformer-pair' && activeSliceIdx !== this.lastOverviewPfSlice) {
            this.lastOverviewPfSlice = activeSliceIdx
            this.updateDynamicPairBiasEdge(1 + Math.round(animPfFrac * 47))
          }
        } else if (id === 'diffusion-transformer') {
          activeSliceIdx = Math.min(
            sliceCount - 1,
            Math.max(0, Math.round(animDiffFrac * (sliceCount - 1)))
          )
        }
        visual.sliceMaterials.forEach((mat, idx) => {
          mat.opacity = blockOp
          if (idx === activeSliceIdx) {
            mat.emissive.copy(visual.baseColor)
            mat.emissiveIntensity = this.isDark ? 0.65 : 0.45
            mat.color.copy(visual.baseColor).lerp(new THREE.Color(0xffffff), 0.35)
          } else {
            mat.emissive.copy(visual.baseColor)
            mat.emissiveIntensity = glow * (this.isDark ? 0.35 : 0.22)
            mat.color.setHex(0xffffff)
          }
        })
        visual.edgeLines.forEach(line => {
          const lm = line.material as THREE.LineBasicMaterial
          lm.opacity = lineOp
        })
      }
      if (visual.detailedVisual && visual.detailedVisual.group.visible) {
        visual.detailedVisual.update(dt, this.isFlowPlaying)
        visual.group.getWorldPosition(this.scratchVec)
        const camDist = this.camera.position.distanceTo(this.scratchVec)
        visual.detailedVisual.setLabelsVisible(
          shouldShowDetailMiniLabels({
            camDist,
            isSelected: id === this.selectedBlockId,
            isHovered: id === this.hoveredBlockId,
            isFocused,
          })
        )
        visual.detailedVisual.updateLabelScales(camDist)
      }

      visual.group.getWorldPosition(this.scratchVec)
      const blockDist = this.camera.position.distanceTo(this.scratchVec)
      const isExpanded = this.expandedBlockIds.has(id)
      const showAxisTags = shouldShowAxisTags({
        dist: blockDist,
        isExpanded,
        isSelected: id === this.selectedBlockId,
        isHovered: id === this.hoveredBlockId,
        hasFocus,
        isFocused,
        focusBlockCount: this.focusBlockIds.size,
      })
      for (const tag of visual.axisTagSprites) {
        tag.visible = showAxisTags
      }

      visual.labelSprite.getWorldPosition(this.scratchVec)
      const dist = this.camera.position.distanceTo(this.scratchVec)
      const labelState = getBlockLabelState({
        dist,
        targetDist,
        isOverviewMode,
        isSelected: id === this.selectedBlockId,
        isHovered: id === this.hoveredBlockId,
        isFocused,
        isExpanded,
        hasDetailedSpec: Boolean(visual.spec.detailedSpec),
      })

      if (labelState.mode !== 'hidden') {
        const useCompact = labelState.mode === 'compact'
        visual.labelSprite.visible = !useCompact
        visual.compactLabelSprite.visible = useCompact

        const activeSprite = useCompact ? visual.compactLabelSprite : visual.labelSprite
        const aspect =
          (activeSprite.userData.aspect as number | undefined) ??
          (useCompact ? 136 / 768 : 200 / 768)
        const baseHeightRatio =
          (activeSprite.userData.baseHeightRatio as number | undefined) ??
          (useCompact ? 136 / 768 : 200 / 768)
        const h = labelState.refWidth * baseHeightRatio
        activeSprite.scale.set(h / aspect, h, 1)
      } else {
        visual.labelSprite.visible = false
        visual.compactLabelSprite.visible = false
      }
    }

    for (const sprite of this.externalLabelSprites) {
      sprite.getWorldPosition(this.scratchVec)
      const dist = this.camera.position.distanceTo(this.scratchVec)
      const extState = getExternalLabelState({ dist, targetDist })
      sprite.visible = extState.visible
      if (extState.visible) {
        const aspect = (sprite.userData.aspect as number | undefined) ?? 136 / 768
        const baseHeightRatio = (sprite.userData.baseHeightRatio as number | undefined) ?? 136 / 768
        const h = extState.refWidth * baseHeightRatio
        sprite.scale.set(h / aspect, h, 1)
      }
    }

    const hasHighlightedEdges = this.highlightEdgeIds.size > 0
    const inspectingBlock = this.selectedBlockId !== null
    const isSelectedBlockExpanded =
      this.selectedBlockId !== null && this.expandedBlockIds.has(this.selectedBlockId)

    for (const ev of this.edgeVisuals) {
      if (!ev.labelSprite) continue
      const shouldConsider = inspectingBlock
        ? ev.isHighlighted
        : hasHighlightedEdges && ev.isHighlighted
      ev.labelSprite.getWorldPosition(this.scratchVec)
      const dist = this.camera.position.distanceTo(this.scratchVec)
      const edgeState = getEdgeLabelState({
        dist,
        targetDist,
        shouldConsider,
        isSelectedBlockExpanded,
      })
      ev.labelSprite.visible = edgeState.visible
      if (edgeState.visible) {
        ev.labelSprite.scale.set(edgeState.scaleWidth, edgeState.scaleWidth * 0.175, 1)
      }
    }

    this.updateLabelScales(targetDist)
    this.deoverlapScreenLabels()

    if (this.recyclePulseBoost > 0) {
      this.recyclePulseBoost = Math.max(0, this.recyclePulseBoost - dt * 1.4)
    }

    const pos = new THREE.Vector3()
    for (const ev of this.edgeVisuals) {
      if (isOverviewWave) {
        let eGlow: number
        if (ev.spec.kind === 'recycle') {
          eGlow = cycleGlow(0.76, 0.025)
        } else if (
          TRUNK_LOOP_BLOCK_PHASE[ev.spec.from] !== undefined &&
          TRUNK_LOOP_BLOCK_PHASE[ev.spec.to] !== undefined
        ) {
          const tFrom = TRUNK_LOOP_BLOCK_PHASE[ev.spec.from]!
          const tTo = TRUNK_LOOP_BLOCK_PHASE[ev.spec.to]!
          eGlow = cycleGlow((tFrom + tTo) * 0.5, 0.025)
        } else {
          let edgePhase: number
          if (ev.spec.id === 'e-pf-pair-to-aux') {
            edgePhase = 0.89
          } else {
            const pFrom = OVERVIEW_WAVE_PHASE[ev.spec.from] ?? 0.5
            const pTo = OVERVIEW_WAVE_PHASE[ev.spec.to] ?? 0.5
            edgePhase = (pFrom + pTo) * 0.5
          }
          eGlow = waveGlow(edgePhase, 0.07)
        }
        ev.ribbonMat.opacity = THREE.MathUtils.lerp(
          this.isDark ? 0.1 : 0.09,
          this.isDark ? 0.84 : 0.86,
          eGlow
        )
        ev.outlineMat.opacity = THREE.MathUtils.lerp(
          this.isDark ? 0.14 : 0.14,
          this.isDark ? 0.92 : 0.95,
          eGlow
        )
        const beadScale = 0.85 + eGlow * 0.65
        for (const bead of ev.beads) {
          bead.scale.setScalar(beadScale)
          const bm = bead.material as THREE.MeshBasicMaterial
          bm.opacity = THREE.MathUtils.lerp(0.25, 1.0, eGlow)
        }
      } else if (ev.spec.kind === 'recycle' && this.recyclePulseBoost > 0) {
        ev.ribbonMat.opacity = Math.min(0.85, 0.62 + this.recyclePulseBoost * 0.24)
      } else if (
        ev.isHighlighted &&
        this.isFlowPlaying &&
        this.selectedBlockId === null &&
        !this.isDark &&
        this.highlightEdgeIds.size > 0
      ) {
        const pulse = 0.5 + 0.5 * Math.sin(now * 0.0045)
        const baseR = 0.62
        const baseO = 0.72
        ev.ribbonMat.opacity = baseR + 0.14 * pulse
        ev.outlineMat.opacity = baseO + 0.12 * pulse
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

    const tryPlace = (sprite: THREE.Sprite, pad: number, force = false): boolean => {
      const rect = computeRect(sprite, pad)
      if (!rect) {
        sprite.visible = false
        return false
      }
      if (!force && placedRects.some(r => rectsOverlap(rect, r))) {
        sprite.visible = false
        return false
      }
      placedRects.push(rect)
      return true
    }

    const hasFocus = this.focusBlockIds.size > 0
    const activeBlocks: THREE.Sprite[] = []
    const focusedBlocks: THREE.Sprite[] = []
    const otherBlocks: THREE.Sprite[] = []

    for (const [id, visual] of this.blockVisuals) {
      const activeSprite = visual.compactLabelSprite.visible
        ? visual.compactLabelSprite
        : visual.labelSprite
      if (!activeSprite.visible || activeSprite.material.opacity < 0.25) continue
      if (id === this.selectedBlockId || id === this.hoveredBlockId) {
        activeBlocks.push(activeSprite)
      } else if (hasFocus && this.focusBlockIds.has(id)) {
        focusedBlocks.push(activeSprite)
      } else {
        otherBlocks.push(activeSprite)
      }
    }

    for (const sprite of activeBlocks) tryPlace(sprite, 8, true)
    for (const sprite of focusedBlocks) tryPlace(sprite, 8)
    for (const sprite of otherBlocks) tryPlace(sprite, 8)

    if (this.recycleBadgeSprite && this.recycleBadgeSprite.visible) {
      tryPlace(this.recycleBadgeSprite, 8)
    }

    for (const sprite of this.externalLabelSprites) {
      if (!sprite.visible) continue
      tryPlace(sprite, 8)
    }

    for (const ev of this.edgeVisuals) {
      if (!ev.labelSprite || !ev.labelSprite.visible) continue
      tryPlace(ev.labelSprite, 10)
    }

    for (const visual of this.blockVisuals.values()) {
      if (!visual.detailedVisual || !visual.detailedVisual.group.visible) continue
      for (const sprite of visual.detailedVisual.miniLabels) {
        if (!sprite.visible) continue
        tryPlace(sprite, 3)
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
    this.controls.removeEventListener('end', this.handleControlsEnd)
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
