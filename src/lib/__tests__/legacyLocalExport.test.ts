// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  LEGACY_STORAGE_KEYS,
  LEGACY_EXPORT_DISMISSED_KEY,
  isLegacyExportDismissed,
  dismissLegacyExport,
  resetLegacyExportDismissal,
  getLegacyLocalEntriesSummary,
  recordsToCsv,
  buildLegacyExportBundle,
} from '../legacyLocalExport'

describe('legacyLocalExport (T4-06, Ruling D28, Law 3)', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  describe('dismissal flag', () => {
    it('is not dismissed initially', () => {
      expect(isLegacyExportDismissed()).toBe(false)
    })

    it('dismisses when dismissLegacyExport is called', () => {
      dismissLegacyExport()
      expect(isLegacyExportDismissed()).toBe(true)
      expect(localStorage.getItem(LEGACY_EXPORT_DISMISSED_KEY)).toBe('true')
    })

    it('resets dismissal when resetLegacyExportDismissal is called', () => {
      dismissLegacyExport()
      expect(isLegacyExportDismissed()).toBe(true)
      resetLegacyExportDismissal()
      expect(isLegacyExportDismissed()).toBe(false)
      expect(localStorage.getItem(LEGACY_EXPORT_DISMISSED_KEY)).toBeNull()
    })
  })

  describe('summary calculation', () => {
    it('reports 0 entries on a clean device', async () => {
      const summary = await getLegacyLocalEntriesSummary()
      expect(summary.totalCount).toBe(0)
      for (const key of LEGACY_STORAGE_KEYS) {
        expect(summary.countsByKey[key]).toBe(0)
      }
    })

    it('counts array entries in legacy keys accurately', async () => {
      localStorage.setItem('br.productions', JSON.stringify([{ id: 'p1' }, { id: 'p2' }]))
      localStorage.setItem('babin_rentals_deliveries_v1', JSON.stringify([{ id: 'd1' }]))
      localStorage.setItem('babin_internal_notes_v1', JSON.stringify([{ id: 'n1' }, { id: 'n2' }, { id: 'n3' }]))
      localStorage.setItem('br.shiftHandovers', JSON.stringify([])) // empty array = 0

      const summary = await getLegacyLocalEntriesSummary()
      expect(summary.countsByKey['br.productions']).toBe(2)
      expect(summary.countsByKey['babin_rentals_deliveries_v1']).toBe(1)
      expect(summary.countsByKey['babin_internal_notes_v1']).toBe(3)
      expect(summary.countsByKey['br.shiftHandovers']).toBe(0)
      expect(summary.totalCount).toBe(6)
    })

    it('handles non-array objects and non-JSON values without crashing', async () => {
      localStorage.setItem('babin_coupons_v2', JSON.stringify({ code: 'DISC10' }))
      localStorage.setItem('br.warranties', 'plain-text-record')

      const summary = await getLegacyLocalEntriesSummary()
      expect(summary.countsByKey['babin_coupons_v2']).toBe(1)
      expect(summary.countsByKey['br.warranties']).toBe(1)
      expect(summary.totalCount).toBe(2)
    })
  })

  describe('recordsToCsv', () => {
    it('returns empty string for empty rows', () => {
      expect(recordsToCsv([])).toBe('')
    })

    it('formats flat records with comma and quotes', () => {
      const rows = [
        { id: '1', name: 'Item One', notes: 'Simple' },
        { id: '2', name: 'Item, with comma', notes: 'Has "quotes" inside' },
      ]
      const csv = recordsToCsv(rows)
      expect(csv).toContain('id,name,notes')
      expect(csv).toContain('1,Item One,Simple')
      expect(csv).toContain('"Item, with comma"')
      expect(csv).toContain('"Has ""quotes"" inside"')
    })

    it('serializes nested objects as escaped JSON in CSV cells', () => {
      const rows = [{ id: '1', meta: { key: 'val' } }]
      const csv = recordsToCsv(rows)
      expect(csv).toContain('"{""key"":""val""}"')
    })
  })

  describe('buildLegacyExportBundle & Law 3 adherence', () => {
    it('packages all stored legacy entries and DOES NOT delete anything (Law 3, D28)', async () => {
      const notesData = [{ id: 'n1', text: 'Important note' }]
      const productionsData = [{ id: 'prod1', title: 'Music Video' }]

      localStorage.setItem('babin_internal_notes_v1', JSON.stringify(notesData))
      localStorage.setItem('br.productions', JSON.stringify(productionsData))

      const bundle = await buildLegacyExportBundle()

      expect(bundle.totalCount).toBe(2)
      expect(bundle.summary['babin_internal_notes_v1']).toBe(1)
      expect(bundle.summary['br.productions']).toBe(1)
      expect(bundle.data['babin_internal_notes_v1']).toEqual(notesData)
      expect(bundle.data['br.productions']).toEqual(productionsData)
      expect(bundle.csvText).toContain('# --- babin_internal_notes_v1')
      expect(bundle.csvText).toContain('# --- br.productions')

      // CRITICAL LAW 3 & D28 ASSERTION: Stored data must stay 100% intact!
      expect(localStorage.getItem('babin_internal_notes_v1')).toBe(JSON.stringify(notesData))
      expect(localStorage.getItem('br.productions')).toBe(JSON.stringify(productionsData))
    })
  })
})
