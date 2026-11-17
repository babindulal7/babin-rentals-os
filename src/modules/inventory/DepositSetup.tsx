import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import type { SystemRole } from '../../types/database'
import { useAuth } from '../../lib/auth'
import { canViewMoneyField, gateContext } from '../../lib/fieldGating'
import { RestrictedState } from '../../components/ui/StateViews'
import { Badge } from '../../components/ui/Badge'
import { PageHeader, Button } from '../../components/ui/Page'
import { Modal } from '../../components/ui/Modal'
import Icon from '../../components/ui/Icon'
import { supabase, newClientUuid } from '../../lib/supabase'
import { formatMoney, rupees } from '../../lib/money'
import {
  type DepositRuleType,
  type ProductDepositRow,
  type DepositCsvDryRunResult,
  type DepositCsvDryRunEntry,
  depositRuleType,
  hasDepositRule,
  calculateEffectiveDeposit,
  exportDepositSetupCsv,
  parseDepositSetupCsv,
} from '../../lib/productDeposit'
import './inventory.css'

export interface DepositSetupProps {
  embedded?: boolean
  onDone?: () => void
  role?: SystemRole
}

interface RowDraft {
  ruleType: DepositRuleType
  fixedRupees: string
  percentStr: string
  replacementRupees: string
  isDirty: boolean
  isSaving: boolean
  saveError?: string | null
}

interface RawProductDeposit {
  id: string
  name: string
  brand: string
  model: string | null
  category_id: string
  category: { name: string } | null
  daily_rate: number | null
  replacement_value: number | null
  deposit_fixed: number | null
  deposit_percent: number | null
  is_active: boolean
}

export function DepositSetup({ embedded = false, role: propRole }: DepositSetupProps = {}) {
  const { user } = useAuth()
  const role = propRole ?? (user?.role ?? 'Client')
  const gctx = gateContext(role)
  const canEdit = canViewMoneyField(gctx, 'booking')

  const [products, setProducts] = useState<ProductDepositRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterMode, setFilterMode] = useState<'all' | 'missing' | 'configured'>('all')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({})
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set())

  // Bulk edit popover / action modal
  const [bulkModalOpen, setBulkModalOpen] = useState(false)
  const [bulkRuleType, setBulkRuleType] = useState<DepositRuleType>('percent')
  const [bulkFixedRupees, setBulkFixedRupees] = useState('5000')
  const [bulkPercent, setBulkPercent] = useState('10')
  const [bulkSaving, setBulkSaving] = useState(false)
  const [bulkMessage, setBulkMessage] = useState<string | null>(null)

  // CSV Dry Run Modal state
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [dryRunResult, setDryRunResult] = useState<DepositCsvDryRunResult | null>(null)
  const [dryRunModalOpen, setDryRunModalOpen] = useState(false)
  const [applyingCsv, setApplyingCsv] = useState(false)

  // Success toast notice (Law 12)
  const [notice, setNotice] = useState<string | null>(null)

  const loadProducts = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const { data, error } = await supabase
        .from('products_v')
        .select('id, name, brand, model, category_id, category:inventory_categories(name), daily_rate, replacement_value, deposit_fixed, deposit_percent, is_active')
        .eq('is_active', true)
        .order('name', { ascending: true })

      if (error) throw new Error(error.message)

      const rows: ProductDepositRow[] = ((data as unknown as RawProductDeposit[]) ?? []).map((r) => {
        const depositFixedPaisa = r.deposit_fixed !== null && r.deposit_fixed !== undefined ? rupees(Number(r.deposit_fixed)) : null
        const depositPercent = r.deposit_percent !== null && r.deposit_percent !== undefined ? Number(r.deposit_percent) : null
        const replacementValuePaisa = r.replacement_value !== null && r.replacement_value !== undefined ? rupees(Number(r.replacement_value)) : null
        const dailyRatePaisa = r.daily_rate !== null && r.daily_rate !== undefined ? rupees(Number(r.daily_rate)) : null
        const catName = r.category?.name ?? 'Other'

        const effectiveDepositPaisa = calculateEffectiveDeposit({
          depositFixedPaisa,
          depositPercent,
          replacementValuePaisa,
        })
        const hasDeposit = hasDepositRule({
          depositFixedPaisa,
          depositPercent,
          replacementValuePaisa,
        })

        return {
          id: r.id,
          name: r.name,
          brand: r.brand,
          model: r.model ?? null,
          category: catName,
          dailyRatePaisa,
          replacementValuePaisa,
          depositFixedPaisa,
          depositPercent,
          effectiveDepositPaisa,
          hasDeposit,
        }
      })

      setProducts(rows)

      // Initialize drafts
      const initialDrafts: Record<string, RowDraft> = {}
      for (const p of rows) {
        initialDrafts[p.id] = {
          ruleType: depositRuleType(p),
          fixedRupees: p.depositFixedPaisa !== null ? String(Math.round(p.depositFixedPaisa / 100)) : '',
          percentStr: p.depositPercent !== null ? String(p.depositPercent) : '',
          replacementRupees: p.replacementValuePaisa !== null ? String(Math.round(p.replacementValuePaisa / 100)) : '',
          isDirty: false,
          isSaving: false,
        }
      }
      setDrafts(initialDrafts)
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : 'Could not load active inventory products.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (canEdit) {
      loadProducts()
    }
  }, [canEdit, loadProducts])

  // Categories list for filter
  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const p of products) {
      if (p.category) set.add(p.category)
    }
    return Array.from(set).sort()
  }, [products])

  // Progress metrics (T3-02: "Staff fill all ~180 products before trial; screen shows progress '142 / 178 set'")
  const totalCount = products.length
  const configuredCount = useMemo(() => products.filter((p) => p.hasDeposit).length, [products])
  const missingCount = totalCount - configuredCount
  const percentConfigured = totalCount > 0 ? Math.round((configuredCount / totalCount) * 100) : 0

  // Filtered rows
  const filteredProducts = useMemo(() => {
    let result = products

    if (filterMode === 'missing') {
      result = result.filter((p) => !p.hasDeposit)
    } else if (filterMode === 'configured') {
      result = result.filter((p) => p.hasDeposit)
    }

    if (selectedCategory !== 'all') {
      result = result.filter((p) => p.category === selectedCategory)
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim()
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.brand.toLowerCase().includes(q) ||
          (p.model && p.model.toLowerCase().includes(q)) ||
          p.category.toLowerCase().includes(q),
      )
    }

    return result
  }, [products, filterMode, selectedCategory, searchTerm])

  if (!canEdit) {
    return <RestrictedState reason="Deposit setup is a money role action." />
  }

  // Row Draft Handlers
  const updateRowDraft = (id: string, patch: Partial<RowDraft>) => {
    setDrafts((prev) => {
      const current = prev[id]
      if (!current) return prev
      return {
        ...prev,
        [id]: {
          ...current,
          ...patch,
          isDirty: true,
          saveError: null,
        },
      }
    })
  }

  // Save single product
  const saveProductRow = async (id: string) => {
    const draft = drafts[id]
    const prod = products.find((p) => p.id === id)
    if (!draft || !prod) return

    setDrafts((prev) => ({
      ...prev,
      [id]: { ...prev[id]!, isSaving: true, saveError: null },
    }))

    try {
      let deposit_fixed: number | null = null
      let deposit_percent: number | null = null
      let replacement_value: number | null = null

      if (draft.ruleType === 'fixed') {
        const val = Number(draft.fixedRupees)
        if (!Number.isFinite(val) || val < 0) throw new Error('Fixed deposit must be a valid non-negative number.')
        deposit_fixed = val > 0 ? val : null
        deposit_percent = null
      } else if (draft.ruleType === 'percent') {
        const val = Number(draft.percentStr)
        if (!Number.isFinite(val) || val < 0 || val > 100) throw new Error('Deposit percentage must be between 0 and 100.')
        deposit_percent = val > 0 ? val : null
        deposit_fixed = null
      } else {
        deposit_fixed = null
        deposit_percent = null
      }

      if (draft.replacementRupees.trim()) {
        const rVal = Number(draft.replacementRupees)
        if (!Number.isFinite(rVal) || rVal < 0) throw new Error('Replacement value must be non-negative.')
        replacement_value = rVal > 0 ? rVal : null
      }

      // Execute via bulk_update_products RPC with client UUID for idempotency
      const clientUuid = newClientUuid()
      const { error: rpcError } = await supabase.rpc('bulk_update_products', {
        p_product_ids: [id],
        p_field: 'deposit_fixed',
        p_value: { deposit_fixed } as Record<string, unknown>,
        p_client_uuid: clientUuid,
      })

      if (rpcError) throw new Error(rpcError.message)

      // Update percent
      const pctUuid = newClientUuid()
      await supabase.rpc('bulk_update_products', {
        p_product_ids: [id],
        p_field: 'deposit_percent',
        p_value: { deposit_percent } as Record<string, unknown>,
        p_client_uuid: pctUuid,
      })

      // Update replacement value if provided
      if (replacement_value !== null) {
        const replUuid = newClientUuid()
        await supabase.rpc('bulk_update_products', {
          p_product_ids: [id],
          p_field: 'replacement_value',
          p_value: { replacement_value } as Record<string, unknown>,
          p_client_uuid: replUuid,
        })
      }

      // Update local product record
      const fixedPaisa = deposit_fixed !== null ? rupees(deposit_fixed) : null
      const replPaisa = replacement_value !== null ? rupees(replacement_value) : prod.replacementValuePaisa
      const effectiveDepositPaisa = calculateEffectiveDeposit({
        depositFixedPaisa: fixedPaisa,
        depositPercent: deposit_percent,
        replacementValuePaisa: replPaisa,
      })
      const hasDeposit = hasDepositRule({
        depositFixedPaisa: fixedPaisa,
        depositPercent: deposit_percent,
        replacementValuePaisa: replPaisa,
      })

      setProducts((prev) =>
        prev.map((p) =>
          p.id === id
            ? {
                ...p,
                depositFixedPaisa: fixedPaisa,
                depositPercent: deposit_percent,
                replacementValuePaisa: replPaisa,
                effectiveDepositPaisa,
                hasDeposit,
              }
            : p,
        ),
      )

      setDrafts((prev) => ({
        ...prev,
        [id]: { ...prev[id]!, isDirty: false, isSaving: false },
      }))

      setNotice(`Saved deposit rule for ${prod.name}.`)
      setTimeout(() => setNotice(null), 3000)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Save failed.'
      setDrafts((prev) => ({
        ...prev,
        [id]: { ...prev[id]!, isSaving: false, saveError: msg },
      }))
    }
  }

  // Bulk Apply
  const applyBulkRule = async () => {
    if (selectedProductIds.size === 0) return
    setBulkSaving(true)
    setBulkMessage(null)

    try {
      const ids = Array.from(selectedProductIds)
      let deposit_fixed: number | null = null
      let deposit_percent: number | null = null

      if (bulkRuleType === 'fixed') {
        const val = Number(bulkFixedRupees)
        if (!Number.isFinite(val) || val < 0) throw new Error('Enter a valid fixed deposit amount.')
        deposit_fixed = val
      } else if (bulkRuleType === 'percent') {
        const val = Number(bulkPercent)
        if (!Number.isFinite(val) || val < 0 || val > 100) throw new Error('Enter a percentage between 0 and 100.')
        deposit_percent = val
      }

      const clientUuid1 = newClientUuid()
      const { error: err1 } = await supabase.rpc('bulk_update_products', {
        p_product_ids: ids,
        p_field: 'deposit_fixed',
        p_value: { deposit_fixed } as Record<string, unknown>,
        p_client_uuid: clientUuid1,
      })
      if (err1) throw new Error(err1.message)

      const clientUuid2 = newClientUuid()
      const { error: err2 } = await supabase.rpc('bulk_update_products', {
        p_product_ids: ids,
        p_field: 'deposit_percent',
        p_value: { deposit_percent } as Record<string, unknown>,
        p_client_uuid: clientUuid2,
      })
      if (err2) throw new Error(err2.message)

      setBulkModalOpen(false)
      setSelectedProductIds(new Set())
      setNotice(`Successfully updated deposit rule for ${ids.length} products.`)
      setTimeout(() => setNotice(null), 4000)
      loadProducts()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Bulk update failed.'
      setBulkMessage(msg)
    } finally {
      setBulkSaving(false)
    }
  }

  // CSV Export
  const handleExportCsv = () => {
    const csvContent = exportDepositSetupCsv(products)
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `babin-rentals-deposit-setup-${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  // CSV File Selected -> Dry Run
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const text = await file.text()
    const result = parseDepositSetupCsv(text, products)
    setDryRunResult(result)
    setDryRunModalOpen(true)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // Apply CSV Dry Run Changes
  const handleApplyCsv = async () => {
    if (!dryRunResult || dryRunResult.changeCount === 0) return
    setApplyingCsv(true)

    try {
      const validChanges = dryRunResult.entries.filter((e) => e.hasChange && !e.error)

      for (const entry of validChanges) {
        const fixedNum = entry.newFixed !== null ? Math.round(entry.newFixed / 100) : null
        const pctNum = entry.newPercent !== null ? entry.newPercent : null
        const replNum = entry.newReplacement !== null ? Math.round(entry.newReplacement / 100) : null

        const u1 = newClientUuid()
        await supabase.rpc('bulk_update_products', {
          p_product_ids: [entry.productId],
          p_field: 'deposit_fixed',
          p_value: { deposit_fixed: fixedNum } as Record<string, unknown>,
          p_client_uuid: u1,
        })

        const u2 = newClientUuid()
        await supabase.rpc('bulk_update_products', {
          p_product_ids: [entry.productId],
          p_field: 'deposit_percent',
          p_value: { deposit_percent: pctNum } as Record<string, unknown>,
          p_client_uuid: u2,
        })

        if (replNum !== null) {
          const u3 = newClientUuid()
          await supabase.rpc('bulk_update_products', {
            p_product_ids: [entry.productId],
            p_field: 'replacement_value',
            p_value: { replacement_value: replNum } as Record<string, unknown>,
            p_client_uuid: u3,
          })
        }
      }

      setDryRunModalOpen(false)
      setDryRunResult(null)
      setNotice(`Successfully imported and applied deposit terms for ${validChanges.length} products.`)
      setTimeout(() => setNotice(null), 4000)
      loadProducts()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      alert(`Import application failed: ${msg}`)
    } finally {
      setApplyingCsv(false)
    }
  }

  // Multi-select toggle
  const toggleSelectAll = () => {
    if (selectedProductIds.size === filteredProducts.length) {
      setSelectedProductIds(new Set())
    } else {
      setSelectedProductIds(new Set(filteredProducts.map((p) => p.id)))
    }
  }

  const toggleSelectRow = (id: string) => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div style={{ padding: embedded ? '0' : 'var(--sp-lg, 16px)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-md, 16px)' }}>
      {!embedded && (
        <PageHeader
          title="Deposit Setup"
          description="Configure per-product deposit rules. Fixed deposit wins; otherwise percent of replacement value."
          status={
            <Badge
              tone={configuredCount === totalCount && totalCount > 0 ? 'in' : 'primary'}
              label={configuredCount === totalCount && totalCount > 0 ? 'All products configured' : 'Staff fill all products before trial'}
              variant="pill"
            />
          }
        />
      )}

      {/* Progress banner (T3-02, BABIN_ACTIONS) */}
      <div
        style={{
          padding: '16px 20px',
          borderRadius: 'var(--r-card, 8px)',
          background: 'var(--card, #fff)',
          border: '1px solid var(--border, #e5e7eb)',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="checklist" size={18} style={{ color: 'var(--primary, #2563eb)' }} />
              <span style={{ fontSize: 'var(--t-ui, 15px)', fontWeight: 700, color: 'var(--text, #111)' }}>
                Product Deposit Readiness
              </span>
              <span
                style={{
                  fontSize: 'var(--t-meta, 12px)',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 'var(--r-badge, 4px)',
                  background: configuredCount === totalCount && totalCount > 0 ? 'var(--st-success-bg, #ecfdf5)' : 'var(--st-primary-bg, #eff6ff)',
                  color: configuredCount === totalCount && totalCount > 0 ? 'var(--st-success-fg, #059669)' : 'var(--st-primary-fg, #2563eb)',
                }}
              >
                {configuredCount} / {totalCount} set ({percentConfigured}%)
              </span>
            </div>
            <p style={{ margin: '4px 0 0 0', fontSize: 'var(--t-meta, 13px)', color: 'var(--text2, #4b5563)' }}>
              {missingCount > 0
                ? `${missingCount} product${missingCount === 1 ? '' : 's'} still have no deposit rule set. Set fixed or percent terms before trial go-live.`
                : 'All products currently have an active deposit rule configured.'}
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Button size="sm" variant="secondary" onClick={handleExportCsv} disabled={loading || products.length === 0}>
              <Icon name="download" size={14} />
              Export CSV
            </Button>
            <Button size="sm" variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={loading}>
              <Icon name="upload" size={14} />
              Import CSV
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
          </div>
        </div>

        {/* Progress Bar */}
        <div
          style={{
            width: '100%',
            height: 8,
            borderRadius: 4,
            background: 'var(--hover-row, #f3f4f6)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${percentConfigured}%`,
              height: '100%',
              background: configuredCount === totalCount && totalCount > 0 ? 'var(--st-success-fg, #10b981)' : 'var(--primary, #2563eb)',
              transition: 'width 0.3s ease',
            }}
          />
        </div>
      </div>

      {/* Success notice */}
      {notice && (
        <div
          role="status"
          style={{
            padding: '10px 14px',
            borderRadius: 'var(--r-btn, 6px)',
            background: 'var(--st-success-bg, #ecfdf5)',
            border: '1px solid var(--st-success-fg, #10b981)',
            color: 'var(--st-success-fg, #065f46)',
            fontSize: 'var(--t-meta, 13px)',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Icon name="check" size={16} />
          {notice}
        </div>
      )}

      {/* Load error banner */}
      {loadError && (
        <div
          role="alert"
          style={{
            padding: '10px 14px',
            borderRadius: 'var(--r-btn, 6px)',
            background: 'var(--st-danger-bg, #fef2f2)',
            border: '1px solid var(--st-danger-fg, #ef4444)',
            color: 'var(--st-danger-fg, #991b1b)',
            fontSize: 'var(--t-meta, 13px)',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Icon name="alert_triangle" size={16} />
          {loadError}
        </div>
      )}

      {/* Toolbar: Search, Filters, Bulk Selection */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          background: 'var(--card, #fff)',
          padding: '12px 16px',
          borderRadius: 'var(--r-card, 8px)',
          border: '1px solid var(--border, #e5e7eb)',
        }}
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', flex: '1 1 300px' }}>
          {/* Search box */}
          <div style={{ position: 'relative', width: 260 }}>
            <input
              type="text"
              placeholder="Search equipment, brand, model…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                height: 36,
                padding: '0 10px 0 32px',
                borderRadius: 'var(--r-input, 6px)',
                border: '1px solid var(--border, #d1d5db)',
                fontSize: 'var(--t-meta, 13px)',
                background: 'var(--card, #fff)',
                color: 'var(--text, #111)',
              }}
            />
            <span style={{ position: 'absolute', left: 9, top: 9, color: 'var(--muted, #9ca3af)', pointerEvents: 'none' }}>
              <Icon name="search" size={15} />
            </span>
          </div>

          {/* Filter Chips */}
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              className="press"
              onClick={() => setFilterMode('all')}
              style={{
                height: 34,
                padding: '0 12px',
                borderRadius: 'var(--r-btn, 6px)',
                border: '1px solid',
                borderColor: filterMode === 'all' ? 'var(--primary, #2563eb)' : 'var(--border, #d1d5db)',
                background: filterMode === 'all' ? 'var(--st-primary-bg, #eff6ff)' : 'transparent',
                color: filterMode === 'all' ? 'var(--primary, #2563eb)' : 'var(--text, #111)',
                fontSize: 'var(--t-meta, 12px)',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              All ({totalCount})
            </button>
            <button
              type="button"
              className="press"
              onClick={() => setFilterMode('missing')}
              style={{
                height: 34,
                padding: '0 12px',
                borderRadius: 'var(--r-btn, 6px)',
                border: '1px solid',
                borderColor: filterMode === 'missing' ? 'var(--st-danger-fg, #ef4444)' : 'var(--border, #d1d5db)',
                background: filterMode === 'missing' ? 'var(--st-danger-bg, #fef2f2)' : 'transparent',
                color: filterMode === 'missing' ? 'var(--st-danger-fg, #ef4444)' : 'var(--text, #111)',
                fontSize: 'var(--t-meta, 12px)',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              No deposit set ({missingCount})
            </button>
            <button
              type="button"
              className="press"
              onClick={() => setFilterMode('configured')}
              style={{
                height: 34,
                padding: '0 12px',
                borderRadius: 'var(--r-btn, 6px)',
                border: '1px solid',
                borderColor: filterMode === 'configured' ? 'var(--st-success-fg, #10b981)' : 'var(--border, #d1d5db)',
                background: filterMode === 'configured' ? 'var(--st-success-bg, #ecfdf5)' : 'transparent',
                color: filterMode === 'configured' ? 'var(--st-success-fg, #10b981)' : 'var(--text, #111)',
                fontSize: 'var(--t-meta, 12px)',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Deposit set ({configuredCount})
            </button>
          </div>

          {/* Category Dropdown */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            style={{
              height: 36,
              padding: '0 8px',
              borderRadius: 'var(--r-input, 6px)',
              border: '1px solid var(--border, #d1d5db)',
              fontSize: 'var(--t-meta, 12px)',
              background: 'var(--card, #fff)',
              color: 'var(--text, #111)',
            }}
          >
            <option value="all">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {/* Bulk Action Trigger */}
        {selectedProductIds.size > 0 && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 'var(--t-meta, 12px)', fontWeight: 600, color: 'var(--text2, #4b5563)' }}>
              {selectedProductIds.size} selected
            </span>
            <Button size="sm" variant="primary" onClick={() => setBulkModalOpen(true)}>
              <Icon name="edit" size={14} />
              Set rule for selected…
            </Button>
          </div>
        )}
      </div>

      {/* Editor Table */}
      <div
        style={{
          background: 'var(--card, #fff)',
          borderRadius: 'var(--r-card, 8px)',
          border: '1px solid var(--border, #e5e7eb)',
          overflowX: 'auto',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--t-meta, 13px)', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: 'var(--surface-sunken, #f9fafb)', borderBottom: '1px solid var(--border, #e5e7eb)' }}>
              <th style={{ width: 44, padding: '10px 12px', textAlign: 'center' }}>
                <input
                  type="checkbox"
                  checked={filteredProducts.length > 0 && selectedProductIds.size === filteredProducts.length}
                  onChange={toggleSelectAll}
                  aria-label="Select all products"
                />
              </th>
              <th style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--text, #111)' }}>Product</th>
              <th style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--text, #111)', width: 140 }}>Rule Type</th>
              <th style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--text, #111)', width: 130 }}>Fixed Deposit</th>
              <th style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--text, #111)', width: 110 }}>Percent (%)</th>
              <th style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--text, #111)', width: 140 }}>Replacement Value</th>
              <th style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--text, #111)', width: 140 }}>Effective Deposit</th>
              <th style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--text, #111)', width: 90 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--muted, #6b7280)' }}>
                  Loading inventory products…
                </td>
              </tr>
            ) : filteredProducts.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--muted, #6b7280)' }}>
                  No products matched the current filter.
                </td>
              </tr>
            ) : (
              filteredProducts.map((p) => {
                const draft = drafts[p.id] || {
                  ruleType: depositRuleType(p),
                  fixedRupees: '',
                  percentStr: '',
                  replacementRupees: '',
                  isDirty: false,
                  isSaving: false,
                }
                const isSelected = selectedProductIds.has(p.id)

                // Effective deposit preview based on current draft
                const previewFixed = draft.ruleType === 'fixed' && draft.fixedRupees ? rupees(Number(draft.fixedRupees) || 0) : null
                const previewPercent = draft.ruleType === 'percent' && draft.percentStr ? Number(draft.percentStr) || null : null
                const previewRepl = draft.replacementRupees ? rupees(Number(draft.replacementRupees) || 0) : p.replacementValuePaisa
                const previewEffective = calculateEffectiveDeposit({
                  depositFixedPaisa: previewFixed,
                  depositPercent: previewPercent,
                  replacementValuePaisa: previewRepl,
                })

                return (
                  <tr
                    key={p.id}
                    data-testid={`deposit-row-${p.id}`}
                    style={{
                      borderBottom: '1px solid var(--border, #f3f4f6)',
                      background: isSelected ? 'var(--st-primary-bg, #eff6ff)' : draft.isDirty ? 'var(--hover-row, #fffbeb)' : 'transparent',
                    }}
                  >
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectRow(p.id)}
                        aria-label={`Select ${p.name}`}
                      />
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text, #111)' }}>{p.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text2, #6b7280)' }}>
                        {p.brand} {p.model ? `· ${p.model}` : ''} · {p.category}
                        {p.dailyRatePaisa && ` · ${formatMoney(p.dailyRatePaisa)}/day`}
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <select
                        value={draft.ruleType}
                        onChange={(e) => updateRowDraft(p.id, { ruleType: e.target.value as DepositRuleType })}
                        style={{
                          width: '100%',
                          height: 32,
                          padding: '0 6px',
                          borderRadius: 'var(--r-input, 4px)',
                          border: '1px solid var(--border, #d1d5db)',
                          fontSize: '12px',
                          background: 'var(--card, #fff)',
                          color: 'var(--text, #111)',
                        }}
                      >
                        <option value="fixed">Fixed (NPR)</option>
                        <option value="percent">Percent (%)</option>
                        <option value="none">No Deposit</option>
                      </select>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <input
                        type="number"
                        min="0"
                        step="100"
                        disabled={draft.ruleType !== 'fixed'}
                        value={draft.fixedRupees}
                        onChange={(e) => updateRowDraft(p.id, { fixedRupees: e.target.value })}
                        placeholder="e.g. 5000"
                        style={{
                          width: '100%',
                          height: 32,
                          padding: '0 8px',
                          borderRadius: 'var(--r-input, 4px)',
                          border: '1px solid var(--border, #d1d5db)',
                          fontSize: '12px',
                          background: draft.ruleType !== 'fixed' ? 'var(--hover-row, #f3f4f6)' : 'var(--card, #fff)',
                          color: 'var(--text, #111)',
                        }}
                      />
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        disabled={draft.ruleType !== 'percent'}
                        value={draft.percentStr}
                        onChange={(e) => updateRowDraft(p.id, { percentStr: e.target.value })}
                        placeholder="e.g. 10"
                        style={{
                          width: '100%',
                          height: 32,
                          padding: '0 8px',
                          borderRadius: 'var(--r-input, 4px)',
                          border: '1px solid var(--border, #d1d5db)',
                          fontSize: '12px',
                          background: draft.ruleType !== 'percent' ? 'var(--hover-row, #f3f4f6)' : 'var(--card, #fff)',
                          color: 'var(--text, #111)',
                        }}
                      />
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <input
                        type="number"
                        min="0"
                        step="1000"
                        value={draft.replacementRupees}
                        onChange={(e) => updateRowDraft(p.id, { replacementRupees: e.target.value })}
                        placeholder="e.g. 150000"
                        style={{
                          width: '100%',
                          height: 32,
                          padding: '0 8px',
                          borderRadius: 'var(--r-input, 4px)',
                          border: '1px solid var(--border, #d1d5db)',
                          fontSize: '12px',
                          background: 'var(--card, #fff)',
                          color: 'var(--text, #111)',
                        }}
                      />
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      {previewEffective !== null ? (
                        <span style={{ fontWeight: 700, color: 'var(--text, #111)' }}>
                          {formatMoney(previewEffective)}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--st-danger-fg, #ef4444)', fontSize: '11px', fontWeight: 600 }}>
                          — None
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <Button
                        size="sm"
                        variant={draft.isDirty ? 'primary' : 'ghost'}
                        disabled={!draft.isDirty || draft.isSaving}
                        onClick={() => saveProductRow(p.id)}
                      >
                        {draft.isSaving ? '…' : 'Save'}
                      </Button>
                      {draft.saveError && (
                        <div style={{ color: 'var(--st-danger-fg, #ef4444)', fontSize: '10px', marginTop: 2 }}>
                          {draft.saveError}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Bulk Edit Modal */}
      <Modal
        isOpen={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
        size="sm"
        title={`Set Deposit Rule for ${selectedProductIds.size} Products`}
        subtitle="Applies the selected deposit rule uniformly across all selected equipment rows."
        footer={
          <>
            <Button variant="ghost" onClick={() => setBulkModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" disabled={bulkSaving} onClick={applyBulkRule}>
              {bulkSaving ? 'Saving…' : 'Apply Rule'}
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {bulkMessage && (
            <div role="alert" style={{ color: 'var(--st-danger-fg, #ef4444)', fontSize: '12px' }}>
              {bulkMessage}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: '12px', fontWeight: 600 }}>Deposit Rule Type</label>
            <select
              value={bulkRuleType}
              onChange={(e) => setBulkRuleType(e.target.value as DepositRuleType)}
              style={{
                height: 36,
                padding: '0 8px',
                borderRadius: 'var(--r-input, 6px)',
                border: '1px solid var(--border, #d1d5db)',
              }}
            >
              <option value="fixed">Fixed Deposit (NPR)</option>
              <option value="percent">Percentage of Replacement Value (%)</option>
              <option value="none">No Deposit (Clear)</option>
            </select>
          </div>

          {bulkRuleType === 'fixed' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: '12px', fontWeight: 600 }}>Fixed Deposit Amount (NPR)</label>
              <input
                type="number"
                min="0"
                step="500"
                value={bulkFixedRupees}
                onChange={(e) => setBulkFixedRupees(e.target.value)}
                style={{
                  height: 36,
                  padding: '0 8px',
                  borderRadius: 'var(--r-input, 6px)',
                  border: '1px solid var(--border, #d1d5db)',
                }}
              />
            </div>
          )}

          {bulkRuleType === 'percent' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: '12px', fontWeight: 600 }}>Deposit Percentage (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={bulkPercent}
                onChange={(e) => setBulkPercent(e.target.value)}
                style={{
                  height: 36,
                  padding: '0 8px',
                  borderRadius: 'var(--r-input, 6px)',
                  border: '1px solid var(--border, #d1d5db)',
                }}
              />
              <span style={{ fontSize: '11px', color: 'var(--text2, #6b7280)' }}>
                Applied to each item's configured replacement value.
              </span>
            </div>
          )}
        </div>
      </Modal>

      {/* CSV Dry Run Modal (T3-02, BQ-407: "mandatory, fully-rendered dry-run") */}
      <Modal
        isOpen={dryRunModalOpen}
        onClose={() => setDryRunModalOpen(false)}
        size="lg"
        title="Deposit CSV Import — Dry Run Preview"
        subtitle={`Verified ${dryRunResult?.totalRows ?? 0} rows. ${dryRunResult?.changeCount ?? 0} changes to apply.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDryRunModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={applyingCsv || (dryRunResult?.changeCount ?? 0) === 0}
              onClick={handleApplyCsv}
            >
              {applyingCsv ? 'Applying Changes…' : `Apply ${dryRunResult?.changeCount ?? 0} Changes`}
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Summary KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            <div style={{ padding: '8px 12px', borderRadius: 6, background: 'var(--hover-row, #f3f4f6)' }}>
              <div style={{ fontSize: '11px', color: 'var(--text2, #6b7280)' }}>Total Rows</div>
              <div style={{ fontSize: '16px', fontWeight: 700 }}>{dryRunResult?.totalRows ?? 0}</div>
            </div>
            <div style={{ padding: '8px 12px', borderRadius: 6, background: 'var(--st-primary-bg, #eff6ff)' }}>
              <div style={{ fontSize: '11px', color: 'var(--primary, #2563eb)' }}>Changes</div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--primary, #2563eb)' }}>
                {dryRunResult?.changeCount ?? 0}
              </div>
            </div>
            <div style={{ padding: '8px 12px', borderRadius: 6, background: 'var(--hover-row, #f3f4f6)' }}>
              <div style={{ fontSize: '11px', color: 'var(--text2, #6b7280)' }}>Unchanged</div>
              <div style={{ fontSize: '16px', fontWeight: 700 }}>{dryRunResult?.unchangedCount ?? 0}</div>
            </div>
            <div style={{ padding: '8px 12px', borderRadius: 6, background: 'var(--st-danger-bg, #fef2f2)' }}>
              <div style={{ fontSize: '11px', color: 'var(--st-danger-fg, #ef4444)' }}>Errors</div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--st-danger-fg, #ef4444)' }}>
                {dryRunResult?.errorCount ?? 0}
              </div>
            </div>
          </div>

          {/* Table Preview */}
          <div style={{ maxHeight: 360, overflowY: 'auto', border: '1px solid var(--border, #e5e7eb)', borderRadius: 6 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: 'var(--surface-sunken, #f9fafb)', borderBottom: '1px solid var(--border, #e5e7eb)' }}>
                  <th style={{ padding: '8px 10px', textAlign: 'left' }}>Product</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left' }}>Current Term</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left' }}>Proposed Term</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {dryRunResult?.entries.map((entry: DepositCsvDryRunEntry) => (
                  <tr
                    key={entry.rowIndex}
                    style={{
                      borderBottom: '1px solid var(--border, #f3f4f6)',
                      background: entry.error ? 'var(--st-danger-bg, #fef2f2)' : entry.hasChange ? 'var(--st-primary-bg, #eff6ff)' : 'transparent',
                    }}
                  >
                    <td style={{ padding: '8px 10px' }}>
                      <div style={{ fontWeight: 600 }}>{entry.productName}</div>
                      <div style={{ fontSize: '10px', color: 'var(--text2, #6b7280)' }}>{entry.brand} {entry.model ?? ''}</div>
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      {entry.oldEffective !== null ? formatMoney(entry.oldEffective) : '— None'}
                      <span style={{ fontSize: '10px', color: 'var(--text2, #6b7280)', marginLeft: 4 }}>
                        ({entry.oldRule})
                      </span>
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      {entry.newEffective !== null ? (
                        <span style={{ fontWeight: 700, color: 'var(--primary, #2563eb)' }}>
                          {formatMoney(entry.newEffective)}
                        </span>
                      ) : (
                        '— None'
                      )}
                      <span style={{ fontSize: '10px', color: 'var(--text2, #6b7280)', marginLeft: 4 }}>
                        ({entry.newRule})
                      </span>
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      {entry.error ? (
                        <span style={{ color: 'var(--st-danger-fg, #ef4444)', fontWeight: 600 }}>
                          Error: {entry.error}
                        </span>
                      ) : entry.hasChange ? (
                        <span style={{ color: 'var(--primary, #2563eb)', fontWeight: 600 }}>
                          Update
                        </span>
                      ) : (
                        <span style={{ color: 'var(--muted, #9ca3af)' }}>Unchanged</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default DepositSetup
