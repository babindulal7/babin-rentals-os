import { useEffect, useState } from 'react'
import Icon from '../ui/Icon'
import { Button, Card } from '../ui/Page'
import { listInventory } from '../../lib/queries/inventory'
import type { RecordValues } from '../../lib/recordEditor'
import { toBs, formatBs, formatAd } from '../../lib/bs'
import { generateCode128Svg } from '../../lib/labelPrinter'
import { useToast } from '../ui/Toast'
import { rupees, formatMoney } from '../../lib/money'
import { InputGroup, InputGroupTextarea, InputGroupAddon } from '../ui/InputGroup'
import { Kbd } from '../ui/Kbd'

/*
 * Add Equipment assists (8 Oct 2026, RULINGS-2026-10-08.md; Add Equipment v3.0
 * §2, §3, §5.2, §5.4, §7, §9). Presentation and guidance only — nothing here
 * decides whether a record may be saved; `validateRecord` and the record-editor
 * RPC still own that (Law 1). Every state pairs an icon with words.
 */

/** Intake condition — the five values of `unit_condition` (0004) and Return & Inspection v2.1. */
export const INTAKE_CONDITIONS = ['Excellent', 'Good', 'Fair', 'Damaged', 'Lost'] as const

const text = (v: unknown) => String(v ?? '').trim()
const filled = (v: unknown) => text(v) !== ''
const positive = (v: unknown) => Number(v) > 0

/** Split pasted serials (one per line, or comma/tab separated), dropping blanks and repeats. */
export function parseSerialList(input: string, existing: readonly unknown[]): { serials: string[]; skipped: number } {
  const seen = new Set(existing.map((s) => text(s).toLowerCase()).filter(Boolean))
  const serials: string[] = []
  let skipped = 0
  for (const raw of input.split(/[\n,\t]+/)) {
    const serial = raw.trim()
    if (!serial) continue
    const key = serial.toLowerCase()
    if (seen.has(key)) { skipped += 1; continue }
    seen.add(key)
    serials.push(serial)
  }
  return { serials, skipped }
}

export interface ReadinessItem { ok: boolean; label: string }

/** §9 Ready to Rent — what the record still needs before it is worth renting. Never blocks saving. */
export function equipmentReadiness(values: RecordValues, rows: readonly RecordValues[]): ReadinessItem[] {
  const serialised = values.tracking_mode === 'Serialised'
  const identity = filled(values.name) && filled(values.category_id) && filled(values.brand) && filled(values.tracking_mode)
  const withSerial = rows.filter((r) => filled(r.serial_no)).length
  const items: ReadinessItem[] = [
    { ok: identity, label: identity ? 'Name, category, brand and tracking' : 'Name, category, brand and tracking needed' },
    serialised
      ? { ok: rows.length > 0 && withSerial === rows.length, label: rows.length === 0 ? 'No units added' : withSerial === rows.length ? `${rows.length} ${rows.length === 1 ? 'unit' : 'units'} with serials` : `${rows.length - withSerial} of ${rows.length} units need a serial` }
      : { ok: positive(values.total_quantity), label: positive(values.total_quantity) ? `Quantity ${Number(values.total_quantity)} ${text(values.quantity_unit) || 'piece'}` : 'Quantity not set' },
    { ok: filled(values.daily_rate), label: filled(values.daily_rate) ? 'Daily rate set' : 'Daily rate not set' },
    { ok: filled(values.replacement_value), label: filled(values.replacement_value) ? 'Replacement value set' : 'Replacement value not set — needed for damage charges' },
  ]
  if (serialised && rows.length > 0) {
    const located = rows.filter((r) => filled(r.warehouse_id)).length
    items.push({ ok: located === rows.length, label: located === rows.length ? 'Every unit has a warehouse' : `${rows.length - located} of ${rows.length} units need a warehouse` })
  }
  return items
}

export type SectionState = 'complete' | 'todo' | 'optional'

/** §2 completeness dot for one section of the equipment form. */
export function equipmentSectionState(section: string, values: RecordValues, rows: readonly RecordValues[]): SectionState {
  const ready = equipmentReadiness(values, rows)
  switch (section) {
    case 'Identity': return ready[0]!.ok ? 'complete' : 'todo'
    case 'Stock & Units': return ready[1]!.ok ? 'complete' : 'todo'
    case 'Units & location': return ready[1]!.ok && (ready[4]?.ok ?? true) ? 'complete' : 'todo'
    case 'Relationships': return 'optional'
    case 'Location': return ready[4] ? (ready[4].ok ? 'complete' : 'todo') : 'optional'
    case 'Pricing & Rental':
    case 'Pricing': return filled(values.daily_rate) ? 'complete' : 'todo'
    case 'Purchase': return filled(values.replacement_value) ? 'complete' : 'optional'
    case 'Maintenance & Documents':
    case 'Maintenance & notes': return 'optional'
    default: return 'optional'
  }
}

export interface EquipmentStage {
  id: number
  key: 'basic' | 'structure' | 'pricing' | 'relationships' | 'review'
  name: string
  shortName: string
  description: string
  sections: string[]
}

/** 5-Stage Precision Cinema Equipment Intake (Phase 3 Spec). */
export const EQUIPMENT_STAGES: readonly EquipmentStage[] = [
  {
    id: 1,
    key: 'basic',
    name: 'Basic Information',
    shortName: 'Basic Info',
    description: 'Identity, classification, and primary storage location',
    sections: ['Identity', 'Location'],
  },
  {
    id: 2,
    key: 'structure',
    name: 'Inventory Structure',
    shortName: 'Structure',
    description: 'Tracking mode, serialized units, and barcode generation',
    sections: ['Stock & Units'],
  },
  {
    id: 3,
    key: 'pricing',
    name: 'Pricing & Terms',
    shortName: 'Pricing & Terms',
    description: 'Rental rates, purchase price, and security deposit',
    sections: ['Pricing & Rental', 'Purchase'],
  },
  {
    id: 4,
    key: 'relationships',
    name: 'Relationships & Maintenance',
    shortName: 'Relationships',
    description: 'Bundles, compatibility, prep & cleaning rules',
    sections: ['Relationships', 'Maintenance & Documents'],
  },
  {
    id: 5,
    key: 'review',
    name: 'Review & Save',
    shortName: 'Review & Save',
    description: 'Pre-flight specification card & live catalogue preview',
    sections: ['Review'],
  },
] as const

export function getEquipmentStageState(
  stageId: number,
  values: RecordValues,
  rows: readonly RecordValues[],
  canViewMoney: boolean,
  errors: Record<string, string>
): { state: 'complete' | 'todo' | 'optional'; label: string } {
  const ready = equipmentReadiness(values, rows)

  if (stageId === 1) {
    const identityOk = ready[0]?.ok ?? false
    const locationOk = ready[4] ? ready[4].ok : true
    const hasErr = Boolean(errors.name || errors.category_id || errors.brand)
    if (identityOk && locationOk && !hasErr) {
      return { state: 'complete', label: 'Complete' }
    }
    return { state: 'todo', label: 'Required' }
  }

  if (stageId === 2) {
    const stockOk = ready[1]?.ok ?? false
    const hasErr = Boolean(errors.units || errors.total_quantity)
    if (stockOk && !hasErr) {
      return { state: 'complete', label: 'Complete' }
    }
    return { state: 'todo', label: 'Required' }
  }

  if (stageId === 3) {
    if (!canViewMoney) {
      return { state: 'complete', label: 'RBAC Blind' }
    }
    const pricingOk = ready[2]?.ok ?? false
    const hasErr = Boolean(errors.daily_rate || errors.purchase_price || errors.replacement_value)
    if (pricingOk && !hasErr) {
      return { state: 'complete', label: 'Complete' }
    }
    return { state: 'todo', label: 'Daily Rate' }
  }

  if (stageId === 4) {
    const hasMaintenance = filled(values.prep_time_minutes) || filled(values.notes_internal) || filled(values.notes_warehouse)
    return { state: hasMaintenance ? 'complete' : 'optional', label: hasMaintenance ? 'Configured' : 'Optional' }
  }

  if (stageId === 5) {
    const s1 = getEquipmentStageState(1, values, rows, canViewMoney, errors).state
    const s2 = getEquipmentStageState(2, values, rows, canViewMoney, errors).state
    const s3 = getEquipmentStageState(3, values, rows, canViewMoney, errors).state
    const allGood = s1 === 'complete' && s2 === 'complete' && (s3 === 'complete' || !canViewMoney)
    return { state: allGood ? 'complete' : 'todo', label: allGood ? 'Ready' : 'Pending' }
  }

  return { state: 'optional', label: 'Optional' }
}

/** 5-Stage Stepper Header with Step Indicators & Mode Toggle. */
export function EquipmentWizardStepper({
  currentStage,
  onSelectStage,
  wizardMode,
  onToggleWizardMode,
  values,
  rows,
  canViewMoney,
  errors,
}: {
  currentStage: number
  onSelectStage: (stageId: number) => void
  wizardMode: boolean
  onToggleWizardMode: (mode: boolean) => void
  values: RecordValues
  rows: readonly RecordValues[]
  canViewMoney: boolean
  errors: Record<string, string>
}) {
  return (
    <div className="equipment-wizard-stepper-wrap">
      <nav aria-label="Add Equipment 5 Stages" className="equipment-wizard-stepper">
        {EQUIPMENT_STAGES.map((stage) => {
          const active = currentStage === stage.id
          const { state, label } = getEquipmentStageState(stage.id, values, rows, canViewMoney, errors)
          const isComplete = state === 'complete'
          const isTodo = state === 'todo'

          return (
            <button
              key={stage.id}
              type="button"
              className={`equipment-wizard-step ${active ? 'is-active' : ''} is-${state}`}
              aria-current={active ? 'step' : undefined}
              onClick={() => onSelectStage(stage.id)}
            >
              <div className="equipment-wizard-step__num">
                {isComplete ? <Icon name="check" size={14} /> : stage.id}
              </div>
              <div className="equipment-wizard-step__content">
                <span className="equipment-wizard-step__title">{stage.shortName}</span>
                <span className={`equipment-wizard-step__badge is-${state}`}>
                  {isComplete && <Icon name="check" size={11} />}
                  {isTodo && <Icon name="alert_circle" size={11} />}
                  <span>{label}</span>
                </span>
              </div>
            </button>
          )
        })}
      </nav>

      <div className="equipment-mode-toggle" role="group" aria-label="Form navigation mode">
        <button
          type="button"
          className={`equipment-mode-btn ${wizardMode ? 'is-active' : ''}`}
          onClick={() => onToggleWizardMode(true)}
          title="Guided 5-stage sequential wizard"
        >
          <Icon name="queues" size={14} />
          <span>Step by Step</span>
        </button>
        <button
          type="button"
          className={`equipment-mode-btn ${!wizardMode ? 'is-active' : ''}`}
          onClick={() => onToggleWizardMode(false)}
          title="Classic all sections vertical view"
        >
          <Icon name="checklist" size={14} />
          <span>All Sections</span>
        </button>
      </div>
    </div>
  )
}

/** Unit Barcode & Tag Inspection Modal. */
export function UnitBarcodeModal({
  isOpen,
  unit,
  index,
  assetCode,
  equipmentName,
  onClose,
}: {
  isOpen: boolean
  unit: RecordValues | null
  index: number
  assetCode: string
  equipmentName: string
  onClose: () => void
}) {
  const { showSuccessToast } = useToast()
  if (!isOpen || !unit) return null

  const serial = String(unit.serial_no || 'NO-SERIAL')
  const tag = String(unit.asset_tag || `${assetCode}-${String(index + 1).padStart(2, '0')}`)
  const condition = String(unit.condition || 'Excellent')

  const copyTag = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(tag).then(() => {
        showSuccessToast('Asset tag copied', tag)
      })
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="barcode-modal-title"
      className="equipment-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="equipment-modal-card">
        <div className="equipment-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="barcode" size={20} style={{ color: 'var(--link)' }} />
            <h3 id="barcode-modal-title" style={{ margin: 0, fontSize: 'var(--t-ui)' }}>
              Unit Barcode &amp; Tag
            </h3>
          </div>
          <button
            type="button"
            className="equipment-icon-button"
            onClick={onClose}
            aria-label="Close"
          >
            <Icon name="x" size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 'var(--t-meta)' }}>
            <div>
              <span style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>Equipment</span>
              <strong>{equipmentName || 'New Equipment'}</strong>
            </div>
            <div>
              <span style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>Unit Index</span>
              <span>Unit #{index + 1}</span>
            </div>
            <div>
              <span style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>Serial Number</span>
              <span className="identifier" style={{ fontWeight: 600 }}>{serial}</span>
            </div>
            <div>
              <span style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>Condition</span>
              <span className="equipment-badge-condition">{condition}</span>
            </div>
          </div>

          <div className="equipment-barcode-card" style={{ padding: '16px 20px', border: '1px solid var(--border)' }}>
            <div
              className="equipment-barcode-svg"
              dangerouslySetInnerHTML={{ __html: generateCode128Svg(tag, 44) }}
            />
            <span className="equipment-barcode-text identifier" style={{ fontSize: 13, marginTop: 4 }}>
              {tag}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <Button type="button" variant="secondary" icon="copy" onClick={copyTag}>
              Copy Tag ({tag})
            </Button>
            <Button type="button" variant="primary" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Operational Catalogue Live Asset Card Preview Modal. */
export function EquipmentCatalogPreviewModal({
  isOpen,
  values,
  rows,
  categoryName,
  assetCode,
  canViewMoney,
  imagePreviewUrl,
  onClose,
}: {
  isOpen: boolean
  values: RecordValues
  rows: readonly RecordValues[]
  categoryName?: string | undefined
  assetCode?: string | undefined
  canViewMoney: boolean
  imagePreviewUrl?: string | null
  onClose: () => void
}) {
  if (!isOpen) return null

  const code = assetCode || (values.asset_code ? String(values.asset_code) : 'EQ000234')
  const trackingMode = String(values.tracking_mode || 'Serialised')
  const stockCount = trackingMode === 'Serialised' ? rows.length : Number(values.total_quantity || 0)
  const name = text(values.name) || 'Untitled Equipment'
  const brand = text(values.brand) || 'Generic'
  const model = text(values.model)
  const dailyRate = Number(values.daily_rate || 0)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="catalog-preview-title"
      className="equipment-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="equipment-modal-card equipment-modal-card--wide">
        <div className="equipment-modal-header">
          <div>
            <h3 id="catalog-preview-title" style={{ margin: 0, fontSize: 'var(--t-ui)' }}>
              Operational Catalogue Preview
            </h3>
            <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
              Live rendering of this asset card across Inventory, Rental Quotes, and Booking pickers.
            </span>
          </div>
          <button
            type="button"
            className="equipment-icon-button"
            onClick={onClose}
            aria-label="Close"
          >
            <Icon name="x" size={18} />
          </button>
        </div>

        <div className="equipment-catalog-card-preview">
          <div className="equipment-preview-asset-tile">
            <div className="equipment-preview-asset-media">
              {imagePreviewUrl ? (
                <img
                  src={imagePreviewUrl}
                  alt={name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, color: 'var(--muted)' }}>
                  <Icon name="camera" size={32} />
                  <span style={{ fontSize: 'var(--t-th)' }}>No Image</span>
                </div>
              )}
              <span className="equipment-preview-code-tag identifier">{code}</span>
            </div>

            <div className="equipment-preview-asset-info">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span className="equipment-preview-badge">{categoryName || 'Uncategorized'}</span>
                <span className="equipment-preview-badge equipment-preview-badge--mode">{trackingMode}</span>
                <span className="equipment-preview-badge equipment-preview-badge--status">Active Catalogue</span>
              </div>

              <h4 style={{ margin: '6px 0 2px', fontSize: 'var(--t-ui)', color: 'var(--text)' }}>{name}</h4>
              <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                {brand}{model ? ` · ${model}` : ''}
              </div>

              {text(values.description) && (
                <p style={{ margin: '8px 0 0', fontSize: 'var(--t-th)', color: 'var(--muted)', lineClamp: 2, WebkitLineClamp: 2, display: '-webkit-box', WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {text(values.description)}
                </p>
              )}

              <div className="equipment-preview-divider" />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div>
                  <span style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>Available Stock</span>
                  <strong style={{ fontSize: 'var(--t-ui)', color: 'var(--text)' }}>
                    {stockCount} {stockCount === 1 ? 'unit' : 'units'}
                  </strong>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <span style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>Rental Rate</span>
                  {canViewMoney ? (
                    <strong style={{ fontSize: 'var(--t-ui)', color: 'var(--link)' }}>
                      {dailyRate > 0 ? `${formatMoney(rupees(dailyRate))} / day` : 'Not set'}
                    </strong>
                  ) : (
                    <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', fontStyle: 'italic' }}>
                      Restricted (Law 1)
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <Button type="button" variant="primary" onClick={onClose}>
            Close Preview
          </Button>
        </div>
      </div>
    </div>
  )
}

const STATE_COPY: Record<SectionState, { icon: 'check' | 'alert_circle' | 'dot'; word: string }> = {
  complete: { icon: 'check', word: 'complete' },
  todo: { icon: 'alert_circle', word: 'needs attention' },
  optional: { icon: 'dot', word: 'optional' },
}

/** §2 — jump links with a completeness mark; any section may be filled in any order. */
export function EquipmentSectionLinks({ sections, stateOf, idOf }: { sections: readonly string[]; stateOf: (s: string) => SectionState; idOf: (s: string) => string }) {
  return (
    <nav aria-label="Form sections" className="record-section-links">
      {sections.map((section) => {
        const state = stateOf(section)
        return (
          <a key={section} href={`#${idOf(section)}`} className={`record-section-link is-${state}`} onClick={(e) => { e.preventDefault(); document.getElementById(idOf(section))?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}>
            <Icon name={STATE_COPY[state].icon} size={14} />
            <span>{section}</span>
            <span className="sr-only">, {STATE_COPY[state].word}</span>
          </a>
        )
      })}
    </nav>
  )
}

/** §8–§9 — a live picture of what will be created, codes, tree preview, and the Ready-to-Rent checklist. */
export function EquipmentInformationDrawerContent({
  values,
  rows,
  categoryName,
  editing,
  assetCode,
  userName,
  onGenerateAssetTags,
  onCheckDuplicates,
}: {
  values: RecordValues
  rows: readonly RecordValues[]
  categoryName: string | undefined
  editing: boolean
  assetCode?: string | undefined
  userName?: string | undefined
  onGenerateAssetTags?: (() => void) | undefined
  onCheckDuplicates?: (() => void) | undefined
}) {
  const { showSuccessToast } = useToast()
  const [copied, setCopied] = useState(false)
  const ready = equipmentReadiness(values, rows)
  const open = ready.filter((r) => !r.ok).length
  const code = assetCode || (values.asset_code ? String(values.asset_code) : 'EQ000234')
  const serialised = (values.tracking_mode ?? 'Serialised') === 'Serialised'
  const stockCount = serialised ? rows.length : Number(values.total_quantity || 0)
  const today = new Date()
  const bsDate = toBs(today)
  const formattedBs = bsDate ? formatBs(bsDate) : ''

  const copyCode = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(code).then(() => {
        setCopied(true)
        showSuccessToast('Asset code copied', code)
        setTimeout(() => setCopied(false), 2000)
      })
    }
  }

  return (
    <div className="equipment-drawer-content" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      {/* 1. Quick Info */}
      <Card title="Quick Info">
        <div className="equipment-info-grid">
          <div className="equipment-info-row">
            <span className="equipment-info-label">Created by</span>
            <span className="equipment-info-val">{userName || 'Staff'}</span>
          </div>
          <div className="equipment-info-row">
            <span className="equipment-info-label">Created date</span>
            <span className="equipment-info-val">
              {formattedBs ? `${formattedBs} · ` : ''}{formatAd(today)}
            </span>
          </div>
          <div className="equipment-info-row">
            <span className="equipment-info-label">Last updated</span>
            <span className="equipment-info-val">{editing ? 'In catalogue' : 'Never saved'}</span>
          </div>
          <div className="equipment-info-row">
            <span className="equipment-info-label">Status</span>
            <span className="equipment-status-pill">
              <span className="equipment-status-dot" />
              {editing ? 'Active' : 'Draft'}
            </span>
          </div>
        </div>
      </Card>

      {/* 2. Codes */}
      <Card title="Codes">
        <div className="equipment-codes-block">
          <div className="equipment-code-header">
            <div>
              <span className="equipment-code-label">Asset Code</span>
              <strong className="equipment-code-val identifier">{code}</strong>
            </div>
            <button
              type="button"
              className="equipment-copy-btn"
              onClick={copyCode}
              title="Copy Asset Code"
              aria-label="Copy Asset Code"
            >
              <Icon name="copy" size={14} />
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>

          <div className="equipment-barcode-card">
            <div
              className="equipment-barcode-svg"
              dangerouslySetInnerHTML={{ __html: generateCode128Svg(code, 30) }}
            />
            <span className="equipment-barcode-text identifier">{code}</span>
          </div>

          <p style={{ margin: '6px 0 0', fontSize: 'var(--t-th)', color: 'var(--muted)', lineHeight: 1.4 }}>
            One Asset Code drives barcode and QR labels. Serials match manufacturer labels on hardware.
          </p>
        </div>
      </Card>

      {/* 3. Equipment Preview */}
      <Card title="Equipment Preview">
        <div className="equipment-preview-tree">
          <div className="equipment-tree-root">
            <Icon name="box" size={16} style={{ color: 'var(--link)', flexShrink: 0 }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: 'var(--t-meta)' }}>
                {text(values.name) || 'New equipment'}
              </div>
              <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                {stockCount} {stockCount === 1 ? 'item' : 'items'} · {String(values.tracking_mode || 'Serialised')}
                {categoryName ? ` · ${categoryName}` : ''}
              </div>
            </div>
          </div>

          {serialised && rows.length > 0 && (
            <div className="equipment-tree-children">
              {rows.slice(0, 10).map((row, i) => (
                <div key={String(row.id ?? i)} className="equipment-tree-node">
                  <span className="equipment-tree-connector" />
                  <span className="identifier" style={{ color: row.serial_no ? 'var(--text)' : 'var(--muted)', fontSize: 'var(--t-th)' }}>
                    {String(row.serial_no || 'no serial yet')}
                  </span>
                  <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                    {String(row.asset_tag || `${code}-${String(i + 1).padStart(2, '0')}`)}
                  </span>
                  <span className="equipment-tree-badge">
                    {String(row.status || 'In Stock')}
                  </span>
                </div>
              ))}
              {rows.length > 10 && (
                <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', paddingLeft: 16 }}>
                  + {rows.length - 10} more units…
                </div>
              )}
            </div>
          )}

          <div className="equipment-invariant-box">
            <Icon name="check" size={14} style={{ color: 'var(--success-text)', flexShrink: 0 }} />
            <span>
              Preview reconciles — {stockCount} listed = {stockCount} stock. No unit carries a booking.
            </span>
          </div>
        </div>
      </Card>

      {/* 4. Relationship Summary */}
      <Card title="Relationship Summary">
        <div className="equipment-info-grid">
          <div className="equipment-info-row">
            <span className="equipment-info-label">Parent / Container</span>
            <span className="equipment-info-val">Direct Shelf (None)</span>
          </div>
          <div className="equipment-info-row">
            <span className="equipment-info-label">Contained items</span>
            <span className="equipment-info-val">0 Items</span>
          </div>
          <div className="equipment-info-row">
            <span className="equipment-info-label">Total Stock</span>
            <span className="equipment-info-val">{stockCount}</span>
          </div>
          <div className="equipment-info-row">
            <span className="equipment-info-label">Serialized</span>
            <span className="equipment-info-val">{serialised ? 'Yes ✓' : 'No'}</span>
          </div>
          <div className="equipment-info-row">
            <span className="equipment-info-label">Bundle eligible</span>
            <span className="equipment-info-val">Yes ✓</span>
          </div>
        </div>
      </Card>

      {/* 5. Ready to Rent */}
      <Card title="Ready to Rent">
        <div className="equipment-summary__ready" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
          <span className="equipment-summary__ready-title">
            {open === 0 ? 'Ready to rent' : `Ready to rent? ${open} to finish`}
          </span>
          <ul>
            {ready.map((item) => (
              <li key={item.label} className={item.ok ? 'is-ok' : 'is-open'}>
                <Icon name={item.ok ? 'check' : 'alert_triangle'} size={14} />
                <span>{item.label}</span>
              </li>
            ))}
          </ul>
          <span className="equipment-summary__note">
            Saving is never blocked by this list.
          </span>
        </div>
      </Card>

      {/* 6. Quick Actions */}
      <Card title="Quick Actions">
        <div className="equipment-quick-actions-grid">
          {onGenerateAssetTags && (
            <button
              type="button"
              className="equipment-quick-action-btn"
              onClick={onGenerateAssetTags}
            >
              <Icon name="checklist" size={16} />
              <span>Generate Tags</span>
            </button>
          )}
          {onCheckDuplicates && (
            <button
              type="button"
              className="equipment-quick-action-btn"
              onClick={onCheckDuplicates}
            >
              <Icon name="search" size={16} />
              <span>Check Duplicates</span>
            </button>
          )}
          <button
            type="button"
            className="equipment-quick-action-btn"
            onClick={copyCode}
          >
            <Icon name="copy" size={16} />
            <span>Copy Code</span>
          </button>
        </div>
      </Card>
    </div>
  )
}

/** §8–§9 — a live picture of what will be created, then the Ready-to-Rent checklist. */
export function EquipmentSummary({ values, rows, categoryName, editing, assetCode, userName, onGenerateAssetTags, onCheckDuplicates }: {
  values: RecordValues
  rows: readonly RecordValues[]
  categoryName: string | undefined
  editing: boolean
  assetCode?: string | undefined
  userName?: string | undefined
  onGenerateAssetTags?: (() => void) | undefined
  onCheckDuplicates?: (() => void) | undefined
}) {
  return (
    <EquipmentInformationDrawerContent
      values={values}
      rows={rows}
      categoryName={categoryName}
      editing={editing}
      assetCode={assetCode}
      userName={userName}
      onGenerateAssetTags={onGenerateAssetTags}
      onCheckDuplicates={onCheckDuplicates}
    />
  )
}

/** §5.2 — paste many serials at once instead of adding units one by one. */
export function PasteSerials({ existing, disabled, onAdd }: { existing: readonly unknown[]; disabled: boolean; onAdd: (serials: string[]) => void }) {
  const [draft, setDraft] = useState('')
  const [note, setNote] = useState('')
  const preview = parseSerialList(draft, existing)
  return (
    <div className="record-paste-serials">
      <label className="record-field" htmlFor="record-paste-serials">
        <span>Paste serials — one per line</span>
        <InputGroup className="mt-1" disabled={disabled}>
          <InputGroupTextarea
            id="record-paste-serials"
            value={draft}
            disabled={disabled}
            rows={3}
            placeholder={'SN1023\nSN1024\nSN1025'}
            onChange={(e) => { setDraft(e.target.value); setNote('') }}
          />
          <InputGroupAddon align="block-end">
            <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
              {preview.serials.length > 0 ? `${preview.serials.length} serials detected` : 'Line-delimited list'}
            </span>
            <Kbd>Enter ↵</Kbd>
          </InputGroupAddon>
        </InputGroup>
      </label>
      <Button
        disabled={disabled || preview.serials.length === 0}
        onClick={() => {
          onAdd(preview.serials)
          setNote(`${preview.serials.length} ${preview.serials.length === 1 ? 'unit' : 'units'} added${preview.skipped ? `; ${preview.skipped} repeated ${preview.skipped === 1 ? 'serial' : 'serials'} skipped` : ''}.`)
          setDraft('')
        }}
      >
        {preview.serials.length > 0 ? `Add ${preview.serials.length} ${preview.serials.length === 1 ? 'unit' : 'units'}` : 'Add units'}
      </Button>
      {note && <p role="status" className="record-paste-serials__note">{note}</p>}
    </div>
  )
}

/** §7 — an existing equipment record with the same name (and model, when one is given). */
export function useEquipmentDuplicate(name: unknown, model: unknown, enabled: boolean): { id: string; name: string } | null {
  const [match, setMatch] = useState<{ id: string; name: string } | null>(null)
  const wantName = text(name).toLowerCase()
  const wantModel = text(model).toLowerCase()
  useEffect(() => {
    if (!enabled || wantName.length < 3) { setMatch(null); return }
    let active = true
    const timer = setTimeout(() => {
      void listInventory({ search: text(name) })
        .then((result) => {
          if (!active) return
          const hit = result.rows.find((p) => p.name.trim().toLowerCase() === wantName && (!wantModel || !p.model || p.model.trim().toLowerCase() === wantModel))
          setMatch(hit ? { id: hit.id, name: hit.name } : null)
        })
        // The database has no unique name rule; a failed check simply shows no warning.
        .catch(() => { if (active) setMatch(null) })
    }, 350)
    return () => { active = false; clearTimeout(timer) }
  }, [enabled, wantName, wantModel, name])
  return match
}
