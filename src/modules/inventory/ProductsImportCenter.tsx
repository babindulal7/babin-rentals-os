import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Select } from '../../components/ui'
import { Card, Button, KpiStrip, type Kpi } from '../../components/ui/Page'
import { ScreenHeader } from '../../components/ui/ScreenHeader'
import { DataTableShell } from '../../components/ui/DataTable'
import { RestrictedState } from '../../components/ui/StateViews'
import { useUnsavedRecord } from '../../components/ui/RecordWorkspace'
import { useAuth } from '../../lib/auth'
import { useNetwork } from '../../lib/network'
import { newClientUuid } from '../../lib/supabase'
import { parseCsv, csvCell } from '../../lib/csv'
import {
  PRODUCT_IMPORT_TARGET_FIELDS,
  PRODUCT_IMPORT_SAMPLE_HEADERS,
  PRODUCT_IMPORT_SAMPLE_ROW,
  guessProductTargetField,
  buildProductImportPreview,
  productMappingErrors,
  canImportProducts,
  type ProductImportTargetField,
  type ProductImportRowResult,
  type ExistingProductRef,
} from '../../lib/productImport'
import { listInventoryCategories, listProductImportCorpus } from '../../lib/queries/inventory'
import { useWarehouses } from '../../lib/queries/warehouses'
import { importProducts, type ProductImportOutcome } from '../../actions/inventory/importProducts'
import '../clients/import-center.css'

/**
 * # Catalogue CSV Import — Booqable adoption BQ-407
 *
 * "A catalog CSV import with a **mandatory, fully-rendered dry-run**": nothing
 * commits until every row has been built, validated and shown — parser errors
 * surfaced per row, unknown categories and invalid tracking modes refused at
 * the preview, duplicates against the live catalogue and inside the file
 * blocking the commit, and the operator able to skip a row without losing it.
 *
 * Modeled on the clients ImportCenter, minus the recovery-draft machinery: a
 * client row is contact data a walk-in may not say twice, a catalogue row is a
 * price-list line the operator re-uploads in seconds. That difference is why
 * this file is a third of that one, and why it does not pretend otherwise.
 */

const inputStyle: CSSProperties = {
  minHeight: 'var(--tap)',
  padding: '0 10px',
  borderRadius: 'var(--r-input)',
  border: '1px solid var(--border)',
  background: 'var(--card2)',
  color: 'var(--text)',
  fontSize: 'var(--t-meta)',
  fontFamily: 'inherit',
}

function downloadSampleCsv() {
  const lines = [PRODUCT_IMPORT_SAMPLE_HEADERS.join(','), PRODUCT_IMPORT_SAMPLE_ROW.map((v) => csvCell(String(v))).join(',')]
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'product-import-sample.csv'
  a.click()
  URL.revokeObjectURL(url)
}

export interface ProductsImportCenterProps {
  embedded?: boolean
  onDone?: () => void
}

export default function ProductsImportCenter({ embedded = false, onDone }: ProductsImportCenterProps = {}) {
  const { user } = useAuth()
  if (!user || !canImportProducts(user.role)) return <RestrictedState />
  return <ProductImportForm key={user.id} embedded={embedded} {...(onDone ? { onDone } : {})} />
}

function ProductImportForm({ embedded = false, onDone }: ProductsImportCenterProps = {}) {
  const { user } = useAuth()
  const online = useNetwork()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const fileVersion = useRef(0)
  const submitGuard = useRef(false)
  const stopRequested = useRef(false)

  const [fileName, setFileName] = useState<string | null>(null)
  const [rawRows, setRawRows] = useState<string[][]>([])
  const [hasHeaderRow, setHasHeaderRow] = useState(true)
  const [mapping, setMapping] = useState<Record<number, ProductImportTargetField>>({})
  const [parseError, setParseError] = useState<string | null>(null)
  const [skippedRows, setSkippedRows] = useState<Set<number>>(new Set())
  const [dragOver, setDragOver] = useState(false)

  /* The dry-run's reference data: the category list (empty until loaded) and
     the catalogue corpus (null until a completed fetch — '[]' is a completed
     check that found nothing, which is not the same sentence). */
  const [categories, setCategories] = useState<string[] | null>(null)
  const [categoriesError, setCategoriesError] = useState<string | null>(null)
  const [corpus, setCorpus] = useState<ExistingProductRef[] | null>(null)
  const [corpusError, setCorpusError] = useState<string | null>(null)
  const [corpusRetry, setCorpusRetry] = useState(0)

  /* Where imported serialised units land — one facility for the whole file. */
  const warehouses = useWarehouses()
  const [warehouseName, setWarehouseName] = useState('')
  const [rack, setRack] = useState('')
  const [shelf, setShelf] = useState('')
  const [bin, setBin] = useState('')

  const [busy, setBusy] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [commitError, setCommitError] = useState('')
  const [outcomes, setOutcomes] = useState<ProductImportOutcome[]>([])
  const unfinished = busy || outcomes.some((row) => row.status === 'pending' || row.status === 'unconfirmed')
  useUnsavedRecord(unfinished)

  useEffect(() => {
    let cancelled = false
    listInventoryCategories()
      .then((rows) => {
        if (!cancelled) setCategories(rows.map((r) => r.name))
      })
      .catch((err: unknown) => {
        if (!cancelled) setCategoriesError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [])

  const headers = useMemo(() => {
    if (rawRows.length === 0) return []
    const first = rawRows[0]!
    return hasHeaderRow ? first : first.map((_, i) => `Column ${i + 1}`)
  }, [rawRows, hasHeaderRow])

  const dataRows = useMemo(() => (hasHeaderRow ? rawRows.slice(1) : rawRows), [rawRows, hasHeaderRow])

  const mappedFields = useMemo(() => new Set(Object.values(mapping)), [mapping])
  const nameMapped = mappedFields.has('name')
  const categoryMapped = mappedFields.has('category')
  const brandMapped = mappedFields.has('brand')
  const trackingMapped = mappedFields.has('tracking')
  const mappingErrors = useMemo(() => productMappingErrors(headers, mapping), [headers, mapping])
  const readyToPreview = nameMapped && categoryMapped && brandMapped && trackingMapped && mappingErrors.length === 0

  /* The duplicate corpus: fetched once per file, not per keystroke. A stale
     in-flight response is cancelled so it cannot overwrite a newer one. */
  useEffect(() => {
    if (!readyToPreview || dataRows.length === 0) {
      setCorpus(null)
      setCorpusError(null)
      return
    }
    let cancelled = false
    listProductImportCorpus()
      .then((rows) => {
        if (!cancelled) setCorpus(rows)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          // An unreachable catalogue must not read as "no duplicates found".
          setCorpus(null)
          setCorpusError(err instanceof Error ? err.message : String(err))
        }
      })
    return () => {
      cancelled = true
    }
  }, [readyToPreview, dataRows.length, corpusRetry])

  const results: ProductImportRowResult[] = useMemo(() => {
    if (!readyToPreview || categories === null) return []
    return buildProductImportPreview(
      dataRows,
      mapping,
      { categories, existing: corpus ?? [] },
      skippedRows,
    )
  }, [dataRows, mapping, readyToPreview, categories, corpus, skippedRows])

  const includedRows = results.filter((row) => !row.skip)
  const readyRows = includedRows.filter((row) => row.errors.length === 0 && row.record)
  const errorRows = includedRows.filter((row) => row.errors.length > 0)
  const serialisedReady = readyRows.some((row) => row.record?.tracking === 'Serialised')
  const serialHomeOk = !serialisedReady || (warehouseName.trim().length > 0 && rack.trim().length > 0)
  const commitReady =
    readyToPreview &&
    categories !== null &&
    corpus !== null &&
    !corpusError &&
    !categoriesError &&
    !parseError &&
    errorRows.length === 0 &&
    readyRows.length > 0 &&
    serialHomeOk &&
    !busy

  const savedCount = outcomes.filter((row) => row.status === 'saved').length

  function handleFile(file: File) {
    if (busy) return
    const version = ++fileVersion.current
    setFileName(null)
    setRawRows([])
    setOutcomes([])
    setCommitError('')
    setParseError(null)
    setMapping({})
    setSkippedRows(new Set())
    setCorpus(null)
    setCorpusError(null)
    file
      .text()
      .then((text) => {
        if (version !== fileVersion.current) return
        const parsed = parseCsv(text.replace(/^\uFEFF/, ''))
        // ⛔ A file the parser could not read must not reach the mapping step
        // (R3-6, same rule as the clients import): the operator sees WHY.
        if (!parsed.ok) {
          setParseError(parsed.errors.join(' '))
          return
        }
        if (parsed.rows.length === 0) {
          setParseError('That file has no rows.')
          return
        }
        setFileName(file.name)
        setRawRows(parsed.rows)
        const first = parsed.rows[0]!
        const guesses: Record<number, ProductImportTargetField> = {}
        first.forEach((h, i) => {
          guesses[i] = guessProductTargetField(h)
        })
        setMapping(guesses)
      })
      .catch(() => {
        if (version === fileVersion.current) setParseError('Could not read that file — make sure it is a plain-text CSV.')
      })
  }

  function reset() {
    if (busy) return
    fileVersion.current += 1
    setFileName(null)
    setRawRows([])
    setOutcomes([])
    setCommitError('')
    setMapping({})
    setParseError(null)
    setSkippedRows(new Set())
    setCorpus(null)
    setCorpusError(null)
  }

  async function runImport() {
    if (submitGuard.current || !user || !online || !commitReady) return
    submitGuard.current = true
    stopRequested.current = false
    setStopping(false)
    setBusy(true)
    setCommitError('')
    const prepared = readyRows.map((row) => ({
      rowIndex: row.rowIndex,
      clientUuid: newClientUuid(),
      values: row.record!,
      ...(row.record!.tracking === 'Serialised'
        ? { unitUuids: row.record!.serials.map(() => newClientUuid()) }
        : {}),
    }))
    setOutcomes(prepared.map((row) => ({ rowIndex: row.rowIndex, status: 'pending' as const })))
    try {
      const result = await importProducts(
        {
          rows: prepared,
          onProgress: (next) => setOutcomes([...next]),
          shouldStop: () => stopRequested.current,
          ...(serialisedReady
            ? { serialHome: { warehouseName: warehouseName.trim(), rack: rack.trim(), shelf: shelf.trim(), bin: bin.trim() } }
            : {}),
        },
        { userId: user.id, role: user.role, isOnline: online },
      )
      setOutcomes([...result.outcomes])
      if (result.outcomes.every((row) => row.status === 'saved')) onDone?.()
    } catch (error: unknown) {
      setCommitError(error instanceof Error ? error.message : 'The import could not finish. Your file and mappings are still here.')
    } finally {
      setBusy(false)
      setStopping(false)
      submitGuard.current = false
    }
  }

  const kpis: Kpi[] = [
    {
      label: 'Rows in file',
      value: String(dataRows.length),
      icon: 'checklist',
      accent: 'primary',
      ...(fileName ? { detail: fileName } : {}),
      zeroExplanation: 'The file has no data rows under its header.',
    },
    {
      label: 'Ready to import',
      value: readyRows.length === 0 ? '0' : String(readyRows.length),
      icon: 'check',
      accent: 'success',
      zeroExplanation: 'No row passed the dry-run yet — map every required column and fix the errors below.',
    },
    {
      label: 'Rows with errors',
      value: errorRows.length === 0 ? '0' : String(errorRows.length),
      icon: 'alert_triangle',
      accent: errorRows.length > 0 ? 'danger' : 'neutral',
      zeroExplanation: 'Every row is valid — nothing to fix.',
    },
    {
      label: 'Possible duplicates',
      value: corpus === null ? '—' : String(includedRows.filter((row) => row.duplicateOf).length),
      icon: 'copy',
      accent: 'neutral',
      ...(corpus === null ? { detail: 'checking the catalogue…' } : {}),
      zeroExplanation: 'No row matches an existing catalogue product.',
    },
  ]

  return (
    <div className="client-import" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>
      <ScreenHeader
        embedded={embedded}
        icon="upload"
        title="Import equipment catalogue"
        description="Upload a CSV, map its columns, review the dry-run, then import. Existing products are never overwritten — a duplicate blocks the commit."
      />

      {!online && (
        <Card title="Connect to import">
          <p style={{ margin: 0 }}>
            Importing needs the database's asset-code allocator, so it is refused offline — never queued. Your file and
            mappings stay on this screen.
          </p>
        </Card>
      )}

      {/* ── 1 · the file ─────────────────────────────────────────────────── */}
      <Card
        title="1 · Choose a file"
        bodyStyle={{ padding: 'var(--sp-md)' }}
        action={
          <Button icon="download" onClick={downloadSampleCsv}>
            Sample CSV
          </Button>
        }
      >
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            const file = e.dataTransfer.files[0]
            if (file) handleFile(file)
          }}
          style={{
            border: `2px dashed ${dragOver ? 'var(--nav-active-accent)' : 'var(--border)'}`,
            borderRadius: 'var(--r-card)',
            padding: 'var(--sp-lg)',
            textAlign: 'center',
            background: dragOver ? 'var(--select-bg)' : 'transparent',
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleFile(file)
              e.target.value = ''
            }}
          />
          <p style={{ marginTop: 0 }}>Drag a CSV here, or</p>
          <Button icon="upload" onClick={() => fileInputRef.current?.click()}>
            Choose file
          </Button>
          <p style={{ marginBottom: 0 }}>
            The sample shows every supported column. On-hand stock columns have no mapping target — a stock count is never
            written by an import.
          </p>
        </div>
        {parseError && (
          <p role="alert" style={{ color: 'var(--danger-text)', marginBottom: 0 }}>
            {parseError}
          </p>
        )}
        {fileName && (
          <p className="client-import-file-summary" style={{ marginBottom: 0 }}>
            <strong>{fileName}</strong> — {dataRows.length} data row{dataRows.length === 1 ? '' : 's'}
            <label style={{ marginLeft: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <input
                type="checkbox"
                checked={hasHeaderRow}
                onChange={(e) => setHasHeaderRow(e.target.checked)}
                style={{ width: 18, height: 18 }}
              />
              First row is a header
            </label>
          </p>
        )}
      </Card>

      {/* ── 2 · the mapping ──────────────────────────────────────────────── */}
      {rawRows.length > 0 && (
        <Card title="2 · Map columns" bodyStyle={{ padding: 0 }}>
          <DataTableShell ariaLabel="Column mapping" data-table-scroll style={{ overflowX: 'auto' }}>
            <table className="client-import-preview" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th scope="col" style={{ textAlign: 'left', padding: 8 }}>CSV column</th>
                  <th scope="col" style={{ textAlign: 'left', padding: 8 }}>Maps to</th>
                </tr>
              </thead>
              <tbody>
                {headers.map((header, index) => (
                  /*
                   * Index key, deliberately: a column's identity in this screen
                   * IS its position. `mapping` is keyed by the same index, so
                   * two columns both called "Name" must stay distinct rows —
                   * a header-string key would collide and drop one.
                   */
                  <tr key={index}>
                    <td style={{ padding: 8, maxWidth: 280, overflowWrap: 'anywhere' }}>{header}</td>
                    <td style={{ padding: 8 }}>
                      <select
                        aria-label={`Map column ${header} to a field`}
                        value={mapping[index] ?? 'skip'}
                        onChange={(e) =>
                          setMapping((current) => ({ ...current, [index]: e.target.value as ProductImportTargetField }))
                        }
                        style={{ ...inputStyle, width: 'min(320px, 100%)' }}
                      >
                        {PRODUCT_IMPORT_TARGET_FIELDS.map((field) => (
                          <option key={field.key} value={field.key}>
                            {field.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTableShell>
          {mappingErrors.map((error) => (
            <p key={error} role="alert" style={{ color: 'var(--danger-text)', margin: '8px 12px 12px' }}>
              {error}
            </p>
          ))}
          {categoriesError && (
            <p role="alert" style={{ color: 'var(--danger-text)', margin: '8px 12px 12px' }}>
              The category list could not be read: {categoriesError}
            </p>
          )}
        </Card>
      )}

      {/* ── 3 · the dry-run ──────────────────────────────────────────────── */}
      {readyToPreview && (
        <Card
          title="3 · Preview & validate"
          bodyStyle={{ padding: 0 }}
          {...(corpusError
            ? {
                action: (
                  <Button
                    onClick={() => {
                      setCorpusError(null)
                      setCorpusRetry((n) => n + 1)
                    }}
                  >
                    Retry duplicate check
                  </Button>
                ),
              }
            : {})}
        >
          <KpiStrip items={kpis} />
          {corpusError && (
            <p role="alert" style={{ color: 'var(--danger-text)', margin: '8px 12px' }}>
              The catalogue could not be read, so duplicates cannot be checked: {corpusError} Nothing can be imported until
              this check runs.
            </p>
          )}
          {serialisedReady && (
            <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)' }}>
              <p style={{ marginTop: 4, fontWeight: 600 }}>
                Where do the imported serialised units land? One facility for the whole file — re-shelve afterwards.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <Select
                  aria-label="Warehouse for imported serialised units"
                  value={warehouseName}
                  onChange={(e) => setWarehouseName(e.target.value)}
                  options={[
                    { value: '', label: warehouses.loading ? 'Loading warehouses…' : 'Choose a warehouse' },
                    ...warehouses.rows.map((w) => ({ value: w.name, label: w.name })),
                  ]}
                  style={{ ...inputStyle, width: 'min(260px, 100%)' }}
                />
                {[
                  { label: 'Rack', value: rack, set: setRack },
                  { label: 'Shelf', value: shelf, set: setShelf },
                  { label: 'Bin', value: bin, set: setBin },
                ].map((part) => (
                  <label key={part.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span>{part.label}</span>
                    <input
                      type="text"
                      value={part.value}
                      onChange={(e) => part.set(e.target.value)}
                      aria-label={`${part.label} for imported units`}
                      style={{ ...inputStyle, width: 120 }}
                    />
                  </label>
                ))}
              </div>
              {!serialHomeOk && (
                <p role="alert" style={{ color: 'var(--danger-text)', marginBottom: 4 }}>
                  Choose a warehouse and name a rack — product_units.warehouse_id is NOT NULL and every unit needs a
                  position.
                </p>
              )}
            </div>
          )}
          <DataTableShell ariaLabel="Import preview" data-table-scroll style={{ overflowX: 'auto' }}>
            <table className="client-import-preview" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th scope="col" style={{ textAlign: 'left', padding: 8 }}>Row</th>
                  <th scope="col" style={{ textAlign: 'left', padding: 8 }}>Product</th>
                  <th scope="col" style={{ textAlign: 'left', padding: 8 }}>Tracking</th>
                  <th scope="col" style={{ textAlign: 'left', padding: 8 }}>Dry-run result</th>
                  <th scope="col" style={{ textAlign: 'left', padding: 8 }}>Skip</th>
                </tr>
              </thead>
              <tbody>
                {results.map((row) => {
                  const outcome = outcomes.find((o) => o.rowIndex === row.rowIndex)
                  return (
                    <tr key={row.rowIndex} style={{ opacity: row.skip ? 0.55 : 1 }}>
                      <td style={{ padding: 8 }}>{row.rowIndex + 1}</td>
                      <td style={{ padding: 8, maxWidth: 260, overflowWrap: 'anywhere' }}>
                        {row.record?.name ?? '—'}
                        {row.record && (
                          <span style={{ display: 'block', color: 'var(--muted)', fontSize: 'var(--t-th)' }}>
                            {row.record.brand}
                            {row.record.model ? ` · ${row.record.model}` : ''} · {row.record.category}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: 8 }}>
                        {row.record
                          ? row.record.tracking === 'Serialised'
                            ? `Serialised (${row.record.serials.length} unit${row.record.serials.length === 1 ? '' : 's'})`
                            : `${row.record.tracking} (${row.record.quantity ?? 0})`
                          : '—'}
                      </td>
                      <td style={{ padding: 8, maxWidth: 360, overflowWrap: 'anywhere' }}>
                        {outcome ? (
                          outcome.status === 'saved' ? (
                            <span>
                              Saved as {outcome.assetCode}
                              {outcome.message ? ` — ${outcome.message}` : ''}
                            </span>
                          ) : (
                            <span>{outcome.message ?? outcome.status}</span>
                          )
                        ) : row.errors.length > 0 ? (
                          <span role="alert" style={{ color: 'var(--danger-text)' }}>
                            {row.errors.join(' ')}
                          </span>
                        ) : row.duplicateOf ? (
                          <span style={{ color: 'var(--danger-text)' }}>Matches an existing catalogue product</span>
                        ) : (
                          <span style={{ color: 'var(--success-text)' }}>Ready</span>
                        )}
                      </td>
                      <td style={{ padding: 8 }}>
                        <input
                          type="checkbox"
                          aria-label={`Skip row ${row.rowIndex + 1}`}
                          checked={row.skip}
                          disabled={busy || outcome?.status === 'saved'}
                          onChange={(e) =>
                            setSkippedRows((current) => {
                              const next = new Set(current)
                              if (e.target.checked) next.add(row.rowIndex)
                              else next.delete(row.rowIndex)
                              return next
                            })
                          }
                          style={{ width: 18, height: 18 }}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </DataTableShell>
        </Card>
      )}

      {/* ── 4 · the commit ───────────────────────────────────────────────── */}
      {readyToPreview && (
        <Card title="4 · Import" bodyStyle={{ padding: 'var(--sp-md)' }}>
          {commitError && (
            <p role="alert" style={{ color: 'var(--danger-text)', marginTop: 0 }}>
              {commitError}
            </p>
          )}
          <div className="client-import-actions">
            <Button
              variant="primary"
              icon="check"
              disabled={!commitReady}
              {...(commitReady ? {} : { title: 'Every row must pass the dry-run, and the duplicate check must have finished.' })}
              onClick={runImport}
            >
              Import {readyRows.length} product{readyRows.length === 1 ? '' : 's'} as Drafts
            </Button>
            {busy && (
              <Button
                onClick={() => {
                  stopRequested.current = true
                  setStopping(true)
                }}
                disabled={stopping}
              >
                {stopping ? 'Stopping…' : 'Stop after this row'}
              </Button>
            )}
            {!busy && (savedCount > 0 || fileName) && (
              <Button
                onClick={() => {
                  reset()
                  onDone?.()
                }}
              >
                {savedCount > 0 ? 'Done — back to Inventory' : 'Start over'}
              </Button>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}
