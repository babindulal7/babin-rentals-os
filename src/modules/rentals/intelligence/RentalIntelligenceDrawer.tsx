import { useState, useMemo } from 'react'
import { ContextDrawer } from '../../../components/ui/ContextDrawer'
import { Badge } from '../../../components/ui/Badge'
import Icon from '../../../components/ui/Icon'
import {
  RENTAL_INTELLIGENCE_MODULES,
  type RentalAdvice,
  type AdviceModule,
} from '../../../lib/rentalIntelligence/types'
import {
  recommendKit,
  SHOOT_BLUEPRINTS,
  type ShootType,
  type PackageTier,
} from '../../../lib/rentalIntelligence/kitRecommender'
import {
  validateKitSafety,
} from '../../../lib/rentalIntelligence/safetyValidator'
import {
  explainCanonicalQuote,
  type CanonicalQuoteSnapshot,
} from '../../../lib/rentalIntelligence/quoteExplainer'
import {
  generateOperationalChecklist,
  type OperationalStage,
  type BookingLineForChecklist,
} from '../../../lib/rentalIntelligence/checklistGenerator'
import {
  evaluateClientIntelligence,
  type ClientProfileInput,
} from '../../../lib/rentalIntelligence/clientIntelligence'
import {
  evaluateFleetIdleStock,
  type AssetPerformanceInput,
} from '../../../lib/rentalIntelligence/idleStockEngine'
import {
  generateMorningReport,
  type MorningReportInput,
} from '../../../lib/rentalIntelligence/morningReport'
import type { SystemRole } from '../../../types/database'
import type { Surface } from '../../../lib/fieldGating'

export interface RentalIntelligenceDrawerProps {
  open: boolean
  onClose: () => void
  advices: RentalAdvice[]
  userRole?: SystemRole | undefined
  surface?: Surface | undefined
  bookingNo?: string | undefined
  currentItems?: Array<{ id?: string | undefined; name: string; quantity?: number | undefined }> | undefined
  quoteSnapshot?: CanonicalQuoteSnapshot | undefined
  checklistLines?: BookingLineForChecklist[] | undefined
  clientProfile?: ClientProfileInput | undefined
  fleetPerformance?: AssetPerformanceInput[] | undefined
  morningReportInput?: MorningReportInput | undefined
  onAddSuggestion?: ((item: {
    productId: string
    displayName: string
    quantity: number
  }) => void) | undefined
}

export function RentalIntelligenceDrawer({
  open,
  onClose,
  advices: propAdvices,
  userRole = 'Coordinator',
  surface = 'default',
  bookingNo,
  currentItems = [],
  quoteSnapshot,
  checklistLines,
  clientProfile,
  fleetPerformance,
  morningReportInput,
  onAddSuggestion,
}: RentalIntelligenceDrawerProps) {
  const [selectedModule, setSelectedModule] = useState<AdviceModule | 'all' | 'recommender'>('all')
  const [selectedShootType, setSelectedShootType] = useState<ShootType>('Documentary')
  const [selectedTier, setSelectedTier] = useState<PackageTier>('STANDARD')
  const [selectedChecklistStage, setSelectedChecklistStage] = useState<OperationalStage>('pack')

  // Live Blueprint Recommendation computation
  const kitResult = useMemo(() => {
    return recommendKit({
      bookingId: bookingNo ?? 'DRAFT',
      shootType: selectedShootType,
      tier: selectedTier,
      currentItems,
      availabilityFetchedAt: new Date().toISOString(),
    })
  }, [bookingNo, selectedShootType, selectedTier, currentItems])

  // Live Safety Evaluation computation
  const safetyReport = useMemo(() => {
    return validateKitSafety(
      currentItems.map((i) => ({ name: i.name, quantity: i.quantity })),
      {
        targetId: bookingNo ?? 'DRAFT',
        supportType: 'tripod',
        supportRatingKg: 10.0,
      },
    )
  }, [bookingNo, currentItems])

  // Live Canonical Quote Explanation computation (RI-02)
  const quoteResult = useMemo(() => {
    if (!quoteSnapshot) return null
    return explainCanonicalQuote(quoteSnapshot, userRole, surface)
  }, [quoteSnapshot, userRole, surface])

  // Live Operational Checklist computation (RI-08)
  const checklistResult = useMemo(() => {
    const linesToUse: BookingLineForChecklist[] =
      checklistLines ??
      currentItems.map((item, idx) => ({
        id: item.id ?? `LINE-${idx + 1}`,
        productId: item.id ?? `PROD-${idx + 1}`,
        displayName: item.name,
        dispatchedQuantity: item.quantity ?? 1,
      }))

    if (linesToUse.length === 0) return null

    return generateOperationalChecklist({
      bookingId: bookingNo ?? 'DRAFT',
      stage: selectedChecklistStage,
      lines: linesToUse,
    })
  }, [checklistLines, currentItems, bookingNo, selectedChecklistStage])

  // Live Client Intelligence computation (RI-04)
  const clientResult = useMemo(() => {
    if (!clientProfile) return null
    return evaluateClientIntelligence(clientProfile, userRole, surface)
  }, [clientProfile, userRole, surface])

  // Live Fleet Idle Stock computation (RI-05)
  const idleStockResult = useMemo(() => {
    if (!fleetPerformance || fleetPerformance.length === 0) return null
    return evaluateFleetIdleStock(fleetPerformance, userRole, surface)
  }, [fleetPerformance, userRole, surface])

  // Live Morning Report computation (RI-03)
  const morningReportResult = useMemo(() => {
    if (!morningReportInput) return null
    return generateMorningReport(morningReportInput, userRole, surface)
  }, [morningReportInput, userRole, surface])

  // Combine external advices with live-evaluated modules
  const allAdvices = useMemo(() => {
    const combined = [...propAdvices]
    if (currentItems.length > 0) {
      for (const adv of kitResult.advices) {
        if (!combined.some((a) => a.id === adv.id)) {
          combined.push(adv)
        }
      }
      for (const adv of safetyReport.advices) {
        if (!combined.some((a) => a.id === adv.id)) {
          combined.push(adv)
        }
      }
    }
    if (quoteResult) {
      for (const adv of quoteResult.advices) {
        if (!combined.some((a) => a.id === adv.id)) {
          combined.push(adv)
        }
      }
    }
    if (checklistResult) {
      for (const adv of checklistResult.advices) {
        if (!combined.some((a) => a.id === adv.id)) {
          combined.push(adv)
        }
      }
    }
    if (clientResult) {
      for (const adv of clientResult.advices) {
        if (!combined.some((a) => a.id === adv.id)) {
          combined.push(adv)
        }
      }
    }
    if (idleStockResult) {
      for (const adv of idleStockResult.advices) {
        if (!combined.some((a) => a.id === adv.id)) {
          combined.push(adv)
        }
      }
    }
    if (morningReportResult) {
      for (const adv of morningReportResult.advices) {
        if (!combined.some((a) => a.id === adv.id)) {
          combined.push(adv)
        }
      }
    }
    return combined
  }, [
    propAdvices,
    kitResult.advices,
    safetyReport.advices,
    quoteResult,
    checklistResult,
    clientResult,
    idleStockResult,
    morningReportResult,
    currentItems.length,
  ])

  const workingModules = RENTAL_INTELLIGENCE_MODULES.filter((m) => m.status === 'working')
  const plannedModules = RENTAL_INTELLIGENCE_MODULES.filter((m) => m.status === 'planned')

  const filteredAdvices =
    selectedModule === 'all'
      ? allAdvices
      : selectedModule === 'recommender'
        ? allAdvices.filter((a) => a.module === 'kit')
        : allAdvices.filter((a) => a.module === selectedModule)

  const isFloorRole = ['Warehouse', 'Technician', 'Driver'].includes(userRole) || surface === 'floor'

  return (
    <ContextDrawer
      id="rental-intelligence-drawer"
      open={open}
      onClose={onClose}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Icon name="zap" size={20} color="var(--primary)" />
          <span>Rental Intelligence</span>
        </div>
      }
      subtitle={
        <span>
          {bookingNo ? `Booking #${bookingNo} · ` : ''}Read-only operational advisory
        </span>
      }
      status={
        isFloorRole ? (
          <Badge tone="neutral" size="sm" label="Floor Role (₨ Omitted)" />
        ) : (
          <Badge tone="primary" size="sm" label={userRole} />
        )
      }
      width={520}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Module Filter Tabs */}
        <div>
          <label
            style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--muted)',
              marginBottom: '8px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Active Modules
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            <button
              type="button"
              onClick={() => setSelectedModule('all')}
              style={{
                minHeight: '44px',
                padding: '0 12px',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                background: selectedModule === 'all' ? 'var(--primary-subtle, #e0f2fe)' : 'var(--surface)',
                color: selectedModule === 'all' ? 'var(--primary)' : 'var(--ink)',
                fontWeight: selectedModule === 'all' ? 600 : 400,
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              All ({allAdvices.length})
            </button>
            <button
              type="button"
              onClick={() => setSelectedModule('recommender')}
              style={{
                minHeight: '44px',
                padding: '0 12px',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                background: selectedModule === 'recommender' ? 'var(--primary-subtle, #e0f2fe)' : 'var(--surface)',
                color: selectedModule === 'recommender' ? 'var(--primary)' : 'var(--ink)',
                fontWeight: selectedModule === 'recommender' ? 600 : 400,
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              Kit Builder
            </button>
            {workingModules.map((m) => {
              const count = allAdvices.filter((a) => a.module === m.id).length
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedModule(m.id)}
                  style={{
                    minHeight: '44px',
                    padding: '0 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--border)',
                    background: selectedModule === m.id ? 'var(--primary-subtle, #e0f2fe)' : 'var(--surface)',
                    color: selectedModule === m.id ? 'var(--primary)' : 'var(--ink)',
                    fontWeight: selectedModule === m.id ? 600 : 400,
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                >
                  {m.title} {count > 0 ? `(${count})` : ''}
                </button>
              )
            })}
          </div>
        </div>

        {/* Blueprint Kit Recommender Section (RI-01) */}
        {(selectedModule === 'recommender' || selectedModule === 'kit') && (
          <div
            style={{
              padding: '14px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: 'var(--surface-sunken, #f8fafc)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>
                Production Blueprint Candidate
              </span>
              <Badge tone="primary" size="sm" label={selectedTier} />
            </div>

            {/* Shoot Type Buttons */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '10px' }}>
              {(Object.keys(SHOOT_BLUEPRINTS) as ShootType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setSelectedShootType(type)}
                  style={{
                    minHeight: '36px',
                    padding: '0 8px',
                    borderRadius: '4px',
                    border: '1px solid var(--border)',
                    background: selectedShootType === type ? 'var(--ink)' : 'var(--surface)',
                    color: selectedShootType === type ? 'var(--surface)' : 'var(--ink)',
                    fontSize: '12px',
                    fontWeight: selectedShootType === type ? 600 : 400,
                    cursor: 'pointer',
                  }}
                >
                  {type}
                </button>
              ))}
            </div>

            {/* Tier Buttons */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
              {(['BUDGET', 'STANDARD', 'PREMIUM'] as PackageTier[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setSelectedTier(t)}
                  style={{
                    minHeight: '32px',
                    flex: 1,
                    borderRadius: '4px',
                    border: '1px solid var(--border)',
                    background: selectedTier === t ? 'var(--primary-subtle, #e0f2fe)' : 'var(--surface)',
                    color: selectedTier === t ? 'var(--primary)' : 'var(--muted)',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {t}
                </button>
              ))}
            </div>

            <p style={{ margin: '0 0 10px', fontSize: '12px', color: 'var(--muted)', lineHeight: '1.4' }}>
              {kitResult.blueprint.description}
            </p>

            {/* Proposed Kit Items */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {kitResult.proposedItems.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 8px',
                    background: 'var(--surface)',
                    borderRadius: '4px',
                    border: '1px solid var(--border-light, #e2e8f0)',
                    fontSize: '12px',
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 500, color: 'var(--ink)' }}>{item.displayName}</span>
                    <span style={{ color: 'var(--muted)', marginLeft: '6px', fontSize: '11px' }}>
                      ({item.chargeType.replace(/_/g, ' ')})
                    </span>
                  </div>
                  {onAddSuggestion && (
                    <button
                      type="button"
                      onClick={() => onAddSuggestion(item)}
                      style={{
                        minHeight: '28px',
                        padding: '0 8px',
                        fontSize: '11px',
                        fontWeight: 600,
                        borderRadius: '3px',
                        border: '1px solid var(--primary)',
                        background: 'transparent',
                        color: 'var(--primary)',
                        cursor: 'pointer',
                      }}
                    >
                      + Add
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Canonical Quote Explanation View (RI-02) */}
        {(selectedModule === 'all' || selectedModule === 'quote_explanation') && quoteResult && (
          <div
            style={{
              padding: '14px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--ink)' }}>
                Authoritative Quote Explanation (Why this price?)
              </span>
              <Badge tone="primary" size="sm" label={`${quoteResult.durationDays} Day(s)`} />
            </div>

            {quoteResult.isMoneyMasked ? (
              <div
                style={{
                  padding: '12px',
                  background: 'var(--surface-sunken, #f8fafc)',
                  borderRadius: '6px',
                  border: '1px dashed var(--border)',
                  fontSize: '12px',
                  color: 'var(--muted)',
                }}
              >
                Commercial rates, VAT, and financial totals are omitted on floor surfaces in compliance with field-level gating.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--muted)' }}>Equipment Base Subtotal:</span>
                  <span style={{ fontWeight: 500, color: 'var(--ink)' }}>{quoteResult.equipmentSubtotalFormatted}</span>
                </div>
                {quoteResult.discountPercent > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--success, #16a34a)' }}>
                    <span>Approved Discount ({quoteResult.discountPercent}%):</span>
                    <span style={{ fontWeight: 500 }}>-{quoteResult.discountFormatted}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--muted)' }}>Nepal VAT (13%):</span>
                  <span style={{ fontWeight: 500, color: 'var(--ink)' }}>{quoteResult.vatFormatted}</span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    paddingTop: '6px',
                    borderTop: '1px solid var(--border)',
                    fontWeight: 700,
                    fontSize: '13px',
                  }}
                >
                  <span>Total Rental:</span>
                  <span style={{ color: 'var(--primary)' }}>{quoteResult.totalRentalFormatted}</span>
                </div>

                {quoteResult.depositLiabilityFormatted && (
                  <div
                    style={{
                      marginTop: '6px',
                      padding: '8px',
                      background: 'var(--primary-subtle, #e0f2fe)',
                      borderRadius: '4px',
                      fontSize: '11px',
                    }}
                  >
                    <span style={{ fontWeight: 600, color: 'var(--primary)', display: 'block' }}>
                      Security Deposit Liability (Escrow): {quoteResult.depositLiabilityFormatted}
                    </span>
                    <span style={{ color: 'var(--muted)' }}>
                      Held separately in escrow; strictly excluded from rental revenue.
                    </span>
                  </div>
                )}

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginTop: '4px',
                    paddingTop: '6px',
                    borderTop: '1px dashed var(--border-light, #e2e8f0)',
                  }}
                >
                  <span style={{ color: 'var(--muted)' }}>Advance Received:</span>
                  <span style={{ fontWeight: 500 }}>{quoteResult.advancePaidFormatted}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                  <span style={{ color: 'var(--ink)' }}>Balance Due at Handover:</span>
                  <span style={{ color: 'var(--ink)' }}>{quoteResult.outstandingBalanceFormatted}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Operational Checklist Generator View (RI-08) */}
        {(selectedModule === 'all' || selectedModule === 'checklist') && checklistResult && (
          <div
            style={{
              padding: '14px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: 'var(--surface-sunken, #f8fafc)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>
                Operational Checklist Generator
              </span>
              <div style={{ display: 'flex', gap: '4px' }}>
                <Badge tone="primary" size="sm" label={`${checklistResult.estimatedPrepMinutes}m prep`} />
                <Badge tone="neutral" size="sm" label={checklistResult.deliveryLoadCategory.replace(/_/g, ' ')} />
              </div>
            </div>

            {/* Stage Selector Tabs */}
            <div style={{ display: 'flex', gap: '4px', marginBottom: '10px' }}>
              {(['pack', 'handover', 'return', 'reset'] as OperationalStage[]).map((stg) => (
                <button
                  key={stg}
                  type="button"
                  onClick={() => setSelectedChecklistStage(stg)}
                  style={{
                    minHeight: '32px',
                    flex: 1,
                    borderRadius: '4px',
                    border: '1px solid var(--border)',
                    background: selectedChecklistStage === stg ? 'var(--ink)' : 'var(--surface)',
                    color: selectedChecklistStage === stg ? 'var(--surface)' : 'var(--ink)',
                    fontSize: '11px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                  }}
                >
                  {stg}
                </button>
              ))}
            </div>

            <p style={{ margin: '0 0 10px', fontSize: '11px', color: 'var(--muted)', lineHeight: '1.4' }}>
              {checklistResult.deliveryLoadGuidance}
            </p>

            {/* Invariant Warning Banner (RI-A20) */}
            <div
              style={{
                padding: '6px 8px',
                background: 'var(--surface)',
                borderRadius: '4px',
                border: '1px solid var(--border-light, #e2e8f0)',
                marginBottom: '10px',
                fontSize: '10.5px',
                color: 'var(--muted)',
                lineHeight: '1.3',
              }}
            >
              <strong>Advisory Checklist:</strong> Completing items here is for warehouse staff coordination.
              Custody stage transitions require verified submission in Babin Rentals OS.
            </div>

            {/* Checklist Items List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {checklistResult.items.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    padding: '6px 8px',
                    background: 'var(--surface)',
                    borderRadius: '4px',
                    border: '1px solid var(--border-light, #e2e8f0)',
                    fontSize: '12px',
                  }}
                >
                  <input type="checkbox" style={{ marginTop: '2px', cursor: 'pointer' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 500, color: 'var(--ink)' }}>{item.title}</span>
                      <Badge tone="neutral" size="sm" label={item.category} />
                    </div>
                    <span style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
                      {item.instruction}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Client Intelligence View (RI-04) */}
        {(selectedModule === 'all' || selectedModule === 'client') && clientResult && (
          <div
            style={{
              padding: '14px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--ink)' }}>
                Client Intelligence ({clientResult.clientName})
              </span>
              <div style={{ display: 'flex', gap: '4px' }}>
                <Badge tone="primary" size="sm" label={clientResult.title} />
                <Badge tone="neutral" size="sm" label={`Trust ${clientResult.trustFactor}x`} />
              </div>
            </div>

            <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '6px', lineHeight: '1.4' }}>
              <strong>Communication Tone:</strong> {clientResult.tone}
            </div>

            <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '10px' }}>
              <strong>Technical Depth:</strong> {clientResult.technicalDepth}
            </div>

            {/* Safeguards */}
            <div style={{ marginBottom: '10px' }}>
              <span style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--ink)', marginBottom: '4px' }}>
                Operational Safeguards
              </span>
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '11.5px', color: 'var(--muted)', lineHeight: '1.4' }}>
                {clientResult.safeguards.map((sg, idx) => (
                  <li key={idx}>{sg}</li>
                ))}
              </ul>
            </div>

            {/* Due Recovery Draft */}
            {clientResult.dueRecoveryDraft && !clientResult.isMoneyMasked && (
              <div
                style={{
                  padding: '10px',
                  background: 'var(--surface-sunken, #f8fafc)',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  fontSize: '11.5px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontWeight: 600, color: 'var(--ink)' }}>
                    Overdue Recovery Draft ({clientResult.dueRecoveryDraft.stageName})
                  </span>
                  <Badge
                    tone={clientResult.dueRecoveryDraft.warningTone === 'hold' ? 'danger' : 'warning'}
                    size="sm"
                    label="Staff Review Only"
                  />
                </div>
                <div style={{ color: 'var(--muted)', marginBottom: '4px' }}>
                  <strong>Subject:</strong> {clientResult.dueRecoveryDraft.subject}
                </div>
                <pre
                  style={{
                    margin: 0,
                    padding: '8px',
                    background: 'var(--surface)',
                    borderRadius: '4px',
                    border: '1px solid var(--border-light, #e2e8f0)',
                    fontSize: '11px',
                    fontFamily: 'inherit',
                    whiteSpace: 'pre-wrap',
                    color: 'var(--ink)',
                    lineHeight: '1.4',
                  }}
                >
                  {clientResult.dueRecoveryDraft.body}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Idle Stock Activation View (RI-05) */}
        {(selectedModule === 'all' || selectedModule === 'idle_stock') && idleStockResult && (
          <div
            style={{
              padding: '14px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: 'var(--surface-sunken, #f8fafc)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--ink)' }}>
                Fleet Idle Stock &amp; Activation
              </span>
              {idleStockResult.totalIdleCapitalFormatted && (
                <Badge tone="warning" size="sm" label={`Idle Capital: ${idleStockResult.totalIdleCapitalFormatted}`} />
              )}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
              <Badge tone="primary" size="sm" label={`${idleStockResult.expansionCandidatesCount} Expansion`} />
              <Badge tone="warning" size="sm" label={`${idleStockResult.idleHighCapitalCount} High Idle Capital`} />
              <Badge tone="neutral" size="sm" label={`${idleStockResult.steadyEarnersCount} Steady Earners`} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {idleStockResult.assets.map((asset) => {
                const actionBadgeTone =
                  asset.action === 'BUY_ADD_ONE_MORE'
                    ? 'primary'
                    : asset.action === 'BUNDLE_OR_REPOSITION'
                      ? 'warning'
                      : asset.action === 'HOLD_AND_OPTIMIZE'
                        ? 'neutral'
                        : 'neutral'

                return (
                  <div
                    key={asset.productId}
                    style={{
                      padding: '8px 10px',
                      background: 'var(--surface)',
                      borderRadius: '6px',
                      border: '1px solid var(--border-light, #e2e8f0)',
                      fontSize: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{asset.displayName}</span>
                      <Badge tone={actionBadgeTone} size="sm" label={asset.action.replace(/_/g, ' ')} />
                    </div>
                    {asset.utilizationPct !== undefined && (
                      <span style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '2px' }}>
                        Monthly Utilization: {asset.utilizationPct}%
                      </span>
                    )}
                    <p style={{ margin: 0, fontSize: '11px', color: 'var(--muted)', lineHeight: '1.3' }}>
                      {asset.reasoning}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Morning Report View (RI-03) */}
        {(selectedModule === 'all' || selectedModule === 'operations') && morningReportResult && (
          <div
            style={{
              padding: '14px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--ink)' }}>
                Today Morning Operational Report
              </span>
              <div style={{ display: 'flex', gap: '4px' }}>
                <Badge tone="primary" size="sm" label={`AD ${morningReportResult.reportDateIso.slice(0, 10)}`} />
                {morningReportResult.nepaliDateBs && (
                  <Badge tone="neutral" size="sm" label={`BS ${morningReportResult.nepaliDateBs}`} />
                )}
              </div>
            </div>

            {/* Queue Counts Bar */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
              <Badge tone="primary" size="sm" label={`${morningReportResult.pickupsTodayCount} Pickups Today`} />
              <Badge tone="neutral" size="sm" label={`${morningReportResult.returnsTodayCount} Returns Today`} />
              <Badge
                tone={morningReportResult.overdueCount > 0 ? 'danger' : 'neutral'}
                size="sm"
                label={`${morningReportResult.overdueCount} Overdue`}
              />
              <Badge tone="neutral" size="sm" label={`${morningReportResult.maintenanceHoldCount} QC/Quarantine`} />
            </div>

            {/* Leakage Audit Details for Authorized Roles */}
            {morningReportResult.leakageCount > 0 && !morningReportResult.isMoneyMasked && (
              <div
                style={{
                  padding: '10px',
                  background: 'var(--surface-sunken, #f8fafc)',
                  borderRadius: '6px',
                  border: '1px solid var(--border-light, #e2e8f0)',
                  fontSize: '11.5px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontWeight: 600, color: 'var(--ink)' }}>
                    Revenue Leakage Audits ({morningReportResult.leakageCount})
                  </span>
                  {morningReportResult.totalRecoverableLeakageFormatted && (
                    <Badge tone="danger" size="sm" label={`Recoverable: ${morningReportResult.totalRecoverableLeakageFormatted}`} />
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {morningReportResult.leakageItems.map((leak, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '6px 8px',
                        background: 'var(--surface)',
                        borderRadius: '4px',
                        border: '1px solid var(--border-light, #e2e8f0)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: 500, color: 'var(--ink)' }}>{leak.message}</span>
                        {leak.recoverableFormatted && (
                          <span style={{ fontWeight: 600, color: 'var(--status-critical, #b91c1c)', marginLeft: '6px' }}>
                            {leak.recoverableFormatted}
                          </span>
                        )}
                      </div>
                      <span style={{ display: 'block', fontSize: '10.5px', color: 'var(--muted)', marginTop: '2px' }}>
                        Action: {leak.action}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Live Safety Metrics Summary Card (RI-10) */}
        {(selectedModule === 'all' || selectedModule === 'safety') && (
          <div
            style={{
              padding: '12px',
              borderRadius: '8px',
              border: `1px solid ${safetyReport.isSafe ? 'var(--border)' : 'var(--status-critical, #ef4444)'}`,
              background: 'var(--surface)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--ink)' }}>
                Equipment Safety Baseline
              </span>
              <Badge
                tone={safetyReport.isSafe ? 'primary' : 'danger'}
                size="sm"
                label={safetyReport.isSafe ? 'Rig Safe' : 'Safety Review Required'}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
              <div style={{ padding: '6px 8px', background: 'var(--surface-sunken, #f8fafc)', borderRadius: '4px' }}>
                <span style={{ color: 'var(--muted)', display: 'block', fontSize: '10px' }}>ESTIMATED RIG WEIGHT</span>
                <span style={{ fontWeight: 600, color: 'var(--ink)' }}>
                  {(safetyReport.totalRigWeightGrams / 1000).toFixed(2)} kg
                </span>
              </div>
              <div style={{ padding: '6px 8px', background: 'var(--surface-sunken, #f8fafc)', borderRadius: '4px' }}>
                <span style={{ color: 'var(--muted)', display: 'block', fontSize: '10px' }}>LIGHTING LOAD</span>
                <span style={{ fontWeight: 600, color: 'var(--ink)' }}>
                  {safetyReport.totalPowerWatts}W (Limit 2,760W)
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Advice Cards List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filteredAdvices.length === 0 ? (
            <div
              style={{
                padding: '24px 16px',
                textAlign: 'center',
                background: 'var(--surface-sunken, #f8fafc)',
                borderRadius: '8px',
                border: '1px dashed var(--border)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
                <Icon name="check_circle" size={24} color="var(--status-ok, #10b981)" />
              </div>
              <p style={{ margin: 0, fontSize: '14px', fontWeight: 500, color: 'var(--ink)' }}>
                No active warnings or suggestions
              </p>
              <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--muted)' }}>
                Current draft configuration passes deterministic kit, safety, and operational gates.
              </p>
            </div>
          ) : (
            filteredAdvices.map((adv) => {
              const isBlocked = adv.evidenceState === 'blocked'
              const isUrgent = adv.severity === 'urgent'
              const tone = isBlocked || isUrgent ? 'danger' : adv.severity === 'review' ? 'warning' : 'primary'

              return (
                <article
                  key={adv.id}
                  style={{
                    padding: '16px',
                    borderRadius: '8px',
                    border: `1px solid ${isBlocked ? 'var(--status-critical, #ef4444)' : 'var(--border)'}`,
                    background: 'var(--surface)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  }}
                >
                  {/* Card Header */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink)', textTransform: 'uppercase' }}>
                        {adv.module.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <Badge tone={tone} size="sm" label={adv.evidenceState.replace(/_/g, ' ')} />
                      <Badge
                        tone={adv.severity === 'urgent' ? 'danger' : adv.severity === 'review' ? 'warning' : 'neutral'}
                        size="sm"
                        label={adv.severity}
                      />
                    </div>
                  </div>

                  {/* Card Body */}
                  <p
                    style={{
                      margin: '0 0 10px',
                      fontSize: '13px',
                      lineHeight: '1.5',
                      color: isBlocked ? 'var(--status-critical, #b91c1c)' : 'var(--ink)',
                      fontWeight: isBlocked ? 500 : 400,
                    }}
                  >
                    {adv.explanation}
                  </p>

                  {/* Suggested Additions */}
                  {adv.suggestedAdditions && adv.suggestedAdditions.length > 0 && (
                    <div
                      style={{
                        marginTop: '10px',
                        padding: '10px',
                        background: 'var(--surface-sunken, #f8fafc)',
                        borderRadius: '6px',
                        border: '1px solid var(--border-light, #e2e8f0)',
                      }}
                    >
                      <span
                        style={{
                          display: 'block',
                          fontSize: '11px',
                          fontWeight: 600,
                          color: 'var(--muted)',
                          textTransform: 'uppercase',
                          marginBottom: '6px',
                        }}
                      >
                        Recommended Dependencies
                      </span>
                      {adv.suggestedAdditions.map((item, idx) => (
                        <div
                          key={idx}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '4px 0',
                            fontSize: '13px',
                          }}
                        >
                          <div>
                            <span style={{ fontWeight: 500, color: 'var(--ink)' }}>
                              {item.displayName}
                            </span>
                            <span style={{ color: 'var(--muted)', marginLeft: '6px', fontSize: '12px' }}>
                              (Qty: {item.quantity})
                            </span>
                          </div>
                          {onAddSuggestion && (
                            <button
                              type="button"
                              onClick={() => onAddSuggestion(item)}
                              style={{
                                minHeight: '36px',
                                padding: '0 10px',
                                fontSize: '12px',
                                fontWeight: 600,
                                borderRadius: '4px',
                                border: '1px solid var(--primary)',
                                background: 'transparent',
                                color: 'var(--primary)',
                                cursor: 'pointer',
                              }}
                            >
                              + Add to Draft
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Required Staff Checks */}
                  {adv.requiredChecks && adv.requiredChecks.length > 0 && (
                    <div style={{ marginTop: '10px' }}>
                      <span
                        style={{
                          display: 'block',
                          fontSize: '11px',
                          fontWeight: 600,
                          color: 'var(--muted)',
                          textTransform: 'uppercase',
                          marginBottom: '4px',
                        }}
                      >
                        Required Staff Verification
                      </span>
                      <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: 'var(--ink-secondary, #475569)' }}>
                        {adv.requiredChecks.map((chk, i) => (
                          <li key={i} style={{ marginBottom: '2px' }}>
                            {chk}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Source Citations */}
                  {adv.sourceRefs && adv.sourceRefs.length > 0 && (
                    <div
                      style={{
                        marginTop: '10px',
                        paddingTop: '8px',
                        borderTop: '1px solid var(--border-light, #f1f5f9)',
                        fontSize: '11px',
                        color: 'var(--muted)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <span>Sources:</span>
                      {adv.sourceRefs.map((ref, idx) => (
                        <code
                          key={idx}
                          style={{
                            background: 'var(--surface-sunken, #f1f5f9)',
                            padding: '2px 4px',
                            borderRadius: '3px',
                            fontSize: '10px',
                          }}
                        >
                          {ref}
                        </code>
                      ))}
                    </div>
                  )}
                </article>
              )
            })
          )}
        </div>

        {/* Planned Modules Taxonomy Status */}
        <div
          style={{
            marginTop: '8px',
            padding: '12px',
            borderRadius: '8px',
            background: 'var(--surface-sunken, #f8fafc)',
            border: '1px solid var(--border-light, #e2e8f0)',
          }}
        >
          <span
            style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--muted)',
              textTransform: 'uppercase',
              marginBottom: '8px',
            }}
          >
            Planned Capabilities ({plannedModules.length})
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {plannedModules.map((m) => (
              <div
                key={m.id}
                style={{
                  padding: '8px',
                  borderRadius: '6px',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  fontSize: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 500, color: 'var(--ink)' }}>{m.title}</span>
                  <Badge tone="neutral" size="sm" label="Planned" />
                </div>
                <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--muted)', lineHeight: '1.3' }}>
                  {m.shortDesc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ContextDrawer>
  )
}

export default RentalIntelligenceDrawer
