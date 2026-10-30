// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import BookingConflictModal from '../BookingConflictModal'
import type { LineEvaluationResult } from '../../../lib/availabilityEvaluation'

describe('BookingConflictModal', () => {
  let container: HTMLDivElement
  let root: Root

  const sampleConflicts: LineEvaluationResult[] = [
    {
      lineId: 'line-1',
      productId: 'prod-fx3',
      productName: 'Sony FX3 Cinema Camera',
      requestedQty: 1,
      availableQty: 0,
      status: 'conflict',
      conflictingBookingNo: 'B-102',
      conflictingReason: 'Already reserved by Booking B-102',
      unavailablePeriod: {
        fromAd: '2026-11-03T00:15:00.000Z',
        toAd: '2026-11-04T00:15:00.000Z',
      },
      suggestedSolutions: {
        alternativeUnits: [{ unitId: 'unit-fx3-02', assetTag: 'CAM-002' }],
        compatibleSubstitutes: [{ productId: 'prod-a7s3', name: 'Sony A7S III' }],
        canReduceQuantity: false,
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

  it('renders title, subtitle and conflict details accurately', async () => {
    await act(async () => {
      root.render(
        <BookingConflictModal
          isOpen={true}
          onClose={vi.fn()}
          bookingNo="B-101"
          conflicts={sampleConflicts}
          onKeepDraft={vi.fn()}
        />,
      )
    })

    expect(document.body.textContent).toContain('Booking conflict')
    expect(document.body.textContent).toContain('1 item is unavailable during this rental.')
    expect(document.body.textContent).toContain('Sony FX3 Cinema Camera')
    expect(document.body.textContent).toContain('Already reserved by Booking B-102')
  })

  it('displays ordered solutions and triggers keep as draft', async () => {
    const keepDraftSpy = vi.fn()
    const closeSpy = vi.fn()

    await act(async () => {
      root.render(
        <BookingConflictModal
          isOpen={true}
          onClose={closeSpy}
          bookingNo="B-101"
          conflicts={sampleConflicts}
          onKeepDraft={keepDraftSpy}
        />,
      )
    })

    expect(document.body.textContent).toContain('1. Assign another same-model unit')
    expect(document.body.textContent).toContain('Assign CAM-002')
    expect(document.body.textContent).toContain('2. Offer approved compatible replacement')
    expect(document.body.textContent).toContain('Substitute Sony A7S III')

    const buttons = Array.from(document.querySelectorAll('button'))
    const keepDraftBtn = buttons.find((b) => b.textContent?.includes('Keep as draft'))
    expect(keepDraftBtn).toBeDefined()

    await act(async () => {
      keepDraftBtn?.click()
    })

    expect(keepDraftSpy).toHaveBeenCalledTimes(1)
    expect(closeSpy).toHaveBeenCalledTimes(1)
  })
})
