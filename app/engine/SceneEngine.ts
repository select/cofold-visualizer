import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { DataFlowEdge, FoldingModelSpec, TensorBlock3D } from '~/types/architecture'
import { MoleculeCloud } from './moleculeCloud'
import { createLabelSprite, createTensorMatrixTexture } from './textures'

export interface SceneEngineCallbacks {
  onSelectBlock?: (blockId: string | null) => void
  onHoverBlock?: (blockId: string | null) => void
}

interface BlockVisual {
  spec: TensorBlock3D
  group: THREE.Group
  hitMesh: THREE.Mesh
  sliceMeshes: THREE.Mesh[]
  sliceMaterials: THREE.MeshStandardMaterial[]
  edgeLines: THREE.LineSegments[]
  labelSprite: THREE.Sprite
  baseColor: THREE.Color
}

interface EdgeVisual {
  spec: DataFlowEdge
  curve: THREE.CatmullRomCurve3
  tube: THREE.Mesh
  tubeMat: THREE.MeshStandardMaterial
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
  private readonly desiredCamPos = new THREE.Vector3(3, 14, 44)
  private readonly desiredTarget = new THREE.Vector3(3, 0, 0)

  private rafId: number | null = null
  private lastTime = performance.now()
  private disposed = false

  private readonly beadGeo = new THREE.SphereGeometry(0.11, 10, 10)
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
    this.camera = new THREE.PerspectiveCamera(44, width / height, 0.2, 260)
    this.camera.position.copy(this.desiredCamPos)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.minDistance = 4
    this.controls.maxDistance = 95
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

  private applyThemeColors() {
    const bgHex = this.isDark ? 0x161618 : 0xfafaf9
    this.scene.background = new THREE.Color(bgHex)
    this.scene.fog = new THREE.Fog(bgHex, 60, 145)

    this.hemiLight.intensity = this.isDark ? 0.72 : 0.95
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
        this.modelGroup.add(edgeVisual.tube)
        edgeVisual.beads.forEach(b => this.modelGroup.add(b))
      }
    }

    this.refreshVisualStates()
  }

  private clearModelScene() {
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
      group.add(wire)
      edgeLines.push(wire)

      this.moleculeCloud = new MoleculeCloud()
      this.moleculeCloud.setDiffusionStep(this.diffusionStep)
      group.add(this.moleculeCloud.group)
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
        group.add(mesh)
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
    labelSprite.position.set(0, sy / 2 + 0.95, 0)
    group.add(labelSprite)

    return {
      spec: block,
      group,
      hitMesh,
      sliceMeshes,
      sliceMaterials,
      edgeLines,
      labelSprite,
      baseColor,
    }
  }

  private buildEdgeVisual(edge: DataFlowEdge): EdgeVisual | null {
    const fromBlock = this.blockVisuals.get(edge.from)
    const toBlock = this.blockVisuals.get(edge.to)
    if (!fromBlock || !toBlock) return null

    const start = fromBlock.group.position.clone()
    const end = toBlock.group.position.clone()

    const pts: THREE.Vector3[] = [start]
    if (edge.controlPoints && edge.controlPoints.length > 0) {
      for (const cp of edge.controlPoints) {
        pts.push(new THREE.Vector3(cp[0], cp[1], cp[2]))
      }
    } else {
      const mid = start.clone().lerp(end, 0.5)
      if (edge.kind === 'pair-bias') {
        mid.z -= 0.8
      } else if (edge.kind === 'residual') {
        mid.y -= 0.7
      }
      pts.push(mid)
    }
    pts.push(end)

    const curve = new THREE.CatmullRomCurve3(pts)
    const radius = edge.kind === 'recycle' ? 0.065 : 0.042
    const tubeGeo = new THREE.TubeGeometry(curve, 36, radius, 8, false)
    this.disposableGeometries.push(tubeGeo)

    const colorHex = this.getEdgeColor(edge.kind)
    const tubeMat = new THREE.MeshStandardMaterial({
      color: colorHex,
      emissive: colorHex,
      emissiveIntensity: 0.12,
      roughness: 0.4,
      transparent: true,
      opacity: 0.45,
    })
    this.disposableMaterials.push(tubeMat)
    const tube = new THREE.Mesh(tubeGeo, tubeMat)

    const beadCount = edge.kind === 'recycle' ? 3 : 2
    const beads: THREE.Mesh[] = []
    const beadOffsets: number[] = []
    for (let i = 0; i < beadCount; i++) {
      const beadMat = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.9,
      })
      this.disposableMaterials.push(beadMat)
      const bead = new THREE.Mesh(this.beadGeo, beadMat)
      beads.push(bead)
      beadOffsets.push(i / beadCount)
    }

    return {
      spec: edge,
      curve,
      tube,
      tubeMat,
      beads,
      beadOffsets,
      beadSpeed: edge.kind === 'recycle' ? 0.28 : 0.36,
      isHighlighted: false,
    }
  }

  private getEdgeColor(kind: DataFlowEdge['kind']): number {
    switch (kind) {
      case 'recycle':
        return 0xf59e0b
      case 'pair-bias':
        return 0xa855f7
      case 'conditioning':
        return 0xec4899
      case 'residual':
        return 0x14b8a6
      default:
        return 0x6366f1
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

  public flyToCamera(position: [number, number, number], target: [number, number, number]) {
    this.desiredCamPos.set(position[0], position[1], position[2])
    this.desiredTarget.set(target[0], target[1], target[2])
    this.cameraFlying = true
  }

  private refreshVisualStates() {
    const hasFocus = this.focusBlockIds.size > 0

    for (const [id, visual] of this.blockVisuals) {
      const isSelected = id === this.selectedBlockId
      const isHovered = id === this.hoveredBlockId
      const isFocused = !hasFocus || this.focusBlockIds.has(id)

      const targetOpacity = isSelected || isHovered ? 1.0 : isFocused ? 0.96 : 0.28
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

      visual.sliceMaterials.forEach((mat, idx) => {
        mat.opacity = targetOpacity
        const isSliceActive = activeSliceIdx === idx
        if (isSelected || isSliceActive) {
          mat.emissive.copy(visual.baseColor)
          mat.emissiveIntensity = isSelected ? 0.35 : 0.48
        } else if (isHovered) {
          mat.emissive.copy(visual.baseColor)
          mat.emissiveIntensity = 0.22
        } else {
          mat.emissive.setHex(0x000000)
          mat.emissiveIntensity = 0
        }
      })

      visual.edgeLines.forEach(line => {
        const lm = line.material as THREE.LineBasicMaterial
        lm.opacity = isSelected || isHovered ? 0.95 : isFocused ? 0.55 : 0.16
      })

      visual.labelSprite.material.opacity = isSelected || isHovered || isFocused ? 1.0 : 0.25
    }

    for (const ev of this.edgeVisuals) {
      const highlighted = this.highlightEdgeIds.size === 0 || this.highlightEdgeIds.has(ev.spec.id)
      ev.isHighlighted = highlighted
      ev.tubeMat.opacity = highlighted ? 0.72 : 0.14
      ev.tubeMat.emissiveIntensity = highlighted ? 0.35 : 0.04
      ev.beads.forEach(b => {
        b.visible = highlighted
      })
    }
  }

  private readonly handleControlsStart = () => {
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

    if (this.recyclePulseBoost > 0) {
      this.recyclePulseBoost = Math.max(0, this.recyclePulseBoost - dt * 1.4)
    }

    const pos = new THREE.Vector3()
    for (const ev of this.edgeVisuals) {
      if (ev.spec.kind === 'recycle' && this.recyclePulseBoost > 0) {
        ev.tubeMat.emissiveIntensity = 0.35 + this.recyclePulseBoost * 0.9
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

  public resize() {
    if (this.disposed) return
    const width = Math.max(1, this.container.clientWidth)
    const height = Math.max(1, this.container.clientHeight)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
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
