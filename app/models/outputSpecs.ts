import type { OutputId, OutputSpec } from '~/types/architecture'

export const OUTPUT_SPECS: Record<OutputId, OutputSpec> = {
  'cif-structure': {
    id: 'cif-structure',
    label: 'Predicted 3D Structure (.cif)',
    subtitle: 'All-atom 3D biomolecular coordinates exported in mmCIF format',
    color: '#ea580c',
    formatBadge: 'mmCIF (.cif)',
    description:
      'Final all-atom 3D coordinates [N_atom, 3] sampled by the 200-step EDM Diffusion module and written as standard mmCIF atomic records (polymer chains, nucleic acids, ions, and small-molecule ligands) with per-atom B-factor columns populated from pLDDT.',
    sourceBlockIds: ['denoised-coords'],
  },
  'confidence-scores': {
    id: 'confidence-scores',
    label: 'Confidence Metrics (pLDDT / PAE)',
    subtitle: 'Per-residue pLDDT profile, pairwise PAE/PDE matrices & pTM/ipTM ranking',
    color: '#ea580c',
    formatBadge: 'JSON (.json)',
    description:
      'Calibrated structure confidence outputs predicted by the 4-block Auxiliary Pairformer and Confidence Heads: per-atom/per-residue pLDDT (0–100), pairwise Predicted Aligned Error (PAE), Predicted Distance Error (PDE), and sample ranking score (0.2·pTM + 0.8·ipTM).',
    sourceBlockIds: ['confidence-outputs'],
  },
}

export function getOutputSpecById(id: OutputId): OutputSpec {
  return OUTPUT_SPECS[id]
}
