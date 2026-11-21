import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Select } from '../../components/ui'
import { Card, Button, KpiStrip } from '../../components/ui/Page'
import { ScreenHeader } from '../../components/ui/ScreenHeader'
import { DataTableShell } from '../../components/ui/DataTable'
import { RestrictedState } from '../../components/ui/StateViews'
import { useUnsavedRecord } from '../../components/ui/RecordWorkspace'
import { useAuth } from '../../lib/auth'
import { useNetwork } from '../../lib/network'
import { parseCsv, csvCell } from '../../lib/csv'
import {
  PRICING_IMPORT_TARGET_FIELDS,
  PRICING_IMPORT_SAMPLE_HEADERS,
  PRICING_IMPORT_SAMPLE_ROW,
  guessPricingTargetField,
  buildPricingImportPreview,
  pricingMappingErrors,
  canImportPricingStructures,
  type PricingImportTargetField,
  type PricingImportRowResult,
  type ExistingStructureRef,
} from '../../lib/pricingStructureImport'
import { importPricingStructures, type ImportPricingStructuresOutcome } from '../../actions/inventory/importPricingStructures'
import '../clients/import-center.css'

/**
 * # Pricing Structures CSV Import — Booqable adoption
 * B4, B45, D20: "Babin Daily", "Days wise discount", "Rental Rate Card" + 4 seasonal rulesets
 * with end dates so they expire on their own.
 */

function downloadSampleCsv() {
  const lines = [PRICING_IMPORT_SAMPLE_HEADERS.join(','), PRICING_IMPORT_SAMPLE_ROW.map((v) => csvCell(String(v))).join(',')]
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'pricing-structures-import-sample.csv'
  a.click()
  URL.revokeObjectURL(url)
}

export interface PricingStructuresImportCenterProps {
  embedded?: boolean
  onDone?: () => void
}

export default function PricingStructuresImportCenter({ embedded = false, onDone }: PricingStructuresImportCenterProps = {}) {
  const { user } = useAuth()
  if (!user || !canImportPricingStructures(user.role)) return <RestrictedState />
  return <PricingStructuresImportForm key={user.id} embedded={embedded} {...(onDone ? { onDone } : {})} />
}

function PricingStructuresImportForm({ embedded = false, onDone }: PricingStructuresImportCenterProps = {}) {
  const online = useNetwork()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const fileVersion = useRef(0)

  const [fileName, setFileName] = useState<string | null>(null)
  const [rawRows, setRawRows] = useState<string[][]>([])
  const [hasHeaderRow, setHasHeaderRow] = useState(true)
  const [mapping, setMapping] = useState<Record<number, PricingImportTargetField>>({})
  const [parseError, setParseError] = useState<string | null>(null)
  const [skippedRows, setSkippedRows] = useState<Set<number>>(new Set())
  const [dragOver, setDragOver] = useState(false)

  const [existingStructures] = useState<ExistingStructureRef[] | null>(null)

  const [busy, setBusy] = useState(false)
  const [commitError, setCommitError] = useState('')
  const [outcomes, setOutcomes] = useState<ImportPricingStructuresOutcome[]>([])
  const unfinished = busy || outcomes.some((row) => row.status === 'pending' || row.status === 'unconfirmed')
  useUnsavedRecord(unfinished)

  const headers = useMemo(() => {
    if (rawRows.length === 0) return []
    const first = rawRows[0]!
    return hasHeaderRow ? first : first.map((_, i) => `Column ${i + 1}`)
  }, [rawRows, hasHeaderRow])

  const dataRows = useMemo(() => (hasHeaderRow ? rawRows.slice(1) : rawRows), [rawRows, hasHeaderRow])

  const mappedFields = useMemo(() => new Set(Object.values(mapping)), [mapping])
  const structureNameMapped = mappedFields.has('structure_name')
  const tileDurationMapped = mappedFields.has('tile_duration_days')
  const tileAmountMapped = mappedFields.has('tile_amount')
  const mappingErrors = useMemo(() => pricingMappingErrors(headers, mapping), [headers, mapping])
  const readyToPreview = structureNameMapped && tileDurationMapped && tileAmountMapped && mappingErrors.length === 0

  const [preview, setPreview] = useState<readonly PricingImportRowResult[]>([])

  useEffect(() => {
    if (!readyToPreview || dataRows.length === 0) {
      setPreview([])
      return
    }
    const previewData = buildPricingImportPreview({
      rawRows,
      hasHeaderRow,
      mapping,
      existingStructures: existingStructures ?? [],
      skippedRows: skippedRows,
    })
    setPreview(previewData)
  }, [readyToPreview, rawRows, hasHeaderRow, dataRows, mapping, existingStructures, skippedRows])

  const handleFile = (file: File) => {
    if (!file.name.endsWith('.csv')) {
      setParseError('Please select a CSV file.')
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      try {
        const parsed = parseCsv(text.replace(/^\uFEFF/, ''))
        if (!parsed.ok) {
          setParseError(parsed.errors.join('; '))
          return
        }
        if (parsed.rows.length === 0) {
          setParseError('That file has no rows.')
          return
        }
        setRawRows(parsed.rows)
        fileVersion.current += 1
        setFileName(file.name)
        setHasHeaderRow(true)
        setParseError(null)
        // Auto-guess mapping
        const firstRow = parsed.rows[0]!
        const guessed: Record<number, PricingImportTargetField> = {}
        firstRow.forEach((header, index) => {
          const guessedField = header ? guessPricingTargetField(header) : 'skip'
          guessed[index] = guessedField
        })
        setMapping(guessed)
        setSkippedRows(new Set())
      } catch (err) {
        setParseError(err instanceof Error ? err.message : 'Failed to parse CSV.')
      }
    }
    reader.readAsText(file)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(true)
  }
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
  }
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  async function handleCommit() {
    if (!preview.length) return
    if (!online) {
      setCommitError('Connect to import pricing structures.')
      return
    }
    setBusy(true)
    setCommitError('')
    try {
      const structures = preview
        .filter((r) => !r.skip && !r.errors.length && r.record)
        .map((r) => r.record!)
      const res = await importPricingStructures({
        structures,
        clientUuid: crypto.randomUUID(),
        note: 'Imported from Booqable CSV',
      })
      // Update outcomes
      setOutcomes(res.structures.map((s) => ({
        rowIndex: preview.findIndex((r) => r.record?.name === s.name),
        status: 'saved',
        productId: s.id,
        message: `${s.action === 'created' ? 'Created' : 'Updated'} pricing structure "${s.name}".`,
      })))
      if (onDone) onDone()
    } catch (err) {
      setCommitError(err instanceof Error ? err.message : 'Import failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card style={embedded ? { border: 'none', boxShadow: 'none', padding: 0 } : cardStyle}>
      {!embedded && (
        <ScreenHeader
          title="Import Pricing Structures"
          description="Import Booqable pricing structures, rulesets and rules from CSV. Dry-run first, then commit."
          actions={<Button variant="secondary" onClick={downloadSampleCsv}>Download Sample CSV</Button>}
        />
      )}
      <form
        onSubmit={(e) => { e.preventDefault(); handleCommit() }}
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-lg)' }}
      >
        {embedded && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-md)' }}>
            <h2 style={{ margin: 0, fontSize: 'var(--t-h3)' }}>Import Pricing Structures</h2>
            <Button variant="secondary" type="button" onClick={downloadSampleCsv}>Download Sample CSV</Button>
          </div>
        )}

        {/* File Drop Zone */}
        <div
          role="group"
          aria-label="CSV upload — drop a file here or use Choose file"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          style={{
            border: `2px dashed ${dragOver ? 'var(--brand)' : 'var(--border)'}`,
            borderRadius: 'var(--r-card)',
            padding: 'var(--sp-xl)',
            textAlign: 'center',
            background: dragOver ? 'var(--brand-bg)' : 'var(--card2)',
            cursor: 'pointer',
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileInput}
            style={{ display: 'none' }}
            id="pricing-structures-csv"
          />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--sp-xs)' }}>
            <div style={{ fontSize: 'var(--t-body)', color: 'var(--text)', marginBottom: 'var(--sp-xs)' }}>
              Drag & drop a CSV file here, or click to browse
            </div>
            <Button variant="secondary" type="button" icon="upload" onClick={() => fileInputRef.current?.click()}>
              Choose file
            </Button>
            <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginTop: 'var(--sp-xs)' }}>
              Must be a .csv file with headers
            </div>
          </div>
        </div>

        {parseError && (
          <div role="alert" style={{ color: 'var(--danger-text)', fontSize: 'var(--t-meta)', marginTop: 'var(--sp-sm)' }}>
            {parseError}
          </div>
        )}

        {fileName && (
          <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginTop: 'var(--sp-sm)' }}>
            File: <strong>{fileName}</strong> — {rawRows.length - (hasHeaderRow ? 1 : 0)} data rows
          </div>
        )}

        {/* Mapping */}
        {rawRows.length > 0 && (
          <Card style={{ marginTop: 'var(--sp-lg)' }}>
            <div style={{ fontWeight: 600, marginBottom: 'var(--sp-md)' }}>Column Mapping</div>
            {mappingErrors.length > 0 && (
              <div role="alert" style={{ color: 'var(--danger-text)', fontSize: 'var(--t-meta)', marginBottom: 'var(--sp-md)' }}>
                {mappingErrors.map((e, idx) => <div key={idx}>{e}</div>)}
              </div>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-md)' }}>
              {headers.map((header, index) => (
                <div key={index} style={{ minWidth: 200, flex: '1 1 200px' }}>
                  <label style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
                    {header}
                  </label>
                  <Select
                    value={mapping[index] || 'skip'}
                    onChange={(e) => setMapping((prev) => ({ ...prev, [index]: e.target.value as PricingImportTargetField }))}
                    options={PRICING_IMPORT_TARGET_FIELDS.map((f) => ({ value: f.key, label: f.label }))}
                    style={{ minHeight: 44, fontSize: 'var(--t-meta)' }}
                  />
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Preview */}
        {preview.length > 0 && (
          <Card style={{ marginTop: 'var(--sp-lg)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-md)' }}>
              <div style={{ fontWeight: 600 }}>Dry-run Preview ({preview.filter((r) => !r.skip).length} structures)</div>
              <KpiStrip
                items={[
                  { label: 'Valid', value: String(preview.filter((r) => !r.skip && !r.errors.length).length), icon: 'check', accent: 'success' },
                  { label: 'Errors', value: String(preview.filter((r) => r.errors.length > 0).length), icon: 'alert_triangle', accent: 'danger' },
                  { label: 'Skipped', value: String(preview.filter((r) => r.skip).length), icon: 'checklist', accent: 'neutral' },
                  { label: 'Duplicates', value: String(preview.filter((r) => Boolean(r.duplicateOf)).length), icon: 'copy', accent: 'warn' },
                ]}
              />
            </div>
            <DataTableShell ariaLabel="Pricing structures preview">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                    <th style={cellStyle}>Row</th>
                    <th style={cellStyle}>Structure Name</th>
                    <th style={cellStyle}>Tiles</th>
                    <th style={cellStyle}>Rulesets</th>
                    <th style={cellStyle}>Status</th>
                    <th style={cellStyle}>Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={cellStyle}>{r.rowIndex + 1}</td>
                      <td style={cellStyle}>{r.record?.name ?? '—'}</td>
                      <td style={cellStyle}>{r.record?.tiles.length ?? 0}</td>
                      <td style={cellStyle}>{r.record?.rulesets.length ?? 0}</td>
                      <td style={cellStyle}>
                        {r.skip ? <span style={{ color: 'var(--muted)' }}>Skipped</span> : r.errors.length ? <span style={{ color: 'var(--danger)' }}>Errors</span> : r.duplicateOf ? <span style={{ color: 'var(--warning)' }}>Duplicate</span> : <span style={{ color: 'var(--success)' }}>Valid</span>}
                      </td>
                      <td style={cellStyle}>
                        {r.errors.length > 0 && (
                          <div style={{ fontSize: 'var(--t-meta)', color: 'var(--danger-text)', maxWidth: 300 }}>
                            {r.errors.join('; ')}
                          </div>
                        )}
                        {r.duplicateOf && (
                          <div style={{ fontSize: 'var(--t-meta)', color: 'var(--warning-text)' }}>
                            Duplicate of: {r.duplicateOf.name}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTableShell>
          </Card>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-md)', marginTop: 'var(--sp-lg)' }}>
          <Button variant="secondary" type="button" disabled={busy} onClick={() => onDone?.()}>
            Done
          </Button>
          <Button variant="primary" type="submit" disabled={busy || !preview.some((r) => !r.skip && !r.errors.length)} loading={busy}>
            {busy ? 'Importing…' : 'Import Pricing Structures'}
          </Button>
        </div>

        {commitError && (
          <div role="alert" style={{ color: 'var(--danger-text)', fontSize: 'var(--t-meta)', marginTop: 'var(--sp-md)' }}>
            {commitError}
          </div>
        )}
      </form>
    </Card>
  )
}

const cellStyle: CSSProperties = {
  padding: '8px 12px',
  fontSize: 'var(--t-meta)',
  color: 'var(--text)',
  borderBottom: '1px solid var(--border)',
  verticalAlign: 'top',
}

const cardStyle: CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-card)',
  background: 'var(--card)',
  padding: 'var(--sp-lg)',
}
