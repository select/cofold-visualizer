import * as THREE from 'three'
import { createEdgeLabelSprite, createLabelSprite, createTensorMatrixTexture } from './textures'

export type AttentionContextKey = 'atom-enc' | 'msa' | 'pairformer' | 'dit'

export interface AttentionContextPreset {
  key: AttentionContextKey
  title: string
  badgeText: string
  headCountLabel: string
  dHeadLabel: string
  channelLabel: string
  normLabel: string
  normAggLabel: string
  pairBiasLabel: string
  accentColor: string
  isAdaLN: boolean
}

export const ATTENTION_PRESETS: Record<AttentionContextKey, AttentionContextPreset> = {
  'atom-enc': {
    key: 'atom-enc',
    title: 'Atom Attention Encoder',
    badgeText: 'Atom Attention Encoder · 4 heads (32×128)',
    headCountLabel: 'Head 1 … Head 4',
    dHeadLabel: 'd_head = 32 · 32×128 window',
    channelLabel: 'c_atom = 128',
    normLabel: 'LayerNorm',
    normAggLabel: 'LN Agg: μ, σ',
    pairBiasLabel: 'Atom Pair Bias (c_atom_pair=16)',
    accentColor: '#6366f1',
    isAdaLN: false,
  },
  msa: {
    key: 'msa',
    title: 'MSA Pair-Weighted Averaging',
    badgeText: 'MSA Pair-Weighted Avg · 8 heads (d=8)',
    headCountLabel: 'Head 1 … Head 8',
    dHeadLabel: 'd_head = 8 · 4 shown',
    channelLabel: 'c_m = 64',
    normLabel: 'LayerNorm',
    normAggLabel: 'LN Agg: μ, σ',
    pairBiasLabel: 'Pair Bias (z_ij → b_ij)',
    accentColor: '#14b8a6',
    isAdaLN: false,
  },
  pairformer: {
    key: 'pairformer',
    title: 'Pairformer Attention with Pair Bias',
    badgeText: 'Pairformer Attention with Pair Bias · 16 heads (d=24)',
    headCountLabel: 'Head 1 … Head 16',
    dHeadLabel: 'd_head = 24 · 4 shown',
    channelLabel: 'c_s = 384',
    normLabel: 'LayerNorm',
    normAggLabel: 'LN Agg: μ, σ',
    pairBiasLabel: 'Pair Bias (z_ij [128] → b_ij)',
    accentColor: '#9333ea',
    isAdaLN: false,
  },
  dit: {
    key: 'dit',
    title: 'Diffusion Transformer (DiT)',
    badgeText: 'Diffusion Transformer · 16 heads + AdaLN',
    headCountLabel: 'Head 1 … Head 16',
    dHeadLabel: 'd_head = 48 · 4 shown',
    channelLabel: 'c_a = 768',
    normLabel: 'AdaLN (γ, β)',
    normAggLabel: 'AdaLN: σ → γ, β',
    pairBiasLabel: 'Pair Bias (z_trunk → b_ij)',
    accentColor: '#e11d48',
    isAdaLN: true,
  },
}

export function resolveAttentionContext(
  stepId?: string | null,
  selectedBlockId?: string | null
): AttentionContextKey {
  if (selectedBlockId) {
    if (
      selectedBlockId === 'atom-attn-encoder-init' ||
      selectedBlockId === 'atom-attn-encoder-diff' ||
      selectedBlockId === 'ref-conformers'
    ) {
      return 'atom-enc'
    }
    if (selectedBlockId === 'msa-stack' || selectedBlockId === 'msa-embed') {
      return 'msa'
    }
    if (
      selectedBlockId === 'diffusion-transformer' ||
      selectedBlockId === 'atom-attn-decoder' ||
      selectedBlockId === 'diffusion-conditioning' ||
      selectedBlockId === 'denoised-coords'
    ) {
      return 'dit'
    }
    if (selectedBlockId === 'pairformer-single' || selectedBlockId === 'pairformer-pair') {
      return 'pairformer'
    }
  }

  switch (stepId) {
    case 'input-embedder':
      return 'atom-enc'
    case 'msa-module':
      return 'msa'
    case 'diffusion-module':
      return 'dit'
    case 'pairformer':
    default:
      return 'pairformer'
  }
}

interface AnimatedRibbon {
  curve: THREE.CatmullRomCurve3
  ribbonMat: THREE.MeshBasicMaterial
  beads: THREE.Mesh[]
  beadOffsets: number[]
  speed: number
  baseOpacity: number
}

export class DetailedAttentionView {
  public readonly group = new THREE.Group()
  private preset: AttentionContextPreset
  private isDark: boolean

  private readonly geometries: THREE.BufferGeometry[] = []
  private readonly materials: THREE.Material[] = []
  private readonly textures: THREE.Texture[] = []
  private readonly animatedRibbons: AnimatedRibbon[] = []
  private readonly beadGeo = new THREE.SphereGeometry(0.08, 8, 8)
  private readonly scratchPos = new THREE.Vector3()
  private elapsed = 0

  constructor(contextKey: AttentionContextKey, isDark: boolean) {
    this.preset = ATTENTION_PRESETS[contextKey]
    this.isDark = isDark
    this.build()
  }

  public rebuild(contextKey: AttentionContextKey, isDark: boolean) {
    this.clear()
    this.preset = ATTENTION_PRESETS[contextKey]
    this.isDark = isDark
    this.build()
  }

  private addSlab(
    pos: [number, number, number],
    size: [number, number, number],
    tex: THREE.Texture,
    edgeColor: number,
    label?: { text: string; offset?: [number, number, number]; scale?: number; subtitle?: string }
  ): THREE.Mesh {
    const geo = new THREE.BoxGeometry(size[0], size[1], size[2])
    const edges = new THREE.EdgesGeometry(geo)
    this.geometries.push(geo, edges)

    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      color: 0xffffff,
      roughness: 0.38,
      metalness: 0.06,
      transparent: true,
      opacity: 0.96,
    })
    this.materials.push(mat)

    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(pos[0], pos[1], pos[2])
    this.group.add(mesh)

    const lineMat = new THREE.LineBasicMaterial({
      color: edgeColor,
      transparent: true,
      opacity: this.isDark ? 0.52 : 0.48,
    })
    this.materials.push(lineMat)
    const wire = new THREE.LineSegments(edges, lineMat)
    mesh.add(wire)

    if (label) {
      const sprite = createLabelSprite(
        label.text,
        label.subtitle ?? '',
        this.preset.accentColor,
        this.isDark,
        !label.subtitle
      )
      if (sprite.material.map) this.textures.push(sprite.material.map)
      this.materials.push(sprite.material)
      const [ox, oy, oz] = label.offset ?? [0, size[1] / 2 + 0.55, 0]
      sprite.position.set(pos[0] + ox, pos[1] + oy, pos[2] + oz)
      const s = label.scale ?? 2.3
      const aspect = sprite.scale.y / sprite.scale.x
      sprite.scale.set(s, s * aspect, 1)
      sprite.renderOrder = 20
      sprite.material.depthTest = false
      this.group.add(sprite)
    }

    return mesh
  }

  private addRibbon(
    points: Array<[number, number, number]>,
    width: number,
    colorHex: number,
    opacity: number,
    beadCount = 2,
    speed = 0.38,
    edgeLabel?: { text: string; t?: number; offset?: [number, number, number] }
  ) {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p[0], p[1], p[2])))
    const totalLen = Math.max(0.5, curve.getLength())
    const headLen = Math.min(0.75, totalLen * 0.35)
    const shaftFrac = Math.max(0.2, (totalLen - headLen) / totalLen)
    const segments = 24

    const p0 = curve.getPointAt(0)
    const p1 = curve.getPointAt(1)
    const avgDir = p1.clone().sub(p0).normalize()
    const refNormal =
      Math.abs(avgDir.z) < 0.85 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0)

    const sideAt = (t: number) => {
      const tan = curve.getTangentAt(t).normalize()
      const s = new THREE.Vector3().crossVectors(tan, refNormal)
      return s.lengthSq() < 1e-6 ? new THREE.Vector3(1, 0, 0) : s.normalize()
    }

    const positions: number[] = []
    const indices: number[] = []
    const halfW = width / 2

    for (let i = 0; i <= segments; i++) {
      const t = (i / segments) * shaftFrac
      const pt = curve.getPointAt(t)
      const side = sideAt(t)
      const l = pt.clone().addScaledVector(side, halfW)
      const r = pt.clone().addScaledVector(side, -halfW)
      positions.push(l.x, l.y, l.z, r.x, r.y, r.z)
      if (i < segments) {
        const b = i * 2
        indices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2)
      }
    }

    const headBase = curve.getPointAt(shaftFrac)
    const headSide = sideAt(shaftFrac)
    const headHalf = width * 0.92
    const hl = headBase.clone().addScaledVector(headSide, headHalf)
    const hr = headBase.clone().addScaledVector(headSide, -headHalf)
    const tip = curve.getPointAt(1)
    const hbIdx = positions.length / 3
    positions.push(hl.x, hl.y, hl.z, hr.x, hr.y, hr.z, tip.x, tip.y, tip.z)
    indices.push(hbIdx, hbIdx + 1, hbIdx + 2)

    const ribbonGeo = new THREE.BufferGeometry()
    ribbonGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    ribbonGeo.setIndex(indices)
    ribbonGeo.computeVertexNormals()
    this.geometries.push(ribbonGeo)

    const ribbonMat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    this.materials.push(ribbonMat)

    const mesh = new THREE.Mesh(ribbonGeo, ribbonMat)
    mesh.renderOrder = 3
    this.group.add(mesh)

    const beads: THREE.Mesh[] = []
    const beadOffsets: number[] = []
    for (let i = 0; i < beadCount; i++) {
      const bMat = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.9,
      })
      this.materials.push(bMat)
      const bead = new THREE.Mesh(this.beadGeo, bMat)
      this.group.add(bead)
      beads.push(bead)
      beadOffsets.push(i / Math.max(1, beadCount))
    }

    if (edgeLabel) {
      const sprite = createEdgeLabelSprite(edgeLabel.text, colorHex, this.isDark)
      if (sprite.material.map) this.textures.push(sprite.material.map)
      this.materials.push(sprite.material)
      const pt = curve.getPointAt(edgeLabel.t ?? 0.5)
      const [ox, oy, oz] = edgeLabel.offset ?? [0, 0.55, 0]
      sprite.position.set(pt.x + ox, pt.y + oy, pt.z + oz)
      sprite.scale.set(2.9, 2.9 * 0.175, 1)
      sprite.renderOrder = 22
      sprite.material.depthTest = false
      this.group.add(sprite)
    }

    this.animatedRibbons.push({
      curve,
      ribbonMat,
      beads,
      beadOffsets,
      speed,
      baseOpacity: opacity,
    })
  }

  private build() {
    const p = this.preset
    const weightTex = createTensorMatrixTexture('transformer', '#64748b', this.isDark)
    const qkvTex = createTensorMatrixTexture('sequence', '#22c55e', this.isDark)
    const attnTex = createTensorMatrixTexture('pair', '#4ade80', this.isDark)
    const normTex = createTensorMatrixTexture(
      'sequence',
      p.isAdaLN ? '#e11d48' : '#22c55e',
      this.isDark
    )
    const biasTex = createTensorMatrixTexture('local-window', '#475569', this.isDark)
    const pairBiasTex = createTensorMatrixTexture('pair', '#818cf8', this.isDark)
    this.textures.push(weightTex, qkvTex, attnTex, normTex, biasTex, pairBiasTex)

    const sageRibbon = this.isDark ? 0x4ade80 : 0x22c55e
    const indigoRibbon = 0x818cf8
    const normColor = p.isAdaLN ? 0xe11d48 : 0x334155
    const sageOpacity = this.isDark ? 0.38 : 0.44
    const biasOpacity = this.isDark ? 0.44 : 0.48

    // 1. Far-Right Input Tensor & Vertical Residual Bus
    this.addSlab([12.2, 1.2, 0], [1.4, 5.2, 1.2], normTex, 0x334155, {
      text: 'Input Tensor',
      subtitle: p.channelLabel,
      offset: [0, 3.3, 0],
      scale: 2.9,
    })

    // Vertical Residual Bus on far right
    this.addRibbon(
      [
        [14.8, 6.2, 0],
        [14.8, 0.0, 0],
        [14.8, -6.2, 0],
      ],
      0.85,
      sageRibbon,
      sageOpacity,
      3,
      0.26,
      { text: 'Residual Bus', t: 0.25, offset: [0, 0.2, 0.5] }
    )
    this.addRibbon(
      [
        [13.0, 1.2, 0],
        [14.5, 1.2, 0],
      ],
      0.5,
      sageRibbon,
      sageOpacity,
      1,
      0.4
    )

    // 2. Normalization Column (LayerNorm or AdaLN) + γ, β + LN Agg
    this.addSlab([9.4, 0.6, 0], [1.5, 5.8, 0.9], normTex, normColor, {
      text: p.normLabel,
      offset: [0, 3.4, 0],
      scale: 2.6,
    })
    this.addSlab([9.4, 4.7, 0], [1.6, 0.45, 0.5], biasTex, 0xd97706, {
      text: p.normAggLabel,
      offset: [0, 0.65, 0],
      scale: 2.5,
    })
    this.addSlab([7.6, 0.6, 0], [0.22, 5.6, 0.28], biasTex, 0x475569, {
      text: 'γ',
      offset: [0, 3.2, 0],
      scale: 1.0,
    })
    this.addSlab([6.5, 0.6, 0], [0.22, 5.6, 0.28], biasTex, 0x475569, {
      text: 'β',
      offset: [0, 3.2, 0],
      scale: 1.0,
    })

    // Input -> Norm
    this.addRibbon(
      [
        [11.4, 1.2, 0],
        [10.2, 1.2, 0],
      ],
      0.52,
      sageRibbon,
      sageOpacity,
      1,
      0.45
    )

    // 3. Pair Bias Source Slab (top-center-right feeding into each head's Attention Matrix)
    this.addSlab([2.6, 4.8, -5.8], [2.4, 1.6, 0.35], pairBiasTex, indigoRibbon, {
      text: 'Pair Bias (z_ij)',
      subtitle: p.pairBiasLabel,
      offset: [0, 1.35, 0],
      scale: 3.0,
    })

    // 4. Four Parallel Fanned Attention Heads along Z
    const headZs = [-5.1, -1.7, 1.7, 5.1]
    headZs.forEach((hz, hIdx) => {
      const isFront = hIdx === headZs.length - 1
      const isBack = hIdx === 0
      const qY = 2.4
      const kY = 0.6
      const vY = -1.2

      // Thin vertical Q/K/V Bias bars
      this.addSlab(
        [-11.2, qY, hz],
        [0.16, 1.25, 0.16],
        biasTex,
        0x475569,
        isFront ? { text: 'Q Bias', offset: [0, 0.95, 0], scale: 1.55 } : undefined
      )
      this.addSlab(
        [-10.4, kY, hz],
        [0.16, 1.25, 0.16],
        biasTex,
        0x475569,
        isFront ? { text: 'K Bias', offset: [0, 0.95, 0], scale: 1.55 } : undefined
      )
      this.addSlab(
        [-9.6, vY, hz],
        [0.16, 1.25, 0.16],
        biasTex,
        0x475569,
        isFront ? { text: 'V Bias', offset: [0, 0.95, 0], scale: 1.55 } : undefined
      )

      // Q, K, V Weights slabs
      this.addSlab(
        [-6.6, qY, hz],
        [4.2, 1.2, 0.18],
        weightTex,
        0x475569,
        isFront || isBack ? { text: 'Q Weights', offset: [0, 0.9, 0], scale: 2.0 } : undefined
      )
      this.addSlab(
        [-6.6, kY, hz],
        [4.2, 1.2, 0.18],
        weightTex,
        0x475569,
        isFront ? { text: 'K Weights', offset: [0, 0.9, 0], scale: 2.0 } : undefined
      )
      this.addSlab(
        [-6.6, vY, hz],
        [4.2, 1.2, 0.18],
        weightTex,
        0x475569,
        isFront ? { text: 'V Weights', offset: [0, 0.9, 0], scale: 2.0 } : undefined
      )

      // Q, K, V vector slabs
      this.addSlab(
        [-2.2, qY, hz],
        [1.45, 1.25, 0.22],
        qkvTex,
        0x16a34a,
        isFront ? { text: 'Q vectors', offset: [0, 0.95, 0], scale: 1.9 } : undefined
      )
      this.addSlab(
        [-2.2, kY, hz],
        [1.45, 1.25, 0.22],
        qkvTex,
        0x16a34a,
        isFront ? { text: 'K vectors', offset: [0, 0.95, 0], scale: 1.9 } : undefined
      )
      this.addSlab(
        [-2.2, vY, hz],
        [1.45, 1.25, 0.22],
        qkvTex,
        0x16a34a,
        isFront ? { text: 'V vectors', offset: [0, 0.95, 0], scale: 1.9 } : undefined
      )

      // Attention Matrix (QK^T + b_ij) slab
      this.addSlab(
        [1.4, 1.4, hz],
        [1.8, 1.8, 0.24],
        attnTex,
        0x16a34a,
        isFront
          ? {
              text: 'Attention Matrix',
              subtitle: 'QKᵀ + b_ij',
              offset: [0, 1.35, 0],
              scale: 2.5,
            }
          : undefined
      )

      // Softmax slab
      this.addSlab(
        [1.4, -1.4, hz],
        [1.7, 1.3, 0.22],
        attnTex,
        0x16a34a,
        isFront ? { text: 'Softmax', offset: [0, -1.0, 0], scale: 1.85 } : undefined
      )

      // V Output slab
      this.addSlab(
        [4.2, -1.4, hz],
        [1.45, 1.35, 0.24],
        qkvTex,
        0x16a34a,
        isFront ? { text: 'V Output', offset: [0, -1.05, 0], scale: 1.9 } : undefined
      )

      // Ribbons within each head
      // LayerNorm -> Q/K/V vectors (fanning from Norm)
      this.addRibbon(
        [
          [8.6, 1.0, 0],
          [5.6, 2.2, hz * 0.6],
          [-1.3, qY, hz],
        ],
        0.34,
        sageRibbon,
        sageOpacity * 0.85,
        1,
        0.32
      )
      // Q/K -> Attention Matrix
      this.addRibbon(
        [
          [-1.4, qY, hz],
          [0.4, 1.6, hz],
        ],
        0.34,
        sageRibbon,
        sageOpacity,
        1,
        0.4
      )
      this.addRibbon(
        [
          [-1.4, kY, hz],
          [0.4, 1.2, hz],
        ],
        0.34,
        sageRibbon,
        sageOpacity,
        1,
        0.4
      )
      // Pair Bias -> Attention Matrix (wide translucent indigo ribbon!)
      this.addRibbon(
        [
          [2.6, 4.0, -5.5],
          [2.1, 3.0, hz * 0.7],
          [1.4, 2.35, hz],
        ],
        0.4,
        indigoRibbon,
        biasOpacity,
        1,
        0.36
      )
      // Attention Matrix -> Softmax -> V Output
      this.addRibbon(
        [
          [1.4, 0.45, hz],
          [1.4, -0.7, hz],
        ],
        0.38,
        sageRibbon,
        sageOpacity,
        1,
        0.42
      )
      this.addRibbon(
        [
          [2.3, -1.4, hz],
          [3.4, -1.4, hz],
        ],
        0.38,
        sageRibbon,
        sageOpacity,
        1,
        0.42
      )
      // V Output -> Projection Output
      this.addRibbon(
        [
          [4.2, -2.15, hz],
          [3.6, -4.4, hz * 0.5],
          [2.6, -5.8, 0.0],
        ],
        0.36,
        sageRibbon,
        sageOpacity * 0.9,
        1,
        0.35
      )
    })

    // 5. Bottom Output Projection & Residual Merge
    this.addSlab([-7.6, -6.0, 0], [0.22, 2.0, 0.25], biasTex, 0x475569, {
      text: 'Projection Bias',
      offset: [0, 1.35, 0],
      scale: 2.1,
    })
    this.addSlab([-3.6, -6.0, 0], [4.6, 2.0, 0.28], weightTex, 0x475569, {
      text: 'Projection Weights',
      offset: [0, 1.4, 0],
      scale: 2.5,
    })
    this.addSlab([2.6, -6.0, 0], [1.8, 2.0, 0.35], qkvTex, 0x16a34a, {
      text: 'Attention Output',
      offset: [0, -1.45, 0],
      scale: 2.5,
    })
    this.addSlab([10.5, -6.0, 0], [2.2, 2.0, 0.45], normTex, 0x16a34a, {
      text: 'Attention Residual',
      subtitle: '+ SwiGLU Transition',
      offset: [0, -1.55, 0],
      scale: 2.9,
    })

    // Projection Weights -> Attention Output -> Merge into Residual Bus -> Attention Residual
    this.addRibbon(
      [
        [-1.2, -6.0, 0],
        [1.6, -6.0, 0],
      ],
      0.52,
      sageRibbon,
      sageOpacity,
      1,
      0.42
    )
    this.addRibbon(
      [
        [3.6, -6.0, 0],
        [9.3, -6.0, 0],
      ],
      0.62,
      sageRibbon,
      sageOpacity,
      2,
      0.4
    )
    this.addRibbon(
      [
        [14.8, -6.0, 0],
        [11.7, -6.0, 0],
      ],
      0.65,
      sageRibbon,
      sageOpacity,
      2,
      0.4
    )

    // Head count summary tag at top-left
    const headSummary = createLabelSprite(
      p.headCountLabel,
      p.dHeadLabel,
      p.accentColor,
      this.isDark,
      false
    )
    if (headSummary.material.map) this.textures.push(headSummary.material.map)
    this.materials.push(headSummary.material)
    headSummary.position.set(-6.5, 4.8, 5.1)
    headSummary.scale.set(3.4, 3.4 * 0.26, 1)
    headSummary.renderOrder = 22
    headSummary.material.depthTest = false
    this.group.add(headSummary)
  }

  public update(dt: number, isFlowPlaying: boolean) {
    if (!isFlowPlaying) return
    this.elapsed += dt
    for (const r of this.animatedRibbons) {
      const pulse = 0.5 + 0.5 * Math.sin(this.elapsed * 3.0)
      r.ribbonMat.opacity = r.baseOpacity + 0.08 * pulse
      for (let i = 0; i < r.beads.length; i++) {
        r.beadOffsets[i] = (r.beadOffsets[i]! + dt * r.speed) % 1
        r.curve.getPointAt(r.beadOffsets[i]!, this.scratchPos)
        r.beads[i]!.position.copy(this.scratchPos)
      }
    }
  }

  private clear() {
    this.animatedRibbons.length = 0
    while (this.group.children.length > 0) {
      this.group.remove(this.group.children[0]!)
    }
    this.geometries.forEach(g => g.dispose())
    this.geometries.length = 0
    this.materials.forEach(m => m.dispose())
    this.materials.length = 0
    this.textures.forEach(t => t.dispose())
    this.textures.length = 0
  }

  public dispose() {
    this.clear()
    this.beadGeo.dispose()
  }
}
