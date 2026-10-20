import { useState, useMemo, type Dispatch, type SetStateAction } from 'react'
import Icon from '../ui/Icon'
import { Button } from '../ui/Page'
import { RecordSection } from '../ui/RecordWorkspace'
import {
  EquipmentSectionLinks,
  INTAKE_CONDITIONS,
  PasteSerials,
  equipmentSectionState,
} from './equipmentAssist'
import type { RecordSnapshot, RecordValues, RecordValue } from '../../lib/recordEditor'
import { toBs, formatBs } from '../../lib/bs'
import { useToast } from '../ui/Toast'

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
  const [showPaste, setShowPaste] = useState(false)
  const [defaultWarehouse, setDefaultWarehouse] = useState<string>(
    String(rows[0]?.warehouse_id ?? '')
  )
  const [defaultRack, setDefaultRack] = useState<string>(String(rows[0]?.rack ?? ''))
  const [defaultShelf, setDefaultShelf] = useState<string>(String(rows[0]?.shelf ?? ''))
  const [defaultBin, setDefaultBin] = useState<string>(String(rows[0]?.bin ?? ''))

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

  const bsDateStr = useMemo(() => {
    if (!values.purchase_date) return null
    try {
      const d = new Date(String(values.purchase_date))
      const bs = toBs(d)
      return bs ? formatBs(bs) : null
    } catch {
      return null
    }
  }, [values.purchase_date])

  return (
    <div className="equipment-record-editor">
      <EquipmentSectionLinks
        sections={sections}
        stateOf={(sec) => equipmentSectionState(sec, values, rows)}
        idOf={sectionId}
      />

      {/* ── 1. IDENTITY ──────────────────────────────────────────────────────── */}
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

          <div className="equipment-form-span-full">
            <div className="equipment-media-container">
              <div className="equipment-media-thumb">
                <Icon name="camera" size={24} />
                <span>Thumbnail</span>
                <span className="equipment-media-sub">5 MB max</span>
              </div>
              <div className="equipment-media-gallery">
                <div className="equipment-gallery-slot"><span>Photo 1</span></div>
                <div className="equipment-gallery-slot"><span>Photo 2</span></div>
                <div className="equipment-gallery-slot"><span>Photo 3</span></div>
                <div className="equipment-gallery-slot"><span>Photo 4</span></div>
                <div className="equipment-gallery-slot is-add"><span>+ Add</span></div>
              </div>
            </div>
            <p style={{ margin: '8px 0 0', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
              Image upload not available yet — asset photos and gallery storage will attach here once configured.
            </p>
          </div>
        </div>
      </RecordSection>

      {/* ── 2. STOCK & UNITS ─────────────────────────────────────────────────── */}
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
                            {String(row.asset_tag || (snapshot?.code ? `${snapshot.code}-${String(index + 1).padStart(2, '0')}` : '(Assigned on save)'))}
                          </span>
                        </td>
                        <td>
                          <span className="equipment-badge-subtle">
                            <Icon name="barcode" size={12} />
                            Code
                          </span>
                        </td>
                        <td>
                          <span className="equipment-badge-status">
                            {String(row.status || 'In Stock')}
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

      {/* ── 3. RELATIONSHIPS ─────────────────────────────────────────────────── */}
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

      {/* ── 4. LOCATION ──────────────────────────────────────────────────────── */}
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

      {/* ── 5. PURCHASE (MONEY GATED) ────────────────────────────────────────── */}
      {canViewMoney && (
        <RecordSection
          id={sectionId('Purchase')}
          title="Purchase"
          collapsible
          defaultOpen={true}
        >
          <div className="record-fields equipment-form-grid">
            <label className="record-field" htmlFor="record-purchase_date">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Purchase date</span>
                {bsDateStr && <span className="equipment-bs-badge">{bsDateStr}</span>}
              </div>
              <input
                id="record-purchase_date"
                type="date"
                disabled={busy}
                value={String(values.purchase_date ?? '')}
                onChange={(e) => set('purchase_date', e.target.value)}
              />
            </label>

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
        </RecordSection>
      )}

      {/* ── 6. PRICING & RENTAL (MONEY GATED) ────────────────────────────────── */}
      {canViewMoney && (
        <RecordSection
          id={sectionId('Pricing & Rental')}
          title="Pricing & Rental"
          collapsible
          defaultOpen={true}
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
        </RecordSection>
      )}

      {/* ── 7. MAINTENANCE & DOCUMENTS ───────────────────────────────────────── */}
      <RecordSection
        id={sectionId('Maintenance & Documents')}
        title="Maintenance & Documents"
        collapsible
        defaultOpen={false}
        collapsedHint="Prep, cleaning & notes"
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
      </RecordSection>
    </div>
  )
}
