import type { InputSourceId, InputSourceSpec } from '~/types/architecture'

export const INPUT_SOURCES: Record<InputSourceId, InputSourceSpec> = {
  'dna-sequence': {
    id: 'dna-sequence',
    label: 'DNA Coding Sequence',
    shortLabel: 'DNA',
    subtitle: 'Double-stranded DNA → mRNA → Amino Acid translation & nucleotide tokens',
    targetBlockId: 'input-features',
    color: '#3b82f6',
    formatBadge: 'FASTA / Codons',
    description:
      'OpenFold3 can either tokenize nucleic acid chains directly (A/C/G/T/U tokens) or ingest translated polypeptide chains encoded by coding DNA (3 nucleotides per amino acid codon).',
  },
  'protein-sequence': {
    id: 'protein-sequence',
    label: 'Protein Amino Acid Sequence',
    shortLabel: 'Protein Seq',
    subtitle: 'Polypeptide residue sequence → 32-class restype & token features',
    targetBlockId: 'input-features',
    color: '#22c55e',
    formatBadge: 'FASTA / AA',
    description:
      'Each amino acid residue in the translated protein chain becomes one token in f_token ∈ ℝ^{N_token × 65} via a 32-dim restype one-hot encoding, 32-dim MSA profile, and deletion_mean.',
  },
  'small-molecule': {
    id: 'small-molecule',
    label: 'Small Molecule Ligand (SMILES)',
    shortLabel: 'Small Molecule',
    subtitle: 'SMILES graph → RDKit 3D conformer & atomic bond topology',
    targetBlockId: 'ref-conformers',
    color: '#0ea5e9',
    formatBadge: 'SMILES / CCD',
    description:
      'Small-molecule ligands are parsed from SMILES strings (or CCD codes) into heavy-atom graphs, embedded with RDKit 3D reference coordinates (ref_pos), element types (ref_element), formal charges, and covalent bonds.',
  },
  'msa-a3m': {
    id: 'msa-a3m',
    label: 'Multiple Sequence Alignment (.a3m)',
    shortLabel: 'MSA (.a3m)',
    subtitle: 'A3M homologous alignment → MSA subsampling & deletion features',
    targetBlockId: 'msa-embedder',
    color: '#06b6d4',
    formatBadge: '.a3m',
    description:
      'A3M files store evolutionary homologs compactly: uppercase letters align to query columns (N_token), lowercase letters represent insertions (collapsed into deletion counts), and dashes (-) represent gaps.',
  },
}

export function getInputSourceById(id: InputSourceId): InputSourceSpec {
  return INPUT_SOURCES[id]
}

export interface CodonTranslation {
  index: number
  dnaCodon: string
  complementCodon: string
  rnaCodon: string
  aa1: string
  aa3: string
  name: string
  group: 'hydrophobic' | 'polar' | 'positive' | 'negative'
  color: string
}

export const DNA_TRANSLATION_CODONS: CodonTranslation[] = [
  {
    index: 1,
    dnaCodon: 'ATG',
    complementCodon: 'TAC',
    rnaCodon: 'AUG',
    aa1: 'M',
    aa3: 'Met',
    name: 'Methionine (Start)',
    group: 'hydrophobic',
    color: '#eab308',
  },
  {
    index: 2,
    dnaCodon: 'GCT',
    complementCodon: 'CGA',
    rnaCodon: 'GCU',
    aa1: 'A',
    aa3: 'Ala',
    name: 'Alanine',
    group: 'hydrophobic',
    color: '#f97316',
  },
  {
    index: 3,
    dnaCodon: 'AGC',
    complementCodon: 'TCG',
    rnaCodon: 'AGC',
    aa1: 'S',
    aa3: 'Ser',
    name: 'Serine',
    group: 'polar',
    color: '#22c55e',
  },
  {
    index: 4,
    dnaCodon: 'AAA',
    complementCodon: 'TTT',
    rnaCodon: 'AAA',
    aa1: 'K',
    aa3: 'Lys',
    name: 'Lysine',
    group: 'positive',
    color: '#3b82f6',
  },
  {
    index: 5,
    dnaCodon: 'CTG',
    complementCodon: 'GAC',
    rnaCodon: 'CUG',
    aa1: 'L',
    aa3: 'Leu',
    name: 'Leucine',
    group: 'hydrophobic',
    color: '#eab308',
  },
  {
    index: 6,
    dnaCodon: 'TTT',
    complementCodon: 'AAA',
    rnaCodon: 'UUU',
    aa1: 'F',
    aa3: 'Phe',
    name: 'Phenylalanine',
    group: 'hydrophobic',
    color: '#a855f7',
  },
  {
    index: 7,
    dnaCodon: 'GGC',
    complementCodon: 'CCG',
    rnaCodon: 'GGC',
    aa1: 'G',
    aa3: 'Gly',
    name: 'Glycine',
    group: 'polar',
    color: '#06b6d4',
  },
  {
    index: 8,
    dnaCodon: 'GAT',
    complementCodon: 'CTA',
    rnaCodon: 'GAU',
    aa1: 'D',
    aa3: 'Asp',
    name: 'Aspartate',
    group: 'negative',
    color: '#ef4444',
  },
]

export interface SmilesPreset {
  id: string
  name: string
  medicalUse: string
  formula: string
  smiles: string
  note: string
}

export const SMILES_PRESETS: SmilesPreset[] = [
  {
    id: 'sulfanilamide',
    name: 'Sulfanilamide',
    medicalUse: 'Antibacterial (sulfonamide)',
    formula: 'C₆H₈N₂O₂S',
    smiles: 'Nc1ccc(S(N)(=O)=O)cc1',
    note: 'Aromatic ring with amine + sulfonamide group (matches the 3D ligand motif)',
  },
  {
    id: 'aspirin',
    name: 'Aspirin',
    medicalUse: 'Analgesic & antiplatelet (NSAID)',
    formula: 'C₉H₈O₄',
    smiles: 'CC(=O)Oc1ccccc1C(=O)O',
    note: 'Acetylsalicylic acid · 13 heavy-atom tokens in OpenFold3',
  },
  {
    id: 'ibuprofen',
    name: 'Ibuprofen',
    medicalUse: 'Anti-inflammatory & analgesic',
    formula: 'C₁₃H₁₈O₂',
    smiles: 'CC(C)Cc1ccc(C(C)C(=O)O)cc1',
    note: 'Propionic acid NSAID inhibiting COX-1/COX-2',
  },
  {
    id: 'acetaminophen',
    name: 'Acetaminophen',
    medicalUse: 'Analgesic & antipyretic',
    formula: 'C₈H₉NO₂',
    smiles: 'CC(=O)Nc1ccc(O)cc1',
    note: 'Paracetamol · para-aminophenol derivative',
  },
  {
    id: 'metformin',
    name: 'Metformin',
    medicalUse: 'Type 2 diabetes (biguanide)',
    formula: 'C₄H₁₁N₅',
    smiles: 'CN(C)C(=N)NC(=N)N',
    note: 'First-line oral antihyperglycemic agent',
  },
  {
    id: 'caffeine',
    name: 'Caffeine',
    medicalUse: 'CNS stimulant (adenosine antagonist)',
    formula: 'C₈H₁₀N₄O₂',
    smiles: 'Cn1cnc2c1c(=O)n(C)c(=O)n2C',
    note: 'Methylxanthine alkaloid · purine-like bicyclic core',
  },
  {
    id: 'oseltamivir',
    name: 'Oseltamivir',
    medicalUse: 'Antiviral (influenza neuraminidase)',
    formula: 'C₁₆H₂₈N₂O₄',
    smiles: 'CCOC(=O)C1=C[C@@H](OC(CC)CC)[C@H](NC(C)=O)[C@@H](N)C1',
    note: 'Tamiflu · chiral cyclohexene transition-state analog',
  },
  {
    id: 'imatinib',
    name: 'Imatinib',
    medicalUse: 'Targeted oncology (BCR-ABL TKI)',
    formula: 'C₂₉H₃₁N₇O',
    smiles: 'Cc1ccc(NC(=O)c2ccc(CN3CCN(C)CC3)cc2)cc1Nc1nccc(-c2cccnc2)n1',
    note: 'Kinase inhibitor · multi-ring co-folding benchmark ligand',
  },
  {
    id: 'atorvastatin',
    name: 'Atorvastatin',
    medicalUse: 'Lipid-lowering (HMG-CoA statin)',
    formula: 'C₃₃H₃₅FN₂O₅',
    smiles: 'CC(C)c1c(C(=O)Nc2ccccc2)c(-c2ccccc2)c(-c2ccc(F)cc2)n1CC[C@@H](O)C[C@@H](O)CC(=O)O',
    note: 'Lipitor · fluorinated pyrrole statin',
  },
  {
    id: 'atp-adenine',
    name: 'Adenine',
    medicalUse: 'Nucleobase (ATP / nucleic acids)',
    formula: 'C₅H₅N₅',
    smiles: 'Nc1ncnc2[nH]cnc12',
    note: 'Purine nucleobase · fused 5/6-membered heteroaromatic ring',
  },
]

export interface A3mSequenceEntry {
  header: string
  sequence: string
  isQuery?: boolean
}

export const A3M_EXAMPLE_ENTRIES: A3mSequenceEntry[] = [
  {
    header: '>query_chain_A | 18 residues',
    sequence: 'MASKLFGDEVRTPQWILY',
    isQuery: true,
  },
  {
    header: '>UniRef100_A0A1B2C3 | 89% id',
    sequence: 'MASKLFGDEikVRTPQWVLY',
  },
  {
    header: '>UniRef100_Q9Z4X1 | 72% id',
    sequence: 'MAS-LFGDELVKT--WILY',
  },
  {
    header: '>UniRef100_P42891 | 61% id',
    sequence: 'MGSKLagFGDEVKT-QWVLF',
  },
  {
    header: '>UniRef100_B7K9M2 | 55% id',
    sequence: '--SKLFGEEVRTPQWI--Y',
  },
]
