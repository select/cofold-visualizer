import * as THREE from 'three'

interface AtomNode {
  folded: THREE.Vector3
  noisy: THREE.Vector3
  radius: number
  color: THREE.Color
}

interface BondEdge {
  a: number
  b: number
  isLigand: boolean
}

function seededRandom(seed: number): number {
  const x = Math.sin(seed * 91.345 + 17.123) * 47453.5453
  return x - Math.floor(x)
}

function gaussianLike(seed: number): number {
  const u1 = Math.max(1e-4, seededRandom(seed))
  const u2 = seededRandom(seed + 1009)
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}

export class MoleculeCloud {
  public readonly group = new THREE.Group()
  private readonly atoms: AtomNode[] = []
  private readonly bonds: BondEdge[] = []
  private readonly atomMesh: THREE.InstancedMesh
  private readonly bondMesh: THREE.InstancedMesh
  private readonly atomGeo: THREE.SphereGeometry
  private readonly atomMat: THREE.MeshStandardMaterial
  private readonly bondGeo: THREE.CylinderGeometry
  private readonly bondMat: THREE.MeshStandardMaterial
  private currentProgress = 0.8
  private targetProgress = 0.8

  private readonly dummy = new THREE.Object3D()
  private readonly tmpA = new THREE.Vector3()
  private readonly tmpB = new THREE.Vector3()
  private readonly tmpDir = new THREE.Vector3()
  private readonly upVec = new THREE.Vector3(0, 1, 0)

  constructor() {
    this.buildComplex()

    this.atomGeo = new THREE.SphereGeometry(1, 14, 12)
    this.atomMat = new THREE.MeshStandardMaterial({
      roughness: 0.28,
      metalness: 0.12,
    })
    this.atomMesh = new THREE.InstancedMesh(this.atomGeo, this.atomMat, this.atoms.length)
    this.atomMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)

    for (let i = 0; i < this.atoms.length; i++) {
      this.atomMesh.setColorAt(i, this.atoms[i]!.color)
    }
    if (this.atomMesh.instanceColor) {
      this.atomMesh.instanceColor.needsUpdate = true
    }

    this.bondGeo = new THREE.CylinderGeometry(0.04, 0.04, 1, 8)
    this.bondMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.4,
      metalness: 0.1,
      transparent: true,
      opacity: 0.85,
    })
    this.bondMesh = new THREE.InstancedMesh(this.bondGeo, this.bondMat, this.bonds.length)
    this.bondMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)

    this.group.add(this.atomMesh)
    this.group.add(this.bondMesh)
    this.applyInterpolation(this.currentProgress)
  }

  private buildComplex() {
    // 1. Alpha-helix (22 backbone/sidechain atoms)
    const helixColor = new THREE.Color('#3b82f6')
    const helixStartIdx = this.atoms.length
    for (let i = 0; i < 22; i++) {
      const t = i * 0.85
      const x = Math.cos(t) * 0.72 - 0.55
      const y = (i - 10.5) * 0.13
      const z = Math.sin(t) * 0.72 - 0.2
      this.atoms.push({
        folded: new THREE.Vector3(x, y, z),
        noisy: new THREE.Vector3(
          gaussianLike(i * 3 + 1) * 1.45,
          gaussianLike(i * 3 + 2) * 1.45,
          gaussianLike(i * 3 + 3) * 1.45
        ),
        radius: i % 3 === 0 ? 0.115 : 0.095,
        color: helixColor.clone().offsetHSL(0, 0, (i % 3) * 0.04),
      })
      if (i > 0) {
        this.bonds.push({ a: helixStartIdx + i - 1, b: helixStartIdx + i, isLigand: false })
      }
    }

    // 2. Beta-strand loop (16 atoms)
    const strandColor = new THREE.Color('#8b5cf6')
    const strandStartIdx = this.atoms.length
    for (let i = 0; i < 16; i++) {
      const u = i / 15
      const x = 0.25 + Math.sin(u * Math.PI) * 0.85
      const y = -1.1 + u * 2.2 + (i % 2 === 0 ? 0.08 : -0.08)
      const z = 0.45 + Math.cos(u * Math.PI * 1.5) * 0.35
      this.atoms.push({
        folded: new THREE.Vector3(x, y, z),
        noisy: new THREE.Vector3(
          gaussianLike(100 + i * 3 + 1) * 1.45,
          gaussianLike(100 + i * 3 + 2) * 1.45,
          gaussianLike(100 + i * 3 + 3) * 1.45
        ),
        radius: 0.095,
        color: strandColor.clone().offsetHSL(0, 0, (i % 2) * 0.05),
      })
      if (i > 0) {
        this.bonds.push({ a: strandStartIdx + i - 1, b: strandStartIdx + i, isLigand: false })
      }
    }

    // 3. Bound small-molecule ligand (6-membered aromatic ring + 3 substituent atoms)
    const ligandCarbon = new THREE.Color('#10b981')
    const ligandHetero = new THREE.Color('#f59e0b')
    const ligStartIdx = this.atoms.length
    const ringCenter = new THREE.Vector3(0.32, 0.05, 0.22)
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2
      const pos = new THREE.Vector3(
        ringCenter.x + Math.cos(ang) * 0.34,
        ringCenter.y + Math.sin(ang) * 0.34 * 0.7,
        ringCenter.z + Math.sin(ang) * 0.22
      )
      this.atoms.push({
        folded: pos,
        noisy: new THREE.Vector3(
          gaussianLike(200 + i * 3 + 1) * 1.5,
          gaussianLike(200 + i * 3 + 2) * 1.5,
          gaussianLike(200 + i * 3 + 3) * 1.5
        ),
        radius: 0.09,
        color: i === 0 || i === 3 ? ligandHetero : ligandCarbon,
      })
    }
    for (let i = 0; i < 6; i++) {
      this.bonds.push({ a: ligStartIdx + i, b: ligStartIdx + ((i + 1) % 6), isLigand: true })
    }
    // 3 substituent atoms on the ligand
    const subs: Array<[number, THREE.Vector3]> = [
      [1, new THREE.Vector3(0.74, 0.28, 0.35)],
      [4, new THREE.Vector3(-0.08, -0.26, 0.08)],
      [5, new THREE.Vector3(0.62, -0.32, 0.1)],
    ]
    subs.forEach(([parentOffset, pos], k) => {
      const idx = this.atoms.length
      this.atoms.push({
        folded: pos,
        noisy: new THREE.Vector3(
          gaussianLike(240 + k * 3 + 1) * 1.5,
          gaussianLike(240 + k * 3 + 2) * 1.5,
          gaussianLike(240 + k * 3 + 3) * 1.5
        ),
        radius: 0.085,
        color: k === 0 ? new THREE.Color('#ef4444') : ligandCarbon,
      })
      this.bonds.push({ a: ligStartIdx + parentOffset, b: idx, isLigand: true })
    })
  }

  public setDiffusionStep(step: number) {
    const clamped = Math.min(200, Math.max(0, step))
    // Non-linear EDM-like schedule curve so structure snaps cleanly in final steps
    const linear = clamped / 200
    this.targetProgress = Math.pow(linear, 1.35)
  }

  public update(deltaSeconds: number) {
    const diff = this.targetProgress - this.currentProgress
    if (Math.abs(diff) > 1e-4) {
      this.currentProgress += diff * Math.min(1, deltaSeconds * 8)
      this.applyInterpolation(this.currentProgress)
    }
    this.group.rotation.y += deltaSeconds * 0.32
  }

  private applyInterpolation(progress: number) {
    for (let i = 0; i < this.atoms.length; i++) {
      const atom = this.atoms[i]!
      this.tmpA.lerpVectors(atom.noisy, atom.folded, progress)
      this.dummy.position.copy(this.tmpA)
      this.dummy.rotation.set(0, 0, 0)
      this.dummy.scale.setScalar(atom.radius)
      this.dummy.updateMatrix()
      this.atomMesh.setMatrixAt(i, this.dummy.matrix)
    }
    this.atomMesh.instanceMatrix.needsUpdate = true

    if (progress < 0.35) {
      this.bondMesh.visible = false
      this.bondMat.opacity = 0
    } else {
      this.bondMesh.visible = true
      const fade = THREE.MathUtils.clamp((progress - 0.35) / 0.4, 0, 1)
      this.bondMat.opacity = 0.85 * fade
      const bondVisibility = THREE.MathUtils.clamp(fade, 0.1, 1)
      for (let i = 0; i < this.bonds.length; i++) {
        const bond = this.bonds[i]!
        const atomA = this.atoms[bond.a]!
        const atomB = this.atoms[bond.b]!
        this.tmpA.lerpVectors(atomA.noisy, atomA.folded, progress)
        this.tmpB.lerpVectors(atomB.noisy, atomB.folded, progress)

        this.tmpDir.subVectors(this.tmpB, this.tmpA)
        const len = Math.max(0.001, this.tmpDir.length())
        this.dummy.position.addVectors(this.tmpA, this.tmpB).multiplyScalar(0.5)
        this.dummy.quaternion.setFromUnitVectors(this.upVec, this.tmpDir.normalize())
        this.dummy.scale.set(bondVisibility, len, bondVisibility)
        this.dummy.updateMatrix()
        this.bondMesh.setMatrixAt(i, this.dummy.matrix)
      }
      this.bondMesh.instanceMatrix.needsUpdate = true
    }
  }

  public dispose() {
    this.atomGeo.dispose()
    this.atomMat.dispose()
    this.bondGeo.dispose()
    this.bondMat.dispose()
  }
}
