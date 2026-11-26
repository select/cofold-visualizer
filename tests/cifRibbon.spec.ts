import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import sampleCifText from '~/assets/examples/7BEA.cif?raw'
import {
  buildCifComplex,
  buildRibbonGeometry,
  makeRibbonSamples,
  parseMmCif,
  PLDDT_COLORS,
  plddtToCss,
} from '~/engine/cifRibbon'

describe('cifRibbon', () => {
  it('parses 7BEA.cif chains, helices, sheets, and TK2 ligand without waters', () => {
    const parsed = parseMmCif(sampleCifText)

    expect(parsed.segments.length).toBeGreaterThanOrEqual(2)
    const chainIds = new Set(parsed.segments.map(seg => seg[0]!.chainId))
    expect(chainIds.has('A')).toBe(true)
    expect(chainIds.has('B')).toBe(true)

    const allResidues = parsed.segments.flat()
    const helixCount = allResidues.filter(r => r.kind === 'H').length
    const sheetCount = allResidues.filter(r => r.kind === 'E').length
    const coilCount = allResidues.filter(r => r.kind === 'C').length
    expect(helixCount).toBeGreaterThan(20)
    expect(sheetCount).toBeGreaterThan(80)
    expect(coilCount).toBeGreaterThan(40)

    // TK2 has 35 heavy atoms; HOH waters must be excluded
    expect(parsed.ligandAtoms).toHaveLength(35)
    expect(parsed.ligandAtoms.every(a => a.compId === 'TK2')).toBe(true)
    expect(parsed.ligandBonds.length).toBeGreaterThanOrEqual(35)
  })

  it('splits polymer segments at CA-CA gaps > 4.5 A', () => {
    const syntheticCif = `
data_test
loop_
_atom_site.group_PDB
_atom_site.id
_atom_site.type_symbol
_atom_site.label_atom_id
_atom_site.label_alt_id
_atom_site.label_comp_id
_atom_site.label_asym_id
_atom_site.label_seq_id
_atom_site.Cartn_x
_atom_site.Cartn_y
_atom_site.Cartn_z
ATOM 1 C CA . ALA A 1 0.0 0.0 0.0
ATOM 2 C CA . ALA A 2 3.8 0.0 0.0
ATOM 3 C CA . ALA A 3 7.6 0.0 0.0
ATOM 4 C CA . ALA A 4 11.4 0.0 0.0
ATOM 5 C CA . ALA A 5 20.0 0.0 0.0
ATOM 6 C CA . ALA A 6 23.8 0.0 0.0
ATOM 7 C CA . ALA A 7 27.6 0.0 0.0
ATOM 8 C CA . ALA A 8 31.4 0.0 0.0
`
    const parsed = parseMmCif(syntheticCif)
    expect(parsed.segments).toHaveLength(2)
    expect(parsed.segments[0]).toHaveLength(4)
    expect(parsed.segments[1]).toHaveLength(4)
  })

  it('generates smooth ribbon samples with continuous side frames and beta arrowhead taper', () => {
    const parsed = parseMmCif(sampleCifText)
    const samples = makeRibbonSamples(parsed.segments[0]!, 8)
    expect(samples.length).toBeGreaterThan(100)

    for (let i = 0; i < samples.length; i++) {
      const s = samples[i]!
      const sideLen = Math.hypot(s.side[0], s.side[1], s.side[2])
      const normLen = Math.hypot(s.normal[0], s.normal[1], s.normal[2])
      expect(sideLen).toBeCloseTo(1, 5)
      expect(normLen).toBeCloseTo(1, 5)
      expect(s.width).toBeGreaterThanOrEqual(0.04)
      expect(Number.isFinite(s.alpha)).toBe(true)

      if (i > 0) {
        const prev = samples[i - 1]!
        const dot = prev.side[0] * s.side[0] + prev.side[1] * s.side[1] + prev.side[2] * s.side[2]
        expect(dot).toBeGreaterThan(0.5)
      }
    }
  })

  it('builds a valid indexed BufferGeometry with positions, normals, and vertex colors', () => {
    const parsed = parseMmCif(sampleCifText)
    const geo = buildRibbonGeometry(parsed.segments)

    const pos = geo.getAttribute('position')
    const norm = geo.getAttribute('normal')
    const color = geo.getAttribute('color')
    const index = geo.getIndex()

    expect(pos).toBeDefined()
    expect(norm).toBeDefined()
    expect(color).toBeDefined()
    expect(index).toBeDefined()
    expect(pos.count).toBeGreaterThan(1000)
    expect(index!.count).toBeGreaterThan(3000)

    for (let i = 0; i < Math.min(pos.array.length, 300); i++) {
      expect(Number.isFinite(pos.array[i])).toBe(true)
      expect(Number.isFinite(norm.array[i])).toBe(true)
      expect(Number.isFinite(color.array[i])).toBe(true)
    }

    geo.dispose()
  })

  it('centers and scales the 7BEA complex to fill the 6.2 x 5.8 x 5.4 cif-structure frame', () => {
    const result = buildCifComplex(sampleCifText, { maxXY: 5.5, maxZ: 5.0, isDark: true })

    expect(result.geometries.length).toBeGreaterThanOrEqual(3)
    expect(result.materials.length).toBeGreaterThanOrEqual(3)

    result.complexGroup.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(result.complexGroup)
    const center = new THREE.Vector3()
    const size = new THREE.Vector3()
    box.getCenter(center)
    box.getSize(size)

    expect(Math.abs(center.x)).toBeLessThan(0.05)
    expect(Math.abs(center.y)).toBeLessThan(0.05)
    expect(Math.abs(center.z)).toBeLessThan(0.05)
    expect(size.x).toBeLessThanOrEqual(5.65)
    expect(size.y).toBeLessThanOrEqual(5.65)
    expect(size.z).toBeLessThanOrEqual(5.15)
    expect(Math.max(size.x, size.y, size.z)).toBeGreaterThan(4.4)

    result.geometries.forEach(g => g.dispose())
    result.materials.forEach(m => m.dispose())
  })

  it('maps pLDDT scores to canonical AlphaFold color bands', () => {
    expect(plddtToCss(95)).toBe(PLDDT_COLORS.veryHigh)
    expect(plddtToCss(82)).toBe(PLDDT_COLORS.confident)
    expect(plddtToCss(60)).toBe(PLDDT_COLORS.low)
    expect(plddtToCss(35)).toBe(PLDDT_COLORS.veryLow)
  })
})
