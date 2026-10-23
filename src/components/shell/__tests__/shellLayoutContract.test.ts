import { describe, it, expect } from 'vitest'
import {
  SHELL_DIMENSIONS,
  ZONE3_SLOT_SEQUENCE,
  resolveSearchOwner,
  resolvePhoneSearchKind,
} from '../shellLayoutContract'

describe('shellLayoutContract', () => {
  it('defines canonical dimension invariants', () => {
    expect(SHELL_DIMENSIONS.headerHeight).toBe(64)
    expect(SHELL_DIMENSIONS.sidebarExpandedWidth).toBe(256)
    expect(SHELL_DIMENSIONS.sidebarCollapsedWidth).toBe(64)
    expect(SHELL_DIMENSIONS.bottomBarHeight).toBe(58)
    expect(SHELL_DIMENSIONS.minTouchTarget).toBe(44)
    expect(SHELL_DIMENSIONS.titleMinPhoneWidth).toBe(120)
    expect(SHELL_DIMENSIONS.titleMinTabletWidth).toBe(140)
  })

  it('orders Zone 3 slots with secondary before add before more before primary', () => {
    const secIdx = ZONE3_SLOT_SEQUENCE.indexOf('secondary')
    const addIdx = ZONE3_SLOT_SEQUENCE.indexOf('add')
    const moreIdx = ZONE3_SLOT_SEQUENCE.indexOf('more')
    const primaryIdx = ZONE3_SLOT_SEQUENCE.indexOf('primary')

    expect(secIdx).toBeLessThan(addIdx)
    expect(addIdx).toBeLessThan(moreIdx)
    expect(moreIdx).toBeLessThan(primaryIdx)
  })

  describe('resolveSearchOwner', () => {
    it('returns "none" on phone viewports', () => {
      expect(
        resolveSearchOwner({
          isPhone: true,
          hasPortalSearch: false,
          hasConfigSearch: true,
          isDispatch: false,
        })
      ).toBe('none')
    })

    it('prioritizes portal search when mounted', () => {
      expect(
        resolveSearchOwner({
          isPhone: false,
          hasPortalSearch: true,
          hasConfigSearch: true,
          isDispatch: false,
        })
      ).toBe('portal')
    })

    it('falls back to config search when portal is absent', () => {
      expect(
        resolveSearchOwner({
          isPhone: false,
          hasPortalSearch: false,
          hasConfigSearch: true,
          isDispatch: false,
        })
      ).toBe('config')
    })

    it('falls back to command-palette when neither is present', () => {
      expect(
        resolveSearchOwner({
          isPhone: false,
          hasPortalSearch: false,
          hasConfigSearch: false,
          isDispatch: false,
        })
      ).toBe('command-palette')
    })

    it('returns "none" for dispatch routes without search', () => {
      expect(
        resolveSearchOwner({
          isPhone: false,
          hasPortalSearch: false,
          hasConfigSearch: false,
          isDispatch: true,
        })
      ).toBe('none')
    })
  })

  describe('resolvePhoneSearchKind', () => {
    it('returns "none" if not phone or if searchInMore is true', () => {
      expect(
        resolvePhoneSearchKind({
          isPhone: false,
          hasPortalSearch: false,
          hasConfigSearch: true,
          isDispatch: false,
        })
      ).toBe('none')

      expect(
        resolvePhoneSearchKind({
          isPhone: true,
          searchInMore: true,
          hasPortalSearch: false,
          hasConfigSearch: true,
          isDispatch: false,
        })
      ).toBe('none')
    })

    it('returns "panel" if config search is provided without portal', () => {
      expect(
        resolvePhoneSearchKind({
          isPhone: true,
          hasPortalSearch: false,
          hasConfigSearch: true,
          isDispatch: false,
        })
      ).toBe('panel')
    })

    it('returns "trigger" if no config/portal search and not dispatch', () => {
      expect(
        resolvePhoneSearchKind({
          isPhone: true,
          hasPortalSearch: false,
          hasConfigSearch: false,
          isDispatch: false,
        })
      ).toBe('trigger')
    })
  })
})
