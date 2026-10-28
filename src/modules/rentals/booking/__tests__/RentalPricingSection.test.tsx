// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { RentalPricingSection } from '../RentalPricingSection'
import type { PricingPipelineResult } from '../../../../lib/pricingPipeline'
import { rupees } from '../../../../lib/money'

vi.mock('../../../../lib/device', () => ({ useViewport: () => 'desktop' }))

const mockPricing: PricingPipelineResult = {
  equipmentSubtotalPaisa: rupees(10000),
  bundleSubtotalPaisa: rupees(0),
  subRentalSubtotalPaisa: rupees(0),
  servicesSubtotalPaisa: rupees(0),
  crewSubtotalPaisa: rupees(0),
  deliverySubtotalPaisa: rupees(0),
  grossSubtotalPaisa: rupees(10000),
  discounts: {
    rawTotalPercent: 0,
    appliedPercent: 0,
    discountPaisa: rupees(0),
    capped: false,
    sources: [],
    validationErrors: [],
  },
  taxableSubtotalPaisa: rupees(10000),
  vatPaisa: rupees(1300),
  vatRatePercent: 13,
  rentalTotalPaisa: rupees(11300),
  securityDeposit: {
    recommendedPaisa: rupees(5000),
    requiredPaisa: rupees(5000),
    overridden: false,
    overrideReason: null,
    authorizedBy: null,
    validationErrors: [],
  },
  advanceRequiredPaisa: rupees(5650),
  grandTotalRequirementPaisa: rupees(16300),
}

describe('RentalPricingSection', () => {
  it('renders pricing controls, discounts, and Law 5 deposit isolation', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    try {
      await act(async () => {
        root.render(
          <RentalPricingSection
            open={true}
            onToggle={vi.fn()}
            isDesktop={true}
            pricing={mockPricing}
            canCrewMoney={true}
            vatOn={true}
            setVatOn={vi.fn()}
            vatRatePercent={13}
            discountPct={0}
            setDiscountPct={vi.fn()}
            manualDiscountReason=""
            setManualDiscountReason={vi.fn()}
            manualDiscountAuthorizedBy=""
            setManualDiscountAuthorizedBy={vi.fn()}
            womenDopEligible={false}
            setWomenDopEligible={vi.fn()}
            isStudentBundle={false}
            promoCodeInput=""
            setPromoCodeInput={vi.fn()}
            promoCodeApplied={null}
            setPromoCodeApplied={vi.fn()}
            promoNotice={null}
            setPromoNotice={vi.fn()}
            pickupAt={new Date('2026-10-10')}
            manualDepositOverride={false}
            setManualDepositOverride={vi.fn()}
            manualDepositAmount=""
            setManualDepositAmount={vi.fn()}
            depositOverrideReason=""
            setDepositOverrideReason={vi.fn()}
            depositAuthorizedBy=""
            setDepositAuthorizedBy={vi.fn()}
          />,
        )
      })

      expect(host.textContent).toContain('Discounts & Taxes')
      expect(host.textContent).toContain('Security Deposit')
      expect(host.textContent).toContain('Recommended Deposit')
      expect(host.textContent).toContain('Manual Deposit Override')
      expect(host.textContent).toContain('Refundable and separate from rent')
    } finally {
      await act(async () => root.unmount())
      host.remove()
    }
  })

  it('allows manual discount adjustment and preset selection', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const setDiscountPct = vi.fn()

    try {
      await act(async () => {
        root.render(
          <RentalPricingSection
            open={true}
            onToggle={vi.fn()}
            isDesktop={true}
            pricing={mockPricing}
            canCrewMoney={true}
            vatOn={true}
            setVatOn={vi.fn()}
            vatRatePercent={13}
            discountPct={0}
            setDiscountPct={setDiscountPct}
            manualDiscountReason=""
            setManualDiscountReason={vi.fn()}
            manualDiscountAuthorizedBy=""
            setManualDiscountAuthorizedBy={vi.fn()}
            womenDopEligible={false}
            setWomenDopEligible={vi.fn()}
            isStudentBundle={false}
            promoCodeInput=""
            setPromoCodeInput={vi.fn()}
            promoCodeApplied={null}
            setPromoCodeApplied={vi.fn()}
            promoNotice={null}
            setPromoNotice={vi.fn()}
            pickupAt={new Date('2026-10-10')}
            manualDepositOverride={false}
            setManualDepositOverride={vi.fn()}
            manualDepositAmount=""
            setManualDepositAmount={vi.fn()}
            depositOverrideReason=""
            setDepositOverrideReason={vi.fn()}
            depositAuthorizedBy=""
            setDepositAuthorizedBy={vi.fn()}
          />,
        )
      })

      const chip10 = Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.includes('10%'))
      expect(chip10).toBeDefined()
      await act(async () => {
        chip10?.click()
      })
      expect(setDiscountPct).toHaveBeenCalledWith(10)
    } finally {
      await act(async () => root.unmount())
      host.remove()
    }
  })

  it('handles manual security deposit override toggle and fields', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const setManualDepositOverride = vi.fn()

    try {
      await act(async () => {
        root.render(
          <RentalPricingSection
            open={true}
            onToggle={vi.fn()}
            isDesktop={true}
            pricing={mockPricing}
            canCrewMoney={true}
            vatOn={true}
            setVatOn={vi.fn()}
            vatRatePercent={13}
            discountPct={0}
            setDiscountPct={vi.fn()}
            manualDiscountReason=""
            setManualDiscountReason={vi.fn()}
            manualDiscountAuthorizedBy=""
            setManualDiscountAuthorizedBy={vi.fn()}
            womenDopEligible={false}
            setWomenDopEligible={vi.fn()}
            isStudentBundle={false}
            promoCodeInput=""
            setPromoCodeInput={vi.fn()}
            promoCodeApplied={null}
            setPromoCodeApplied={vi.fn()}
            promoNotice={null}
            setPromoNotice={vi.fn()}
            pickupAt={new Date('2026-10-10')}
            manualDepositOverride={true}
            setManualDepositOverride={setManualDepositOverride}
            manualDepositAmount="3000"
            setManualDepositAmount={vi.fn()}
            depositOverrideReason="Regular client courtesy"
            setDepositOverrideReason={vi.fn()}
            depositAuthorizedBy="Babin"
            setDepositAuthorizedBy={vi.fn()}
          />,
        )
      })

      expect(host.textContent).toContain('Override Amount (Rs) *')
      expect(host.textContent).toContain('Override Reason *')
      expect(host.textContent).toContain('Authorized By *')
    } finally {
      await act(async () => root.unmount())
      host.remove()
    }
  })

  it('displays member benefit line with plan discounts and allows staff to remove it without approval (Law 10)', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const onToggleMemberDiscount = vi.fn()

    const mockMembership = {
      level: 'Creator' as const,
      label: 'Creator Pass',
      individualDiscountPct: 15,
      bundleDiscountPct: 7,
      monthlyBookingLimit: 4,
      simultaneousRentalLimit: 2,
      perks: ['Priority Booking'],
      status: 'Active' as const,
      benefitsActive: true,
    }

    try {
      await act(async () => {
        root.render(
          <RentalPricingSection
            open={true}
            onToggle={vi.fn()}
            isDesktop={true}
            pricing={mockPricing}
            canCrewMoney={true}
            vatOn={true}
            setVatOn={vi.fn()}
            vatRatePercent={13}
            discountPct={0}
            setDiscountPct={vi.fn()}
            manualDiscountReason=""
            setManualDiscountReason={vi.fn()}
            manualDiscountAuthorizedBy=""
            setManualDiscountAuthorizedBy={vi.fn()}
            womenDopEligible={false}
            setWomenDopEligible={vi.fn()}
            isStudentBundle={false}
            promoCodeInput=""
            setPromoCodeInput={vi.fn()}
            promoCodeApplied={null}
            setPromoCodeApplied={vi.fn()}
            promoNotice={null}
            setPromoNotice={vi.fn()}
            pickupAt={new Date('2026-10-10')}
            manualDepositOverride={false}
            setManualDepositOverride={vi.fn()}
            manualDepositAmount=""
            setManualDepositAmount={vi.fn()}
            depositOverrideReason=""
            setDepositOverrideReason={vi.fn()}
            depositAuthorizedBy=""
            setDepositAuthorizedBy={vi.fn()}
            clientMembership={mockMembership}
            memberDiscountRemoved={false}
            onToggleMemberDiscount={onToggleMemberDiscount}
          />,
        )
      })

      const line = host.querySelector('[data-testid="membership-benefit-line"]')
      expect(line).not.toBeNull()
      expect(line?.textContent).toContain('Creator Member Plan Benefit')
      expect(line?.textContent).toContain('15% on equipment · 7% on bundles')

      const removeBtn = line?.querySelector('button')
      expect(removeBtn?.textContent).toBe('Remove')

      await act(async () => {
        removeBtn?.click()
      })
      expect(onToggleMemberDiscount).toHaveBeenCalledTimes(1)
    } finally {
      await act(async () => root.unmount())
      host.remove()
    }
  })

  it('displays removed note when member discount is removed and allows re-applying', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const onToggleMemberDiscount = vi.fn()

    const mockMembership = {
      level: 'Creator' as const,
      label: 'Creator Pass',
      individualDiscountPct: 15,
      bundleDiscountPct: 7,
      monthlyBookingLimit: 4,
      simultaneousRentalLimit: 2,
      perks: ['Priority Booking'],
      status: 'Active' as const,
      benefitsActive: true,
    }

    try {
      await act(async () => {
        root.render(
          <RentalPricingSection
            open={true}
            onToggle={vi.fn()}
            isDesktop={true}
            pricing={mockPricing}
            canCrewMoney={true}
            vatOn={true}
            setVatOn={vi.fn()}
            vatRatePercent={13}
            discountPct={0}
            setDiscountPct={vi.fn()}
            manualDiscountReason=""
            setManualDiscountReason={vi.fn()}
            manualDiscountAuthorizedBy=""
            setManualDiscountAuthorizedBy={vi.fn()}
            womenDopEligible={false}
            setWomenDopEligible={vi.fn()}
            isStudentBundle={false}
            promoCodeInput=""
            setPromoCodeInput={vi.fn()}
            promoCodeApplied={null}
            setPromoCodeApplied={vi.fn()}
            promoNotice={null}
            setPromoNotice={vi.fn()}
            pickupAt={new Date('2026-10-10')}
            manualDepositOverride={false}
            setManualDepositOverride={vi.fn()}
            manualDepositAmount=""
            setManualDepositAmount={vi.fn()}
            depositOverrideReason=""
            setDepositOverrideReason={vi.fn()}
            depositAuthorizedBy=""
            setDepositAuthorizedBy={vi.fn()}
            clientMembership={mockMembership}
            memberDiscountRemoved={true}
            onToggleMemberDiscount={onToggleMemberDiscount}
          />,
        )
      })

      const line = host.querySelector('[data-testid="membership-benefit-line"]')
      expect(line).not.toBeNull()
      expect(line?.textContent).toContain('Member discount removed for this booking')

      const applyBtn = line?.querySelector('button')
      expect(applyBtn?.textContent).toBe('Apply')

      await act(async () => {
        applyBtn?.click()
      })
      expect(onToggleMemberDiscount).toHaveBeenCalledTimes(1)
    } finally {
      await act(async () => root.unmount())
      host.remove()
    }
  })
})
