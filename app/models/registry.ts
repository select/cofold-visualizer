import type { FoldingModelSpec } from '~/types/architecture'
import { openfold3Model } from './openfold3'

const boltz2Placeholder: FoldingModelSpec = {
  id: 'boltz2',
  name: 'Boltz-2',
  shortName: 'Boltz-2',
  version: 'Coming Soon',
  status: 'coming-soon',
  tagline: 'Joint biomolecular structure & binding affinity co-folding',
  description:
    'Boltz-2 extends open-weight all-atom diffusion co-folding with steering potentials and explicit binding affinity prediction heads.',
  repoUrl: 'https://github.com/jwohlwend/boltz',
  paperUrl: 'https://arxiv.org/abs/2506.00000',
  tags: ['All-Atom', 'Affinity Head', 'Steering'],
  stats: [
    { label: 'Trunk', value: 'Pairformer' },
    { label: 'Diffusion', value: 'All-Atom EDM' },
  ],
  blocks: [],
  edges: [],
  steps: [],
}

const chai1Placeholder: FoldingModelSpec = {
  id: 'chai1',
  name: 'Chai-1',
  shortName: 'Chai-1',
  version: 'Coming Soon',
  status: 'coming-soon',
  tagline: 'Multi-modal biomolecular structure prediction with ESM-3 conditioning',
  description:
    'Chai-1 unifies single-sequence pLM embeddings, restraint conditioning, and all-atom diffusion for protein–ligand and antibody–antigen complexes.',
  repoUrl: 'https://github.com/chaidiscovery/chai-lab',
  paperUrl: 'https://www.biorxiv.org/content/10.1101/2024.10.10.615955',
  tags: ['All-Atom', 'pLM + MSA', 'Restraints'],
  stats: [
    { label: 'Trunk', value: 'Pairformer' },
    { label: 'Conditioning', value: 'ESM + Restraints' },
  ],
  blocks: [],
  edges: [],
  steps: [],
}

export const MODELS: FoldingModelSpec[] = [openfold3Model, boltz2Placeholder, chai1Placeholder]

export function getModelById(id: string): FoldingModelSpec | undefined {
  return MODELS.find(model => model.id === id)
}
