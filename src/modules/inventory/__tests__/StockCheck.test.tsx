// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import StockCheck from '../StockCheck'
import * as stockAuditsQuery from '../../../lib/queries/stockAudits'
import type { StockAuditItemRow, StockAuditListRow } from '../../../lib/queries/stockAudits'

// @ts-expect-error React 18 act flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'usr-warehouse-1', role: 'Warehouse', email: 'warehouse@babinrentals.com' },
  }),
}))

vi.mock('../../../lib/device', () => ({
  useViewport: () => 'desktop',
  useCapability: () => ({ hasHover: true }),
}))

const mockAudit: StockAuditListRow = {
  id: 'aud-1',
  auditNo: 'AUD-2026-0001',
  scope: 'Full warehouse',
  status: 'In Progress',
  scheduledDateAd: '2026-11-06',
  startedAtAd: '2026-11-06T09:00:00Z',
  completedAtAd: null,
  auditedById: 'usr-warehouse-1',
  auditorName: 'Warehouse Staff',
  totalExpected: 2,
  totalScanned: 0,
  totalDiscrepancies: 0,
  warehouseName: 'Main Depot',
  warehouseCode: 'WH-MAIN',
}

const mockItems: StockAuditItemRow[] = [
  {
    id: 'item-1',
    stockAuditId: 'aud-1',
    productUnitId: 'unit-1',
    expectedState: 'Available',
    scannedState: null,
    outcome: 'Left unverified',
    exclusionReason: null,
    discrepancyNotes: null,
    scannedAtAd: null,
    scannedById: null,
    serialNo: 'CAM-001',
    assetTag: 'AT-001',
    barcode: 'BC-001',
    rack: 'A1',
    shelf: 'S1',
    bin: 'B1',
    productName: 'Sony FX6 Cinema Camera',
    productAssetCode: 'CAM-FX6',
  },
  {
    id: 'item-2',
    stockAuditId: 'aud-1',
    productUnitId: 'unit-2',
    expectedState: 'Available',
    scannedState: null,
    outcome: 'Confirmed missing',
    exclusionReason: null,
    discrepancyNotes: 'Missing from rack A1',
    scannedAtAd: '2026-11-06T10:00:00Z',
    scannedById: 'usr-warehouse-1',
    serialNo: 'LENS-002',
    assetTag: 'AT-002',
    barcode: 'BC-002',
    rack: 'A1',
    shelf: 'S2',
    bin: 'B1',
    productName: 'Sony 24-70mm GM II',
    productAssetCode: 'LENS-2470',
  },
]

describe('StockCheck Component (#13 scan persistence & #14 confirm missing UI)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    vi.restoreAllMocks()

    vi.spyOn(stockAuditsQuery, 'listStockAudits').mockResolvedValue({
      rows: [mockAudit],
      total: 1,
    })
    vi.spyOn(stockAuditsQuery, 'listStockAuditItems').mockResolvedValue({
      rows: mockItems,
      total: mockItems.length,
    })
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it('renders audit sessions and manifest items with correct initial states', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <StockCheck />
        </MemoryRouter>,
      )
    })

    expect(container.textContent).toContain('AUD-2026-0001')
    expect(container.textContent).toContain('Sony FX6 Cinema Camera')
    expect(container.textContent).toContain('Sony 24-70mm GM II')
    expect(container.textContent).toContain('Confirm missing')
    expect(container.textContent).toContain('Revert missing')
  })

  it('renders Manual verify and Confirm missing actions for unverified unit', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <StockCheck />
        </MemoryRouter>,
      )
    })

    const buttons = Array.from(container.querySelectorAll('button'))
    const manualVerifyBtn = buttons.find((b) => b.textContent?.includes('Manual verify'))
    const confirmMissingBtn = buttons.find((b) => b.textContent?.includes('Confirm missing'))

    expect(manualVerifyBtn).toBeDefined()
    expect(confirmMissingBtn).toBeDefined()
    expect(confirmMissingBtn?.disabled).toBe(false)
  })

  it('renders Revert missing action for confirmed missing unit', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <StockCheck />
        </MemoryRouter>,
      )
    })

    const buttons = Array.from(container.querySelectorAll('button'))
    const revertBtn = buttons.find((b) => b.textContent?.includes('Revert missing'))
    expect(revertBtn).toBeDefined()
    expect(revertBtn?.disabled).toBe(false)
  })
})
