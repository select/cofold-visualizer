import cif5t35 from '~/assets/examples/5t35.cif?raw'
import cif7bea from '~/assets/examples/7BEA.cif?raw'
import cif7m16 from '~/assets/examples/7M16.cif?raw'
import cif8t6d from '~/assets/examples/8T6D.cif?raw'

export interface CifPreset {
  id: string
  pdbId: string
  name: string
  subtitle: string
  note: string
  cifText: string
}

export const CIF_PRESETS: CifPreset[] = [
  {
    id: '7bea',
    pdbId: '7BEA',
    name: 'Human PD-L1 Dimer + TK2 Inhibitor',
    subtitle: 'Chains A, B · Ligand TK2 (35 heavy atoms)',
    note: 'Immunoglobulin-like beta-sandwich dimer in complex with small-molecule PD-L1 inhibitor TK2.',
    cifText: cif7bea,
  },
  {
    id: '7m16',
    pdbId: '7M16',
    name: 'BET Bromodomain + YNS Inhibitor',
    subtitle: 'Chain A · Ligand YNS (triazole)',
    note: 'Canonical 4-helix bromodomain bundle bound to a triazole-based small-molecule inhibitor.',
    cifText: cif7m16,
  },
  {
    id: '5t35',
    pdbId: '5T35',
    name: 'PROTAC MZ1 Ternary Complex (BRD4–VHL–EloBC)',
    subtitle: 'Multi-chain · PROTAC MZ1 degrader',
    note: 'Ternary co-fold complex bridging the BRD4 bromodomain to the VHL–ElonginB–ElonginC E3 ligase via PROTAC MZ1.',
    cifText: cif5t35,
  },
  {
    id: '8t6d',
    pdbId: '8T6D',
    name: 'SHP2 Phosphatase + Allosteric Inhibitor',
    subtitle: 'Chains A, B · Spiro-amine inhibitor',
    note: 'Full-length SHP2 (PTP1D) dimer with alpha/beta domains bound to an allosteric spiro-amine inhibitor.',
    cifText: cif8t6d,
  },
]

export function getCifPresetById(id: string): CifPreset | undefined {
  return CIF_PRESETS.find(p => p.id === id)
}
