// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ResolveAtRiskModal } from '../ResolveAtRiskModal'
import type { BookingAtRiskRow } from '../../../../lib/queries/atRisk'

const mockResolveAtRisk = vi.fn()

vi.mock('../../../../actions/rentals/resolveAtRisk', () => ({
  resolveAtRisk: (...args: unknown[]) => mockResolveAtRisk(...args),
}))

vi.mock('../../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'user-manager-1', name: 'Manager B', role: 'Manager' },
  }),
}))

let container: HTMLDivElement
let root: Root

async function flush(rounds = 4) {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await Promise.resolve()
    })
  }
}

async function mountModal(props: Parameters<typeof ResolveAtRiskModal>[0]) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<ResolveAtRiskModal {...props} />)
  })
  await flush()
}

describe('ResolveAtRiskModal (T3-29)', () => {
  const sampleAtRisk: BookingAtRiskRow = {
    id: 'risk-1',
    booking_id: 'bk-upcoming-1',
    booking_no: 'BK-2026-0042',
    cause: 'extension_clash',
    clashing_booking_id: 'bk-orig-1',
    clashing_booking_no: 'BK-2026-0010',
    product_id: 'prod-fx3',
    product_name: 'Sony FX3 Cinema Camera',
    asset_id: 'unit-fx3-01',
    asset_tag: 'FX3-01',
    raised_by: 'user-manager-1',
    raised_at: '2026-11-18T10:00:00Z',
    resolved_at: null,
    resolved_by: null,
    resolution: null,
    resolution_notes: null,
    created_at: '2026-11-18T10:00:00Z',
  }

  beforeEach(() => {
    mockResolveAtRisk.mockReset()
    mockResolveAtRisk.mockResolvedValue({
      success: true,
      atRiskId: 'risk-1',
      resolvedAt: '2026-11-18T11:00:00Z',
    })
  })

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount()
      })
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container)
    }
  })

  it('renders resolution options and at-risk information', async () => {
    await mountModal({
      isOpen: true,
      onClose: vi.fn(),
      atRisk: sampleAtRisk,
      clientName: 'Kathmandu Films',
    })

    expect(container.textContent).toContain('Resolve At-Risk: Booking #BK-2026-0042')
    expect(container.textContent).toContain('Sony FX3 Cinema Camera')
    expect(container.textContent).toContain('Similar Free Item')
    expect(container.textContent).toContain('Sub-rent from Partner')
    expect(container.textContent).toContain('Keep as Account Credit')
    expect(container.textContent).toContain('Full Refund')
  })

  it('submits resolution with similar item selection', async () => {
    const handleResolved = vi.fn()
    const handleClose = vi.fn()

    await mountModal({
      isOpen: true,
      onClose: handleClose,
      atRisk: sampleAtRisk,
      clientName: 'Kathmandu Films',
      onResolved: handleResolved,
    })

    const submitBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Apply Resolution & Unblock Pack')
    )
    expect(submitBtn).toBeDefined()

    await act(async () => {
      submitBtn?.click()
    })
    await flush()

    expect(mockResolveAtRisk).toHaveBeenCalledWith(
      expect.objectContaining({
        atRiskId: 'risk-1',
        resolution: 'similar_item',
      }),
      expect.anything(),
    )
    expect(handleResolved).toHaveBeenCalled()
    expect(handleClose).toHaveBeenCalled()
  })

  it('allows switching to sub-rent option and shows partner select', async () => {
    await mountModal({
      isOpen: true,
      onClose: vi.fn(),
      atRisk: sampleAtRisk,
      clientName: 'Kathmandu Films',
    })

    const subRentCard = Array.from(container.querySelectorAll('button')).find((el) =>
      el.textContent?.includes('Sub-rent from Partner')
    )
    expect(subRentCard).toBeDefined()

    await act(async () => {
      subRentCard?.click()
    })
    await flush()

    const submitBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Apply Resolution & Unblock Pack')
    )
    await act(async () => {
      submitBtn?.click()
    })
    await flush()

    expect(mockResolveAtRisk).toHaveBeenCalledWith(
      expect.objectContaining({
        atRiskId: 'risk-1',
        resolution: 'sub_rent',
        notes: expect.stringContaining('Sub-rented from'),
      }),
      expect.anything(),
    )
  })

  it('displays WhatsApp/Email draft communication for client care', async () => {
    await mountModal({
      isOpen: true,
      onClose: vi.fn(),
      atRisk: sampleAtRisk,
      clientName: 'Kathmandu Films',
    })

    const toggleDraftBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Draft Client WhatsApp / Email')
    )
    expect(toggleDraftBtn).toBeDefined()

    await act(async () => {
      toggleDraftBtn?.click()
    })
    await flush()

    expect(container.textContent).toContain('Namaste Kathmandu Films')
    expect(container.textContent).toContain('BK-2026-0042')
    expect(container.textContent).toContain('Sony FX3 Cinema Camera')
  })
})
