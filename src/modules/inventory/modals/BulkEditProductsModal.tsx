import { useState, useEffect, useMemo } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Button'
import { useAuth } from '../../../lib/auth'
import { useNetwork } from '../../../lib/network'
import { useToast } from '../../../components/ui/Toast'
import { newClientUuid, supabase } from '../../../lib/supabase'
import { bulkUpdateProducts, type BulkUpdateProductResult } from '../../../actions/inventory/bulkUpdateProducts'
import type { InventoryListRow } from '../../../lib/queries/inventory'

export interface BulkEditProductsModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  selectedProducts: InventoryListRow[]
  canViewMoney: boolean
}

interface ProductDetails {
  id: string
  asset_code: string
  name: string
  category_id: string
  brand: string
  daily_rate: number | null
  weekly_rate: number | null
  monthly_rate: number | null
  deposit_percent: number | null
  deposit_fixed: number | null
  prep_time_minutes: number | null
  cleaning_time_minutes: number | null
  inspection_required: boolean | null
  packing_required: boolean | null
  rental_enabled: boolean | null
  is_active: boolean | null
  reorder_level: number | null
}

interface CategoryOption {
  id: string
  name: string
  code: string
}

type BulkFieldKey =
  | 'rates_percentage'
  | 'daily_rate'
  | 'weekly_rate'
  | 'monthly_rate'
  | 'deposit_percent'
  | 'deposit_fixed'
  | 'category_id'
  | 'brand'
  | 'prep_time_minutes'
  | 'cleaning_time_minutes'
  | 'inspection_required'
  | 'packing_required'
  | 'rental_enabled'
  | 'is_active'
  | 'reorder_level'

export function BulkEditProductsModal({
  isOpen,
  onClose,
  onSuccess,
  selectedProducts,
  canViewMoney,
}: BulkEditProductsModalProps) {
  const { user } = useAuth()
  const isOnline = useNetwork()
  const { showSuccessToast } = useToast()

  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [productDetailsMap, setProductDetailsMap] = useState<Record<string, ProductDetails>>({})

  // Field and value state
  const [selectedField, setSelectedField] = useState<BulkFieldKey>(
    user?.role === 'Owner' && canViewMoney ? 'rates_percentage' : 'prep_time_minutes'
  )
  const [percentageVal, setPercentageVal] = useState<number>(5)
  const [moneyVal, setMoneyVal] = useState<string>('')
  const [percentVal, setPercentVal] = useState<string>('10')
  const [categoryIdVal, setCategoryIdVal] = useState<string>('')
  const [brandVal, setBrandVal] = useState<string>('')
  const [minutesVal, setMinutesVal] = useState<string>('15')
  const [booleanVal, setBooleanVal] = useState<boolean>(true)

  // Submission & Results
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [results, setResults] = useState<{
    batchId: string
    updatedCount: number
    totalRequested: number
    items: BulkUpdateProductResult[]
  } | null>(null)

  const isOwner = user?.role === 'Owner'

  // Fetch full details of selected products from products_v on open
  useEffect(() => {
    if (!isOpen || selectedProducts.length === 0) return

    let cancelled = false
    setLoadingDetails(true)
    setSubmitError(null)
    setResults(null)

    async function loadData() {
      try {
        const productIds = selectedProducts.map((p) => p.id)
        const { data: prods, error: pErr } = await supabase
          .from('products_v')
          .select(
            'id, asset_code, name, category_id, brand, daily_rate, weekly_rate, monthly_rate, deposit_percent, deposit_fixed, prep_time_minutes, cleaning_time_minutes, inspection_required, packing_required, rental_enabled, is_active, reorder_level'
          )
          .in('id', productIds)

        if (pErr) throw pErr

        const { data: cats, error: cErr } = await supabase
          .from('inventory_categories')
          .select('id, name, code')
          .eq('is_active', true)
          .order('name')

        if (cErr) throw cErr

        if (!cancelled) {
          const map: Record<string, ProductDetails> = {}
          for (const p of prods ?? []) {
            map[p.id] = p as ProductDetails
          }
          setProductDetailsMap(map)
          setCategories(cats ?? [])
          if (cats && cats.length > 0 && cats[0]) {
            setCategoryIdVal((prev) => prev || cats[0]!.id)
          }
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setSubmitError(err instanceof Error ? err.message : 'Failed to load product details.')
        }
      } finally {
        if (!cancelled) setLoadingDetails(false)
      }
    }

    loadData()
    return () => {
      cancelled = true
    }
  }, [isOpen, selectedProducts])

  // Compute preview for each product
  const previews = useMemo(() => {
    return selectedProducts.map((p) => {
      const details = productDetailsMap[p.id]
      let oldDisplay = '—'
      let newDisplay = '—'

      switch (selectedField) {
        case 'rates_percentage': {
          const oldD = details?.daily_rate != null ? Number(details.daily_rate) : null
          const oldW = details?.weekly_rate != null ? Number(details.weekly_rate) : null
          const oldM = details?.monthly_rate != null ? Number(details.monthly_rate) : null

          const newD = oldD != null ? Math.round(oldD * (1 + percentageVal / 100)) : null
          const newW = oldW != null ? Math.round(oldW * (1 + percentageVal / 100)) : null
          const newM = oldM != null ? Math.round(oldM * (1 + percentageVal / 100)) : null

          oldDisplay = oldD != null ? `D: Rs. ${oldD.toLocaleString('en-IN')}` : 'D: —'
          newDisplay = newD != null ? `D: Rs. ${newD.toLocaleString('en-IN')}` : 'D: —'

          if (oldW != null) {
            oldDisplay += ` | W: Rs. ${oldW.toLocaleString('en-IN')}`
            newDisplay += ` | W: Rs. ${newW?.toLocaleString('en-IN')}`
          }
          if (oldM != null) {
            oldDisplay += ` | M: Rs. ${oldM.toLocaleString('en-IN')}`
            newDisplay += ` | M: Rs. ${newM?.toLocaleString('en-IN')}`
          }
          break
        }
        case 'daily_rate':
        case 'weekly_rate':
        case 'monthly_rate':
        case 'deposit_fixed': {
          const rawOld = details ? details[selectedField] : null
          oldDisplay = rawOld != null ? `Rs. ${Number(rawOld).toLocaleString('en-IN')}` : '—'
          newDisplay = moneyVal ? `Rs. ${Number(moneyVal).toLocaleString('en-IN')}` : '—'
          break
        }
        case 'deposit_percent': {
          const rawOld = details ? details.deposit_percent : null
          oldDisplay = rawOld != null ? `${rawOld}%` : '—'
          newDisplay = percentVal ? `${percentVal}%` : '—'
          break
        }
        case 'category_id': {
          const oldCat = categories.find((c) => c.id === details?.category_id)
          const newCat = categories.find((c) => c.id === categoryIdVal)
          oldDisplay = oldCat?.name ?? details?.category_id ?? '—'
          newDisplay = newCat?.name ?? categoryIdVal ?? '—'
          break
        }
        case 'brand': {
          oldDisplay = details?.brand || p.brand || '—'
          newDisplay = brandVal || '—'
          break
        }
        case 'prep_time_minutes':
        case 'cleaning_time_minutes':
        case 'reorder_level': {
          const rawOld = details ? details[selectedField] : null
          oldDisplay = rawOld != null ? `${rawOld}` : '—'
          newDisplay = minutesVal ? `${minutesVal}` : '—'
          break
        }
        case 'inspection_required':
        case 'packing_required':
        case 'rental_enabled':
        case 'is_active': {
          const rawOld = details ? details[selectedField] : null
          oldDisplay = rawOld != null ? (rawOld ? 'Yes' : 'No') : '—'
          newDisplay = booleanVal ? 'Yes' : 'No'
          break
        }
      }

      return {
        id: p.id,
        assetCode: p.assetCode,
        name: p.name,
        oldDisplay,
        newDisplay,
      }
    })
  }, [
    selectedProducts,
    productDetailsMap,
    selectedField,
    percentageVal,
    moneyVal,
    percentVal,
    categoryIdVal,
    brandVal,
    minutesVal,
    booleanVal,
    categories,
  ])

  // Build RPC payload based on selectedField
  const buildPayloadValue = (): Record<string, unknown> => {
    switch (selectedField) {
      case 'rates_percentage':
        return { percentage: Number(percentageVal) }
      case 'daily_rate':
      case 'weekly_rate':
      case 'monthly_rate':
      case 'deposit_fixed':
        return { [selectedField]: Number(moneyVal) }
      case 'deposit_percent':
        return { deposit_percent: Number(percentVal) }
      case 'category_id':
        return { category_id: categoryIdVal }
      case 'brand':
        return { brand: brandVal.trim() }
      case 'prep_time_minutes':
      case 'cleaning_time_minutes':
      case 'reorder_level':
        return { [selectedField]: parseInt(minutesVal, 10) || 0 }
      case 'inspection_required':
      case 'packing_required':
      case 'rental_enabled':
      case 'is_active':
        return { [selectedField]: booleanVal }
    }
  }

  const handleApply = async () => {
    if (submitting) return
    setSubmitError(null)

    if (!user) {
      setSubmitError('Authentication is required.')
      return
    }

    if (!isOnline) {
      setSubmitError('Network connection is required for bulk updates.')
      return
    }

    if (selectedField === 'rates_percentage' && !isOwner) {
      setSubmitError('Only the Owner can adjust product rental rates by percentage (B32).')
      return
    }

    if (selectedField === 'brand' && !brandVal.trim()) {
      setSubmitError('Brand cannot be empty.')
      return
    }

    setSubmitting(true)
    const clientUuid = newClientUuid()

    try {
      const payloadVal = buildPayloadValue()
      const productIds = selectedProducts.map((p) => p.id)

      const outcome = await bulkUpdateProducts(
        {
          productIds,
          field: selectedField,
          value: payloadVal,
          clientUuid,
        },
        {
          userId: user.id,
          role: user.role,
          isOnline: true,
        }
      )

      if (outcome) {
        setResults({
          batchId: outcome.batch_id,
          updatedCount: outcome.updated_count,
          totalRequested: outcome.total_requested,
          items: outcome.results,
        })
        showSuccessToast(`Updated ${outcome.updated_count} products successfully.`)
        onSuccess()
      }
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Bulk update failed.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!submitting) onClose()
      }}
      title="Bulk Edit Products"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '0.25rem 0' }}>
        {/* Results Screen if finished */}
        {results ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div
              style={{
                padding: '0.875rem 1rem',
                borderRadius: '8px',
                background: 'var(--success-bg, #ecfdf5)',
                border: '1px solid var(--success-border, #10b981)',
                color: 'var(--success-text, #065f46)',
                fontSize: '0.875rem',
              }}
            >
              <strong>Bulk Update Finished:</strong> Successfully updated {results.updatedCount} of{' '}
              {results.totalRequested} products.
              <div style={{ fontSize: '0.75rem', marginTop: '0.25rem', opacity: 0.85 }}>
                Batch ID: {results.batchId}
              </div>
            </div>

            <div style={{ maxHeight: '280px', overflowY: 'auto', border: '1px solid var(--border-color, #e5e7eb)', borderRadius: '6px' }}>
              <table style={{ width: '100%', fontSize: '0.8125rem', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--table-header-bg, #f9fafb)', borderBottom: '1px solid var(--border-color, #e5e7eb)' }}>
                    <th style={{ textAlign: 'left', padding: '8px 12px' }}>Product</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px' }}>Status</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px' }}>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {results.items.map((item) => {
                    const prod = selectedProducts.find((p) => p.id === item.id)
                    return (
                      <tr key={item.id} style={{ borderBottom: '1px solid var(--border-color, #f3f4f6)' }}>
                        <td style={{ padding: '8px 12px' }}>
                          <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{prod?.assetCode ?? item.id.slice(0, 8)}</span>{' '}
                          {prod?.name}
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          {item.success ? (
                            <span style={{ color: '#059669', fontWeight: 600 }}>✓ Saved</span>
                          ) : (
                            <span style={{ color: '#dc2626', fontWeight: 600 }}>✗ Refused</span>
                          )}
                        </td>
                        <td style={{ padding: '8px 12px', color: item.success ? 'var(--text-muted, #6b7280)' : '#dc2626' }}>
                          {item.error ? item.error : 'Applied'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <Button variant="primary" onClick={onClose} style={{ minHeight: 44, minWidth: 100 }}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* Context Notice */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.75rem 1rem',
                borderRadius: '6px',
                background: 'var(--surface-sunken, #f8fafc)',
                border: '1px solid var(--border-color, #e2e8f0)',
                fontSize: '0.875rem',
              }}
            >
              <span>
                <strong>{selectedProducts.length}</strong> {selectedProducts.length === 1 ? 'product' : 'products'} selected
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)' }}>
                Role: {user?.role}
              </span>
            </div>

            {/* Error Banner */}
            {submitError && (
              <div
                role="alert"
                style={{
                  padding: '0.75rem 1rem',
                  borderRadius: '6px',
                  background: '#fef2f2',
                  border: '1px solid #f87171',
                  color: '#991b1b',
                  fontSize: '0.875rem',
                }}
              >
                {submitError}
              </div>
            )}

            {/* Field Picker */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              <label htmlFor="bulk-field-select" style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                Field to change
              </label>
              <select
                id="bulk-field-select"
                value={selectedField}
                onChange={(e) => {
                  setSelectedField(e.target.value as BulkFieldKey)
                  setSubmitError(null)
                }}
                disabled={submitting}
                style={{
                  minHeight: 44,
                  padding: '0.5rem 0.75rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color, #cbd5e1)',
                  background: 'var(--bg-surface, #ffffff)',
                  fontSize: '0.875rem',
                }}
              >
                {/* Money Fields (Money roles only - Law 6) */}
                {canViewMoney && (
                  <optgroup label="Rates & Pricing">
                    {isOwner ? (
                      <option value="rates_percentage">Rental Rates (% adjustment) — Owner only</option>
                    ) : null}
                    <option value="daily_rate">Daily Rate (Rs.)</option>
                    <option value="weekly_rate">Weekly Rate (Rs.)</option>
                    <option value="monthly_rate">Monthly Rate (Rs.)</option>
                    <option value="deposit_percent">Deposit Percentage (%)</option>
                    <option value="deposit_fixed">Deposit Fixed Amount (Rs.)</option>
                  </optgroup>
                )}

                <optgroup label="Classification & Taxonomy">
                  <option value="category_id">Category</option>
                  <option value="brand">Brand</option>
                </optgroup>

                <optgroup label="Maintenance & Logistics">
                  <option value="prep_time_minutes">Prep Time (minutes)</option>
                  <option value="cleaning_time_minutes">Cleaning Time (minutes)</option>
                  <option value="reorder_level">Reorder Level</option>
                </optgroup>

                <optgroup label="Operations & Status">
                  <option value="inspection_required">Inspection Required</option>
                  <option value="packing_required">Packing Required</option>
                  <option value="rental_enabled">Rental Enabled</option>
                  <option value="is_active">Active Status</option>
                </optgroup>
              </select>
            </div>

            {/* Value Control */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              <label htmlFor="bulk-field-value" style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                New Value
              </label>

              {selectedField === 'rates_percentage' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      id="bulk-field-value"
                      type="number"
                      step="1"
                      value={percentageVal}
                      onChange={(e) => setPercentageVal(parseFloat(e.target.value) || 0)}
                      disabled={submitting}
                      style={{
                        minHeight: 44,
                        width: '120px',
                        padding: '0.5rem 0.75rem',
                        borderRadius: '6px',
                        border: '1px solid var(--border-color, #cbd5e1)',
                        fontSize: '0.875rem',
                      }}
                    />
                    <span style={{ fontWeight: 600 }}>%</span>
                    <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted, #64748b)' }}>
                      (e.g. +5 to raise by 5%, -10 to reduce by 10%)
                    </span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)' }}>
                    Rates are rounded to the nearest whole rupee. Existing bookings maintain their locked prices.
                  </div>
                </div>
              )}

              {['daily_rate', 'weekly_rate', 'monthly_rate', 'deposit_fixed'].includes(selectedField) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontWeight: 600 }}>Rs.</span>
                  <input
                    id="bulk-field-value"
                    type="number"
                    min="0"
                    step="1"
                    placeholder="Rate in Rupees"
                    value={moneyVal}
                    onChange={(e) => setMoneyVal(e.target.value)}
                    disabled={submitting}
                    style={{
                      minHeight: 44,
                      flex: 1,
                      padding: '0.5rem 0.75rem',
                      borderRadius: '6px',
                      border: '1px solid var(--border-color, #cbd5e1)',
                      fontSize: '0.875rem',
                    }}
                  />
                </div>
              )}

              {selectedField === 'deposit_percent' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    id="bulk-field-value"
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={percentVal}
                    onChange={(e) => setPercentVal(e.target.value)}
                    disabled={submitting}
                    style={{
                      minHeight: 44,
                      width: '120px',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '6px',
                      border: '1px solid var(--border-color, #cbd5e1)',
                      fontSize: '0.875rem',
                    }}
                  />
                  <span style={{ fontWeight: 600 }}>%</span>
                </div>
              )}

              {selectedField === 'category_id' && (
                <select
                  id="bulk-field-value"
                  value={categoryIdVal}
                  onChange={(e) => setCategoryIdVal(e.target.value)}
                  disabled={submitting}
                  style={{
                    minHeight: 44,
                    padding: '0.5rem 0.75rem',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color, #cbd5e1)',
                    fontSize: '0.875rem',
                  }}
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}

              {selectedField === 'brand' && (
                <input
                  id="bulk-field-value"
                  type="text"
                  placeholder="Enter brand name"
                  value={brandVal}
                  onChange={(e) => setBrandVal(e.target.value)}
                  disabled={submitting}
                  style={{
                    minHeight: 44,
                    padding: '0.5rem 0.75rem',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color, #cbd5e1)',
                    fontSize: '0.875rem',
                  }}
                />
              )}

              {['prep_time_minutes', 'cleaning_time_minutes', 'reorder_level'].includes(selectedField) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    id="bulk-field-value"
                    type="number"
                    min="0"
                    step="1"
                    value={minutesVal}
                    onChange={(e) => setMinutesVal(e.target.value)}
                    disabled={submitting}
                    style={{
                      minHeight: 44,
                      width: '140px',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '6px',
                      border: '1px solid var(--border-color, #cbd5e1)',
                      fontSize: '0.875rem',
                    }}
                  />
                  <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted, #64748b)' }}>
                    {selectedField === 'reorder_level' ? 'units' : 'minutes'}
                  </span>
                </div>
              )}

              {['inspection_required', 'packing_required', 'rental_enabled', 'is_active'].includes(selectedField) && (
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', height: '44px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="boolean-val"
                      checked={booleanVal === true}
                      onChange={() => setBooleanVal(true)}
                      disabled={submitting}
                    />
                    <span>Yes / Active</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="boolean-val"
                      checked={booleanVal === false}
                      onChange={() => setBooleanVal(false)}
                      disabled={submitting}
                    />
                    <span>No / Inactive</span>
                  </label>
                </div>
              )}
            </div>

            {/* Preview Table */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', marginTop: '0.5rem' }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                Preview of Changes (Old → New)
              </span>

              {loadingDetails ? (
                <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted, #64748b)', fontSize: '0.875rem' }}>
                  Loading preview...
                </div>
              ) : (
                <div
                  style={{
                    maxHeight: '220px',
                    overflowY: 'auto',
                    border: '1px solid var(--border-color, #e2e8f0)',
                    borderRadius: '6px',
                  }}
                >
                  <table style={{ width: '100%', fontSize: '0.8125rem', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'var(--table-header-bg, #f8fafc)', borderBottom: '1px solid var(--border-color, #e2e8f0)' }}>
                        <th style={{ textAlign: 'left', padding: '6px 10px' }}>Product</th>
                        <th style={{ textAlign: 'left', padding: '6px 10px' }}>Current</th>
                        <th style={{ textAlign: 'left', padding: '6px 10px' }}>New</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previews.map((row) => (
                        <tr key={row.id} style={{ borderBottom: '1px solid var(--border-color, #f1f5f9)' }}>
                          <td style={{ padding: '6px 10px' }}>
                            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{row.assetCode}</span>{' '}
                            {row.name}
                          </td>
                          <td style={{ padding: '6px 10px', color: 'var(--text-muted, #64748b)' }}>{row.oldDisplay}</td>
                          <td style={{ padding: '6px 10px', fontWeight: 600, color: 'var(--primary, #0284c7)' }}>
                            {row.newDisplay}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Action Bar */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '0.75rem',
                marginTop: '1rem',
                borderTop: '1px solid var(--border-color, #e2e8f0)',
                paddingTop: '1rem',
              }}
            >
              <Button variant="ghost" onClick={onClose} disabled={submitting} style={{ minHeight: 44 }}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleApply}
                disabled={submitting || loadingDetails || !isOnline}
                style={{ minHeight: 44 }}
              >
                {submitting ? 'Applying Changes...' : `Save Changes to ${selectedProducts.length} Products`}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
