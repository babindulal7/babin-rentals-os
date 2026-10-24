import { useState, useMemo, useEffect, type Dispatch, type SetStateAction, type ChangeEvent } from 'react'
import Icon from '../ui/Icon'
import { Button } from '../ui/Page'
import { DateField } from '../ui/DateField'
import { RecordSection } from '../ui/RecordWorkspace'
import {
  EquipmentSectionLinks,
  INTAKE_CONDITIONS,
  PasteSerials,
  equipmentSectionState,
  EQUIPMENT_STAGES,
  EquipmentWizardStepper,
  UnitBarcodeModal,
  EquipmentCatalogPreviewModal,
} from './equipmentAssist'
import type { RecordSnapshot, RecordValues, RecordValue } from '../../lib/recordEditor'
import { useToast } from '../ui/Toast'
import { rupees, formatMoney } from '../../lib/money'

export interface EquipmentRecordEditorProps {
  recordId?: string | undefined
  snapshot: RecordSnapshot | null
  values: RecordValues
  rows: RecordValues[]
  setValues: Dispatch<SetStateAction<RecordValues>>
  setRows: Dispatch<SetStateAction<RecordValues[]>>
  errors: Record<string, string>
  setErrors: Dispatch<SetStateAction<Record<string, string>>>
  busy: boolean
  options: Record<string, Array<{ id: string; name: string }>>
  canViewMoney: boolean
  manufacturerDiffers: boolean
  setManufacturerDiffers: (differs: boolean) => void
}

export function EquipmentRecordEditor({
  recordId,
  snapshot,
  values,
  rows,
  setValues,
  setRows,
  errors,
  setErrors,
  busy,
  options,
  canViewMoney,
  manufacturerDiffers,
  setManufacturerDiffers,
}: EquipmentRecordEditorProps) {
  const { showSuccessToast } = useToast()
  const editing = Boolean(recordId)
  const [showPaste, setShowPaste] = useState(false)
  const [defaultWarehouse, setDefaultWarehouse] = useState<string>(
    String(rows[0]?.warehouse_id ?? '')
  )
  const [defaultRack, setDefaultRack] = useState<string>(String(rows[0]?.rack ?? ''))
  const [defaultShelf, setDefaultShelf] = useState<string>(String(rows[0]?.shelf ?? ''))
  const [defaultBin, setDefaultBin] = useState<string>(String(rows[0]?.bin ?? ''))

  /* ── 5-Stage Precision Cinema Wizard State ────────────────────────────── */
  const [wizardMode, setWizardMode] = useState<boolean>(false)
  const [currentStage, setCurrentStage] = useState<number>(1)
  const [barcodeModalUnit, setBarcodeModalUnit] = useState<{ unit: RecordValues; index: number } | null>(null)
  const [catalogPreviewOpen, setCatalogPreviewOpen] = useState<boolean>(false)
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)

  const handleImageSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      alert('Image file size must be less than 5 MB.')
      return
    }
    const url = URL.createObjectURL(file)
    setImagePreviewUrl(url)
    showSuccessToast('Image thumbnail attached', file.name)
  }

  const handleRemoveImage = () => {
    if (imagePreviewUrl) {
      URL.revokeObjectURL(imagePreviewUrl)
    }
    setImagePreviewUrl(null)
  }

  useEffect(() => {
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl)
    }
  }, [imagePreviewUrl])

  const stage = EQUIPMENT_STAGES.find((s) => s.id === currentStage) ?? EQUIPMENT_STAGES[0]!
  const prevStage = currentStage > 1 ? (EQUIPMENT_STAGES.find((s) => s.id === currentStage - 1) ?? null) : null
  const nextStage = currentStage < 5 ? (EQUIPMENT_STAGES.find((s) => s.id === currentStage + 1) ?? null) : null

  const handleSelectStage = (stageId: number) => {
    setCurrentStage(stageId)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleNextStage = () => {
    if (currentStage < 5) {
      setCurrentStage((prev) => prev + 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const handleBackStage = () => {
    if (currentStage > 1) {
      setCurrentStage((prev) => prev - 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const set = (key: string, value: RecordValue) => {
    setValues((v) => ({ ...v, [key]: value } as RecordValues))
    setErrors((e) => {
      const next = { ...e }
      delete next[key]
      return next
    })
  }

  const sectionId = (section: string) =>
    `record-section-${section.toLowerCase().replace(/[^a-z]+/g, '-')}`

  const sections = useMemo(() => {
    const list = [
      'Identity',
      'Stock & Units',
      'Relationships',
      'Location',
    ]
    if (canViewMoney) {
      list.push('Purchase', 'Pricing & Rental')
    }
    list.push('Maintenance & Documents')
    return list
  }, [canViewMoney])

  /* ── 1. IDENTITY ──────────────────────────────────────────────────────── */
  const renderIdentitySection = () => (
    <RecordSection
      id={sectionId('Identity')}
      title="Identity"
      collapsible={false}
    >
      <div className="record-fields equipment-form-grid">
        <label className="record-field equipment-form-span-2" htmlFor="record-name">
          <span>Equipment name *</span>
          <input
            id="record-name"
            disabled={busy}
            value={String(values.name ?? '')}
            onChange={(e) => set('name', e.target.value)}
            placeholder="e.g. Sony FX3 Camera Body"
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? 'record-name-error' : undefined}
          />
          {errors.name && <span id="record-name-error" role="alert">{errors.name}</span>}
        </label>

        <label className="record-field" htmlFor="record-short_name">
          <span>Short name</span>
          <input
            id="record-short_name"
            disabled={busy}
            value={String(values.short_name ?? '')}
            onChange={(e) => set('short_name', e.target.value)}
            placeholder="e.g. FX3 Body"
          />
        </label>

        <label className="record-field" htmlFor="record-asset_code">
          <span>Asset code (Auto)</span>
          <input
            id="record-asset_code"
            disabled
            readOnly
            value={snapshot?.code ? snapshot.code : 'Assigned when saved'}
            className="identifier"
            style={{ background: 'var(--card2)', color: 'var(--link)', fontWeight: 600 }}
          />
        </label>

        <label className="record-field" htmlFor="record-category_id">
          <span>Category *</span>
          <select
            id="record-category_id"
            disabled={busy}
            value={String(values.category_id ?? '')}
            onChange={(e) => set('category_id', e.target.value)}
            aria-invalid={Boolean(errors.category_id)}
            aria-describedby={errors.category_id ? 'record-category_id-error' : undefined}
          >
            <option value="">Select category…</option>
            {(options.categories ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {errors.category_id && <span id="record-category_id-error" role="alert">{errors.category_id}</span>}
        </label>

        <label className="record-field" htmlFor="record-brand">
          <span>Brand *</span>
          <input
            id="record-brand"
            disabled={busy}
            value={String(values.brand ?? '')}
            onChange={(e) => set('brand', e.target.value)}
            placeholder="e.g. Sony"
            aria-invalid={Boolean(errors.brand)}
            aria-describedby={errors.brand ? 'record-brand-error' : undefined}
          />
          {errors.brand && <span id="record-brand-error" role="alert">{errors.brand}</span>}
        </label>

        <label className="record-field" htmlFor="record-model">
          <span>Model</span>
          <input
            id="record-model"
            disabled={busy}
            value={String(values.model ?? '')}
            onChange={(e) => set('model', e.target.value)}
            placeholder="e.g. ILME-FX3"
          />
        </label>

        <div className="equipment-form-span-full">
          {!manufacturerDiffers ? (
            <label className="record-field record-field--inline" htmlFor="record-manufacturer-differs">
              <input
                id="record-manufacturer-differs"
                type="checkbox"
                disabled={busy}
                checked={false}
                onChange={() => setManufacturerDiffers(true)}
              />
              <span>Made by a different manufacturer than the brand</span>
            </label>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label className="record-field" htmlFor="record-manufacturer">
                <span>Manufacturer</span>
                <input
                  id="record-manufacturer"
                  disabled={busy}
                  value={String(values.manufacturer ?? '')}
                  onChange={(e) => set('manufacturer', e.target.value)}
                  placeholder="e.g. Cosina"
                />
              </label>
              <button
                type="button"
                className="equipment-link-button"
                onClick={() => {
                  setManufacturerDiffers(false)
                  set('manufacturer', '')
                }}
              >
                Same as brand (hide field)
              </button>
            </div>
          )}
        </div>

        <label className="record-field equipment-form-span-full" htmlFor="record-description">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Description</span>
            <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
              {String(values.description ?? '').length} / 1000
            </span>
          </div>
          <textarea
            id="record-description"
            disabled={busy}
            maxLength={1000}
            rows={4}
            value={String(values.description ?? '')}
            onChange={(e) => set('description', e.target.value)}
            placeholder="Equipment details, features, package inclusions, and handling notes…"
          />
        </label>

        {/* Media Thumbnail with local client-side preview */}
        <div className="equipment-form-span-full">
          <label style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text2)', marginBottom: 8 }}>
            Equipment Media &amp; Thumbnail
          </label>
          <div className="equipment-media-container">
            <div
              className="equipment-media-thumb"
              style={{
                position: 'relative',
                overflow: 'hidden',
                cursor: imagePreviewUrl ? 'default' : 'pointer',
                borderStyle: imagePreviewUrl ? 'solid' : 'dashed',
                borderColor: imagePreviewUrl ? 'var(--border2)' : 'var(--border)',
              }}
              onClick={() => {
                if (!imagePreviewUrl) {
                  document.getElementById('equipment-image-file-input')?.click()
                }
              }}
            >
              {imagePreviewUrl ? (
                <>
                  <img
                    src={imagePreviewUrl}
                    alt="Thumbnail preview"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  <button
                    type="button"
                    className="equipment-icon-button"
                    style={{
                      position: 'absolute',
                      top: 4,
                      right: 4,
                      background: 'rgba(0,0,0,0.7)',
                      color: '#ffffff',
                      borderRadius: '50%',
                      width: 26,
                      height: 26,
                    }}
                    title="Remove image"
                    aria-label="Remove image"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRemoveImage()
                    }}
                  >
                    <Icon name="x" size={14} />
                  </button>
                </>
              ) : (
                <>
                  <Icon name="camera" size={24} />
                  <span>Upload photo</span>
                  <span className="equipment-media-sub">PNG, JPG up to 5MB</span>
                </>
              )}
            </div>

            <input
              id="equipment-image-file-input"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              style={{ display: 'none' }}
              disabled={busy}
              onChange={handleImageSelect}
            />

            <div className="equipment-media-gallery">
              <div className="equipment-gallery-slot"><span>Angle 1</span></div>
              <div className="equipment-gallery-slot"><span>Angle 2</span></div>
              <div className="equipment-gallery-slot"><span>Ports</span></div>
              <div className="equipment-gallery-slot"><span>Serial tag</span></div>
              <button
                type="button"
                className="equipment-gallery-slot is-add"
                style={{ background: 'transparent', cursor: 'pointer', font: 'inherit' }}
                onClick={() => document.getElementById('equipment-image-file-input')?.click()}
                title="Upload additional asset photo"
              >
                <span>+ Add</span>
              </button>
            </div>
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
            Select a primary product photo for catalog cards, quote presentations, and warehouse handover identification.
          </p>
        </div>
      </div>
    </RecordSection>
  )

  /* ── 2. STOCK & UNITS ─────────────────────────────────────────────────── */
  const renderStockSection = () => (
    <RecordSection
      id={sectionId('Stock & Units')}
      title="Stock & Units"
      collapsible={false}
    >
      <div style={{ marginBottom: 'var(--sp-md)' }}>
        <label style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text2)', marginBottom: 8 }}>
          Tracking mode *
        </label>
        <div className="equipment-tracking-selector">
          {[
            { mode: 'Serialised', label: 'Serialised', desc: 'One row per physical unit with unique serial number' },
            { mode: 'Quantity', label: 'Quantity', desc: 'Tracked by count (e.g. cables, batteries, clamps)' },
            { mode: 'Consumable', label: 'Consumable', desc: 'Quantity consumed on use (e.g. gaffer tape, gels)' },
          ].map((t) => {
            const on = (values.tracking_mode ?? 'Serialised') === t.mode
            return (
              <button
                key={t.mode}
                type="button"
                className={`equipment-tracking-option ${on ? 'is-active' : ''}`}
                disabled={busy || Boolean(recordId)}
                onClick={() => set('tracking_mode', t.mode)}
              >
                <strong>{t.label}</strong>
                <span>{t.desc}</span>
              </button>
            )
          })}
        </div>
        {/* Hidden select kept for programmatic and test access */}
        <select
          id="record-tracking_mode"
          value={String(values.tracking_mode ?? 'Serialised')}
          disabled={busy || Boolean(recordId)}
          onChange={(e) => set('tracking_mode', e.target.value)}
          style={{ display: 'none' }}
        >
          <option value="Serialised">Serialised</option>
          <option value="Quantity">Quantity</option>
          <option value="Consumable">Consumable</option>
        </select>
      </div>

      {values.tracking_mode === 'Serialised' ? (
        <div id="record-units" tabIndex={-1}>
          <div className="equipment-unit-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
              <span className="equipment-unit-badge">{rows.length} {rows.length === 1 ? 'unit' : 'units'}</span>
              <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                All serial numbers must be unique across the system.
              </span>
            </div>
            {!recordId && (
              <div style={{ display: 'flex', gap: 'var(--sp-xs)', flexWrap: 'wrap' }}>
                <Button
                  type="button"
                  variant="secondary"
                  icon="checklist"
                  disabled={busy || rows.length === 0}
                  onClick={() => {
                    const prefix = snapshot?.code || 'EQ-TAG'
                    setRows((prev) =>
                      prev.map((r, i) => ({
                        ...r,
                        asset_tag: `${prefix}-${String(i + 1).padStart(2, '0')}`,
                      }))
                    )
                    showSuccessToast('Asset tags numbered', `${rows.length} units tagged from ${prefix}-01`)
                  }}
                >
                  Generate Asset Tags
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  icon="upload"
                  disabled={busy}
                  onClick={() => setShowPaste((v) => !v)}
                >
                  {showPaste ? 'Close Paste' : 'Paste Serials'}
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  icon="plus"
                  disabled={busy}
                  onClick={() =>
                    setRows((prev) => [
                      ...prev,
                      {
                        serial_no: null,
                        warehouse_id: prev[prev.length - 1]?.warehouse_id ?? defaultWarehouse ?? null,
                        rack: defaultRack || null,
                        shelf: defaultShelf || null,
                        bin: defaultBin || null,
                        condition: 'Excellent',
                      },
                    ])
                  }
                >
                  Add unit
                </Button>
              </div>
            )}
          </div>

          {!recordId && (
            <PasteSerials
              existing={rows.map((r) => r.serial_no)}
              disabled={busy}
              onAdd={(serials) => {
                setRows((prev) => [
                  ...prev,
                  ...serials.map((serial) => ({
                    serial_no: serial,
                    warehouse_id: prev[prev.length - 1]?.warehouse_id ?? defaultWarehouse ?? null,
                    rack: defaultRack || null,
                    shelf: defaultShelf || null,
                    bin: defaultBin || null,
                    condition: 'Excellent',
                  })),
                ])
              }}
            />
          )}

          {errors.units && <p role="alert" style={{ color: 'var(--danger-text)', margin: '8px 0', fontWeight: 600 }}>{errors.units}</p>}

          <div className="equipment-unit-table-container">
            <table className="equipment-unit-table">
              <thead>
                <tr>
                  <th style={{ width: 44 }}>#</th>
                  <th>Serial number *</th>
                  <th style={{ width: 140 }}>Asset tag</th>
                  <th style={{ width: 90 }}>Barcode</th>
                  <th style={{ width: 100 }}>Status</th>
                  <th style={{ width: 140 }}>Condition</th>
                  <th style={{ width: 160 }}>Warehouse</th>
                  {!recordId && <th style={{ width: 50 }}></th>}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={recordId ? 7 : 8} style={{ textAlign: 'center', padding: '24px 12px', color: 'var(--muted)' }}>
                      No units added yet. Click &quot;Add unit&quot; or &quot;Paste Serials&quot; to register serialized stock.
                    </td>
                  </tr>
                ) : (
                  rows.map((row, index) => (
                    <tr key={String(row.id ?? index)}>
                      <td style={{ color: 'var(--muted)', fontWeight: 600 }}>{index + 1}</td>
                      <td>
                        <input
                          id={`record-unit-${index}-serial_no`}
                          disabled={busy}
                          placeholder="e.g. SN102"
                          value={String(row.serial_no ?? '')}
                          onChange={(e) =>
                            setRows((prev) =>
                              prev.map((r, i) =>
                                i === index ? { ...r, serial_no: e.target.value } : r
                              )
                            )
                          }
                          className="equipment-cell-input"
                        />
                      </td>
                      <td>
                        <span className="identifier" style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                          {String(row.asset_tag || (editing ? 'Not assigned' : '(Assigned on save)'))}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="equipment-badge-subtle"
                          style={{ cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--card2)', padding: '3px 8px' }}
                          title={editing && row.asset_tag ? 'Inspect Barcode & Tag' : 'Save equipment and assign its unit tag before inspecting the barcode'}
                          disabled={!editing || !row.asset_tag}
                          aria-label={`Inspect barcode for unit ${index + 1}`}
                          onClick={() => setBarcodeModalUnit({ unit: row, index })}
                        >
                          <Icon name="barcode" size={12} />
                          <span>Barcode</span>
                        </button>
                      </td>
                      <td>
                        <span className="equipment-badge-status">
                          <Icon name="lock" size={12} />
                          {String(row.status || (editing ? 'Not available' : 'Not saved'))}
                        </span>
                      </td>
                      <td>
                        {!recordId ? (
                          <select
                            id={`record-unit-${index}-condition`}
                            disabled={busy}
                            value={String(row.condition ?? 'Excellent')}
                            onChange={(e) =>
                              setRows((prev) =>
                                prev.map((r, i) =>
                                  i === index ? { ...r, condition: e.target.value } : r
                                )
                              )
                            }
                            className="equipment-cell-select"
                          >
                            {INTAKE_CONDITIONS.map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="equipment-badge-condition">
                            {String(row.condition ?? 'Excellent')}
                          </span>
                        )}
                      </td>
                      <td>
                        <select
                          disabled={busy}
                          value={String(row.warehouse_id ?? '')}
                          onChange={(e) =>
                            setRows((prev) =>
                              prev.map((r, i) =>
                                i === index ? { ...r, warehouse_id: e.target.value } : r
                              )
                            )
                          }
                          className="equipment-cell-select"
                        >
                          <option value="">Warehouse…</option>
                          {(options.warehouses ?? []).map((w) => (
                            <option key={w.id} value={w.id}>{w.name}</option>
                          ))}
                        </select>
                      </td>
                      {!recordId && (
                        <td>
                          <button
                            type="button"
                            className="equipment-icon-button"
                            disabled={busy}
                            title="Remove unit"
                            aria-label="Remove unit"
                            onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
                          >
                            <Icon name="x" size={16} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {recordId && (
            <p style={{ marginTop: 'var(--sp-sm)', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
              Use stock adjustments or intake to change unit counts; use operational actions to change condition or custody.
            </p>
          )}
        </div>
      ) : (
        <div className="record-fields equipment-form-grid">
          <label className="record-field" htmlFor="record-total_quantity">
            <span>Initial quantity *</span>
            <input
              id="record-total_quantity"
              type="number"
              min={0}
              disabled={busy || Boolean(recordId)}
              value={String(values.total_quantity ?? 0)}
              onChange={(e) => set('total_quantity', Number(e.target.value))}
            />
          </label>
          <label className="record-field" htmlFor="record-reorder_level">
            <span>Reorder level</span>
            <input
              id="record-reorder_level"
              type="number"
              min={0}
              disabled={busy}
              value={String(values.reorder_level ?? '')}
              onChange={(e) => set('reorder_level', Number(e.target.value))}
            />
          </label>
          <label className="record-field" htmlFor="record-quantity_unit">
            <span>Quantity unit</span>
            <select
              id="record-quantity_unit"
              disabled={busy}
              value={String(values.quantity_unit ?? 'piece')}
              onChange={(e) => set('quantity_unit', e.target.value)}
            >
              {['piece', 'metre', 'roll', 'pack'].map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </label>
        </div>
      )}
    </RecordSection>
  )

  /* ── 3. RELATIONSHIPS ─────────────────────────────────────────────────── */
  const renderRelationshipsSection = () => (
    <RecordSection
      id={sectionId('Relationships')}
      title="Relationships"
      collapsible
      defaultOpen={false}
      collapsedHint="Physical containment & bundles"
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--sp-md)' }}>
        <div className="equipment-rel-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: 'var(--text)' }}>
            <Icon name="package" size={16} style={{ color: 'var(--link)' }} />
            <span>1. Physical Containment</span>
          </div>
          <p style={{ margin: '8px 0 4px', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
            Stored in: <strong>None — direct shelf</strong>
          </p>
          <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
            One item is stored in one container at a time.
          </span>
        </div>

        <div className="equipment-rel-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: 'var(--text)' }}>
            <Icon name="queues" size={16} style={{ color: 'var(--link)' }} />
            <span>2. Kit Membership</span>
          </div>
          <p style={{ margin: '8px 0 4px', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
            Used in bundles: <em>None assigned</em>
          </p>
          <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
            Read-only here; bundle membership is edited in Bundles.
          </span>
        </div>

        <div className="equipment-rel-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: 'var(--text)' }}>
            <Icon name="tool" size={16} style={{ color: 'var(--link)' }} />
            <span>3. Compatibility</span>
          </div>
          <p style={{ margin: '8px 0 4px', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
            Compatible with: <em>None linked</em>
          </p>
          <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
            Informational only; powers packing warnings.
          </span>
        </div>
      </div>
      <p style={{ marginTop: 'var(--sp-sm)', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
        Relationship persistence pending API integration — inventory relationships will attach here.
      </p>
    </RecordSection>
  )

  /* ── 4. LOCATION ──────────────────────────────────────────────────────── */
  const renderLocationSection = () => (
    <RecordSection
      id={sectionId('Location')}
      title="Location"
      collapsible
      defaultOpen={true}
    >
      <div className="record-fields equipment-form-grid">
        <label className="record-field" htmlFor="record-default-warehouse">
          <span>Primary warehouse *</span>
          <select
            id="record-default-warehouse"
            disabled={busy}
            value={defaultWarehouse}
            onChange={(e) => {
              const wid = e.target.value
              setDefaultWarehouse(wid)
              if (rows.length > 0) {
                setRows((prev) =>
                  prev.map((r) => ({ ...r, warehouse_id: r.warehouse_id || wid }))
                )
              }
            }}
          >
            <option value="">Select warehouse…</option>
            {(options.warehouses ?? []).map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </label>

        <label className="record-field" htmlFor="record-default-rack">
          <span>Rack</span>
          <input
            id="record-default-rack"
            disabled={busy}
            placeholder="e.g. Rack A"
            value={defaultRack}
            onChange={(e) => setDefaultRack(e.target.value)}
          />
        </label>

        <label className="record-field" htmlFor="record-default-shelf">
          <span>Shelf</span>
          <input
            id="record-default-shelf"
            disabled={busy}
            placeholder="e.g. Shelf 2"
            value={defaultShelf}
            onChange={(e) => setDefaultShelf(e.target.value)}
          />
        </label>

        <label className="record-field" htmlFor="record-default-bin">
          <span>Bin</span>
          <input
            id="record-default-bin"
            disabled={busy}
            placeholder="e.g. Bin 04"
            value={defaultBin}
            onChange={(e) => setDefaultBin(e.target.value)}
          />
        </label>

        {rows.length > 0 && !recordId && (
          <div className="equipment-form-span-full">
            <Button
              type="button"
              variant="secondary"
              disabled={busy || !defaultWarehouse}
              onClick={() => {
                setRows((prev) =>
                  prev.map((r) => ({
                    ...r,
                    warehouse_id: defaultWarehouse,
                    rack: defaultRack || null,
                    shelf: defaultShelf || null,
                    bin: defaultBin || null,
                  }))
                )
                showSuccessToast('Location updated', `Applied to all ${rows.length} units`)
              }}
            >
              Apply warehouse &amp; location to all units
            </Button>
          </div>
        )}
      </div>
    </RecordSection>
  )

  /* ── 5. PURCHASE (MONEY GATED) ────────────────────────────────────────── */
  const renderPurchaseSection = () => (
    <RecordSection
      id={sectionId('Purchase')}
      title="Purchase"
      collapsible
      defaultOpen={true}
      forceOpen={Boolean(errors.purchase_price || errors.replacement_value || errors.purchase_date)}
      statusBadge={
        sectionManager ? (
          <SectionSaveStatusBadge
            status={sectionManager.getSectionStatus('purchase', Boolean(errors.purchase_price || errors.replacement_value || errors.purchase_date))}
            savedAtTime={sectionManager.savedSections['purchase']?.savedAt}
            errorMessage={sectionManager.sectionErrors['purchase']}
          />
        ) : undefined
      }
    >
      <div className="record-fields equipment-form-grid">
        <div className="record-field">
          <label htmlFor="record-purchase_date" style={{ display: 'block', marginBottom: 4 }}>
            Purchase date
          </label>
          <DateField
            id="record-purchase_date"
            value={String(values.purchase_date ?? '')}
            onChange={(val) => set('purchase_date', val)}
            disabled={busy}
            showBs={true}
            placeholder="dd/mm/yyyy"
            ariaLabel="Purchase date"
          />
        </div>

        <label className="record-field" htmlFor="record-purchase_price">
          <span>Purchase price</span>
          <input
            id="record-purchase_price"
            type="text"
            inputMode="decimal"
            disabled={busy}
            placeholder="e.g. 3,50,000"
            value={String(values.purchase_price ?? '')}
            onChange={(e) => set('purchase_price', e.target.value)}
            aria-invalid={Boolean(errors.purchase_price)}
            aria-describedby={errors.purchase_price ? 'record-purchase_price-error' : undefined}
          />
          {errors.purchase_price && <span id="record-purchase_price-error" role="alert">{errors.purchase_price}</span>}
        </label>

        <label className="record-field" htmlFor="record-replacement_value">
          <span>Replacement value</span>
          <input
            id="record-replacement_value"
            type="text"
            inputMode="decimal"
            disabled={busy}
            placeholder="e.g. 4,20,000"
            value={String(values.replacement_value ?? '')}
            onChange={(e) => set('replacement_value', e.target.value)}
            aria-invalid={Boolean(errors.replacement_value)}
            aria-describedby={errors.replacement_value ? 'record-replacement_value-error' : undefined}
          />
          <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
            Used to compute damage charges and security deposits.
          </span>
          {errors.replacement_value && <span id="record-replacement_value-error" role="alert">{errors.replacement_value}</span>}
        </label>
      </div>

      {sectionManager && (
        <SectionSaveBar
          sectionName="Purchase"
          status={sectionManager.getSectionStatus('purchase', Boolean(errors.purchase_price || errors.replacement_value || errors.purchase_date))}
          isSaving={sectionManager.savingSection === 'purchase'}
          canSave={Boolean(recordId || snapshot?.id) && !errors.purchase_price && !errors.replacement_value && !errors.purchase_date}
          saveDisabledReason={!recordId && !snapshot?.id ? 'Save Identity first' : null}
          onSave={async () => {
            await sectionManager.saveSection('purchase', {
              purchase_date: values.purchase_date ?? null,
              purchase_price: values.purchase_price ?? null,
              replacement_value: values.replacement_value ?? null,
            })
          }}
          onNext={() => {
            document.getElementById(sectionId('Pricing & Rental'))?.scrollIntoView({ behavior: 'smooth' })
          }}
          nextLabel="Pricing & Rental"
          errorMessage={sectionManager.sectionErrors['purchase']}
        />
      )}
    </RecordSection>
  )

  /* ── 6. PRICING & RENTAL (MONEY GATED) ────────────────────────────────── */
  const renderPricingSection = () => (
    <RecordSection
      id={sectionId('Pricing & Rental')}
      title="Pricing & Rental"
      collapsible
      defaultOpen={true}
      forceOpen={Boolean(errors.daily_rate)}
      statusBadge={
        sectionManager ? (
          <SectionSaveStatusBadge
            status={sectionManager.getSectionStatus('pricing & rental', Boolean(errors.daily_rate))}
            savedAtTime={sectionManager.savedSections['pricing & rental']?.savedAt}
            errorCount={errors.daily_rate ? 1 : 0}
            errorMessage={sectionManager.sectionErrors['pricing & rental']}
          />
        ) : undefined
      }
    >
      <div className="record-fields equipment-form-grid">
        <label className="record-field" htmlFor="record-daily_rate">
          <span>Daily rate *</span>
          <input
            id="record-daily_rate"
            type="text"
            inputMode="decimal"
            disabled={busy}
            placeholder="e.g. 4,500"
            value={String(values.daily_rate ?? '')}
            onChange={(e) => set('daily_rate', e.target.value)}
            aria-invalid={Boolean(errors.daily_rate)}
            aria-describedby={errors.daily_rate ? 'record-daily_rate-error' : undefined}
          />
          {errors.daily_rate && <span id="record-daily_rate-error" role="alert">{errors.daily_rate}</span>}
        </label>

        <label className="record-field" htmlFor="record-weekly_rate">
          <span>Weekly rate</span>
          <input
            id="record-weekly_rate"
            type="text"
            inputMode="decimal"
            disabled={busy}
            placeholder="e.g. 22,500"
            value={String(values.weekly_rate ?? '')}
            onChange={(e) => set('weekly_rate', e.target.value)}
          />
        </label>

        <label className="record-field" htmlFor="record-monthly_rate">
          <span>Monthly rate</span>
          <input
            id="record-monthly_rate"
            type="text"
            inputMode="decimal"
            disabled={busy}
            placeholder="e.g. 75,000"
            value={String(values.monthly_rate ?? '')}
            onChange={(e) => set('monthly_rate', e.target.value)}
          />
        </label>

        <label className="record-field" htmlFor="record-hourly_rate">
          <span>Hourly rate</span>
          <input
            id="record-hourly_rate"
            type="text"
            inputMode="decimal"
            disabled={busy}
            placeholder="e.g. 800"
            value={String(values.hourly_rate ?? '')}
            onChange={(e) => set('hourly_rate', e.target.value)}
          />
        </label>

        <label className="record-field" htmlFor="record-weekend_rate">
          <span>Weekend rate</span>
          <input
            id="record-weekend_rate"
            type="text"
            inputMode="decimal"
            disabled={busy}
            placeholder="e.g. 7,000"
            value={String(values.weekend_rate ?? '')}
            onChange={(e) => set('weekend_rate', e.target.value)}
          />
        </label>

        <label className="record-field" htmlFor="record-min_rental_days">
          <span>Minimum rental days</span>
          <input
            id="record-min_rental_days"
            type="number"
            min={1}
            disabled={busy}
            value={String(values.min_rental_days ?? 1)}
            onChange={(e) => set('min_rental_days', Number(e.target.value))}
          />
        </label>

        <label className="record-field" htmlFor="record-deposit_percent">
          <span>Deposit percent (% of replacement)</span>
          <input
            id="record-deposit_percent"
            type="number"
            min={0}
            max={100}
            disabled={busy}
            placeholder="e.g. 10"
            value={String(values.deposit_percent ?? '')}
            onChange={(e) => set('deposit_percent', Number(e.target.value))}
          />
        </label>

        <label className="record-field" htmlFor="record-deposit_fixed">
          <span>Fixed deposit (if not percentage)</span>
          <input
            id="record-deposit_fixed"
            type="text"
            inputMode="decimal"
            disabled={busy}
            placeholder="e.g. 20,000"
            value={String(values.deposit_fixed ?? '')}
            onChange={(e) => set('deposit_fixed', e.target.value)}
          />
        </label>

        <label className="record-field record-field--inline equipment-form-span-full" htmlFor="record-rental_enabled">
          <input
            id="record-rental_enabled"
            type="checkbox"
            disabled={busy}
            checked={Boolean(values.rental_enabled ?? true)}
            onChange={(e) => set('rental_enabled', e.target.checked)}
          />
          <span>Available for rental (item can be picked and booked in rental quotes)</span>
        </label>
      </div>

      {sectionManager && (
        <SectionSaveBar
          sectionName="Pricing & Rental"
          status={sectionManager.getSectionStatus('pricing & rental', Boolean(errors.daily_rate))}
          isSaving={sectionManager.savingSection === 'pricing & rental'}
          canSave={Boolean(recordId || snapshot?.id) && !errors.daily_rate}
          saveDisabledReason={!recordId && !snapshot?.id ? 'Save Identity first' : null}
          onSave={async () => {
            await sectionManager.saveSection('pricing & rental', {
              daily_rate: values.daily_rate ?? null,
              weekly_rate: values.weekly_rate ?? null,
              monthly_rate: values.monthly_rate ?? null,
              deposit_percentage: values.deposit_percent ?? null,
              deposit_fixed: values.deposit_fixed ?? null,
              rental_enabled: values.rental_enabled ?? true,
            })
          }}
          onNext={() => {
            document.getElementById(sectionId('Maintenance & Documents'))?.scrollIntoView({ behavior: 'smooth' })
          }}
          nextLabel="Maintenance & Documents"
          errorMessage={sectionManager.sectionErrors['pricing & rental']}
        />
      )}
    </RecordSection>
  )

  /* ── 7. MAINTENANCE & DOCUMENTS ───────────────────────────────────────── */
  const renderMaintenanceSection = () => (
    <RecordSection
      id={sectionId('Maintenance & Documents')}
      title="Maintenance & Documents"
      collapsible
      defaultOpen={false}
      forceOpen={Boolean(errors.prep_time_minutes || errors.cleaning_time_minutes || errors.notes_internal)}
      collapsedHint="Prep, cleaning & notes"
      statusBadge={
        sectionManager ? (
          <SectionSaveStatusBadge
            status={sectionManager.getSectionStatus('maintenance & documents', Boolean(errors.prep_time_minutes || errors.cleaning_time_minutes || errors.notes_internal))}
            savedAtTime={sectionManager.savedSections['maintenance & documents']?.savedAt}
            errorMessage={sectionManager.sectionErrors['maintenance & documents']}
          />
        ) : undefined
      }
    >
      <div className="record-fields equipment-form-grid">
        <label className="record-field" htmlFor="record-prep_time_minutes">
          <span>Preparation minutes</span>
          <input
            id="record-prep_time_minutes"
            type="number"
            min={0}
            disabled={busy}
            value={String(values.prep_time_minutes ?? 0)}
            onChange={(e) => set('prep_time_minutes', Number(e.target.value))}
          />
        </label>

        <label className="record-field" htmlFor="record-cleaning_time_minutes">
          <span>Cleaning minutes</span>
          <input
            id="record-cleaning_time_minutes"
            type="number"
            min={0}
            disabled={busy}
            value={String(values.cleaning_time_minutes ?? 0)}
            onChange={(e) => set('cleaning_time_minutes', Number(e.target.value))}
          />
        </label>

        <label className="record-field record-field--inline" htmlFor="record-inspection_required" style={{ marginTop: 20 }}>
          <input
            id="record-inspection_required"
            type="checkbox"
            disabled={busy}
            checked={Boolean(values.inspection_required ?? true)}
            onChange={(e) => set('inspection_required', e.target.checked)}
          />
          <span>Inspection required on return</span>
        </label>

        <label className="record-field record-field--inline" htmlFor="record-packing_required" style={{ marginTop: 20 }}>
          <input
            id="record-packing_required"
            type="checkbox"
            disabled={busy}
            checked={Boolean(values.packing_required ?? true)}
            onChange={(e) => set('packing_required', e.target.checked)}
          />
          <span>Packing verification required before dispatch</span>
        </label>

        <label className="record-field equipment-form-span-2" htmlFor="record-notes_internal">
          <span>Internal notes (never printed on client documents)</span>
          <textarea
            id="record-notes_internal"
            disabled={busy}
            rows={3}
            value={String(values.notes_internal ?? '')}
            onChange={(e) => set('notes_internal', e.target.value)}
            placeholder="Service history, handling quirks, calibration notes…"
          />
        </label>

        <label className="record-field equipment-form-span-2" htmlFor="record-notes_warehouse">
          <span>Warehouse notes</span>
          <textarea
            id="record-notes_warehouse"
            disabled={busy}
            rows={3}
            value={String(values.notes_warehouse ?? '')}
            onChange={(e) => set('notes_warehouse', e.target.value)}
            placeholder="Case type, storage shelf instructions, cable counts…"
          />
        </label>

        <div className="equipment-form-span-full">
          <p style={{ margin: 0, fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
            Document attachments (manuals, warranty, certificates) restricted to Owner/Manager/Billing — document storage will link here once configured.
          </p>
        </div>
      </div>

      {sectionManager && (
        <SectionSaveBar
          sectionName="Maintenance & Documents"
          status={sectionManager.getSectionStatus('maintenance & documents', Boolean(errors.prep_time_minutes || errors.cleaning_time_minutes || errors.notes_internal))}
          isSaving={sectionManager.savingSection === 'maintenance & documents'}
          canSave={Boolean(recordId || snapshot?.id)}
          saveDisabledReason={!recordId && !snapshot?.id ? 'Save Identity first' : null}
          onSave={async () => {
            await sectionManager.saveSection('maintenance & documents', {
              prep_time_minutes: values.prep_time_minutes ?? 0,
              cleaning_time_minutes: values.cleaning_time_minutes ?? 0,
              inspection_required: values.inspection_required ?? true,
              packing_required: values.packing_required ?? true,
              notes_internal: values.notes_internal ?? null,
              notes_warehouse: values.notes_warehouse ?? null,
            })
          }}
          errorMessage={sectionManager.sectionErrors['maintenance & documents']}
        />
      )}
    </RecordSection>
  )

  /* ── MONEY-BLIND RBAC CARD (Law 1) ────────────────────────────────────── */
  const renderMoneyBlindNotice = () => (
    <div
      role="region"
      aria-label="Commercial terms restricted"
      style={{
        padding: '24px 20px',
        background: 'var(--card2)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-card, 8px)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text)' }}>
        <Icon name="lock" size={20} style={{ color: 'var(--muted)' }} />
        <h4 style={{ margin: 0, fontSize: 'var(--t-ui)' }}>Commercial Terms Managed by Accounts</h4>
      </div>
      <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.5 }}>
        Financial and rental pricing fields are hidden for your role. Daily rates, purchase records, and replacement values are maintained directly by Accounts and Operations Management.
      </p>
    </div>
  )

  /* ── STAGE 5: REVIEW & PRE-FLIGHT CHECKLIST ───────────────────────────── */
  const renderStage5Review = () => {
    const code = snapshot?.code || (values.asset_code ? String(values.asset_code) : 'Assigned on save')
    const trackingMode = String(values.tracking_mode || 'Serialised')
    const serialised = trackingMode === 'Serialised'
    const stockCount = serialised ? rows.length : Number(values.total_quantity || 0)
    const categoryName = (options.categories ?? []).find((c) => c.id === values.category_id)?.name
    const warehouseName = (options.warehouses ?? []).find((w) => w.id === (defaultWarehouse || rows[0]?.warehouse_id))?.name

    return (
      <div className="equipment-review-container">
        {/* 1. Pre-Flight Specification Card */}
        <div className="equipment-review-card">
          <div className="equipment-review-header">
            <h4>
              <Icon name="checklist" size={18} style={{ color: 'var(--link)' }} />
              <span>Pre-Flight Equipment Specification</span>
            </h4>
            <Button
              type="button"
              variant="secondary"
              icon="search"
              onClick={() => setCatalogPreviewOpen(true)}
            >
              Preview Asset in Catalog
            </Button>
          </div>

          <div className="equipment-review-grid">
            <div className="equipment-review-item">
              <span className="equipment-review-item-label">Equipment Name</span>
              <span className="equipment-review-item-val">{String(values.name || '—')}</span>
            </div>
            <div className="equipment-review-item">
              <span className="equipment-review-item-label">Brand &amp; Model</span>
              <span className="equipment-review-item-val">
                {String(values.brand || '—')}{values.model ? ` · ${String(values.model)}` : ''}
              </span>
            </div>
            <div className="equipment-review-item">
              <span className="equipment-review-item-label">Category</span>
              <span className="equipment-review-item-val">{categoryName || '—'}</span>
            </div>
            <div className="equipment-review-item">
              <span className="equipment-review-item-label">Asset Code</span>
              <span className="equipment-review-item-val identifier">{code}</span>
            </div>
            <div className="equipment-review-item">
              <span className="equipment-review-item-label">Tracking Mode</span>
              <span className="equipment-review-item-val">{trackingMode}</span>
            </div>
            <div className="equipment-review-item">
              <span className="equipment-review-item-label">Initial Stock</span>
              <span className="equipment-review-item-val">
                {stockCount} {stockCount === 1 ? 'unit' : 'units'}
              </span>
            </div>
            <div className="equipment-review-item">
              <span className="equipment-review-item-label">Primary Location</span>
              <span className="equipment-review-item-val">
                {warehouseName || '—'}
                {defaultRack || defaultShelf || defaultBin ? ` (${[defaultRack, defaultShelf, defaultBin].filter(Boolean).join(' / ')})` : ''}
              </span>
            </div>
            {canViewMoney && (
              <>
                <div className="equipment-review-item">
                  <span className="equipment-review-item-label">Daily Rental Rate</span>
                  <span className="equipment-review-item-val" style={{ color: 'var(--link)' }}>
                    {values.daily_rate ? `${formatMoney(rupees(Number(values.daily_rate)))} / day` : '—'}
                  </span>
                </div>
                <div className="equipment-review-item">
                  <span className="equipment-review-item-label">Replacement Value</span>
                  <span className="equipment-review-item-val">
                    {values.replacement_value ? formatMoney(rupees(Number(values.replacement_value))) : '—'}
                  </span>
                </div>
              </>
            )}
            <div className="equipment-review-item">
              <span className="equipment-review-item-label">Maintenance Rules</span>
              <span className="equipment-review-item-val">
                {Number(values.prep_time_minutes || 0)}m prep · {Number(values.cleaning_time_minutes || 0)}m clean
                {values.inspection_required ? ' · Inspection required' : ''}
              </span>
            </div>
          </div>
        </div>

        {/* 2. Readiness / Validation Checklist */}
        <div className="equipment-review-card">
          <div className="equipment-review-header">
            <h4>
              <Icon name="check" size={18} style={{ color: 'var(--success-text)' }} />
              <span>Readiness &amp; Safety Checklist</span>
            </h4>
            <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
              All operational prerequisites before dispatch
            </span>
          </div>

          <ul className="equipment-review-checklist">
            <li className={`equipment-review-check-item ${values.name ? 'is-ok' : 'is-todo'}`}>
              <Icon name={values.name ? 'check' : 'alert_circle'} size={15} style={{ color: values.name ? 'var(--success-text)' : 'var(--warn-text)' }} />
              <span>Equipment name entered ({values.name ? '✓' : 'Required'})</span>
            </li>
            <li className={`equipment-review-check-item ${values.category_id ? 'is-ok' : 'is-todo'}`}>
              <Icon name={values.category_id ? 'check' : 'alert_circle'} size={15} style={{ color: values.category_id ? 'var(--success-text)' : 'var(--warn-text)' }} />
              <span>Category assigned ({values.category_id ? '✓' : 'Required'})</span>
            </li>
            <li className={`equipment-review-check-item ${values.brand ? 'is-ok' : 'is-todo'}`}>
              <Icon name={values.brand ? 'check' : 'alert_circle'} size={15} style={{ color: values.brand ? 'var(--success-text)' : 'var(--warn-text)' }} />
              <span>Brand specified ({values.brand ? '✓' : 'Required'})</span>
            </li>
            <li className={`equipment-review-check-item ${serialised ? (rows.length > 0 && rows.every((r) => r.serial_no) ? 'is-ok' : 'is-todo') : (Number(values.total_quantity || 0) > 0 ? 'is-ok' : 'is-todo')}`}>
              <Icon name={serialised ? (rows.length > 0 && rows.every((r) => r.serial_no) ? 'check' : 'alert_circle') : (Number(values.total_quantity || 0) > 0 ? 'check' : 'alert_circle')} size={15} style={{ color: (serialised ? rows.length > 0 && rows.every((r) => r.serial_no) : Number(values.total_quantity || 0) > 0) ? 'var(--success-text)' : 'var(--warn-text)' }} />
              <span>{serialised ? `${rows.length} units with verified serials` : `Stock quantity set to ${values.total_quantity || 0}`}</span>
            </li>
            <li className={`equipment-review-check-item ${defaultWarehouse || rows.some((r) => r.warehouse_id) ? 'is-ok' : 'is-todo'}`}>
              <Icon name={defaultWarehouse || rows.some((r) => r.warehouse_id) ? 'check' : 'alert_circle'} size={15} style={{ color: defaultWarehouse || rows.some((r) => r.warehouse_id) ? 'var(--success-text)' : 'var(--warn-text)' }} />
              <span>Warehouse storage assigned</span>
            </li>
            {canViewMoney ? (
              <li className={`equipment-review-check-item ${values.daily_rate ? 'is-ok' : 'is-todo'}`}>
                <Icon name={values.daily_rate ? 'check' : 'alert_circle'} size={15} style={{ color: values.daily_rate ? 'var(--success-text)' : 'var(--warn-text)' }} />
                <span>Commercial daily rate configured</span>
              </li>
            ) : (
              <li className="equipment-review-check-item is-ok">
                <Icon name="lock" size={15} style={{ color: 'var(--muted)' }} />
                <span>Money-blind role (pricing managed by accounts)</span>
              </li>
            )}
          </ul>
        </div>

        {/* 3. Invariant Safety Guarantee */}
        <div className="equipment-invariant-box" style={{ padding: 12, borderRadius: 'var(--r-card, 8px)' }}>
          <Icon name="check" size={16} style={{ color: 'var(--success-text)', flexShrink: 0 }} />
          <div style={{ fontSize: 'var(--t-meta)', lineHeight: 1.5 }}>
            <strong>Precision Cinema Invariant Guarantee:</strong> Intake records reconcile stock directly into warehouse inventory. No new unit can carry a booking or be placed On Rent during intake creation.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="equipment-record-editor">
      {Object.keys(errors).length > 0 && (
        <div
          role="alert"
          className="record-validation-banner"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 14px',
            marginBottom: 16,
            borderRadius: 'var(--r-card, 8px)',
            background: 'color-mix(in srgb, var(--danger, #ef4444) 10%, var(--card))',
            border: '1px solid color-mix(in srgb, var(--danger, #ef4444) 30%, transparent)',
            color: 'var(--danger-text, #ef4444)',
            fontSize: 'var(--t-meta, 13px)',
            fontWeight: 600,
          }}
        >
          <Icon name="alert_triangle" size={18} style={{ color: 'var(--danger, #ef4444)', flexShrink: 0 }} />
          <span>
            {Object.keys(errors).length} {Object.keys(errors).length === 1 ? 'field requires' : 'fields require'} attention before saving.
          </span>
        </div>
      )}

      {/* ── 5-Stage Stepper Header & Mode Toggle ── */}
      {!editing && (
        <EquipmentWizardStepper
          currentStage={currentStage}
          onSelectStage={handleSelectStage}
          wizardMode={wizardMode}
          onToggleWizardMode={setWizardMode}
          values={values}
          rows={rows}
          canViewMoney={canViewMoney}
          errors={errors}
        />
      )}

      {/* Section jump links */}
      <div style={{ display: wizardMode ? 'none' : undefined }}>
        <EquipmentSectionLinks
          sections={sections}
          stateOf={(sec) => equipmentSectionState(sec, values, rows)}
          idOf={sectionId}
        />
      </div>

      {/* ── STAGE 1: BASIC INFORMATION (Identity & Location) ── */}
      <div style={{ display: !wizardMode || currentStage === 1 ? undefined : 'none' }}>
        {renderIdentitySection()}
        {wizardMode && renderLocationSection()}
      </div>

      {/* ── STAGE 2: INVENTORY STRUCTURE (Stock & Units) ────── */}
      <div style={{ display: !wizardMode || currentStage === 2 ? undefined : 'none' }}>
        {renderStockSection()}
      </div>

      {/* ── STAGE 4 (or non-wizard order): RELATIONSHIPS ────── */}
      <div style={{ display: !wizardMode || currentStage === 4 ? undefined : 'none' }}>
        {renderRelationshipsSection()}
      </div>

      {/* Location in non-wizard mode appears after relationships */}
      {!wizardMode && renderLocationSection()}

      {/* ── STAGE 3: PRICING & TERMS ────────────────────────── */}
      <div style={{ display: !wizardMode || currentStage === 3 ? undefined : 'none' }}>
        {canViewMoney ? (
          <>
            {renderPurchaseSection()}
            {renderPricingSection()}
          </>
        ) : (
          wizardMode && renderMoneyBlindNotice()
        )}
      </div>

      {/* ── STAGE 4: MAINTENANCE & DOCUMENTS ─────────────────── */}
      <div style={{ display: !wizardMode || currentStage === 4 ? undefined : 'none' }}>
        {renderMaintenanceSection()}
      </div>

      {/* ── STAGE 5: REVIEW & SAVE ──────────────────────────── */}
      {(!wizardMode || currentStage === 5) && renderStage5Review()}

      {/* ── WIZARD BOTTOM NAVIGATION BAR ────────────────────── */}
      {!editing && wizardMode && (
        <div className="equipment-wizard-nav">
          <div>
            {prevStage ? (
              <Button
                type="button"
                variant="secondary"
                icon="chevron_left"
                onClick={handleBackStage}
              >
                Back: {prevStage.shortName}
              </Button>
            ) : (
              <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                Step 1 of 5
              </span>
            )}
          </div>

          <div className="equipment-wizard-nav-status" style={{ textAlign: 'center' }}>
            <span className="equipment-wizard-nav-step-name">
              Stage {currentStage}: {stage.name}
            </span>
            <span className="equipment-wizard-nav-step-sub">
              {stage.description}
            </span>
          </div>

          <div className="equipment-wizard-nav-actions">
            {nextStage ? (
              <Button
                type="button"
                variant="primary"
                icon="chevron_right"
                onClick={handleNextStage}
              >
                Next: {nextStage.shortName}
              </Button>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="equipment-badge-status">
                  <Icon name="check" size={14} />
                  Ready to Save
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  icon="search"
                  onClick={() => setCatalogPreviewOpen(true)}
                >
                  Preview in Catalog
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── MODALS ─────────────────────────────────────────── */}
      <UnitBarcodeModal
        isOpen={Boolean(barcodeModalUnit)}
        unit={barcodeModalUnit?.unit ?? null}
        index={barcodeModalUnit?.index ?? 0}
        assetCode={snapshot?.code || ''}
        equipmentName={String(values.name || 'Equipment')}
        onClose={() => setBarcodeModalUnit(null)}
      />

      <EquipmentCatalogPreviewModal
        isOpen={catalogPreviewOpen}
        values={values}
        rows={rows}
        categoryName={(options.categories ?? []).find((c) => c.id === values.category_id)?.name}
        assetCode={snapshot?.code}
        canViewMoney={canViewMoney}
        imagePreviewUrl={imagePreviewUrl}
        onClose={() => setCatalogPreviewOpen(false)}
      />
    </div>
  )
}
