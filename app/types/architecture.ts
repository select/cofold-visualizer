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

export type InteractiveHint = 'cycle' | 'pairformerBlock' | 'diffusionStep'

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
  tags: string[]
  stats: Array<{
    label: string
    value: string
  }>
  blocks: TensorBlock3D[]
  edges: DataFlowEdge[]
  steps: WalkthroughStep[]
}
