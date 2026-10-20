// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ProductionsList from '../../modules/rentals/ProductionsList'
import WarrantyTracker from '../../modules/inventory/WarrantyTracker'
import ShiftHandoverPanel from '../../modules/today/ShiftHandoverPanel'
import InternalNotesPage from '../../modules/notes/InternalNotesPage'
import InternalNotesDrawer from '../../modules/notes/InternalNotesDrawer'
import { getProductions, saveProductions } from '../../lib/queries/productions'
import { getHandoverRecords, saveHandoverRecords } from '../../lib/queries/shiftHandover'
import { getWarrantyItems, saveWarrantyItems } from '../../lib/queries/warranty'
import { listInternalNotes, saveInternalNotes } from '../../lib/queries/internalNotes'

vi.mock('../../lib/supabase', () => ({ IS_MOCK: false, supabase: {} }))
vi.mock('../../lib/auth', () => ({ useAuth: () => ({ user: { id: 'operator', role: 'Warehouse' } }) }))
vi.mock('../../lib/moneyVisibility', () => ({ useCanViewMoney: () => false }))
vi.mock('../../components/ui/Toast', () => ({
  useToast: () => ({ showSuccessToast: vi.fn() }),
  useOptionalToast: () => ({ showSuccessToast: vi.fn() }),
}))
vi.mock('../../lib/device', () => ({ useViewport: () => 'desktop', useCapability: () => ({ hasHover: true }) }))
;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const keys = ['br.productions', 'br.shiftHandovers', 'br.warranties', 'babin_internal_notes_v1']
const kept = JSON.stringify({ privateNote: 'legacy-kept', pending: true })
beforeEach(() => { for (const key of keys) localStorage.setItem(key, kept) })
afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = '' })

describe('live tools refuse unsupported browser-local business operations', () => {
  it.each([
    ['production read', () => getProductions()],
    ['production write', () => saveProductions([])],
    ['shift read', () => getHandoverRecords()],
    ['shift write', () => saveHandoverRecords([])],
    ['warranty read', () => getWarrantyItems()],
    ['warranty write', () => saveWarrantyItems([])],
    ['team notes read', () => listInternalNotes()],
    ['team notes write', () => saveInternalNotes([])],
  ] as const)('%s refuses without changing existing local work', (_name, call) => {
    expect(call).toThrow(/unavailable/i)
    for (const key of keys) expect(localStorage.getItem(key)).toBe(kept)
  })

  it.each([
    ['Productions', ProductionsList],
    ['Warranty', WarrantyTracker],
    ['Shift Handover', ShiftHandoverPanel],
    ['Team notes page', InternalNotesPage],
    ['Team notes drawer', () => <InternalNotesDrawer isOpen onClose={vi.fn()} />],
  ] as const)('%s renders an honest unavailable state without reading local business records', async (_name, Component) => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem')
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    try {
      await act(async () => root.render(<MemoryRouter><Component /></MemoryRouter>))
      expect(container.textContent).toMatch(/unavailable/i)
      expect(container.textContent).not.toMatch(/legacy-kept|Rs\s|Himalayan Films|5 bookings/)
      expect(getItem.mock.calls.filter(([key]) => keys.includes(key))).toEqual([])
      for (const key of keys) expect(localStorage.getItem(key)).toBe(kept)
    } finally { await act(async () => root.unmount()) }
  })
})
