// @vitest-environment jsdom
// @ts-expect-error global flag for react testing
globalThis.IS_REACT_ACT_ENVIRONMENT = true
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { lateFee, lateBand, bandConsequence, formatOverage } from '../../../lib/lateFee'
import { rupees } from '../../../lib/money'
import { LateFeePanel } from '../LateFeePanel'
import { ReturnSettlementModal } from '../modals/ReturnSettlementModal'

let mockUser = { id: 'USR-001', name: 'Babin Manager', role: 'Manager' }

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: mockUser,
  }),
}))

function setNativeValue(element: HTMLElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set
  const prototype = Object.getPrototypeOf(element)
  const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set

  if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
    prototypeValueSetter.call(element, value)
  } else if (valueSetter) {
    valueSetter.call(element, value)
  } else {
    ;(element as HTMLInputElement).value = value
  }
  element.dispatchEvent(new Event('input', { bubbles: true }))
  element.dispatchEvent(new Event('change', { bubbles: true }))
}

describe('T3-11: Late fee — acceptance only (D6)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    mockUser = { id: 'USR-001', name: 'Babin Manager', role: 'Manager' }
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

  const SCHEDULED = new Date('2026-08-01T10:00:00.000Z')
  const DAY_RATE = rupees(6000)

  describe('Three returns (20 min, 90 min, 3 h late) produce 0, half and full day', () => {
    it('Case 1: 20 min late (≤30 min grace) produces 0 fee and grace notification', () => {
      const actual = new Date(SCHEDULED.getTime() + 20 * 60_000)

      // 1. Calculation engine produces 0 late fee
      const feeResult = lateFee({
        scheduledReturnAt: SCHEDULED,
        actualReturnAt: actual,
        dayRatePaisa: DAY_RATE,
      })
      expect(feeResult.overageMinutes).toBe(20)
      expect(feeResult.band).toBe('None')
      expect(feeResult.feePaisa).toBe(0)

      // 2. lateBand for floor preserves Law 6 money blindness
      const band = lateBand(SCHEDULED, actual)
      expect(band.band).toBe('None')
      expect(bandConsequence(band)).toContain('Within the 30-minute grace period — nothing chargeable.')

      // 3. LateFeePanel renders grace period banner
      act(() => {
        root.render(
          <LateFeePanel
            result={feeResult}
            dayRateBasis="Equipment total ÷ 1 day"
            staffName="Desk Staff"
            outcome={null}
            onSettle={() => {}}
          />,
        )
      })
      expect(document.body.textContent).toContain('Returned within the 30-minute grace period — no late fee.')

      // 4. ReturnSettlementModal shows 0 suggested late fee
      act(() => {
        root.render(
          <ReturnSettlementModal
            isOpen={true}
            onClose={() => {}}
            bookingNo="B-201"
            clientName="Grace Client"
            scheduledReturnIso={SCHEDULED.toISOString()}
            actualReturnIso={actual.toISOString()}
            dayRatePaisa={DAY_RATE}
            totalItemCount={1}
            depositHeldPaisa={rupees(10000)}
            onConfirmSettlement={vi.fn()}
          />,
        )
      })
      expect(document.body.textContent).toContain('Late Return Duration: 20m')
      expect(document.body.textContent).toContain('Suggested Fee: Rs 0')
    })

    it('Case 2: 90 min late (< 2 h) produces half day fee suggestion', () => {
      const actual = new Date(SCHEDULED.getTime() + 90 * 60_000)

      // 1. Calculation engine produces half day fee
      const feeResult = lateFee({
        scheduledReturnAt: SCHEDULED,
        actualReturnAt: actual,
        dayRatePaisa: DAY_RATE,
      })
      expect(feeResult.overageMinutes).toBe(90)
      expect(feeResult.band).toBe('Half Day')
      expect(feeResult.feePaisa).toBe(rupees(3000))

      // 2. lateBand for floor
      const band = lateBand(SCHEDULED, actual)
      expect(band.band).toBe('Half Day')
      expect(formatOverage(band.overageMinutes)).toBe('1h 30m')
      expect(bandConsequence(band)).toBe('Half a rental day is chargeable. Finance decides whether to apply it.')

      // 3. LateFeePanel suggests half day fee and allows staff to apply
      const settleSpy = vi.fn()
      act(() => {
        root.render(
          <LateFeePanel
            result={feeResult}
            dayRateBasis="Equipment total ÷ 1 day"
            staffName="Desk Staff"
            outcome={null}
            onSettle={settleSpy}
          />,
        )
      })
      expect(document.body.textContent).toContain('Suggested late fee')
      expect(document.body.textContent).toContain('Rs 3,000')
      expect(document.body.textContent).toContain('under 2 hours late = half day')

      // Staff applies late fee
      const applyBtn = [...document.body.querySelectorAll('button')].find((b) => b.textContent?.includes('Apply Rs 3,000'))
      expect(applyBtn).toBeTruthy()
      act(() => {
        applyBtn?.click()
      })
      expect(settleSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          decision: 'Apply',
          chargedPaisa: rupees(3000),
          suggestedPaisa: rupees(3000),
        }),
      )
    })

    it('Case 3: 3 hours late (≥ 2 h) produces full day fee suggestion', () => {
      const actual = new Date(SCHEDULED.getTime() + 180 * 60_000)

      // 1. Calculation engine produces full day fee
      const feeResult = lateFee({
        scheduledReturnAt: SCHEDULED,
        actualReturnAt: actual,
        dayRatePaisa: DAY_RATE,
      })
      expect(feeResult.overageMinutes).toBe(180)
      expect(feeResult.band).toBe('Full Day')
      expect(feeResult.fullDaysCharged).toBe(1)
      expect(feeResult.feePaisa).toBe(rupees(6000))

      // 2. lateBand for floor
      const band = lateBand(SCHEDULED, actual)
      expect(band.band).toBe('Full Day')
      expect(formatOverage(band.overageMinutes)).toBe('3h')
      expect(bandConsequence(band)).toBe('A full rental day is chargeable. Finance decides whether to apply it.')

      // 3. ReturnSettlementModal suggests full day fee and supports applying
      const onConfirm = vi.fn()
      act(() => {
        root.render(
          <ReturnSettlementModal
            isOpen={true}
            onClose={() => {}}
            bookingNo="B-203"
            clientName="Full Day Late Client"
            scheduledReturnIso={SCHEDULED.toISOString()}
            actualReturnIso={actual.toISOString()}
            dayRatePaisa={DAY_RATE}
            totalItemCount={1}
            depositHeldPaisa={rupees(10000)}
            onConfirmSettlement={onConfirm}
          />,
        )
      })
      expect(document.body.textContent).toContain('Late Return Duration: 3h')
      expect(document.body.textContent).toContain('Band: Full Day')
      expect(document.body.textContent).toContain('Suggested Fee: Rs 6,000')

      // Record settlement with applied full day fee
      const submitBtn = [...document.body.querySelectorAll('button')].find((b) => b.textContent?.includes('Record Settlement'))
      expect(submitBtn).toBeTruthy()
      act(() => {
        submitBtn?.click()
      })
      expect(onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          lateFeeSuggestedPaisa: rupees(6000),
          lateFeeChargedPaisa: rupees(6000),
        }),
      )
    })
  })

  describe('Waiver policy and RBAC authorization (D6)', () => {
    it('Manager can authorize late fee waiver with valid reason (≥ 10 chars)', () => {
      const actual = new Date(SCHEDULED.getTime() + 180 * 60_000)
      const onConfirm = vi.fn()

      act(() => {
        root.render(
          <ReturnSettlementModal
            isOpen={true}
            onClose={() => {}}
            bookingNo="B-204"
            clientName="Waiver Client"
            scheduledReturnIso={SCHEDULED.toISOString()}
            actualReturnIso={actual.toISOString()}
            dayRatePaisa={DAY_RATE}
            totalItemCount={1}
            depositHeldPaisa={rupees(10000)}
            onConfirmSettlement={onConfirm}
          />,
        )
      })

      // Click Waive radio
      const radios = [...document.body.querySelectorAll<HTMLInputElement>('input[type="radio"]')]
      const waiveRadio = radios.find((r) => r.nextSibling?.textContent?.includes('Waive'))
      expect(waiveRadio).toBeTruthy()
      act(() => {
        waiveRadio?.click()
      })

      // Try submit without reason
      const submitBtn = [...document.body.querySelectorAll('button')].find((b) => b.textContent?.includes('Record Settlement'))
      act(() => {
        submitBtn?.click()
      })
      expect(document.body.textContent).toContain('at least 10 characters')
      expect(onConfirm).not.toHaveBeenCalled()

      // Fill valid reason
      const textarea = document.body.querySelector<HTMLTextAreaElement>('textarea')
      expect(textarea).toBeTruthy()
      act(() => {
        if (textarea) setNativeValue(textarea, 'Shoot prolonged due to heavy rain and road blockage')
      })

      // Submit succeeds as Manager
      act(() => {
        submitBtn?.click()
      })
      expect(onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          lateFeeSuggestedPaisa: rupees(6000),
          lateFeeChargedPaisa: 0,
          lateFeeWaiver: expect.objectContaining({
            reason: 'Shoot prolonged due to heavy rain and road blockage',
            approverName: 'Babin Manager',
          }),
        }),
      )
    })

    it('Non-manager (Coordinator) is refused from approving a waiver', () => {
      mockUser = { id: 'USR-002', name: 'Sagar Coordinator', role: 'Coordinator' }
      const actual = new Date(SCHEDULED.getTime() + 180 * 60_000)
      const onConfirm = vi.fn()

      act(() => {
        root.render(
          <ReturnSettlementModal
            isOpen={true}
            onClose={() => {}}
            bookingNo="B-205"
            clientName="Coordinator Test"
            scheduledReturnIso={SCHEDULED.toISOString()}
            actualReturnIso={actual.toISOString()}
            dayRatePaisa={DAY_RATE}
            totalItemCount={1}
            depositHeldPaisa={rupees(10000)}
            onConfirmSettlement={onConfirm}
          />,
        )
      })

      // Click Waive radio
      const radios = [...document.body.querySelectorAll<HTMLInputElement>('input[type="radio"]')]
      const waiveRadio = radios.find((r) => r.nextSibling?.textContent?.includes('Waive'))
      act(() => {
        waiveRadio?.click()
      })

      // Fill valid reason
      const textarea = document.body.querySelector<HTMLTextAreaElement>('textarea')
      act(() => {
        if (textarea) setNativeValue(textarea, 'Coordinator tried to waive without manager')
      })

      // Submit is refused with role warning
      const submitBtn = [...document.body.querySelectorAll('button')].find((b) => b.textContent?.includes('Record Settlement'))
      act(() => {
        submitBtn?.click()
      })
      expect(document.body.textContent).toContain('A waiver is approved by a Manager or Owner')
      expect(onConfirm).not.toHaveBeenCalled()
    })
  })
})
