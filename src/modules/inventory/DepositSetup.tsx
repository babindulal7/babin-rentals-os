import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Input } from '../../components/ui/Input'
import { SearchInput } from '../../components/ui/SearchInput'
import { Card, KpiStrip, PageHeader, type Kpi } from '../../components/ui/Page'
import { PageShell } from '../../components/ui/PageShell'
import { DataTable, type DataTableColumn } from '../../components/ui/DataTable'
import Icon from '../../components/ui/Icon'
import { EmptyState, ErrorBanner, LoadingSkeleton, RestrictedState } from '../../components/ui/StateViews'
import { useToast } from '../../components/ui/Toast'
import { useAuth, type AuthUser } from '../../lib/auth'
import { useNetwork } from '../../lib/network'
import { useLoad } from '../../lib/queries/useLoad'
import { fetchDepositSetupRows } from '../../lib/queries/productDeposits'
import { canEditProductDeposits } from '../../lib/rbac'
import { formatMoney } from '../../lib/money'
import { recordExport } from '../../lib/exportAudit'
import {
  DEPOSIT_CSV_HEADERS,
  changedDepositFields,
  depositBasis,
  depositDraftFromRow,
  depositRowWarning,
  depositSetupProgress,
  describeDepositChange,
  effectiveUnitDepositPaisa,
  filterDepositRows,
  parseDepositDraft,
  previewDepositSetupCsv,
  buildDepositSetupCsv,
  type DepositCsvPreview,
  type DepositDraft,
  type DepositSetupRow,
} from '../../lib/depositSetup'
import {
  saveProductDeposits,
  type ProductDepositSave,
  type SaveProductDepositsResult,
} from '../../actions/inventory/saveProductDeposits'
import './inventory.css'

/**
 * Deposit Setup — the T3-02 bulk editor for product deposit terms.
 *
 * D11: Booqable's global default was "no deposit", so the ~180 imported products
 * arrived with `deposit_fixed` and `deposit_percent` empty. This screen is the
 * one place staff fill them in before the trial, and the progress counter is the
 * go-live check: "142 / 178 set" is a fact about the catalogue, not a demo.
 *
 * ## What this screen is allowed to own
 *
 * Nothing but presentation and input state. Every rule lives in
 * `lib/depositSetup.ts` (what "set" means, what the effective deposit is, how a
 * CSV row resolves to one product) and the write lives in
 * `actions/inventory/saveProductDeposits.ts`. A component that re-decided any of
 * those would be the second interpretation Law 1 exists to prevent.
 *
 * ## Money-blind roles
 *
 * The three columns are money columns, masked to `null` by `products_v` for a
 * money-blind session — and a masked column reads exactly like "nobody has set
 * one". That is why this is gated rather than merely read-only: Warehouse would
 * otherwise see a full list of products that "need a deposit" and could never
 * tell the mask from the truth. The role set is `save_record_section`'s own
 * (Owner · Admin · Manager), so nothing here offers a save the database refuses.
 *
 * ## Deposits are liabilities
 *
 * A figure on this screen is what the shop holds, not what it earns. Nothing
 * here reaches Rental Total or Outstanding (Law 5).
 */

export interface DepositSetupProps {
  embedded?: boolean
  onDone?: () => void
}

export default function DepositSetup({ embedded = false }: DepositSetupProps = {}) {
  const { user } = useAuth()

  if (!user || !canEditProductDeposits(user.role)) {
    return (
      <RestrictedState
        reason="Setting a product's deposit rule is an Owner, Admin or Manager action."
        requiredRole="Owner, Admin or Manager"
      />
    )
  }

  return <DepositSetupForm key={user.id} user={user} embedded={embedded} />
}

type DraftField = keyof DepositDraft

const FIELD_LABEL: Record<DraftField, string> = {
  fixed: 'Fixed deposit',
  percent: 'Deposit percent',
  replacement: 'Replacement value',
}

/** The three inputs a row shows, and the values they currently say. */
interface RowEntry {
  draft: DepositDraft
  parsed: ReturnType<typeof parseDepositDraft>
  dirty: boolean
}

function valuesOf(row: DepositSetupRow) {
  return { fixedPaisa: row.fixedPaisa, percent: row.percent, replacementPaisa: row.replacementPaisa }
}

/** A stable file name: one export per day is enough to tell them apart. */
function depositCsvFileName(): string {
  return `deposit-setup-${new Date().toISOString().slice(0, 10)}.csv`
}

function downloadTextFile(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

function DepositSetupForm({ user, embedded }: { user: AuthUser; embedded: boolean }) {
  const online = useNetwork()
  const { showSuccessToast } = useToast()
  const load = useLoad(fetchDepositSetupRows)
  const rows = useMemo(() => load.data ?? [], [load.data])

  /** Only rows the operator actually touched. Everything else reads from `rows`. */
  const [overrides, setOverrides] = useState<Record<string, DepositDraft>>({})
  const [search, setSearch] = useState('')
  const [onlyUnset, setOnlyUnset] = useState(false)
  const [saving, setSaving] = useState(false)
  const [stopRequested, setStopRequested] = useState(false)
  const [progressNote, setProgressNote] = useState<string | null>(null)
  const [result, setResult] = useState<SaveProductDepositsResult | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ fileName: string; data: DepositCsvPreview } | null>(null)
  const [csvError, setCsvError] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const stopRef = useRef(false)
  const saveGuard = useRef(false)
  const reload = load.reload

  const progress = useMemo(() => depositSetupProgress(rows), [rows])

  const parsedById = useMemo(() => {
    const map = new Map<string, RowEntry>()
    for (const row of rows) {
      const draft = overrides[row.id] ?? depositDraftFromRow(row)
      const parsed = parseDepositDraft(draft)
      const dirty =
        !parsed.ok || changedDepositFields(valuesOf(row), parsed.values).length > 0
      map.set(row.id, { draft, parsed, dirty })
    }
    return map
  }, [rows, overrides])

  const changedRows = useMemo(
    () => rows.filter((row) => parsedById.get(row.id)?.dirty === true),
    [rows, parsedById],
  )
  const invalidRows = changedRows.filter((row) => parsedById.get(row.id)?.parsed.ok === false)
  const filtered = useMemo(
    () => filterDepositRows(rows, { search, onlyUnset }),
    [rows, search, onlyUnset],
  )

  /**
   * After a successful read, an override that now equals the stored row is no
   * longer an edit — it is the reload confirming the save. Dropping it keeps a
   * stale value from masking a later change by someone else, and it is what
   * makes the save bar disappear without a flicker when the reload lands.
   */
  useEffect(() => {
    if (load.lastFetchedAt === null) return
    setOverrides((prev) => {
      if (Object.keys(prev).length === 0) return prev
      const byId = new Map(rows.map((row) => [row.id, row]))
      let dropped = false
      const next: Record<string, DepositDraft> = {}
      for (const [id, draft] of Object.entries(prev)) {
        const row = byId.get(id)
        if (!row) {
          dropped = true
          continue
        }
        const parsed = parseDepositDraft(draft)
        const unchanged =
          parsed.ok && changedDepositFields(valuesOf(row), parsed.values).length === 0
        if (unchanged) {
          dropped = true
          continue
        }
        next[id] = draft
      }
      return dropped ? next : prev
    })
  }, [load.lastFetchedAt, rows])

  const edit = useCallback((row: DepositSetupRow, field: DraftField, value: string) => {
    setOverrides((prev) => {
      const current = prev[row.id] ?? depositDraftFromRow(row)
      return { ...prev, [row.id]: { ...current, [field]: value } }
    })
    setSaveError(null)
  }, [])

  const revert = useCallback((row: DepositSetupRow) => {
    setOverrides((prev) => {
      if (!(row.id in prev)) return prev
      const next = { ...prev }
      delete next[row.id]
      return next
    })
  }, [])

  const runSave = useCallback(
    async (products: ProductDepositSave[], label: string): Promise<SaveProductDepositsResult | null> => {
      if (products.length === 0 || saveGuard.current) return null
      if (!online) {
        setSaveError('Connect to save deposit changes. Nothing has been queued and your edits are still here.')
        return null
      }

      saveGuard.current = true
      setSaving(true)
      setStopRequested(false)
      stopRef.current = false
      setResult(null)
      setSaveError(null)

      try {
        const outcome = await saveProductDeposits(
          {
            products,
            onProgress: (done, total, productName) =>
              setProgressNote(`Saving ${done} of ${total}: ${productName}`),
            shouldStop: () => stopRef.current,
          },
          { userId: user.id, role: user.role, isOnline: online },
        )
        setResult(outcome)
        if (outcome.savedCount > 0) {
          const productsWord = outcome.savedCount === 1 ? 'product' : 'products'
          const matched =
            outcome.unchangedCount > 0
              ? `, ${outcome.unchangedCount} already matched`
              : ''
          showSuccessToast(`${label} saved`, `${outcome.savedCount} ${productsWord} updated${matched}.`)
        }
        if (outcome.savedCount > 0 || outcome.unchangedCount > 0) reload()
        return outcome
      } catch (error: unknown) {
        setSaveError(error instanceof Error ? error.message : String(error))
        return null
      } finally {
        saveGuard.current = false
        setSaving(false)
        setStopRequested(false)
        setProgressNote(null)
      }
    },
    [online, reload, showSuccessToast, user.id, user.role],
  )

  const saveEdits = useCallback(() => {
    if (invalidRows.length > 0) {
      setSaveError('Fix the highlighted values before saving.')
      return
    }
    const products: ProductDepositSave[] = []
    for (const row of changedRows) {
      const entry = parsedById.get(row.id)
      if (!entry || !entry.parsed.ok) continue
      products.push({
        id: row.id,
        productName: row.name,
        fixedPaisa: entry.parsed.values.fixedPaisa,
        percent: entry.parsed.values.percent,
        replacementPaisa: entry.parsed.values.replacementPaisa,
      })
    }
    void runSave(products, 'Deposit rules')
  }, [changedRows, invalidRows.length, parsedById, runSave])

  const exportCsv = useCallback(() => {
    downloadTextFile(depositCsvFileName(), buildDepositSetupCsv(filtered))
    recordExport({
      list: 'inventory.deposit-setup',
      module: 'Inventory',
      rowCount: filtered.length,
      columns: DEPOSIT_CSV_HEADERS,
      scope: 'loaded_directory',
      ...(onlyUnset || search.trim() !== ''
        ? { filter: [onlyUnset ? 'no-deposit-set' : '', search.trim()].filter(Boolean).join(' ') }
        : {}),
    })
  }, [filtered, onlyUnset, search])

  const readCsv = useCallback(
    async (file: File | null) => {
      setCsvError(null)
      if (!file) return
      if (changedRows.length > 0) {
        setCsvError('Save or discard your unsaved changes first, so the dry run compares against what is stored.')
        return
      }
      if (!online) {
        setCsvError('Connect to check a file. Nothing was read and nothing was changed.')
        return
      }
      try {
        const text = await file.text()
        setPreview({ fileName: file.name, data: previewDepositSetupCsv(text, rows) })
      } catch (error: unknown) {
        setPreview(null)
        setCsvError(error instanceof Error ? error.message : 'The file could not be read.')
      }
    },
    [changedRows.length, online, rows],
  )

  const applyPreview = useCallback(async () => {
    if (!preview) return
    const products: ProductDepositSave[] = preview.data.changes.map((change) => ({
      id: change.productId,
      productName: change.productName,
      fixedPaisa: change.newValues.fixedPaisa,
      percent: change.newValues.percent,
      replacementPaisa: change.newValues.replacementPaisa,
    }))
    const outcome = await runSave(products, 'Deposit import')
    if (outcome && outcome.failedCount === 0 && !outcome.stopped) setPreview(null)
  }, [preview, runSave])

  const dirtyCount = changedRows.length
  const failedOutcomes = result?.outcomes.filter((outcome) => outcome.status === 'failed') ?? []
  const stoppedCount = result?.outcomes.filter((outcome) => outcome.status === 'stopped').length ?? 0

  const kpis: Kpi[] = [
    { label: 'Active products', value: String(progress.total), icon: 'box', accent: 'neutral' },
    { label: 'Deposit set', value: String(progress.configured), icon: 'check', accent: 'success' },
    {
      label: 'Not set yet',
      value: String(progress.unset),
      icon: 'alert_triangle',
      accent: progress.unset > 0 ? 'warn' : 'success',
      zeroExplanation: 'Every active product has a deposit rule.',
    },
  ]

  /** What the fields on this row say right now, whether saved or not. */
  const valuesFor = (row: DepositSetupRow) => {
    const entry = parsedById.get(row.id)
    return entry?.parsed.ok ? entry.parsed.values : valuesOf(row)
  }

  const fieldInput = (row: DepositSetupRow, field: DraftField): ReactNode => {
    const entry = parsedById.get(row.id)
    if (!entry) return null
    return (
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
        <Input
          aria-label={`${FIELD_LABEL[field]} for ${row.name}`}
          value={entry.draft[field]}
          onChange={(event) => edit(row, field, event.target.value)}
          inputMode="decimal"
          autoComplete="off"
          placeholder="Not set"
          disabled={saving}
          error={entry.parsed.errors[field] ?? null}
          style={{ fontVariantNumeric: 'tabular-nums' }}
        />
        {field === 'percent' && (
          <span aria-hidden style={{ paddingTop: 12, color: 'var(--muted)' }}>
            %
          </span>
        )}
      </div>
    )
  }

  const identityCell = (row: DepositSetupRow): ReactNode => {
    const warning = depositRowWarning(valuesFor(row))
    const parts = [row.assetCode, row.brand, row.model].filter(
      (part): part is string => typeof part === 'string' && part.trim() !== '',
    )
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, color: 'var(--text)' }}>{row.name}</span>
          {parsedById.get(row.id)?.dirty === true && (
            <Badge tone="progress" size="sm" label="Unsaved" />
          )}
        </span>
        <span
          className="figure"
          style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', overflowWrap: 'anywhere' }}
        >
          {parts.length > 0 ? parts.join(' / ') : 'No asset code'}
        </span>
        {warning && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'flex-start',
              gap: 4,
              fontSize: 'var(--t-meta)',
              lineHeight: 1.35,
              color: 'var(--warn-text)',
            }}
          >
            <Icon name="alert_triangle" size={12} style={{ flexShrink: 0, marginTop: 2 }} />
            {warning}
          </span>
        )}
      </div>
    )
  }

  const effectiveCell = (row: DepositSetupRow): ReactNode => {
    const values = valuesFor(row)
    const paisa = effectiveUnitDepositPaisa(values)
    const basis = depositBasis(values)
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
        <span
          className="figure"
          style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'var(--text)' }}
        >
          {paisa === null ? 'None' : formatMoney(paisa)}
        </span>
        <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
          {basis === 'fixed' ? 'Fixed rule' : basis === 'percent' ? 'Percent of replacement' : 'No rule'}
        </span>
      </div>
    )
  }

  const columns: Array<DataTableColumn<DepositSetupRow>> = [
    { id: 'product', header: 'Product', width: '30%', cell: identityCell, mobileLabel: 'Product' },
    {
      id: 'fixed',
      header: 'Fixed deposit (Rs)',
      width: 160,
      cell: (row) => fieldInput(row, 'fixed'),
      mobileLabel: 'Fixed deposit',
    },
    {
      id: 'percent',
      header: 'Deposit percent',
      width: 140,
      cell: (row) => fieldInput(row, 'percent'),
      mobileLabel: 'Deposit percent',
    },
    {
      id: 'replacement',
      header: 'Replacement value (Rs)',
      width: 170,
      cell: (row) => fieldInput(row, 'replacement'),
      mobileLabel: 'Replacement value',
    },
    {
      id: 'effective',
      header: 'Holds per unit',
      width: 160,
      align: 'right',
      cell: effectiveCell,
      mobileLabel: 'Holds per unit',
    },
  ]

  const toolbar = (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-sm)', alignItems: 'center' }}>
      <div style={{ flex: '1 1 220px', minWidth: 180 }}>
        <SearchInput
          value={search}
          onChange={setSearch}
          onClear={() => setSearch('')}
          placeholder="Search name, code, brand or model"
          aria-label="Search products"
        />
      </div>
      <Button
        variant={onlyUnset ? 'primary' : 'outline'}
        aria-pressed={onlyUnset}
        onClick={() => setOnlyUnset((value) => !value)}
        icon="filter"
      >
        No deposit set ({progress.unset})
      </Button>
      <Button variant="secondary" icon="download" onClick={exportCsv} disabled={filtered.length === 0}>
        Download CSV
      </Button>
      <Button variant="secondary" icon="upload" onClick={() => fileInputRef.current?.click()} disabled={saving}>
        Check a CSV
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        style={{ display: 'none' }}
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null
          event.target.value = ''
          void readCsv(file)
        }}
      />
    </div>
  )

  const progressCard = (
    <Card>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, color: 'var(--text)' }}>
            {progress.configured} / {progress.total} set
          </span>
          <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
            {progress.percentComplete}% of active products have a deposit rule
          </span>
        </div>
        <div
          role="progressbar"
          aria-label="Active products with a deposit rule set"
          aria-valuenow={progress.configured}
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-valuetext={`${progress.configured} of ${progress.total} products set`}
          style={{ height: 8, borderRadius: 999, background: 'var(--card2)', overflow: 'hidden' }}
        >
          <div
            style={{
              width: `${progress.percentComplete}%`,
              height: '100%',
              background: 'var(--success)',
              transition: 'width 160ms ease',
            }}
          />
        </div>
        <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.5 }}>
          A fixed deposit wins when it is above zero. Otherwise the percent applies to the replacement
          value. Both blank means nobody has decided yet; a fixed deposit of 0 means this product
          deliberately asks for nothing.
        </p>
      </div>
    </Card>
  )

  const previewCard = preview && (
    <Card
      title={`Dry run: ${preview.fileName}`}
      action={
        <Button variant="ghost" onClick={() => setPreview(null)} disabled={saving}>
          Close
        </Button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
        <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
          {preview.data.dataRows} data row{preview.data.dataRows === 1 ? '' : 's'}.{' '}
          {preview.data.changes.length} product{preview.data.changes.length === 1 ? '' : 's'} would
          change; {preview.data.unchanged} already match.
        </p>

        {preview.data.fileErrors.length > 0 && (
          <ErrorBanner
            title="This file cannot be applied"
            message={
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {preview.data.fileErrors.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            }
          />
        )}

        {preview.data.rowErrors.length > 0 && (
          <ErrorBanner
            title="Some rows do not resolve to one product"
            message={
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {preview.data.rowErrors.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            }
          />
        )}

        {preview.data.ok && preview.data.changes.length === 0 && (
          <p style={{ margin: 0, fontWeight: 600, color: 'var(--text)' }}>
            Nothing to apply: the file matches what is stored.
          </p>
        )}

        {preview.data.changes.length > 0 && (
          <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 8 }}>
            {preview.data.changes.map((change) => (
              <li key={change.productId} style={{ color: 'var(--text2)' }}>
                <strong style={{ color: 'var(--text)' }}>{change.productName}</strong>
                {change.assetCode ? ` (${change.assetCode})` : ''}
                <ul style={{ margin: '2px 0 0', paddingLeft: 18, fontSize: 'var(--t-meta)' }}>
                  {change.changes.map((fieldChange) => (
                    <li key={fieldChange.field}>{describeDepositChange(fieldChange)}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="ghost" onClick={() => setPreview(null)} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => void applyPreview()}
            loading={saving}
            disabled={!preview.data.ok || preview.data.changes.length === 0 || !online || saving}
          >
            Apply {preview.data.changes.length} change{preview.data.changes.length === 1 ? '' : 's'}
          </Button>
        </div>
      </div>
    </Card>
  )

  const resultPanel = (failedOutcomes.length > 0 || stoppedCount > 0) && (
    <ErrorBanner
      title={
        failedOutcomes.length > 0
          ? 'Deposit changes stopped at the first failure'
          : 'The save was stopped'
      }
      message={
        <div style={{ display: 'grid', gap: 6 }}>
          {failedOutcomes.map((outcome) => (
            <p key={outcome.productId} style={{ margin: 0 }}>
              <strong>{outcome.productName}:</strong> {outcome.message ?? 'This product was not saved.'}
            </p>
          ))}
          {stoppedCount > 0 && (
            <p style={{ margin: 0 }}>
              {stoppedCount} product{stoppedCount === 1 ? '' : 's'} not attempted. Save again to
              continue from there.
            </p>
          )}
        </div>
      }
    />
  )

  const body = (() => {
    if (load.loading && load.data === null) {
      return <LoadingSkeleton type="card" label="Loading deposit rules" />
    }
    if (load.error && load.data === null) {
      return (
        <ErrorBanner
          title={load.offline ? 'You are offline' : 'Deposit rules could not be loaded'}
          message={load.error}
          onRetry={load.reload}
        />
      )
    }
    if (rows.length === 0) {
      return (
        <EmptyState
          kind="nothing-yet"
          icon={<Icon name="box" size={22} />}
          title="No active products"
          description="Activate a product in the catalogue before setting its deposit rule."
        />
      )
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        {!online && (
          <div
            role="status"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 'var(--sp-sm)',
              padding: 'var(--sp-md)',
              borderRadius: 'var(--r-card)',
              border: '1px solid var(--border)',
              background: 'var(--card2)',
              fontSize: 'var(--t-meta)',
              lineHeight: 1.5,
              color: 'var(--text2)',
            }}
          >
            <Icon name="alert_triangle" size={14} style={{ flexShrink: 0, marginTop: 2, color: 'var(--warn-text)' }} />
            <span>
              You are offline. This list is the last successful read, and saving needs a connection.
              Nothing you type is queued.
            </span>
          </div>
        )}

        {load.error && (
          <ErrorBanner
            title="The list could not be refreshed"
            message={`${load.error} The figures below may be out of date.`}
            onRetry={load.reload}
          />
        )}

        <KpiStrip items={kpis} columns={3} />
        {progressCard}
        {toolbar}

        {csvError && <ErrorBanner title="That file was not checked" message={csvError} />}
        {saveError && <ErrorBanner title="The save did not run" message={saveError} />}
        {resultPanel}
        {previewCard}

        <DataTable
          ariaLabel="Products and their deposit rules"
          columns={columns}
          rows={filtered}
          getRowId={(row) => row.id}
          emptyState={
            <EmptyState
              icon={<Icon name="search" size={22} />}
              title="No products match these filters"
              description="Clear the search or the no-deposit filter to see the rest of the catalogue."
              actionLabel="Show every product"
              onAction={() => {
                setSearch('')
                setOnlyUnset(false)
              }}
            />
          }
          rowActions={(row) => (
            <Button
              variant="ghost"
              size="sm"
              icon="refresh"
              aria-label={`Revert ${row.name}`}
              disabled={parsedById.get(row.id)?.dirty !== true || saving}
              onClick={() => revert(row)}
              style={{ minWidth: 44 }}
            />
          )}
          mobileRow={(row) => (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
              {identityCell(row)}
              <div style={{ display: 'grid', gap: 'var(--sp-sm)' }}>
                <div>
                  <span style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                    Fixed deposit (Rs)
                  </span>
                  {fieldInput(row, 'fixed')}
                </div>
                <div>
                  <span style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                    Deposit percent
                  </span>
                  {fieldInput(row, 'percent')}
                </div>
                <div>
                  <span style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                    Replacement value (Rs)
                  </span>
                  {fieldInput(row, 'replacement')}
                </div>
                <div>{effectiveCell(row)}</div>
              </div>
              {parsedById.get(row.id)?.dirty === true && (
                <Button variant="ghost" size="sm" icon="refresh" onClick={() => revert(row)}>
                  Revert this row
                </Button>
              )}
            </div>
          )}
        />
      </div>
    )
  })()

  return (
    <PageShell
      {...(!embedded
        ? {
            header: (
              <PageHeader
                title="Deposit setup"
                description="Every active product and the security deposit it asks for. Staff fill this before the trial."
              />
            ),
          }
        : {})}
    >
      {!embedded && (
        <div style={{ marginBottom: 'var(--sp-md)' }}>
          <Badge tone="primary" label="Deposits are held, never revenue" />
        </div>
      )}
      {body}

      {dirtyCount > 0 && (
        <div
          role="region"
          aria-label="Unsaved deposit changes"
          style={{
            position: 'sticky',
            bottom: 0,
            zIndex: 'var(--z-sticky-nav, 10)',
            marginTop: 'var(--sp-md)',
            padding: 'var(--sp-md)',
            borderRadius: 'var(--r-card)',
            border: '1px solid var(--border)',
            background: 'var(--card)',
            boxShadow: 'var(--shadow-lg)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--sp-sm)',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ flex: '1 1 220px', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontWeight: 700, color: 'var(--text)' }}>
              {dirtyCount} product{dirtyCount === 1 ? '' : 's'} with unsaved deposit changes
            </span>
            <span role="status" style={{ fontSize: 'var(--t-meta)', color: invalidRows.length > 0 ? 'var(--danger-text)' : 'var(--muted)' }}>
              {progressNote ??
                (invalidRows.length > 0
                  ? `${invalidRows.length} row${invalidRows.length === 1 ? '' : 's'} need a valid value before saving.`
                  : 'Nothing is written until you save.')}
            </span>
          </div>
          {saving && (
            <Button
              variant="ghost"
              onClick={() => {
                stopRef.current = true
                setStopRequested(true)
              }}
              disabled={stopRequested}
            >
              {stopRequested ? 'Stopping after this product' : 'Stop after this product'}
            </Button>
          )}
          <Button variant="ghost" onClick={() => setOverrides({})} disabled={saving}>
            Discard
          </Button>
          <Button
            variant="primary"
            onClick={saveEdits}
            loading={saving}
            disabled={!online || invalidRows.length > 0 || saving}
          >
            Save changes
          </Button>
        </div>
      )}
    </PageShell>
  )
}
