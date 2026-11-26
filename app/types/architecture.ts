export type TensorCategory =
  | 'input'
  | 'embedder'
  | 'template'
  | 'msa'
  | 'pair'
  | 'single'
  | 'diffusion'
  | 'atoms'
  | 'head'

export type MatrixStyle =
  | 'sequence'
  | 'pair'
  | 'msa'
  | 'local-window'
  | 'transformer'
  | 'heatmap'
  | 'point-cloud'

export interface CodeRef {
  file: string
  url: string
  symbol?: string
  startLine?: number
  contextBefore?: string[]
  snippet?: string[]
  contextAfter?: string[]
}

export type DetailedKind =
  | 'multihead-attn'
  | 'pair-stack'
  | 'msa-block'
  | 'conditioning'
  | 'atom-dec'
  | 'confidence-heads'
  | 'token-features'
  | 'ref-conformers'
  | 'single-concat'
  | 'linear-proj'
  | 'pair-init'
  | 'recycle-gate'
  | 'msa-embed'
  | 'diffusion-sampler'

export interface DetailedBlockSpec {
  kind: DetailedKind
  heads?: number
  dHead?: number
  normType?: 'LayerNorm' | 'AdaLN'
  subStages: string[]
}

export interface TensorBlock3D {
  id: string
  label: string
  shortLabel: string
  stageId: string
  category: TensorCategory
  shape: string
  dims: string[]
  position: [number, number, number]
  size: [number, number, number]
  stackCount?: number
  color: string
  matrixStyle: MatrixStyle
  description: string
  formula?: string
  codeRef?: CodeRef
  params?: Record<string, string | number>
  detailedSpec?: DetailedBlockSpec
}

export type DataFlowEdgeKind = 'forward' | 'residual' | 'recycle' | 'conditioning' | 'pair-bias'

export interface DataFlowEdge {
  id: string
  from: string
  to: string
  kind: DataFlowEdgeKind
  label?: string
  controlPoints?: [number, number, number][]
}

export type CalloutTone = 'neutral' | 'blue' | 'purple' | 'green' | 'amber'

export type InteractiveHint = 'cycle'

export interface WalkthroughStep {
  id: string
  index: number
  chapterGroup: string
  icon: string
  title: string
  subtitle: string
  summary: string
  callout: {
    icon: string
    tone: CalloutTone
    text: string
  }
  details: Array<{
    title: string
    body: string
  }>
  formula?: string
  properties: Array<{
    label: string
    value: string
    mono?: boolean
  }>
  codeRef?: CodeRef
  focusBlockIds: string[]
  highlightEdgeIds: string[]
  camera: {
    position: [number, number, number]
    target: [number, number, number]
  }
  interactiveHint?: InteractiveHint | null
}

export type InputSourceId = 'dna-sequence' | 'protein-sequence' | 'small-molecule' | 'msa-a3m'

export interface InputSourceSpec {
  id: InputSourceId
  label: string
  shortLabel: string
  subtitle: string
  targetBlockId: string
  color: string
  formatBadge: string
  description: string
}

export type OutputId = 'cif-structure' | 'confidence-scores'

export interface OutputSpec {
  id: OutputId
  label: string
  subtitle: string
  color: string
  formatBadge: string
  description: string
  sourceBlockIds: string[]
}

export type ModelStatus = 'available' | 'coming-soon'

export interface FoldingModelSpec {
  id: string
  name: string
  shortName: string
  version: string
  status: ModelStatus
  tagline: string
  description: string
  repoUrl: string
  paperUrl: string
  papers?: Array<{
    label: string
    url: string
  }>
  tags: string[]
  stats: Array<{
    label: string
    value: string
  }>
  blocks: TensorBlock3D[]
  edges: DataFlowEdge[]
  steps: WalkthroughStep[]
}
