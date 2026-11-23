import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { RentalIntelligenceDrawer } from '../RentalIntelligenceDrawer'
import type { RentalAdvice } from '../../../../lib/rentalIntelligence/types'

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

  it('renders planned capabilities section with exactly 7 planned modules', () => {
    const html = renderToStaticMarkup(
      <RentalIntelligenceDrawer
        open={true}
        onClose={() => {}}
        advices={sampleAdvices}
      />,
    )

    expect(html).toContain('Planned Capabilities (7)')
    expect(html).toContain('Morning Report')
    expect(html).toContain('Checklist Generator')
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
})
