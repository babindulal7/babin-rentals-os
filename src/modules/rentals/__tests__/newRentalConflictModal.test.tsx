// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { BookingConflictModal } from '../booking/BookingConflictModal'
import type { LineEvaluationResult } from '../../../lib/availabilityEvaluation'

// @ts-expect-error React 18 act flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('New Rental Booking Conflict Help (Card 2, G-1, G-2)', () => {
  let container: HTMLDivElement
  let root: Root

  const sampleConflicts: LineEvaluationResult[] = [
    {
      lineId: 'line-camera-1',
      productId: 'prod-fx3',
      productName: 'Sony FX3 Cinema Camera',
      requestedQty: 1,
      availableQty: 0,
      status: 'conflict',
      conflictingBookingNo: 'BK-2026-0042',
      conflictingReason: 'Requested 1, but peak concurrent availability is 0',
      unavailablePeriod: {
        fromAd: '2026-11-12T00:15:00.000Z',
        toAd: '2026-11-14T00:15:00.000Z',
      },
      suggestedSolutions: {
        alternativeUnits: [{ unitId: 'unit-fx3-02', assetTag: 'FX3-002' }],
        compatibleSubstitutes: [{ productId: 'prod-a7s3', name: 'Sony A7S III Body' }],
        freeDateWindows: [{ fromIso: '2026-11-15T00:15:00.000Z', toIso: '2026-11-17T00:15:00.000Z' }],
        canReduceQuantity: true,
        canSubRent: true,
      },
    },
  ]

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it('renders conflict details, reasons, and suggested solutions in 1 view', async () => {
    await act(async () => {
      root.render(
        <BookingConflictModal
          isOpen={true}
          onClose={vi.fn()}
          conflicts={sampleConflicts}
          onKeepDraft={vi.fn()}
        />,
      )
    })

    expect(document.body.textContent).toContain('Booking conflict')
    expect(document.body.textContent).toContain('1 item is unavailable during this rental.')
    expect(document.body.textContent).toContain('Sony FX3 Cinema Camera')
    expect(document.body.textContent).toContain('Requested 1, but peak concurrent availability is 0')
  })

  it('wires onReassignUnit: allows 1-click reassignment to alternate unit', async () => {
    const reassignSpy = vi.fn()

    await act(async () => {
      root.render(
        <BookingConflictModal
          isOpen={true}
          onClose={vi.fn()}
          conflicts={sampleConflicts}
          onKeepDraft={vi.fn()}
          onReassignUnit={reassignSpy}
        />,
      )
    })

    const buttons = Array.from(document.querySelectorAll('button'))
    const assignBtn = buttons.find((b) => b.textContent?.includes('Assign FX3-002'))
    expect(assignBtn).toBeDefined()

    await act(async () => {
      assignBtn?.click()
    })

    expect(reassignSpy).toHaveBeenCalledWith('line-camera-1', 'unit-fx3-02')
  })

  it('wires onSelectSubstitute: allows 1-click replacement with compatible substitute', async () => {
    const substituteSpy = vi.fn()

    await act(async () => {
      root.render(
        <BookingConflictModal
          isOpen={true}
          onClose={vi.fn()}
          conflicts={sampleConflicts}
          onKeepDraft={vi.fn()}
          onSelectSubstitute={substituteSpy}
        />,
      )
    })

    const buttons = Array.from(document.querySelectorAll('button'))
    const subBtn = buttons.find((b) => b.textContent?.includes('Substitute Sony A7S III Body'))
    expect(subBtn).toBeDefined()

    await act(async () => {
      subBtn?.click()
    })

    expect(substituteSpy).toHaveBeenCalledWith('line-camera-1', 'prod-a7s3')
  })

  it('wires onAdjustDates: allows 1-click shift to open availability window', async () => {
    const adjustSpy = vi.fn()

    await act(async () => {
      root.render(
        <BookingConflictModal
          isOpen={true}
          onClose={vi.fn()}
          conflicts={sampleConflicts}
          onKeepDraft={vi.fn()}
          onAdjustDates={adjustSpy}
        />,
      )
    })

    const buttons = Array.from(document.querySelectorAll('button'))
    const shiftBtn = buttons.find((b) => b.textContent?.includes('Shift to 11-15'))
    expect(shiftBtn).toBeDefined()

    await act(async () => {
      shiftBtn?.click()
    })

    expect(adjustSpy).toHaveBeenCalledWith({
      fromIso: '2026-11-15T00:15:00.000Z',
      toIso: '2026-11-17T00:15:00.000Z',
    })
  })

  it('wires onRemoveItem: removes conflicting line from draft', async () => {
    const removeSpy = vi.fn()

    await act(async () => {
      root.render(
        <BookingConflictModal
          isOpen={true}
          onClose={vi.fn()}
          conflicts={sampleConflicts}
          onKeepDraft={vi.fn()}
          onRemoveItem={removeSpy}
        />,
      )
    })

    const buttons = Array.from(document.querySelectorAll('button'))
    const removeBtn = buttons.find((b) => b.textContent?.includes('Remove Line'))
    expect(removeBtn).toBeDefined()

    await act(async () => {
      removeBtn?.click()
    })

    expect(removeSpy).toHaveBeenCalledWith('line-camera-1')
  })

  it('wires onSubRent: marks sub-rent request without prematurely clearing shortage', async () => {
    const subRentSpy = vi.fn()

    await act(async () => {
      root.render(
        <BookingConflictModal
          isOpen={true}
          onClose={vi.fn()}
          conflicts={sampleConflicts}
          onKeepDraft={vi.fn()}
          onSubRent={subRentSpy}
        />,
      )
    })

    const buttons = Array.from(document.querySelectorAll('button'))
    const subRentBtn = buttons.find((b) => b.textContent?.includes('Source Sub-rental'))
    expect(subRentBtn).toBeDefined()

    await act(async () => {
      subRentBtn?.click()
    })

    expect(subRentSpy).toHaveBeenCalledWith('line-camera-1')
  })

  it('wires onKeepDraft: keeps draft and preserves typed data', async () => {
    const keepDraftSpy = vi.fn()

    await act(async () => {
      root.render(
        <BookingConflictModal
          isOpen={true}
          onClose={vi.fn()}
          conflicts={sampleConflicts}
          onKeepDraft={keepDraftSpy}
        />,
      )
    })

    const buttons = Array.from(document.querySelectorAll('button'))
    const keepDraftBtn = buttons.find((b) => b.textContent?.includes('Keep as draft'))
    expect(keepDraftBtn).toBeDefined()

    await act(async () => {
      keepDraftBtn?.click()
    })

    expect(keepDraftSpy).toHaveBeenCalledTimes(1)
  })
})
