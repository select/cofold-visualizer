import { describe, expect, it } from 'vitest'
import {
  getBlockLabelState,
  getEdgeLabelState,
  getExternalLabelState,
  rectsOverlap,
  shouldShowAxisTags,
  shouldShowDetailMiniLabels,
} from '~/engine/labelVisibility'

describe('zoom-level label visibility', () => {
  describe('getBlockLabelState', () => {
    it('shows compact labels at far overview zoom for non-hovered blocks', () => {
      const state = getBlockLabelState({
        dist: 65,
        targetDist: 65,
        isOverviewMode: true,
        isSelected: false,
        isHovered: false,
        isFocused: false,
        isExpanded: false,
        hasDetailedSpec: true,
      })
      expect(state.mode).toBe('compact')
    })

    it('shows full labels at mid zoom and scales proportionally without giant minimum', () => {
      const mid = getBlockLabelState({
        dist: 22,
        targetDist: 22,
        isOverviewMode: false,
        isSelected: false,
        isHovered: false,
        isFocused: true,
        isExpanded: false,
        hasDetailedSpec: true,
      })
      expect(mid.mode).toBe('full')
      expect(mid.refWidth).toBeCloseTo(22 * 0.115, 2)

      const close = getBlockLabelState({
        dist: 10,
        targetDist: 10,
        isOverviewMode: false,
        isSelected: false,
        isHovered: true,
        isFocused: true,
        isExpanded: false,
        hasDetailedSpec: true,
      })
      expect(close.mode).toBe('full')
      expect(close.refWidth).toBeLessThan(1.5)
    })

    it('hides expanded block macro title when zoomed into its interior', () => {
      const state = getBlockLabelState({
        dist: 12,
        targetDist: 10,
        isOverviewMode: false,
        isSelected: false,
        isHovered: false,
        isFocused: true,
        isExpanded: true,
        hasDetailedSpec: true,
      })
      expect(state.mode).toBe('hidden')
    })

    it('hides neighboring block labels when zoomed in close on another block', () => {
      const neighbor = getBlockLabelState({
        dist: 18,
        targetDist: 9,
        isOverviewMode: false,
        isSelected: false,
        isHovered: false,
        isFocused: true,
        isExpanded: false,
        hasDetailedSpec: false,
      })
      expect(neighbor.mode).toBe('hidden')
    })
  })

  describe('getExternalLabelState', () => {
    it('shows external labels at overview zoom and hides them when zoomed into another block', () => {
      expect(getExternalLabelState({ dist: 55, targetDist: 55 }).visible).toBe(true)
      expect(getExternalLabelState({ dist: 20, targetDist: 10 }).visible).toBe(false)
    })

    it('shows external input labels in mid-range zoom', () => {
      const state = getExternalLabelState({ dist: 18, targetDist: 18 })
      expect(state.visible).toBe(true)
      expect(state.refWidth).toBeCloseTo(1.8, 2)
    })
  })

  describe('getEdgeLabelState', () => {
    it('hides edge labels at far zoom or when zoomed into an expanded block', () => {
      expect(
        getEdgeLabelState({
          dist: 55,
          targetDist: 55,
          shouldConsider: true,
          isSelectedBlockExpanded: false,
        }).visible
      ).toBe(false)

      expect(
        getEdgeLabelState({
          dist: 15,
          targetDist: 10,
          shouldConsider: true,
          isSelectedBlockExpanded: true,
        }).visible
      ).toBe(false)
    })

    it('shows highlighted edge labels at mid zoom with proportional scale', () => {
      const state = getEdgeLabelState({
        dist: 20,
        targetDist: 20,
        shouldConsider: true,
        isSelectedBlockExpanded: false,
      })
      expect(state.visible).toBe(true)
      expect(state.scaleWidth).toBeCloseTo(1.7, 2)
    })
  })

  describe('shouldShowDetailMiniLabels', () => {
    it('hides detail mini-labels when zoomed far out even if focused or selected', () => {
      expect(
        shouldShowDetailMiniLabels({
          camDist: 42,
          isSelected: true,
          isHovered: false,
          isFocused: true,
        })
      ).toBe(false)
    })

    it('shows detail mini-labels when zoomed in close', () => {
      expect(
        shouldShowDetailMiniLabels({
          camDist: 12,
          isSelected: false,
          isHovered: false,
          isFocused: false,
        })
      ).toBe(true)
    })
  })

  describe('shouldShowAxisTags', () => {
    it('shows axis tags only in mid-range zoom on unexpanded active blocks', () => {
      expect(
        shouldShowAxisTags({
          dist: 20,
          isExpanded: false,
          isSelected: true,
          isHovered: false,
          hasFocus: true,
          isFocused: true,
          focusBlockCount: 2,
        })
      ).toBe(true)

      expect(
        shouldShowAxisTags({
          dist: 60,
          isExpanded: false,
          isSelected: true,
          isHovered: false,
          hasFocus: true,
          isFocused: true,
          focusBlockCount: 2,
        })
      ).toBe(false)
    })
  })

  describe('rectsOverlap', () => {
    it('detects overlapping and disjoint screen rectangles', () => {
      const a = { left: 10, right: 100, top: 10, bottom: 40 }
      const b = { left: 80, right: 160, top: 20, bottom: 60 }
      const c = { left: 110, right: 180, top: 10, bottom: 40 }
      expect(rectsOverlap(a, b)).toBe(true)
      expect(rectsOverlap(a, c)).toBe(false)
    })
  })
})
