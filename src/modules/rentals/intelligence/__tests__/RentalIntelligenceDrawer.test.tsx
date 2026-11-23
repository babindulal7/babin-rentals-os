import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { RentalIntelligenceDrawer } from '../RentalIntelligenceDrawer'
import type { RentalAdvice } from '../../../../lib/rentalIntelligence/types'
import type { CanonicalQuoteSnapshot } from '../../../../lib/rentalIntelligence/quoteExplainer'
import type { ClientProfileInput } from '../../../../lib/rentalIntelligence/clientIntelligence'
import type { AssetPerformanceInput } from '../../../../lib/rentalIntelligence/idleStockEngine'
import type { MorningReportInput } from '../../../../lib/rentalIntelligence/morningReport'
import { rupees } from '../../../../lib/money'

describe('RentalIntelligenceDrawer UI Component', () => {
  const sampleAdvices: RentalAdvice[] = [
    {
      id: 'adv-1',
      module: 'kit',
      target: { type: 'booking', id: 'BK-100' },
      evidenceState: 'needs_verification',
      severity: 'review',
      explanation: 'RED Komodo-X requires CFexpress Type B card and V-Mount batteries.',
      sourceRefs: ['references/cameras.md'],
      sourceKinds: ['approved_knowledge'],
      snapshotAt: '2026-11-23T12:00:00Z',
      requiredChecks: ['Verify firmware version', 'Format media'],
      suggestedAdditions: [
        {
          productId: 'BRPI-BATT-VMOUNT-99WH',
          displayName: '99Wh V-Mount Battery Pack (Dual)',
          quantity: 2,
          reason: 'Continuous camera power',
          chargeType: 'required_dependency',
        },
      ],
    },
    {
      id: 'adv-2',
      module: 'safety',
      target: { type: 'product', id: 'RONIN-1' },
      evidenceState: 'blocked',
      severity: 'urgent',
      explanation: 'HARD BLOCK: Ronin 4D cannot be mounted to handheld gimbal.',
      sourceRefs: ['references/grip.md'],
      sourceKinds: ['approved_knowledge'],
      snapshotAt: '2026-11-23T12:00:00Z',
      requiredChecks: ['Remove gimbal'],
      blockingReasons: ['Integrated 4-axis stabilization is incompatible with handheld gimbal.'],
    },
  ]

  it('renders drawer content when open is true', () => {
    const html = renderToStaticMarkup(
      <RentalIntelligenceDrawer
        open={true}
        onClose={() => {}}
        advices={sampleAdvices}
        bookingNo="2026-0715"
        userRole="Coordinator"
      />,
    )

    expect(html).toContain('Rental Intelligence')
    expect(html).toContain('Booking #2026-0715')
    expect(html).toContain('HARD BLOCK: Ronin 4D cannot be mounted to handheld gimbal.')
    expect(html).toContain('RED Komodo-X requires CFexpress Type B card and V-Mount batteries.')
  })

  it('renders floor role badge and strips money when user is Warehouse', () => {
    const html = renderToStaticMarkup(
      <RentalIntelligenceDrawer
        open={true}
        onClose={() => {}}
        advices={sampleAdvices}
        userRole="Warehouse"
      />,
    )

    expect(html).toContain('Floor Role (₨ Omitted)')
  })

  it('renders suggested additions and "+ Add to Draft" action', () => {
    const html = renderToStaticMarkup(
      <RentalIntelligenceDrawer
        open={true}
        onClose={() => {}}
        advices={sampleAdvices}
        onAddSuggestion={() => {}}
      />,
    )

    expect(html).toContain('99Wh V-Mount Battery Pack (Dual)')
    expect(html).toContain('+ Add to Draft')
  })

  it('renders active module tabs with advice counts', () => {
    const html = renderToStaticMarkup(
      <RentalIntelligenceDrawer
        open={true}
        onClose={() => {}}
        advices={sampleAdvices}
      />,
    )

    expect(html).toContain('All (2)')
    expect(html).toContain('Kit Recommender (1)')
    expect(html).toContain('Safety Validation (1)')
  })

  it('renders planned capabilities section with exactly 3 planned modules', () => {
    const html = renderToStaticMarkup(
      <RentalIntelligenceDrawer
        open={true}
        onClose={() => {}}
        advices={sampleAdvices}
      />,
    )

    expect(html).toContain('Planned Capabilities (3)')
    expect(html).toContain('Rental RAG')
    expect(html).toContain('Rules &amp; Playbooks')
    expect(html).toContain('Decision Journal')
  })

  it('renders empty state when no advices are present', () => {
    const html = renderToStaticMarkup(
      <RentalIntelligenceDrawer
        open={true}
        onClose={() => {}}
        advices={[]}
      />,
    )

    expect(html).toContain('No active warnings or suggestions')
    expect(html).toContain('Current draft configuration passes deterministic kit, safety, and operational gates.')
  })

  it('renders equipment safety baseline card with rig weight and lighting load', () => {
    const html = renderToStaticMarkup(
      <RentalIntelligenceDrawer
        open={true}
        onClose={() => {}}
        advices={[]}
        currentItems={[
          { name: 'Sony FX3A Cinema Body', quantity: 1 },
          { name: 'Aputure LS 600x Pro', quantity: 1 },
        ]}
      />,
    )

    expect(html).toContain('Equipment Safety Baseline')
    expect(html).toContain('ESTIMATED RIG WEIGHT')
    expect(html).toContain('LIGHTING LOAD')
    expect(html).toContain('735W (Limit 2,760W)')
  })

  it('renders Kit Builder tab button in active modules bar', () => {
    const html = renderToStaticMarkup(
      <RentalIntelligenceDrawer
        open={true}
        onClose={() => {}}
        advices={sampleAdvices}
      />,
    )

    expect(html).toContain('Kit Builder')
  })

  describe('Phase RI-3: Quote Explanation & Operational Checklist views', () => {
    const sampleQuoteSnapshot: CanonicalQuoteSnapshot = {
      bookingId: 'BK-2026-001',
      days: 2,
      lineItems: [
        {
          productId: 'BRPI-CAM-FX3',
          displayName: 'Sony FX3A Cinema Body',
          quantity: 1,
          unitRatePaisa: rupees(6000),
          lineTotalPaisa: rupees(12000),
        },
        {
          productId: 'BRPI-LNS-2470',
          displayName: 'Sony FE 24-70mm f/2.8 GM II',
          quantity: 1,
          unitRatePaisa: rupees(4000),
          lineTotalPaisa: rupees(8000),
        },
      ],
      equipmentSubtotalPaisa: rupees(20000),
      discountPercent: 10,
      discountAmountPaisa: rupees(2000),
      discountReason: 'Corporate repeat partner discount',
      discountApprover: 'Owner (Babin)',
      taxRatePercent: 13,
      taxAmountPaisa: rupees(2340),
      totalRentalPaisa: rupees(20340),
      depositPaisa: rupees(50000),
      advancePaidPaisa: rupees(10170),
      outstandingPaisa: rupees(10170),
      currency: 'NPR',
      calculatedAtIso: '2026-11-23T12:00:00Z',
    }

    it('renders authoritative quote explanation breakdown for authorized roles', () => {
      const html = renderToStaticMarkup(
        <RentalIntelligenceDrawer
          open={true}
          onClose={() => {}}
          advices={[]}
          quoteSnapshot={sampleQuoteSnapshot}
          userRole="Coordinator"
        />,
      )

      expect(html).toContain('Authoritative Quote Explanation (Why this price?)')
      expect(html).toContain('2 Day(s)')
      expect(html).toContain('Equipment Base Subtotal:')
      expect(html).toContain('Approved Discount (10%):')
      expect(html).toContain('Nepal VAT (13%):')
      expect(html).toContain('Total Rental:')
      expect(html).toContain('Security Deposit Liability (Escrow):')
      expect(html).toContain('Held separately in escrow; strictly excluded from rental revenue.')
      expect(html).toContain('Advance Received:')
      expect(html).toContain('Balance Due at Handover:')
    })

    it('masks commercial breakdown when userRole is Warehouse', () => {
      const html = renderToStaticMarkup(
        <RentalIntelligenceDrawer
          open={true}
          onClose={() => {}}
          advices={[]}
          quoteSnapshot={sampleQuoteSnapshot}
          userRole="Warehouse"
        />,
      )

      expect(html).toContain('Authoritative Quote Explanation (Why this price?)')
      expect(html).toContain('Commercial rates, VAT, and financial totals are omitted on floor surfaces in compliance with field-level gating.')
      expect(html).not.toContain('Equipment Base Subtotal:')
      expect(html).not.toContain('Nepal VAT (13%):')
    })

    it('masks commercial breakdown when surface is floor', () => {
      const html = renderToStaticMarkup(
        <RentalIntelligenceDrawer
          open={true}
          onClose={() => {}}
          advices={[]}
          quoteSnapshot={sampleQuoteSnapshot}
          userRole="Coordinator"
          surface="floor"
        />,
      )

      expect(html).toContain('Commercial rates, VAT, and financial totals are omitted on floor surfaces in compliance with field-level gating.')
      expect(html).not.toContain('Equipment Base Subtotal:')
    })

    it('renders operational checklist generator with stage tabs, delivery load badge, and invariant notice', () => {
      const html = renderToStaticMarkup(
        <RentalIntelligenceDrawer
          open={true}
          onClose={() => {}}
          advices={[]}
          checklistLines={[
            { id: 'L-1', productId: 'BRPI-CAM-FX3', displayName: 'Sony FX3A Cinema Body', dispatchedQuantity: 1 },
            { id: 'L-2', productId: 'BRPI-LNS-2470', displayName: 'Sony FE 24-70mm f/2.8 GM II', dispatchedQuantity: 1 },
          ]}
        />,
      )

      expect(html).toContain('Operational Checklist Generator')
      expect(html).toContain('prep')
      expect(html).toContain('Custody stage transitions require verified submission in Babin Rentals OS.')
      expect(html).toContain('Sony FX3 XLR Audio Handle Pin Check')
      expect(html).toContain('Barcode &amp; Physical Serial Verification')
    })
  })

  describe('Phase RI-4: Client, Idle Stock & Morning Report views', () => {
    const sampleClient: ClientProfileInput = {
      clientId: 'CL-TEST-10',
      clientName: 'Kathmandu Visuals Pvt. Ltd.',
      orderCount: 6,
      flags: ['corporate', 'agency'],
      outstandingBalancePaisa: rupees(35000),
      overdueDays: 2,
    }

    const sampleFleet: AssetPerformanceInput[] = [
      {
        productId: 'BRPI-CAM-FX3',
        displayName: 'Sony FX3A Cinema Line Body',
        category: 'Camera Body',
        purchaseCostPaisa: rupees(285000),
        dailyRatePaisa: rupees(4000),
        unitsOwned: 2,
        monthlyRentedDaysAvg: 46.0,
        lostDemandDaysMonthly: 4.0,
      },
      {
        productId: 'BRPI-LNS-CHIOPT',
        displayName: 'CHIOPT 28-85mm Cinema Zoom Set',
        category: 'Cine Lenses',
        purchaseCostPaisa: rupees(790000),
        dailyRatePaisa: rupees(14000),
        unitsOwned: 1,
        monthlyRentedDaysAvg: 0.5,
      },
    ]

    const sampleMorning: MorningReportInput = {
      currentDateIso: '2026-11-24T06:00:00Z',
      nepaliDateBs: '2083-08-09',
      activeBookings: [
        {
          id: 'B-01',
          bookingNo: '2026-1001',
          clientName: 'Sunrise Productions',
          status: 'confirmed',
          pickupTimeIso: '2026-11-24T08:00:00Z',
          returnTimeIso: '2026-11-26T18:00:00Z',
          items: [{ productId: 'BRPI-CAM-FX3', displayName: 'Sony FX3A Cinema Line Body', quantity: 1 }],
          hasCaretaker: false,
        },
      ],
      maintenanceUnits: [
        {
          unitId: 'U-01',
          serialNumber: 'SN-001',
          productId: 'BRPI-LNS-CHIOPT',
          productName: 'CHIOPT Cinema Zoom',
          holdReason: 'Humidity dry cabinet bake',
          holdStartedAtIso: '2026-11-23T12:00:00Z',
          quarantineType: 'monsoon_dry_cabinet',
        },
      ],
    }

    it('renders Client Intelligence view with persona and due recovery draft for Coordinator', () => {
      const html = renderToStaticMarkup(
        <RentalIntelligenceDrawer
          open={true}
          onClose={() => {}}
          advices={[]}
          clientProfile={sampleClient}
          userRole="Coordinator"
        />,
      )

      expect(html).toContain('Client Intelligence (Kathmandu Visuals Pvt. Ltd.)')
      expect(html).toContain('Corporate / Commercial Agency')
      expect(html).toContain('Trust 1x')
      expect(html).toContain('Overdue Recovery Draft (Payment Follow-up)')
      expect(html).toContain('Staff Review Only')
      expect(html).toContain('update us on when the transfer is scheduled')
    })

    it('strips due recovery draft from Client Intelligence view when userRole is Warehouse', () => {
      const html = renderToStaticMarkup(
        <RentalIntelligenceDrawer
          open={true}
          onClose={() => {}}
          advices={[]}
          clientProfile={sampleClient}
          userRole="Warehouse"
        />,
      )

      expect(html).toContain('Client Intelligence (Kathmandu Visuals Pvt. Ltd.)')
      expect(html).toContain('Corporate / Commercial Agency')
      expect(html).not.toContain('Overdue Recovery Draft')
      expect(html).not.toContain('Rs 35,000')
    })

    it('renders Idle Stock Activation view with expansion count, idle capital, and asset cards', () => {
      const html = renderToStaticMarkup(
        <RentalIntelligenceDrawer
          open={true}
          onClose={() => {}}
          advices={[]}
          fleetPerformance={sampleFleet}
          userRole="Manager"
        />,
      )

      expect(html).toContain('Fleet Idle Stock &amp; Activation')
      expect(html).toContain('Idle Capital: Rs 7,90,000')
      expect(html).toContain('1 Expansion')
      expect(html).toContain('1 High Idle Capital')
      expect(html).toContain('Sony FX3A Cinema Line Body')
      expect(html).toContain('CHIOPT 28-85mm Cinema Zoom Set')
    })

    it('strips idle capital amounts from Idle Stock Activation view when userRole is Warehouse', () => {
      const html = renderToStaticMarkup(
        <RentalIntelligenceDrawer
          open={true}
          onClose={() => {}}
          advices={[]}
          fleetPerformance={sampleFleet}
          userRole="Warehouse"
        />,
      )

      expect(html).toContain('Fleet Idle Stock &amp; Activation')
      expect(html).not.toContain('Idle Capital: Rs')
      expect(html).not.toContain('7,90,000')
      expect(html).toContain('Sony FX3A Cinema Line Body')
    })

    it('renders Morning Report view with dual calendar, queue counts, and revenue leakage audit', () => {
      const html = renderToStaticMarkup(
        <RentalIntelligenceDrawer
          open={true}
          onClose={() => {}}
          advices={[]}
          morningReportInput={sampleMorning}
          userRole="Manager"
        />,
      )

      expect(html).toContain('Today Morning Operational Report')
      expect(html).toContain('AD 2026-11-24')
      expect(html).toContain('BS 2083-08-09')
      expect(html).toContain('1 Pickups Today')
      expect(html).toContain('1 QC/Quarantine')
      expect(html).toContain('Revenue Leakage Audits (1)')
      expect(html).toContain('Recoverable: Rs 2,000')
    })

    it('strips revenue leakage audits from Morning Report view when surface is floor', () => {
      const html = renderToStaticMarkup(
        <RentalIntelligenceDrawer
          open={true}
          onClose={() => {}}
          advices={[]}
          morningReportInput={sampleMorning}
          userRole="Coordinator"
          surface="floor"
        />,
      )

      expect(html).toContain('Today Morning Operational Report')
      expect(html).toContain('1 Pickups Today')
      expect(html).not.toContain('Revenue Leakage Audits')
      expect(html).not.toContain('Recoverable: Rs')
    })
  })
})
