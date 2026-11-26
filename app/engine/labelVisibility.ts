import * as THREE from 'three'

export const LABEL_ZOOM = {
  /** Overview / far zoom threshold for switching block labels to compact form */
  FAR_COMPACT_DIST: 36,
  /** Maximum distance where external input annotations (DNA, MSA, etc.) are shown */
  EXTERNAL_MAX_DIST: 50,
  /** Minimum distance where external input annotations are shown */
  EXTERNAL_MIN_DIST: 6,
  /** Maximum distance where macro edge labels are shown */
  EDGE_MAX_DIST: 48,
  /** Maximum distance where axis dimension tags are shown */
  AXIS_TAG_MAX_DIST: 45,
  /** Minimum distance where axis dimension tags are shown */
  AXIS_TAG_MIN_DIST: 8,
  /** Maximum camera distance where in-place detail mini-labels are shown */
  DETAIL_MINI_MAX_DIST: 26,
  /** Maximum camera distance for detail mini-labels when block is selected or hovered */
  DETAIL_MINI_ACTIVE_MAX_DIST: 30,
  /** Camera-to-target distance below which view is considered close-up detail zoom */
  CLOSE_TARGET_DIST: 16,
  /** Distance below which an expanded block hides its own macro title to favor mini-labels */
  EXPANDED_MACRO_HIDE_DIST: 18,
} as const

export interface ScreenRect {
  left: number
  right: number
  top: number
  bottom: number
}

export function rectsOverlap(a: ScreenRect, b: ScreenRect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

export interface BlockLabelStateParams {
  dist: number
  targetDist: number
  isOverviewMode: boolean
  isSelected: boolean
  isHovered: boolean
  isFocused: boolean
  isExpanded: boolean
  hasDetailedSpec: boolean
}

export interface BlockLabelState {
  mode: 'hidden' | 'full' | 'compact'
  refWidth: number
}

export function getBlockLabelState(params: BlockLabelStateParams): BlockLabelState {
  const {
    dist,
    targetDist,
    isOverviewMode,
    isSelected,
    isHovered,
    isFocused,
    isExpanded,
    hasDetailedSpec,
  } = params

  if (isSelected && hasDetailedSpec) {
    return { mode: 'hidden', refWidth: 0 }
  }

  // When zoomed into an expanded block's interior, hide its own macro title in favor of mini-labels
  if (isExpanded && dist < LABEL_ZOOM.EXPANDED_MACRO_HIDE_DIST && !isHovered) {
    return { mode: 'hidden', refWidth: 0 }
  }

  // When zoomed in close on a target block, hide distant/neighboring block titles
  if (targetDist < LABEL_ZOOM.CLOSE_TARGET_DIST && !isSelected && !isHovered && dist > 12) {
    return { mode: 'hidden', refWidth: 0 }
  }

  const useCompact = isOverviewMode && dist > LABEL_ZOOM.FAR_COMPACT_DIST && !isHovered
  const isActiveLabel = isSelected || isHovered || isFocused
  const refWidth = isActiveLabel
    ? THREE.MathUtils.clamp(dist * 0.115, 1.1, 7.8)
    : THREE.MathUtils.clamp(dist * 0.085, 0.9, 3.2)

  return {
    mode: useCompact ? 'compact' : 'full',
    refWidth,
  }
}

export interface ExternalLabelStateParams {
  dist: number
  targetDist: number
}

export interface ExternalLabelState {
  visible: boolean
  refWidth: number
}

export function getExternalLabelState(params: ExternalLabelStateParams): ExternalLabelState {
  const { dist, targetDist } = params
  const inDistRange = dist >= LABEL_ZOOM.EXTERNAL_MIN_DIST
  const relevantAtCloseZoom = targetDist >= LABEL_ZOOM.CLOSE_TARGET_DIST || dist <= targetDist + 8

  if (!inDistRange || !relevantAtCloseZoom) {
    return { visible: false, refWidth: 0 }
  }

  return {
    visible: true,
    refWidth: THREE.MathUtils.clamp(dist * 0.1, 1.0, 4.8),
  }
}

export interface EdgeLabelStateParams {
  dist: number
  targetDist: number
  shouldConsider: boolean
  isSelectedBlockExpanded: boolean
}

export interface EdgeLabelState {
  visible: boolean
  scaleWidth: number
}

export function getEdgeLabelState(params: EdgeLabelStateParams): EdgeLabelState {
  const { dist, targetDist, shouldConsider, isSelectedBlockExpanded } = params
  if (!shouldConsider) {
    return { visible: false, scaleWidth: 0 }
  }
  if (dist > LABEL_ZOOM.EDGE_MAX_DIST) {
    return { visible: false, scaleWidth: 0 }
  }
  if (targetDist < LABEL_ZOOM.CLOSE_TARGET_DIST && (isSelectedBlockExpanded || dist < 11)) {
    return { visible: false, scaleWidth: 0 }
  }

  return {
    visible: true,
    scaleWidth: THREE.MathUtils.clamp(dist * 0.085, 0.9, 4.8),
  }
}

export interface DetailMiniLabelsParams {
  camDist: number
  isSelected: boolean
  isHovered: boolean
  isFocused: boolean
}

export function shouldShowDetailMiniLabels(params: DetailMiniLabelsParams): boolean {
  const { camDist, isSelected, isHovered, isFocused } = params
  const maxDist =
    isSelected || isHovered
      ? LABEL_ZOOM.DETAIL_MINI_ACTIVE_MAX_DIST
      : LABEL_ZOOM.DETAIL_MINI_MAX_DIST
  if (camDist > maxDist) return false
  return isSelected || isHovered || isFocused || camDist < 16
}

export interface AxisTagsParams {
  dist: number
  isExpanded: boolean
  isSelected: boolean
  isHovered: boolean
  hasFocus: boolean
  isFocused: boolean
  focusBlockCount: number
}

export function shouldShowAxisTags(params: AxisTagsParams): boolean {
  const { dist, isExpanded, isSelected, isHovered, hasFocus, isFocused, focusBlockCount } = params
  if (isExpanded) return false
  if (dist < LABEL_ZOOM.AXIS_TAG_MIN_DIST || dist > LABEL_ZOOM.AXIS_TAG_MAX_DIST) return false
  return isSelected || isHovered || (hasFocus && isFocused && focusBlockCount <= 3)
}
