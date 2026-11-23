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
import type { SystemRole } from '../../../types/database'

export interface RentalIntelligenceDrawerProps {
  open: boolean
  onClose: () => void
  advices: RentalAdvice[]
  userRole?: SystemRole | undefined
  bookingNo?: string | undefined
  currentItems?: Array<{ id?: string | undefined; name: string; quantity?: number | undefined }> | undefined
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
  bookingNo,
  currentItems = [],
  onAddSuggestion,
}: RentalIntelligenceDrawerProps) {
  const [selectedModule, setSelectedModule] = useState<AdviceModule | 'all' | 'recommender'>('all')
  const [selectedShootType, setSelectedShootType] = useState<ShootType>('Documentary')
  const [selectedTier, setSelectedTier] = useState<PackageTier>('STANDARD')

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

  // Combine external advices with live-evaluated kit and safety advices when currentItems are provided
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
    return combined
  }, [propAdvices, kitResult.advices, safetyReport.advices, currentItems.length])

  const workingModules = RENTAL_INTELLIGENCE_MODULES.filter((m) => m.status === 'working')
  const plannedModules = RENTAL_INTELLIGENCE_MODULES.filter((m) => m.status === 'planned')

  const filteredAdvices =
    selectedModule === 'all'
      ? allAdvices
      : selectedModule === 'recommender'
        ? allAdvices.filter((a) => a.module === 'kit')
        : allAdvices.filter((a) => a.module === selectedModule)

  const isFloorRole = ['Warehouse', 'Technician', 'Driver'].includes(userRole)

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
      width={500}
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

        {/* Blueprint Kit Recommender Section */}
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

        {/* Live Safety Metrics Summary Card */}
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
