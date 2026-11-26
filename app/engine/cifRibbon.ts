import * as THREE from 'three'

export type SecondaryStructure = 'H' | 'E' | 'C'

export interface ResidueBackbone {
  chainId: string
  seqId: number
  compId: string
  ca: [number, number, number]
  carbonyl: [number, number, number]
  kind: SecondaryStructure
  plddt: number
}

export interface LigandAtom {
  element: string
  name: string
  compId: string
  asymId: string
  seqId: string
  pos: [number, number, number]
}

export interface LigandBond {
  a: number
  b: number
}

export interface ParsedCif {
  segments: ResidueBackbone[][]
  ligandAtoms: LigandAtom[]
  ligandBonds: LigandBond[]
}

export interface RibbonSample {
  point: [number, number, number]
  side: [number, number, number]
  normal: [number, number, number]
  width: number
  alpha: number
  kind: SecondaryStructure
  plddt: number
}

type Vec3 = [number, number, number]

function add3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

function sub3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

function mul3(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s]
}

function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function norm3(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2])
}

function cross3(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

function unit3(v: Vec3, fallback: Vec3): Vec3 {
  const n = norm3(v)
  return n > 1e-12 ? [v[0] / n, v[1] / n, v[2] / n] : fallback
}

function lerp3(a: Vec3, b: Vec3, t: number): Vec3 {
  const s = 1 - t
  return [a[0] * s + b[0] * t, a[1] * s + b[1] * t, a[2] * s + b[2] * t]
}

function perpendicular(tangent: Vec3): Vec3 {
  const ax = Math.abs(tangent[0])
  const ay = Math.abs(tangent[1])
  const az = Math.abs(tangent[2])
  const v: Vec3 = ax <= ay && ax <= az ? [1, 0, 0] : ay <= az ? [0, 1, 0] : [0, 0, 1]
  return unit3(sub3(v, mul3(tangent, dot3(v, tangent))), [1, 0, 0])
}

function gradient3(values: Vec3[], i: number): Vec3 {
  if (values.length < 2) return [0, 1, 0]
  if (i === 0) return sub3(values[1]!, values[0]!)
  if (i + 1 === values.length) return sub3(values[i]!, values[i - 1]!)
  return mul3(sub3(values[i + 1]!, values[i - 1]!), 0.5)
}

function gaussian3(values: Vec3[], sigma: number): Vec3[] {
  const n = values.length
  if (n === 0) return []
  const radius = Math.floor(4.0 * sigma + 0.5)
  const weights: number[] = []
  let sum = 0
  for (let i = -radius; i <= radius; i++) {
    const w = Math.exp(-0.5 * (i / sigma) ** 2)
    weights.push(w)
    sum += w
  }
  const out: Vec3[] = Array.from({ length: n })
  for (let i = 0; i < n; i++) {
    let x = 0
    let y = 0
    let z = 0
    for (let j = 0; j < weights.length; j++) {
      const k = Math.max(0, Math.min(n - 1, i + j - radius))
      const w = weights[j]! / sum
      const v = values[k]!
      x += v[0] * w
      y += v[1] * w
      z += v[2] * w
    }
    out[i] = [x, y, z]
  }
  return out
}

function gaussian1(values: number[], sigma: number): number[] {
  const n = values.length
  if (n === 0) return []
  const radius = Math.floor(4.0 * sigma + 0.5)
  const weights: number[] = []
  let sum = 0
  for (let i = -radius; i <= radius; i++) {
    const w = Math.exp(-0.5 * (i / sigma) ** 2)
    weights.push(w)
    sum += w
  }
  const out: number[] = Array.from({ length: n })
  for (let i = 0; i < n; i++) {
    let acc = 0
    for (let j = 0; j < weights.length; j++) {
      const k = Math.max(0, Math.min(n - 1, i + j - radius))
      acc += values[k]! * (weights[j]! / sum)
    }
    out[i] = acc
  }
  return out
}

/** Uniform-knot not-a-knot cubic spline for Vec3 (matches SciPy CubicSpline for n >= 4). */
class CubicSpline3 {
  private readonly values: Vec3[]
  private readonly second: Vec3[]

  constructor(values: Vec3[]) {
    this.values = values
    const n = values.length
    this.second = Array.from({ length: n }, () => [0, 0, 0] as Vec3)
    if (n < 4) return

    const m = n - 2
    const diag = new Float64Array(m).fill(4.0)
    const upper = new Float64Array(m).fill(1.0)
    const rhs: Vec3[] = Array.from({ length: m })
    for (let i = 1; i < n - 1; i++) {
      rhs[i - 1] = mul3(add3(sub3(values[i - 1]!, mul3(values[i]!, 2.0)), values[i + 1]!), 6.0)
    }
    diag[0] = 6.0
    diag[m - 1] = 6.0
    upper[0] = 0.0

    for (let i = 1; i < m; i++) {
      const lower = i + 1 === m ? 0.0 : 1.0
      const ratio = lower / diag[i - 1]!
      diag[i]! -= ratio * upper[i - 1]!
      rhs[i] = sub3(rhs[i]!, mul3(rhs[i - 1]!, ratio))
    }

    this.second[n - 2] = mul3(rhs[m - 1]!, 1.0 / diag[m - 1]!)
    for (let j = m - 2; j >= 0; j--) {
      this.second[j + 1] = mul3(sub3(rhs[j]!, mul3(this.second[j + 2]!, upper[j]!)), 1.0 / diag[j]!)
    }
    this.second[0] = sub3(mul3(this.second[1]!, 2.0), this.second[2]!)
    this.second[n - 1] = sub3(mul3(this.second[n - 2]!, 2.0), this.second[n - 3]!)
  }

  at(t: number): { value: Vec3; derivative: Vec3 } {
    const i = Math.min(Math.floor(t), this.values.length - 2)
    const b = Math.max(0, Math.min(1, t - i))
    const a = 1 - b
    const s0 = this.second[i]!
    const s1 = this.second[i + 1]!
    const correction = add3(mul3(s0, (a * a * a - a) / 6.0), mul3(s1, (b * b * b - b) / 6.0))
    const value = add3(lerp3(this.values[i]!, this.values[i + 1]!, b), correction)
    const derivative = add3(
      sub3(this.values[i + 1]!, this.values[i]!),
      add3(mul3(s0, (1.0 - 3.0 * a * a) / 6.0), mul3(s1, (3.0 * b * b - 1.0) / 6.0))
    )
    return { value, derivative }
  }
}

/** Shape-preserving cubic Hermite interpolation (PCHIP) at unit-spaced knots. */
class Pchip {
  private readonly values: number[]
  private readonly slopes: number[]

  constructor(values: number[]) {
    this.values = values
    const n = values.length
    this.slopes = Array.from({ length: n }, () => 0)
    if (n < 2) return
    if (n === 2) {
      const d = values[1]! - values[0]!
      this.slopes[0] = d
      this.slopes[1] = d
      return
    }

    const delta: number[] = Array.from({ length: n - 1 })
    for (let i = 0; i < n - 1; i++) {
      delta[i] = values[i + 1]! - values[i]!
    }
    const endpoint = (a: number, b: number) => {
      const d = (3.0 * a - b) * 0.5
      if (Math.sign(d) !== Math.sign(a)) return 0.0
      if (Math.sign(a) !== Math.sign(b) && Math.abs(d) > 3.0 * Math.abs(a)) return 3.0 * a
      return d
    }

    this.slopes[0] = endpoint(delta[0]!, delta[1]!)
    this.slopes[n - 1] = endpoint(delta[n - 2]!, delta[n - 3]!)
    for (let i = 1; i < n - 1; i++) {
      const a = delta[i - 1]!
      const b = delta[i]!
      if (a * b > 0.0) {
        this.slopes[i] = (2.0 * a * b) / (a + b)
      }
    }
  }

  at(t: number): number {
    const i = Math.min(Math.floor(t), this.values.length - 2)
    const s = Math.max(0, Math.min(1, t - i))
    const s2 = s * s
    const s3 = s2 * s
    return (
      (2.0 * s3 - 3.0 * s2 + 1.0) * this.values[i]! +
      (s3 - 2.0 * s2 + s) * this.slopes[i]! +
      (-2.0 * s3 + 3.0 * s2) * this.values[i + 1]! +
      (s3 - s2) * this.slopes[i + 1]!
    )
  }
}

/** Tokenize a single mmCIF line (handles single/double quotes and # comments). */
function tokenizeCifLine(line: string): string[] {
  const tokens: string[] = []
  let i = 0
  const len = line.length
  while (i < len) {
    while (i < len && (line[i] === ' ' || line[i] === '\t')) i++
    if (i >= len || line[i] === '#') break

    const ch = line[i]!
    if (ch === "'" || ch === '"') {
      const quote = ch
      i++
      const start = i
      while (i < len && line[i] !== quote) i++
      tokens.push(line.slice(start, i))
      if (i < len) i++
    } else {
      const start = i
      while (i < len && line[i] !== ' ' && line[i] !== '\t') i++
      tokens.push(line.slice(start, i))
    }
  }
  return tokens
}

function isPlaceholder(val: string | undefined): boolean {
  return !val || val === '.' || val === '?'
}

/**
 * Parse an mmCIF string into polymer backbone segments (split at chain boundaries
 * or CA-CA gaps > 4.5 Å) with secondary structure annotations and non-water ligands.
 */
export function parseMmCif(cifText: string): ParsedCif {
  const lines = cifText.split(/\r?\n/)
  const helices = new Map<string, Set<number>>()
  const sheets = new Map<string, Set<number>>()

  const markRange = (
    target: Map<string, Set<number>>,
    chain: string,
    begStr: string,
    endStr: string
  ) => {
    const beg = Number.parseInt(begStr, 10)
    const end = Number.parseInt(endStr, 10)
    if (!chain || Number.isNaN(beg) || Number.isNaN(end)) return
    let set = target.get(chain)
    if (!set) {
      set = new Set<number>()
      target.set(chain, set)
    }
    const lo = Math.min(beg, end)
    const hi = Math.max(beg, end)
    for (let s = lo; s <= hi; s++) set.add(s)
  }

  interface RawResidue {
    chainId: string
    seqId: number
    compId: string
    ca?: Vec3
    c?: Vec3
    o?: Vec3
    bFactor?: number
  }
  const residueMap = new Map<string, RawResidue>()
  const residueOrder: string[] = []
  const ligandAtoms: LigandAtom[] = []

  let i = 0
  while (i < lines.length) {
    const trimmed = lines[i]!.trim()
    if (trimmed === 'loop_') {
      i++
      const cols: string[] = []
      while (i < lines.length) {
        const colLine = lines[i]!.trim()
        if (colLine.startsWith('_')) {
          cols.push(colLine)
          i++
        } else {
          break
        }
      }

      const isStructConf = cols.length > 0 && cols[0]!.startsWith('_struct_conf.')
      const isSheetRange = cols.length > 0 && cols[0]!.startsWith('_struct_sheet_range.')
      const isAtomSite = cols.length > 0 && cols[0]!.startsWith('_atom_site.')

      if (!isStructConf && !isSheetRange && !isAtomSite) {
        // Skip uninteresting loop body
        while (i < lines.length) {
          const l = lines[i]!.trim()
          if (l === '' || l.startsWith('#')) {
            i++
            if (l.startsWith('#')) break
            continue
          }
          if (l.startsWith(';')) {
            i++
            while (i < lines.length && !lines[i]!.startsWith(';')) i++
            i++
            continue
          }
          if (
            l === 'loop_' ||
            l.startsWith('_') ||
            l.startsWith('data_') ||
            l.startsWith('save_')
          ) {
            break
          }
          i++
        }
        continue
      }

      const colIndex = new Map<string, number>()
      cols.forEach((c, idx) => colIndex.set(c, idx))

      const getVal = (row: string[], key: string): string => {
        const idx = colIndex.get(key)
        return idx !== undefined && idx < row.length ? row[idx]! : ''
      }

      let rowTokens: string[] = []
      while (i < lines.length) {
        const rawLine = lines[i]!
        const l = rawLine.trim()
        if (l === '' || l.startsWith('#')) {
          i++
          if (l.startsWith('#')) break
          continue
        }
        if (l.startsWith(';')) {
          let multi = rawLine.slice(1)
          i++
          while (i < lines.length && !lines[i]!.startsWith(';')) {
            multi += '\n' + lines[i]!
            i++
          }
          i++
          rowTokens.push(multi.trim())
        } else if (
          l === 'loop_' ||
          l.startsWith('_') ||
          l.startsWith('data_') ||
          l.startsWith('save_')
        ) {
          break
        } else {
          rowTokens.push(...tokenizeCifLine(rawLine))
          i++
        }

        while (rowTokens.length >= cols.length) {
          const row = rowTokens.slice(0, cols.length)
          rowTokens = rowTokens.slice(cols.length)

          if (isStructConf) {
            const confType = getVal(row, '_struct_conf.conf_type_id')
            if (confType.startsWith('HELX')) {
              const chain = !isPlaceholder(getVal(row, '_struct_conf.beg_label_asym_id'))
                ? getVal(row, '_struct_conf.beg_label_asym_id')
                : getVal(row, '_struct_conf.beg_auth_asym_id')
              const begSeq = !isPlaceholder(getVal(row, '_struct_conf.beg_label_seq_id'))
                ? getVal(row, '_struct_conf.beg_label_seq_id')
                : getVal(row, '_struct_conf.beg_auth_seq_id')
              const endSeq = !isPlaceholder(getVal(row, '_struct_conf.end_label_seq_id'))
                ? getVal(row, '_struct_conf.end_label_seq_id')
                : getVal(row, '_struct_conf.end_auth_seq_id')
              markRange(helices, chain, begSeq, endSeq)
            }
          } else if (isSheetRange) {
            const chain = !isPlaceholder(getVal(row, '_struct_sheet_range.beg_label_asym_id'))
              ? getVal(row, '_struct_sheet_range.beg_label_asym_id')
              : getVal(row, '_struct_sheet_range.beg_auth_asym_id')
            const begSeq = !isPlaceholder(getVal(row, '_struct_sheet_range.beg_label_seq_id'))
              ? getVal(row, '_struct_sheet_range.beg_label_seq_id')
              : getVal(row, '_struct_sheet_range.beg_auth_seq_id')
            const endSeq = !isPlaceholder(getVal(row, '_struct_sheet_range.end_label_seq_id'))
              ? getVal(row, '_struct_sheet_range.end_label_seq_id')
              : getVal(row, '_struct_sheet_range.end_auth_seq_id')
            markRange(sheets, chain, begSeq, endSeq)
          } else if (isAtomSite) {
            const model = getVal(row, '_atom_site.pdbx_PDB_model_num')
            if (model && model !== '1' && !isPlaceholder(model)) continue

            const altId = getVal(row, '_atom_site.label_alt_id')
            if (!isPlaceholder(altId) && altId !== 'A') continue

            const groupPdb = getVal(row, '_atom_site.group_PDB')
            const x = Number.parseFloat(getVal(row, '_atom_site.Cartn_x'))
            const y = Number.parseFloat(getVal(row, '_atom_site.Cartn_y'))
            const z = Number.parseFloat(getVal(row, '_atom_site.Cartn_z'))
            if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z)) continue

            const asymId = !isPlaceholder(getVal(row, '_atom_site.label_asym_id'))
              ? getVal(row, '_atom_site.label_asym_id')
              : getVal(row, '_atom_site.auth_asym_id')
            const compId = !isPlaceholder(getVal(row, '_atom_site.label_comp_id'))
              ? getVal(row, '_atom_site.label_comp_id')
              : getVal(row, '_atom_site.auth_comp_id')
            const atomId = !isPlaceholder(getVal(row, '_atom_site.label_atom_id'))
              ? getVal(row, '_atom_site.label_atom_id')
              : getVal(row, '_atom_site.auth_atom_id')

            if (groupPdb === 'ATOM') {
              if (atomId !== 'CA' && atomId !== 'C' && atomId !== 'O') continue
              const seqStr = !isPlaceholder(getVal(row, '_atom_site.label_seq_id'))
                ? getVal(row, '_atom_site.label_seq_id')
                : getVal(row, '_atom_site.auth_seq_id')
              const seqId = Number.parseInt(seqStr, 10)
              if (Number.isNaN(seqId)) continue

              const key = `${asymId}:${seqId}`
              let res = residueMap.get(key)
              if (!res) {
                res = { chainId: asymId, seqId, compId }
                residueMap.set(key, res)
                residueOrder.push(key)
              }
              const pos: Vec3 = [x, y, z]
              if (atomId === 'CA') {
                res.ca = pos
                const bVal = Number.parseFloat(getVal(row, '_atom_site.B_iso_or_equiv'))
                if (!Number.isNaN(bVal)) res.bFactor = bVal
              } else if (atomId === 'C') res.c = pos
              else if (atomId === 'O') res.o = pos
            } else if (groupPdb === 'HETATM') {
              if (compId === 'HOH' || compId === 'WAT' || compId === 'DOD') continue
              const element = getVal(row, '_atom_site.type_symbol').toUpperCase() || 'C'
              if (element === 'H' || element === 'D') continue
              const seqStr = !isPlaceholder(getVal(row, '_atom_site.auth_seq_id'))
                ? getVal(row, '_atom_site.auth_seq_id')
                : getVal(row, '_atom_site.label_seq_id')
              ligandAtoms.push({
                element,
                name: atomId,
                compId,
                asymId,
                seqId: seqStr || '1',
                pos: [x, y, z],
              })
            }
          }
        }
      }
      continue
    }
    i++
  }

  // Determine whether B_iso_or_equiv stores pLDDT (0-100, max > 70) or crystallographic B-factors
  let maxB = 0
  for (const key of residueOrder) {
    const b = residueMap.get(key)?.bFactor
    if (b !== undefined && b > maxB) maxB = b
  }
  const isRawPlddt = maxB > 70

  // Split polymer chains at chain boundaries or CA-CA gaps > 4.5 Å
  const segments: ResidueBackbone[][] = []
  let current: ResidueBackbone[] = []

  for (const key of residueOrder) {
    const raw = residueMap.get(key)!
    if (!raw.ca) continue

    const isHelix = helices.get(raw.chainId)?.has(raw.seqId) ?? false
    const isSheet = sheets.get(raw.chainId)?.has(raw.seqId) ?? false
    const kind: SecondaryStructure = isHelix ? 'H' : isSheet ? 'E' : 'C'
    const carbonyl: Vec3 = raw.c && raw.o ? sub3(raw.o, raw.c) : [0, 0, 0]
    const b = raw.bFactor ?? 75
    const plddt = isRawPlddt
      ? Math.max(0, Math.min(100, b))
      : Math.max(38, Math.min(97, 118 - b * 1.15))

    const residue: ResidueBackbone = {
      chainId: raw.chainId,
      seqId: raw.seqId,
      compId: raw.compId,
      ca: raw.ca,
      carbonyl,
      kind,
      plddt,
    }

    if (current.length > 0) {
      const prev = current[current.length - 1]!
      const dist = norm3(sub3(residue.ca, prev.ca))
      if (prev.chainId !== residue.chainId || dist > 4.5) {
        if (current.length >= 4) segments.push(current)
        current = []
      }
    }
    current.push(residue)
  }
  if (current.length >= 4) segments.push(current)

  // Compute covalent bonds for ligand atoms within 1.9 Å (same asymId + seqId)
  const ligandBonds: LigandBond[] = []
  const maxBondSq = 1.9 * 1.9
  const minBondSq = 0.4 * 0.4
  for (let a = 0; a < ligandAtoms.length; a++) {
    const atomA = ligandAtoms[a]!
    for (let b = a + 1; b < ligandAtoms.length; b++) {
      const atomB = ligandAtoms[b]!
      if (atomA.asymId !== atomB.asymId || atomA.seqId !== atomB.seqId) continue
      const dx = atomA.pos[0] - atomB.pos[0]
      const dy = atomA.pos[1] - atomB.pos[1]
      const dz = atomA.pos[2] - atomB.pos[2]
      const d2 = dx * dx + dy * dy + dz * dz
      if (d2 >= minBondSq && d2 <= maxBondSq) {
        ligandBonds.push({ a, b })
      }
    }
  }

  return { segments, ligandAtoms, ligandBonds }
}

/**
 * Port of ribbon.rs `make_ribbon`: Gaussian-smoothed CA backbone, carbonyl O-C
 * side-frame projection with sign-flip continuity, secondary-structure widths with
 * beta-strand arrowhead taper, and cubic/PCHIP spline interpolation.
 */
export function makeRibbonSamples(
  segment: ResidueBackbone[],
  samplesPerResidue = 8
): RibbonSample[] {
  const n = segment.length
  if (n < 4) return []

  const ca = segment.map(r => r.ca)
  const centers = gaussian3(ca, 0.55)
  const sides: Vec3[] = Array.from({ length: n })

  for (let i = 0; i < n; i++) {
    const residue = segment[i]!
    const tangent = unit3(gradient3(centers, i), unit3(gradient3(ca, i), [0, 1, 0]))
    const projected = sub3(residue.carbonyl, mul3(tangent, dot3(residue.carbonyl, tangent)))
    const previous = i > 0 ? sides[i - 1]! : perpendicular(tangent)
    const fallback = unit3(
      sub3(previous, mul3(tangent, dot3(previous, tangent))),
      perpendicular(tangent)
    )
    let side = norm3(projected) < 1e-8 ? fallback : unit3(projected, fallback)
    if (i > 0 && dot3(sides[i - 1]!, side) < 0) {
      side = mul3(side, -1)
    }
    sides[i] = side
  }

  const smoothedSides = gaussian3(sides, 0.8)
  const kinds = segment.map(r => r.kind)
  const rawWidths: number[] = kinds.map(k => (k === 'H' ? 1.15 : k === 'E' ? 1.35 : 0.2))

  // Beta-strand arrowhead shoulder & tip taper
  for (let i = 0; i < n; i++) {
    if (kinds[i] === 'E' && (i + 1 === n || kinds[i + 1] !== 'E')) {
      rawWidths[i] = 0.06
      if (i > 0 && kinds[i - 1] === 'E') {
        rawWidths[i - 1] = 2.0
      }
    }
  }

  const widths = gaussian1(rawWidths, 0.75)
  widths[0] = 0.08
  widths[n - 1] = 0.08

  const loopValues = gaussian1(
    kinds.map(k => (k === 'C' ? 1.0 : 0.0)),
    1.15
  )

  const centerSpline = new CubicSpline3(centers)
  const sideSpline = new CubicSpline3(smoothedSides)
  const widthSpline = new Pchip(widths)
  const loopSpline = new Pchip(loopValues)

  const plddtSpline = new Pchip(segment.map(r => r.plddt))

  const count = (n - 1) * samplesPerResidue + 1
  const result: RibbonSample[] = Array.from({ length: count })
  let previousTangent = unit3(sub3(ca[1]!, ca[0]!), [0, 1, 0])

  for (let i = 0; i < count; i++) {
    const t = i / samplesPerResidue
    const { value: point, derivative } = centerSpline.at(t)
    const tangent = unit3(derivative, previousTangent)
    previousTangent = tangent

    const { value: rawSide } = sideSpline.at(t)
    const projected = sub3(rawSide, mul3(tangent, dot3(rawSide, tangent)))
    const previous = i > 0 ? result[i - 1]!.side : perpendicular(tangent)
    const fallback = unit3(
      sub3(previous, mul3(tangent, dot3(previous, tangent))),
      perpendicular(tangent)
    )
    let side = unit3(projected, fallback)
    if (dot3(side, previous) < 0) {
      side = mul3(side, -1)
    }
    const normal = unit3(cross3(tangent, side), [0, 0, 1])

    const rawAlpha = Math.max(0, Math.min(1, loopSpline.at(t)))
    const alpha = rawAlpha * rawAlpha * (3 - 2 * rawAlpha)
    const nearestIdx = Math.max(0, Math.min(n - 1, Math.round(t)))

    result[i] = {
      point,
      side,
      normal,
      width: Math.max(0.04, widthSpline.at(t)),
      alpha,
      kind: kinds[nearestIdx]!,
      plddt: Math.max(0, Math.min(100, plddtSpline.at(t))),
    }
  }

  return result
}

/** Canonical AlphaFold / OpenFold3 pLDDT confidence color bands. */
export const PLDDT_COLORS = {
  veryHigh: '#0053d6', // > 90
  confident: '#65cbf3', // 70 - 90
  low: '#ffdb13', // 50 - 70
  veryLow: '#ff7d45', // < 50
} as const

export function plddtToCss(score: number): string {
  if (score >= 90) return PLDDT_COLORS.veryHigh
  if (score >= 70) return PLDDT_COLORS.confident
  if (score >= 50) return PLDDT_COLORS.low
  return PLDDT_COLORS.veryLow
}

export function plddtToColor(score: number, out = new THREE.Color()): THREE.Color {
  return out.set(plddtToCss(score))
}

const ELEMENT_COLORS: Record<string, number> = {
  C: 0x10b981, // Emerald green for ligand carbons so bound ligand stands out
  N: 0x3b82f6, // Blue
  O: 0xef4444, // Red
  S: 0xeab308, // Yellow
  P: 0xf97316, // Orange
  F: 0x22d3ee, // Cyan
  CL: 0x22c55e, // Green
  BR: 0xa855f7, // Purple
  I: 0x9333ea, // Violet
}

/**
 * Extrude all polymer ribbon segments into a single indexed THREE.BufferGeometry
 * with smooth vertex normals and secondary-structure vertex colors.
 */
export function buildRibbonGeometry(
  segments: ResidueBackbone[][],
  samplesPerResidue = 8,
  profileSegments = 8
): THREE.BufferGeometry {
  const positions: number[] = []
  const colors: number[] = []
  const indices: number[] = []

  const tmpColor = new THREE.Color()

  for (const segment of segments) {
    const samples = makeRibbonSamples(segment, samplesPerResidue)
    if (samples.length < 2) continue

    const baseVertex = positions.length / 3
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i]!
      const rx = s.width * 0.68
      const ry = 0.16 + (rx - 0.16) * s.alpha

      plddtToColor(s.plddt, tmpColor)

      for (let k = 0; k < profileSegments; k++) {
        const theta = (k / profileSegments) * Math.PI * 2
        const cosT = Math.cos(theta) * rx
        const sinT = Math.sin(theta) * ry
        positions.push(
          s.point[0] + s.side[0] * cosT + s.normal[0] * sinT,
          s.point[1] + s.side[1] * cosT + s.normal[1] * sinT,
          s.point[2] + s.side[2] * cosT + s.normal[2] * sinT
        )
        colors.push(tmpColor.r, tmpColor.g, tmpColor.b)
      }
    }

    // Side quads between consecutive cross-section rings
    for (let i = 0; i < samples.length - 1; i++) {
      const r0 = baseVertex + i * profileSegments
      const r1 = baseVertex + (i + 1) * profileSegments
      for (let k = 0; k < profileSegments; k++) {
        const kNext = (k + 1) % profileSegments
        const a = r0 + k
        const b = r0 + kNext
        const c = r1 + kNext
        const d = r1 + k
        indices.push(a, b, c, a, c, d)
      }
    }

    // Start and end caps
    const first = samples[0]!
    const startCapIdx = positions.length / 3
    positions.push(first.point[0], first.point[1], first.point[2])
    plddtToColor(first.plddt, tmpColor)
    colors.push(tmpColor.r, tmpColor.g, tmpColor.b)
    for (let k = 0; k < profileSegments; k++) {
      const kNext = (k + 1) % profileSegments
      indices.push(startCapIdx, baseVertex + kNext, baseVertex + k)
    }

    const last = samples[samples.length - 1]!
    const endCapIdx = positions.length / 3
    const lastRing = baseVertex + (samples.length - 1) * profileSegments
    positions.push(last.point[0], last.point[1], last.point[2])
    plddtToColor(last.plddt, tmpColor)
    colors.push(tmpColor.r, tmpColor.g, tmpColor.b)
    for (let k = 0; k < profileSegments; k++) {
      const kNext = (k + 1) % profileSegments
      indices.push(endCapIdx, lastRing + k, lastRing + kNext)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

export interface CifComplexResult {
  /** Centered and uniformly scaled group ready to mount inside the cif-structure frame. */
  complexGroup: THREE.Group
  ribbonGeometry: THREE.BufferGeometry
  geometries: THREE.BufferGeometry[]
  materials: Array<THREE.MeshStandardMaterial>
  parsed: ParsedCif
}

/**
 * Build a centered, uniformly scaled 3D protein ribbon + ball-and-stick ligand
 * group from an mmCIF string, sized to fit inside the 2.6 × 2.6 × 2.2 frame.
 */
export function buildCifComplex(
  cifText: string,
  options: {
    maxXY?: number
    maxZ?: number
    isDark?: boolean
  } = {}
): CifComplexResult {
  const maxXY = options.maxXY ?? 2.1
  const maxZ = options.maxZ ?? 1.85
  const isDark = options.isDark ?? false

  const parsed = parseMmCif(cifText)
  const ribbonGeometry = buildRibbonGeometry(parsed.segments)

  const geometries: THREE.BufferGeometry[] = [ribbonGeometry]
  const materials: THREE.MeshStandardMaterial[] = []

  const ribbonMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.34,
    metalness: 0.08,
    transparent: true,
    opacity: 0.96,
  })
  materials.push(ribbonMat)

  const innerGroup = new THREE.Group()
  const ribbonMesh = new THREE.Mesh(ribbonGeometry, ribbonMat)
  innerGroup.add(ribbonMesh)

  // Bound ligand ball-and-stick representation
  if (parsed.ligandAtoms.length > 0) {
    const atomGeo = new THREE.SphereGeometry(0.32, 12, 12)
    const bondGeo = new THREE.CylinderGeometry(0.11, 0.11, 1, 8)
    geometries.push(atomGeo, bondGeo)

    const elementMats = new Map<string, THREE.MeshStandardMaterial>()
    const getElementMat = (el: string) => {
      let mat = elementMats.get(el)
      if (!mat) {
        const color = ELEMENT_COLORS[el] ?? 0x94a3b8
        mat = new THREE.MeshStandardMaterial({
          color,
          roughness: 0.25,
          metalness: 0.15,
          transparent: true,
          opacity: 0.98,
        })
        elementMats.set(el, mat)
        materials.push(mat)
      }
      return mat
    }

    const bondMat = new THREE.MeshStandardMaterial({
      color: isDark ? 0xcbd5e1 : 0x475569,
      roughness: 0.4,
      metalness: 0.15,
      transparent: true,
      opacity: 0.95,
    })
    materials.push(bondMat)

    const ligandGroup = new THREE.Group()
    for (const atom of parsed.ligandAtoms) {
      const sphere = new THREE.Mesh(atomGeo, getElementMat(atom.element))
      sphere.position.set(atom.pos[0], atom.pos[1], atom.pos[2])
      ligandGroup.add(sphere)
    }

    const up = new THREE.Vector3(0, 1, 0)
    const vecA = new THREE.Vector3()
    const vecB = new THREE.Vector3()
    const dir = new THREE.Vector3()
    for (const bond of parsed.ligandBonds) {
      const atomA = parsed.ligandAtoms[bond.a]!
      const atomB = parsed.ligandAtoms[bond.b]!
      vecA.set(atomA.pos[0], atomA.pos[1], atomA.pos[2])
      vecB.set(atomB.pos[0], atomB.pos[1], atomB.pos[2])
      dir.subVectors(vecB, vecA)
      const len = dir.length()
      if (len < 1e-4) continue
      const cyl = new THREE.Mesh(bondGeo, bondMat)
      cyl.position.copy(vecA).lerp(vecB, 0.5)
      cyl.scale.set(1, len, 1)
      cyl.quaternion.setFromUnitVectors(up, dir.normalize())
      ligandGroup.add(cyl)
    }

    innerGroup.add(ligandGroup)
  }

  // Center and uniformly scale complex to fit cleanly inside the 2.6 x 2.6 x 2.2 box
  const box = new THREE.Box3()
  ribbonGeometry.computeBoundingBox()
  if (ribbonGeometry.boundingBox) {
    box.union(ribbonGeometry.boundingBox)
  }
  for (const atom of parsed.ligandAtoms) {
    box.expandByPoint(new THREE.Vector3(atom.pos[0], atom.pos[1], atom.pos[2]))
  }

  const center = new THREE.Vector3()
  const size = new THREE.Vector3()
  if (!box.isEmpty()) {
    box.getCenter(center)
    box.getSize(size)
  }
  const scale = Math.min(
    size.x > 1e-4 ? maxXY / size.x : 1,
    size.y > 1e-4 ? maxXY / size.y : 1,
    size.z > 1e-4 ? maxZ / size.z : 1
  )

  innerGroup.scale.setScalar(scale)
  innerGroup.position.set(-center.x * scale, -center.y * scale, -center.z * scale)

  const complexGroup = new THREE.Group()
  complexGroup.add(innerGroup)

  return {
    complexGroup,
    ribbonGeometry,
    geometries,
    materials,
    parsed,
  }
}
