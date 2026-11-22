import { useState, useMemo, useEffect, type CSSProperties } from 'react'
import Icon from '../../../components/ui/Icon'
import { Button } from '../../../components/ui/Page'
import {
  getSmartEquipmentDraft,
  findModelMatches,
  type SmartEquipmentDraft,
  type SmartFieldSuggestion,
  type ProvenanceBadge,
} from '../../../lib/smartEquipment'
import { formatMoney, toRupees, type Paisa } from '../../../lib/money'
import { useViewport } from '../../../lib/device'

export interface SmartEquipmentPanelProps {
  name: string
  shortName?: string
  brand?: string
  modelNo?: string
  category?: string
  description?: string
  dailyRate?: string
  replacementValue?: string

  onApplyField: (field: string, value: string | number) => void
  onApplyAll: (fields: Record<string, string | number>) => void

  isOpen: boolean
  onClose: () => void
  canViewMoney: boolean

  onOpenExisting?: (candidateId: string) => void
  onDismissDuplicate?: () => void

  // Tracking manual edits made by staff so intelligence never silently overwrites them
  userTouchedFields?: Set<string>
  onFieldTouched?: (field: string) => void
}

type PanelTab = 'identity' | 'specs' | 'accessories' | 'safety' | 'pricing' | 'diff'

const PROVENANCE_STYLES: Record<
  ProvenanceBadge,
  { label: string; bg: string; color: string; border: string; icon: 'check' | 'tool' | 'alert_circle' | 'info' }
> = {
  oem_documented: {
    label: 'OEM Documented',
    bg: 'rgba(5, 150, 105, 0.12)',
    color: '#059669',
    border: 'rgba(5, 150, 105, 0.25)',
    icon: 'check',
  },
  verified_bench_test: {
    label: 'Verified Bench Test',
    bg: 'rgba(37, 99, 235, 0.12)',
    color: '#2563eb',
    border: 'rgba(37, 99, 235, 0.25)',
    icon: 'tool',
  },
  ai_draft: {
    label: 'AI Draft — Needs Review',
    bg: 'rgba(217, 119, 6, 0.12)',
    color: '#d97706',
    border: 'rgba(217, 119, 6, 0.25)',
    icon: 'alert_circle',
  },
  offline_fixture: {
    label: 'Offline Catalog Fixture',
    bg: 'rgba(100, 116, 139, 0.12)',
    color: '#64748b',
    border: 'rgba(100, 116, 139, 0.25)',
    icon: 'info',
  },
  unknown: {
    label: 'Unknown / Unverified',
    bg: 'rgba(148, 163, 184, 0.12)',
    color: '#94a3b8',
    border: 'rgba(148, 163, 184, 0.25)',
    icon: 'info',
  },
}

export function SmartEquipmentPanel({
  name,
  shortName = '',
  brand = '',
  modelNo = '',
  category = '',
  description = '',
  dailyRate = '',
  replacementValue = '',
  onApplyField,
  onApplyAll,
  isOpen,
  onClose,
  canViewMoney,
  onOpenExisting,
  onDismissDuplicate,
  userTouchedFields = new Set(),
}: SmartEquipmentPanelProps) {
  const viewport = useViewport()
  const isPhone = viewport === 'phone'
  const isTablet = viewport === 'tablet'

  const [activeTab, setActiveTab] = useState<PanelTab>('identity')
  const [rejectedFields, setRejectedFields] = useState<Set<string>>(new Set())
  const [acceptedFields, setAcceptedFields] = useState<Set<string>>(new Set())
  const [previousManualValues, setPreviousManualValues] = useState<Record<string, string | number>>({})

  // Compute smart draft proposals based on typed name and model
  const smartDraft: SmartEquipmentDraft | null = useMemo(() => {
    if (!name || name.trim().length < 2) return null
    return getSmartEquipmentDraft(name, modelNo, { canViewMoney })
  }, [name, modelNo, canViewMoney])

  // Check for catalogue duplicates
  const catalogueMatches = useMemo(() => {
    return findModelMatches(name, modelNo)
  }, [name, modelNo])

  const topMatch = catalogueMatches[0]
  const hasExactDuplicate = Boolean(topMatch && topMatch.isExactOrPrimary)

  // Current values map for comparison and diff view
  const currentValuesMap: Record<string, string | number> = useMemo(
    () => ({
      name,
      shortName,
      brand,
      modelNo,
      category,
      description,
      dailyRate,
      replacementValue,
    }),
    [name, shortName, brand, modelNo, category, description, dailyRate, replacementValue]
  )

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleAcceptField = (fieldKey: string, proposedVal: string | number | Paisa) => {
    // Record current value for undo
    const current = currentValuesMap[fieldKey] ?? ''
    setPreviousManualValues((prev) => ({ ...prev, [fieldKey]: current }))

    // Remove from rejected if it was rejected previously
    setRejectedFields((prev) => {
      const next = new Set(prev)
      next.delete(fieldKey)
      return next
    })

    setAcceptedFields((prev) => new Set(prev).add(fieldKey))

    // If money, convert to whole rupees string for form input
    if (typeof proposedVal === 'object' && proposedVal !== null && 'paisa' in proposedVal) {
      onApplyField(fieldKey, String(toRupees(proposedVal as Paisa)))
    } else {
      onApplyField(fieldKey, proposedVal as string | number)
    }
  }

  const handleRejectField = (fieldKey: string) => {
    setRejectedFields((prev) => new Set(prev).add(fieldKey))
    setAcceptedFields((prev) => {
      const next = new Set(prev)
      next.delete(fieldKey)
      return next
    })
  }

  const handleUndoField = (fieldKey: string) => {
    const prev = previousManualValues[fieldKey]
    if (prev !== undefined) {
      onApplyField(fieldKey, prev)
    }
    setAcceptedFields((prevSet) => {
      const next = new Set(prevSet)
      next.delete(fieldKey)
      return next
    })
    setRejectedFields((prevSet) => {
      const next = new Set(prevSet)
      next.delete(fieldKey)
      return next
    })
  }

  const handleAcceptAllVerified = () => {
    if (!smartDraft) return
    const toApply: Record<string, string | number> = {}

    // Collect all suggestions that are OEM documented or Verified Bench Test
    // and have NOT been explicitly rejected or manually modified by staff
    Object.entries(smartDraft.suggestions).forEach(([key, sug]) => {
      if (!sug) return
      if (rejectedFields.has(key)) return
      if (userTouchedFields.has(key)) return // Never overwrite manual edits

      if (sug.provenance.badge === 'oem_documented' || sug.provenance.badge === 'verified_bench_test') {
        const val = sug.proposedValue
        if (typeof val === 'object' && val !== null && 'paisa' in val) {
          toApply[key] = String(toRupees(val as Paisa))
        } else if (typeof val === 'string' || typeof val === 'number') {
          toApply[key] = val
        }
        setAcceptedFields((prev) => new Set(prev).add(key))
      }
    })

    if (Object.keys(toApply).length > 0) {
      onApplyAll(toApply)
    }
  }

  /* ── Presentation Styles ─────────────────────────────────────────────── */

  const overlayStyle: CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.45)',
    zIndex: 999,
    display: 'flex',
    justifyContent: isPhone ? 'center' : 'flex-end',
    alignItems: isPhone ? 'flex-end' : 'stretch',
    backdropFilter: 'blur(2px)',
  }

  const drawerContainerStyle: CSSProperties = {
    background: 'var(--card)',
    color: 'var(--text)',
    width: isPhone ? '100%' : isTablet ? '480px' : '540px',
    maxHeight: isPhone ? '90vh' : '100vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: 'var(--shadow-xl, 0 20px 25px -5px rgba(0, 0, 0, 0.3))',
    borderLeft: isPhone ? 'none' : '1px solid var(--border)',
    borderTop: isPhone ? '1px solid var(--border)' : 'none',
    borderTopLeftRadius: isPhone ? 16 : 0,
    borderTopRightRadius: isPhone ? 16 : 0,
    overflow: 'hidden',
    animation: 'drawerSlideIn 0.25s ease-out',
  }

  return (
    <div style={overlayStyle} role="dialog" aria-modal="true" aria-label="Smart Equipment Intelligence Drawer" onClick={onClose}>
      <div style={drawerContainerStyle} onClick={(e) => e.stopPropagation()}>
        {/* ── Header ────────────────────────────────────────────────────── */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--card2)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: 'var(--nav-active-accent)',
                color: '#fff',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Icon name="sparkles" size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>
                Suggest with Intelligence
              </h3>
              <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                Evidence-backed specifications &amp; duplicate verification
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close intelligence drawer"
            style={{
              minWidth: 44,
              minHeight: 44,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text2)',
              display: 'grid',
              placeItems: 'center',
              borderRadius: 6,
            }}
          >
            <Icon name="x" size={20} />
          </button>
        </div>

        {/* ── Duplicate Warning Banner (if catalogue match detected) ──── */}
        {hasExactDuplicate && topMatch && (
          <div
            style={{
              padding: '12px 16px',
              background: 'rgba(217, 119, 6, 0.1)',
              borderBottom: '1px solid rgba(217, 119, 6, 0.3)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <Icon name="alert_triangle" size={16} style={{ color: '#d97706', flexShrink: 0, marginTop: 2 }} />
              <div>
                <strong style={{ fontSize: 'var(--t-meta)', color: '#d97706', display: 'block' }}>
                  Existing Catalogue Model Detected
                </strong>
                <span style={{ fontSize: 'var(--t-th)', color: 'var(--text2)' }}>
                  “{topMatch.candidate.name}” (<span className="identifier">{topMatch.candidate.sku}</span>) is already in the catalogue with {topMatch.candidate.stock} units in stock.
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
              {onOpenExisting && (
                <Button
                  variant="primary"
                  onClick={() => onOpenExisting(topMatch.candidate.id)}
                  style={{ minHeight: 44, fontSize: 'var(--t-th)', padding: '0 12px' }}
                >
                  Open Existing Model
                </Button>
              )}
              {onDismissDuplicate && (
                <Button
                  variant="ghost"
                  onClick={onDismissDuplicate}
                  style={{ minHeight: 44, fontSize: 'var(--t-th)', padding: '0 12px' }}
                >
                  Continue As Distinct Model
                </Button>
              )}
            </div>
          </div>
        )}

        {/* ── Navigation Tabs ────────────────────────────────────────── */}
        <nav
          aria-label="Intelligence sections"
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--border)',
            background: 'var(--card)',
            overflowX: 'auto',
            scrollbarWidth: 'none',
          }}
        >
          <TabButton
            active={activeTab === 'identity'}
            label="Identity"
            icon="box"
            onClick={() => setActiveTab('identity')}
          />
          <TabButton
            active={activeTab === 'specs'}
            label="Technical"
            icon="tool"
            onClick={() => setActiveTab('specs')}
          />
          <TabButton
            active={activeTab === 'accessories'}
            label="Accessories"
            icon="plug"
            badge={smartDraft?.accessories.length}
            onClick={() => setActiveTab('accessories')}
          />
          <TabButton
            active={activeTab === 'safety'}
            label="How-To &amp; Safety"
            icon="activity"
            onClick={() => setActiveTab('safety')}
          />
          {canViewMoney && (
            <TabButton
              active={activeTab === 'pricing'}
              label="Pricing"
              icon="sparkles"
              onClick={() => setActiveTab('pricing')}
            />
          )}
          <TabButton
            active={activeTab === 'diff'}
            label="Diff Compare"
            icon="eye"
            onClick={() => setActiveTab('diff')}
          />
        </nav>

        {/* ── Tab Content Area ───────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!smartDraft ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)' }}>
              <Icon name="search" size={32} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
              <p style={{ margin: 0, fontSize: 'var(--t-ui)', fontWeight: 600, color: 'var(--text)' }}>
                Type an equipment model name
              </p>
              <p style={{ margin: '6px 0 0', fontSize: 'var(--t-meta)' }}>
                e.g. “Sony FX3”, “Sony FX30”, “Aputure 600x” to generate evidence-backed draft specifications.
              </p>
            </div>
          ) : (
            <>
              {activeTab === 'identity' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <SuggestionCard
                    suggestion={smartDraft.suggestions.name}
                    currentValue={name}
                    isRejected={rejectedFields.has('name')}
                    isAccepted={acceptedFields.has('name')}
                    isManualEdit={userTouchedFields.has('name')}
                    onAccept={() => smartDraft.suggestions.name && handleAcceptField('name', smartDraft.suggestions.name.proposedValue)}
                    onReject={() => handleRejectField('name')}
                    onUndo={() => handleUndoField('name')}
                  />
                  <SuggestionCard
                    suggestion={smartDraft.suggestions.shortName}
                    currentValue={shortName}
                    isRejected={rejectedFields.has('shortName')}
                    isAccepted={acceptedFields.has('shortName')}
                    isManualEdit={userTouchedFields.has('shortName')}
                    onAccept={() => smartDraft.suggestions.shortName && handleAcceptField('shortName', smartDraft.suggestions.shortName.proposedValue)}
                    onReject={() => handleRejectField('shortName')}
                    onUndo={() => handleUndoField('shortName')}
                  />
                  <SuggestionCard
                    suggestion={smartDraft.suggestions.brand}
                    currentValue={brand}
                    isRejected={rejectedFields.has('brand')}
                    isAccepted={acceptedFields.has('brand')}
                    isManualEdit={userTouchedFields.has('brand')}
                    onAccept={() => smartDraft.suggestions.brand && handleAcceptField('brand', smartDraft.suggestions.brand.proposedValue)}
                    onReject={() => handleRejectField('brand')}
                    onUndo={() => handleUndoField('brand')}
                  />
                  <SuggestionCard
                    suggestion={smartDraft.suggestions.modelNo}
                    currentValue={modelNo}
                    isRejected={rejectedFields.has('modelNo')}
                    isAccepted={acceptedFields.has('modelNo')}
                    isManualEdit={userTouchedFields.has('modelNo')}
                    onAccept={() => smartDraft.suggestions.modelNo && handleAcceptField('modelNo', smartDraft.suggestions.modelNo.proposedValue)}
                    onReject={() => handleRejectField('modelNo')}
                    onUndo={() => handleUndoField('modelNo')}
                  />
                  <SuggestionCard
                    suggestion={smartDraft.suggestions.category}
                    currentValue={category}
                    isRejected={rejectedFields.has('category')}
                    isAccepted={acceptedFields.has('category')}
                    isManualEdit={userTouchedFields.has('category')}
                    onAccept={() => smartDraft.suggestions.category && handleAcceptField('category', smartDraft.suggestions.category.proposedValue)}
                    onReject={() => handleRejectField('category')}
                    onUndo={() => handleUndoField('category')}
                  />
                  <SuggestionCard
                    suggestion={smartDraft.suggestions.description}
                    currentValue={description}
                    isRejected={rejectedFields.has('description')}
                    isAccepted={acceptedFields.has('description')}
                    isManualEdit={userTouchedFields.has('description')}
                    onAccept={() => smartDraft.suggestions.description && handleAcceptField('description', smartDraft.suggestions.description.proposedValue)}
                    onReject={() => handleRejectField('description')}
                    onUndo={() => handleUndoField('description')}
                  />
                </div>
              )}

              {activeTab === 'specs' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {smartDraft.suggestions.mount && (
                    <SuggestionCard
                      suggestion={smartDraft.suggestions.mount}
                      currentValue=""
                      isRejected={rejectedFields.has('mount')}
                      isAccepted={acceptedFields.has('mount')}
                      onAccept={() => handleAcceptField('mount', smartDraft.suggestions.mount!.proposedValue)}
                      onReject={() => handleRejectField('mount')}
                      onUndo={() => handleUndoField('mount')}
                    />
                  )}
                  {smartDraft.suggestions.powerRequirement && (
                    <SuggestionCard
                      suggestion={smartDraft.suggestions.powerRequirement}
                      currentValue=""
                      isRejected={rejectedFields.has('powerRequirement')}
                      isAccepted={acceptedFields.has('powerRequirement')}
                      onAccept={() => handleAcceptField('powerRequirement', smartDraft.suggestions.powerRequirement!.proposedValue)}
                      onReject={() => handleRejectField('powerRequirement')}
                      onUndo={() => handleUndoField('powerRequirement')}
                    />
                  )}
                  {smartDraft.suggestions.weightGrams && (
                    <SuggestionCard
                      suggestion={smartDraft.suggestions.weightGrams}
                      currentValue=""
                      isRejected={rejectedFields.has('weightGrams')}
                      isAccepted={acceptedFields.has('weightGrams')}
                      onAccept={() => handleAcceptField('weightGrams', smartDraft.suggestions.weightGrams!.proposedValue)}
                      onReject={() => handleRejectField('weightGrams')}
                      onUndo={() => handleUndoField('weightGrams')}
                    />
                  )}
                  {smartDraft.suggestions.dimensionsMm && (
                    <SuggestionCard
                      suggestion={smartDraft.suggestions.dimensionsMm}
                      currentValue=""
                      isRejected={rejectedFields.has('dimensionsMm')}
                      isAccepted={acceptedFields.has('dimensionsMm')}
                      onAccept={() => handleAcceptField('dimensionsMm', smartDraft.suggestions.dimensionsMm!.proposedValue)}
                      onReject={() => handleRejectField('dimensionsMm')}
                      onUndo={() => handleUndoField('dimensionsMm')}
                    />
                  )}
                  {smartDraft.suggestions.mediaSlots && (
                    <SuggestionCard
                      suggestion={smartDraft.suggestions.mediaSlots}
                      currentValue=""
                      isRejected={rejectedFields.has('mediaSlots')}
                      isAccepted={acceptedFields.has('mediaSlots')}
                      onAccept={() => handleAcceptField('mediaSlots', smartDraft.suggestions.mediaSlots!.proposedValue)}
                      onReject={() => handleRejectField('mediaSlots')}
                      onUndo={() => handleUndoField('mediaSlots')}
                    />
                  )}
                  {smartDraft.suggestions.skillLevel && (
                    <SuggestionCard
                      suggestion={smartDraft.suggestions.skillLevel}
                      currentValue=""
                      isRejected={rejectedFields.has('skillLevel')}
                      isAccepted={acceptedFields.has('skillLevel')}
                      onAccept={() => handleAcceptField('skillLevel', smartDraft.suggestions.skillLevel!.proposedValue)}
                      onReject={() => handleRejectField('skillLevel')}
                      onUndo={() => handleUndoField('skillLevel')}
                    />
                  )}
                </div>
              )}

              {activeTab === 'accessories' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
                      Recommended Included Kit &amp; Accessories
                    </span>
                    <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                      Canonical Inventory Items Only
                    </span>
                  </div>

                  {smartDraft.accessories.map((acc, i) => (
                    <div
                      key={i}
                      style={{
                        padding: '12px 14px',
                        borderRadius: 8,
                        background: 'var(--card2)',
                        border: '1px solid var(--border)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <strong style={{ fontSize: 'var(--t-ui)', color: 'var(--text)' }}>{acc.name}</strong>
                          {acc.sku && <span className="identifier" style={{ marginLeft: 6, fontSize: 'var(--t-th)' }}>{acc.sku}</span>}
                        </div>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: 4,
                            fontSize: 'var(--t-th)',
                            fontWeight: 600,
                            background: acc.relationType === 'included_mandatory' ? 'rgba(5, 150, 105, 0.15)' : 'rgba(37, 99, 235, 0.15)',
                            color: acc.relationType === 'included_mandatory' ? '#059669' : '#2563eb',
                          }}
                        >
                          {acc.relationType === 'included_mandatory' ? 'Included Standard' : 'Recommended Add-on'}
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: 'var(--t-th)', color: 'var(--text2)' }}>{acc.description}</p>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'safety' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Setup Steps */}
                  <div>
                    <h4 style={{ margin: '0 0 8px', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Icon name="check" size={14} style={{ color: '#059669' }} />
                      Operational Setup Steps
                    </h4>
                    <ol style={{ margin: 0, paddingLeft: 20, fontSize: 'var(--t-th)', color: 'var(--text2)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {smartDraft.howTo.setupSteps.map((step, i) => (
                        <li key={i}>{step}</li>
                      ))}
                    </ol>
                  </div>

                  {/* Cautions */}
                  <div style={{ padding: '12px 14px', borderRadius: 8, background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)' }}>
                    <h4 style={{ margin: '0 0 6px', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--danger-text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Icon name="alert_triangle" size={14} />
                      Critical Handling Cautions
                    </h4>
                    <ul style={{ margin: 0, paddingLeft: 20, fontSize: 'var(--t-th)', color: 'var(--text)', display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {smartDraft.howTo.cautions.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </div>

                  {/* Common Mistakes */}
                  <div>
                    <h4 style={{ margin: '0 0 8px', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Icon name="alert_circle" size={14} style={{ color: '#d97706' }} />
                      Common Mistakes to Avoid
                    </h4>
                    <ul style={{ margin: 0, paddingLeft: 20, fontSize: 'var(--t-th)', color: 'var(--text2)', display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {smartDraft.howTo.commonMistakes.map((m, i) => (
                        <li key={i}>{m}</li>
                      ))}
                    </ul>
                  </div>

                  {/* Inspection Checklists */}
                  <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr', gap: 12 }}>
                    <div style={{ padding: 10, background: 'var(--card2)', borderRadius: 6, border: '1px solid var(--border)' }}>
                      <strong style={{ fontSize: 'var(--t-th)', color: 'var(--text)' }}>Pre-Rental QC Check</strong>
                      <ul style={{ margin: '6px 0 0', paddingLeft: 16, fontSize: 'var(--t-th)', color: 'var(--text2)' }}>
                        {smartDraft.howTo.preRentalChecklist.map((c, i) => (
                          <li key={i}>{c}</li>
                        ))}
                      </ul>
                    </div>
                    <div style={{ padding: 10, background: 'var(--card2)', borderRadius: 6, border: '1px solid var(--border)' }}>
                      <strong style={{ fontSize: 'var(--t-th)', color: 'var(--text)' }}>Return &amp; Decon Check</strong>
                      <ul style={{ margin: '6px 0 0', paddingLeft: 16, fontSize: 'var(--t-th)', color: 'var(--text2)' }}>
                        {smartDraft.howTo.returnChecklist.map((c, i) => (
                          <li key={i}>{c}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'pricing' && canViewMoney && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {smartDraft.suggestions.dailyRatePaisa && (
                    <SuggestionCard
                      suggestion={{
                        field: 'dailyRate',
                        label: 'Standard Daily Rental Rate',
                        proposedValue: formatMoney(smartDraft.suggestions.dailyRatePaisa.proposedValue),
                        provenance: smartDraft.suggestions.dailyRatePaisa.provenance,
                        description: 'Rate card benchmark for single-day rentals.',
                      }}
                      currentValue={dailyRate ? `Rs ${dailyRate}` : ''}
                      isRejected={rejectedFields.has('dailyRate')}
                      isAccepted={acceptedFields.has('dailyRate')}
                      isManualEdit={userTouchedFields.has('dailyRate')}
                      onAccept={() => handleAcceptField('dailyRate', smartDraft.suggestions.dailyRatePaisa!.proposedValue)}
                      onReject={() => handleRejectField('dailyRate')}
                      onUndo={() => handleUndoField('dailyRate')}
                    />
                  )}
                  {smartDraft.suggestions.replacementValuePaisa && (
                    <SuggestionCard
                      suggestion={{
                        field: 'replacementValue',
                        label: 'Replacement / Asset Value',
                        proposedValue: formatMoney(smartDraft.suggestions.replacementValuePaisa.proposedValue),
                        provenance: smartDraft.suggestions.replacementValuePaisa.provenance,
                        description: 'Used as valuation basis for collateral and damage charges.',
                      }}
                      currentValue={replacementValue ? `Rs ${replacementValue}` : ''}
                      isRejected={rejectedFields.has('replacementValue')}
                      isAccepted={acceptedFields.has('replacementValue')}
                      isManualEdit={userTouchedFields.has('replacementValue')}
                      onAccept={() => handleAcceptField('replacementValue', smartDraft.suggestions.replacementValuePaisa!.proposedValue)}
                      onReject={() => handleRejectField('replacementValue')}
                      onUndo={() => handleUndoField('replacementValue')}
                    />
                  )}
                </div>
              )}

              {activeTab === 'diff' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
                      Comparison Before Save (Current vs Proposed)
                    </span>
                    <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                      Staff manual entries protected
                    </span>
                  </div>

                  <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--t-th)' }}>
                      <thead>
                        <tr style={{ background: 'var(--card2)', borderBottom: '1px solid var(--border)' }}>
                          <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--muted)' }}>Field</th>
                          <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--muted)' }}>Current Form Value</th>
                          <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--muted)' }}>Intelligence Suggestion</th>
                          <th style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--muted)' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(smartDraft.suggestions).map(([key, sug]) => {
                          if (!sug) return null
                          const curr = currentValuesMap[key] ?? ''
                          const prop = typeof sug.proposedValue === 'object' && sug.proposedValue !== null && 'paisa' in sug.proposedValue
                            ? formatMoney(sug.proposedValue as Paisa)
                            : String(sug.proposedValue)

                          const isAccepted = acceptedFields.has(key)
                          const isRejected = rejectedFields.has(key)

                          return (
                            <tr key={key} style={{ borderBottom: '1px solid var(--border2)' }}>
                              <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--text)' }}>{sug.label}</td>
                              <td style={{ padding: '8px 12px', color: curr ? 'var(--text)' : 'var(--muted)' }}>
                                {curr ? String(curr) : '— blank —'}
                              </td>
                              <td style={{ padding: '8px 12px', color: '#059669', fontWeight: 500 }}>
                                {prop}
                              </td>
                              <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                {isAccepted ? (
                                  <span style={{ color: '#059669', fontWeight: 600 }}>Accepted ✓</span>
                                ) : isRejected ? (
                                  <span style={{ color: '#ef4444', textDecoration: 'line-through' }}>Rejected</span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleAcceptField(key, sug.proposedValue)}
                                    style={{
                                      padding: '4px 8px',
                                      borderRadius: 4,
                                      border: '1px solid var(--border)',
                                      background: 'var(--card2)',
                                      cursor: 'pointer',
                                      fontSize: 'var(--t-th)',
                                    }}
                                  >
                                    Accept
                                  </button>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Footer Actions ─────────────────────────────────────────── */}
        <div
          style={{
            padding: '14px 20px',
            borderTop: '1px solid var(--border)',
            background: 'var(--card2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Button variant="ghost" onClick={onClose} style={{ minHeight: 44 }}>
              Close Drawer
            </Button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Button
              variant="secondary"
              onClick={handleAcceptAllVerified}
              disabled={!smartDraft}
              style={{ minHeight: 44 }}
            >
              Accept All Verified
            </Button>
            <Button
              variant="primary"
              onClick={onClose}
              style={{ minHeight: 44 }}
            >
              Done Reviewing
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Small Subcomponents ─────────────────────────────────────────────────── */

function TabButton({
  active,
  label,
  icon,
  badge,
  onClick,
}: {
  active: boolean
  label: string
  icon: 'box' | 'tool' | 'plug' | 'activity' | 'sparkles' | 'eye'
  badge?: number | undefined
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '12px 14px',
        minHeight: 44,
        background: 'transparent',
        border: 'none',
        borderBottom: `2px solid ${active ? 'var(--nav-active-accent)' : 'transparent'}`,
        color: active ? 'var(--text)' : 'var(--muted)',
        fontWeight: active ? 600 : 500,
        fontSize: 'var(--t-meta)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        whiteSpace: 'nowrap',
      }}
    >
      <Icon name={icon} size={15} />
      <span>{label}</span>
      {badge !== undefined && badge > 0 && (
        <span
          style={{
            padding: '1px 6px',
            borderRadius: 10,
            fontSize: 'var(--t-th)',
            background: 'var(--border)',
            color: 'var(--text2)',
          }}
        >
          {badge}
        </span>
      )}
    </button>
  )
}

function SuggestionCard<T>({
  suggestion,
  currentValue,
  isRejected,
  isAccepted,
  isManualEdit,
  onAccept,
  onReject,
  onUndo,
}: {
  suggestion: SmartFieldSuggestion<T> | undefined
  currentValue?: string | number
  isRejected?: boolean
  isAccepted?: boolean
  isManualEdit?: boolean
  onAccept: () => void
  onReject: () => void
  onUndo: () => void
}) {
  if (!suggestion) return null

  const pStyle = PROVENANCE_STYLES[suggestion.provenance.badge] || PROVENANCE_STYLES.unknown
  const displayProposed =
    typeof suggestion.proposedValue === 'object' && suggestion.proposedValue !== null && 'paisa' in suggestion.proposedValue
      ? formatMoney(suggestion.proposedValue as unknown as Paisa)
      : String(suggestion.proposedValue)

  return (
    <div
      style={{
        padding: '14px 16px',
        borderRadius: 8,
        background: isAccepted ? 'rgba(5, 150, 105, 0.04)' : isRejected ? 'rgba(239, 68, 68, 0.04)' : 'var(--card2)',
        border: `1px solid ${isAccepted ? '#059669' : isRejected ? '#ef4444' : 'var(--border)'}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        opacity: isRejected ? 0.6 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <strong style={{ fontSize: 'var(--t-meta)', color: 'var(--text)' }}>{suggestion.label}</strong>
          {isManualEdit && (
            <span
              style={{
                fontSize: 'var(--t-th)',
                color: '#7c3aed',
                background: 'rgba(124, 58, 237, 0.1)',
                padding: '2px 6px',
                borderRadius: 4,
                fontWeight: 600,
              }}
            >
              Manual Edit Preserved
            </span>
          )}
        </div>

        {/* Provenance Badge */}
        <span
          style={{
            fontSize: 'var(--t-th)',
            fontWeight: 600,
            padding: '2px 8px',
            borderRadius: 4,
            background: pStyle.bg,
            color: pStyle.color,
            border: `1px solid ${pStyle.border}`,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <Icon name={pStyle.icon} size={11} />
          {suggestion.provenance.label || pStyle.label}
        </span>
      </div>

      {suggestion.description && (
        <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>{suggestion.description}</span>
      )}

      {/* Value Comparison */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: currentValue ? '1fr 1fr' : '1fr',
          gap: 10,
          background: 'var(--card)',
          padding: '8px 10px',
          borderRadius: 6,
          border: '1px solid var(--border2)',
        }}
      >
        {currentValue && (
          <div>
            <span style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>Current form value:</span>
            <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{String(currentValue)}</span>
          </div>
        )}
        <div>
          <span style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>Proposed suggestion:</span>
          <span
            style={{
              fontSize: 'var(--t-meta)',
              color: isRejected ? 'var(--muted)' : '#059669',
              fontWeight: 600,
              textDecoration: isRejected ? 'line-through' : 'none',
            }}
          >
            {displayProposed}
          </span>
        </div>
      </div>

      {/* Per-field controls: Accept, Reject, Undo */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
        {isAccepted || isRejected ? (
          <button
            type="button"
            onClick={onUndo}
            style={{
              minHeight: 36,
              padding: '0 12px',
              borderRadius: 4,
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text2)',
              fontSize: 'var(--t-th)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Icon name="arrow_left" size={12} />
            Undo
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={onReject}
              style={{
                minHeight: 36,
                padding: '0 10px',
                borderRadius: 4,
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--danger-text)',
                fontSize: 'var(--t-th)',
                cursor: 'pointer',
              }}
            >
              Reject
            </button>
            <button
              type="button"
              onClick={onAccept}
              style={{
                minHeight: 36,
                padding: '0 14px',
                borderRadius: 4,
                border: 'none',
                background: 'var(--nav-active-accent)',
                color: '#fff',
                fontWeight: 600,
                fontSize: 'var(--t-th)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <Icon name="check" size={13} />
              Accept
            </button>
          </>
        )}
      </div>
    </div>
  )
}
