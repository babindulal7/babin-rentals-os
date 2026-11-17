import { useState, useCallback } from 'react'
import { Card, Button } from '../../components/ui/Page'
import { PageBody } from '../../components/ui/PageBody'
import { RestrictedState } from '../../components/ui/StateViews'
import Icon from '../../components/ui/Icon'
import { useToast } from '../../components/ui/Toast'
import { useAuth } from '../../lib/auth'
import { BS_MONTHS, BS_MIN_YEAR, BS_MAX_YEAR, toBs } from '../../lib/bs'
import {
  generateMonthlyPack,
  resolveMonthlyPackPeriod,
  type MonthCalendar,
  type MonthlyPackResult,
} from '../../lib/monthlyPack'
import type { SystemRole } from '../../types/database'

export function canAccountantExport(role: SystemRole | null | undefined): boolean {
  if (!role) return false
  return role === 'Owner' || role === 'Admin' || role === 'Manager' || role === 'Accounts'
}

export default function MonthlyPack() {
  const { user } = useAuth()
  const { showSuccessToast } = useToast()

  const userRole = (user?.role as SystemRole) ?? null
  const isAllowed = canAccountantExport(userRole)

  // Current date anchor
  const now = new Date()
  const currentBs = toBs(now)

  // Form states
  const [calendar, setCalendar] = useState<MonthCalendar>('BS')
  const [bsYear, setBsYear] = useState<number>(currentBs?.year ?? 2083)
  const [bsMonth, setBsMonth] = useState<number>(currentBs?.month ?? 4) // default Shrawan

  const [adYear, setAdYear] = useState<number>(now.getFullYear())
  const [adMonth, setAdMonth] = useState<number>(now.getMonth() + 1)

  const [includePdfs, setIncludePdfs] = useState<boolean>(false)

  const [generating, setGenerating] = useState<boolean>(false)
  const [result, setResult] = useState<MonthlyPackResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Selected period metadata
  const selectedYear = calendar === 'BS' ? bsYear : adYear
  const selectedMonth = calendar === 'BS' ? bsMonth : adMonth

  let periodInfo: ReturnType<typeof resolveMonthlyPackPeriod> | null = null
  try {
    periodInfo = resolveMonthlyPackPeriod(calendar, selectedYear, selectedMonth)
  } catch {
    periodInfo = null
  }

  const handleGenerateAndDownload = useCallback(async () => {
    if (!isAllowed) return
    setGenerating(true)
    setError(null)
    try {
      const pack = await generateMonthlyPack({
        calendar,
        year: selectedYear,
        month: selectedMonth,
        includeInvoicePdfs: includePdfs,
      })

      setResult(pack)

      // Trigger automatic browser download
      if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        const downloadUrl = URL.createObjectURL(pack.zipBlob)
        const a = document.createElement('a')
        a.href = downloadUrl
        a.download = pack.filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000)
      }

      showSuccessToast(
        'Monthly Pack Generated',
        `Downloaded ${pack.filename} (${(pack.fileSizeBytes / 1024).toFixed(1)} KB) with ${pack.counts.invoices} invoices and ${pack.counts.payments} payments.`,
      )
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not generate monthly accountant pack.')
    } finally {
      setGenerating(false)
    }
  }, [calendar, selectedYear, selectedMonth, includePdfs, isAllowed, showSuccessToast])

  if (!isAllowed) {
    return (
      <PageBody>
        <RestrictedState
          requiredRole="Accounts"
          reason="Only Owner, Admin, Manager, and Accounts can access the Accountant Monthly Export Pack."
        />
      </PageBody>
    )
  }

  return (
    <PageBody>
      <div style={{ maxWidth: 900, margin: '0 auto', display: 'grid', gap: 'var(--sp-md)' }}>
        <div>
          <h2 style={{ margin: '0 0 4px', fontSize: 'var(--t-h2)', fontWeight: 700 }}>
            Accountant Monthly Export Pack
          </h2>
          <p style={{ margin: 0, color: 'var(--text2)', fontSize: 'var(--t-body)' }}>
            Statutory accounting bundle for Nepal Inland Revenue Department (IRD) filing and audit reconciliation.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            style={{
              padding: '12px 16px',
              borderRadius: 'var(--r-md)',
              background: 'var(--danger-surface, rgba(239, 68, 68, 0.1))',
              color: 'var(--danger-text, #ef4444)',
              fontSize: 'var(--t-body)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Icon name="alert_circle" size={18} />
            <span>{error}</span>
          </div>
        )}

        <Card title="Export Parameters">
          <div style={{ display: 'grid', gap: 'var(--sp-md)' }}>
            {/* Calendar mode switch */}
            <div>
              <label style={{ display: 'block', fontWeight: 600, fontSize: 'var(--t-small)', marginBottom: 6 }}>
                Calendar System
              </label>
              <div style={{ display: 'inline-flex', borderRadius: 'var(--r-btn)', border: '1px solid var(--border)', overflow: 'hidden' }}>
                <button
                  type="button"
                  onClick={() => setCalendar('BS')}
                  style={{
                    padding: '8px 16px',
                    border: 'none',
                    background: calendar === 'BS' ? 'var(--primary)' : 'var(--card)',
                    color: calendar === 'BS' ? 'var(--primary-contrast, #fff)' : 'var(--text)',
                    fontWeight: calendar === 'BS' ? 700 : 500,
                    cursor: 'pointer',
                  }}
                >
                  Bikram Sambat (BS)
                </button>
                <button
                  type="button"
                  onClick={() => setCalendar('AD')}
                  style={{
                    padding: '8px 16px',
                    border: 'none',
                    borderLeft: '1px solid var(--border)',
                    background: calendar === 'AD' ? 'var(--primary)' : 'var(--card)',
                    color: calendar === 'AD' ? 'var(--primary-contrast, #fff)' : 'var(--text)',
                    fontWeight: calendar === 'AD' ? 700 : 500,
                    cursor: 'pointer',
                  }}
                >
                  Gregorian (AD)
                </button>
              </div>
            </div>

            {/* Year & Month select */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--sp-md)' }}>
              {calendar === 'BS' ? (
                <>
                  <div>
                    <label htmlFor="bs-year-select" style={{ display: 'block', fontWeight: 600, fontSize: 'var(--t-small)', marginBottom: 6 }}>
                      Fiscal / BS Year
                    </label>
                    <select
                      id="bs-year-select"
                      value={bsYear}
                      onChange={(e) => setBsYear(Number(e.target.value))}
                      disabled={generating}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: 'var(--r-btn)',
                        border: '1px solid var(--border)',
                        background: 'var(--card)',
                        color: 'var(--text)',
                        minHeight: 44,
                      }}
                    >
                      {Array.from({ length: BS_MAX_YEAR - BS_MIN_YEAR + 1 }, (_, i) => BS_MIN_YEAR + i).map((y) => (
                        <option key={y} value={y}>
                          {y} BS
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="bs-month-select" style={{ display: 'block', fontWeight: 600, fontSize: 'var(--t-small)', marginBottom: 6 }}>
                      BS Month
                    </label>
                    <select
                      id="bs-month-select"
                      value={bsMonth}
                      onChange={(e) => setBsMonth(Number(e.target.value))}
                      disabled={generating}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: 'var(--r-btn)',
                        border: '1px solid var(--border)',
                        background: 'var(--card)',
                        color: 'var(--text)',
                        minHeight: 44,
                      }}
                    >
                      {BS_MONTHS.map((m, idx) => (
                        <option key={m} value={idx + 1}>
                          {m} (Month {idx + 1})
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label htmlFor="ad-year-select" style={{ display: 'block', fontWeight: 600, fontSize: 'var(--t-small)', marginBottom: 6 }}>
                      AD Year
                    </label>
                    <select
                      id="ad-year-select"
                      value={adYear}
                      onChange={(e) => setAdYear(Number(e.target.value))}
                      disabled={generating}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: 'var(--r-btn)',
                        border: '1px solid var(--border)',
                        background: 'var(--card)',
                        color: 'var(--text)',
                        minHeight: 44,
                      }}
                    >
                      {[2024, 2025, 2026, 2027].map((y) => (
                        <option key={y} value={y}>
                          {y} AD
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="ad-month-select" style={{ display: 'block', fontWeight: 600, fontSize: 'var(--t-small)', marginBottom: 6 }}>
                      AD Month
                    </label>
                    <select
                      id="ad-month-select"
                      value={adMonth}
                      onChange={(e) => setAdMonth(Number(e.target.value))}
                      disabled={generating}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: 'var(--r-btn)',
                        border: '1px solid var(--border)',
                        background: 'var(--card)',
                        color: 'var(--text)',
                        minHeight: 44,
                      }}
                    >
                      {[
                        'January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December',
                      ].map((m, idx) => (
                        <option key={m} value={idx + 1}>
                          {m} ({idx + 1})
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>

            {/* Include Invoice PDFs Checkbox */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
              <input
                id="include-pdfs-checkbox"
                type="checkbox"
                checked={includePdfs}
                onChange={(e) => setIncludePdfs(e.target.checked)}
                disabled={generating}
                style={{ width: 18, height: 18, cursor: 'pointer' }}
              />
              <label htmlFor="include-pdfs-checkbox" style={{ fontSize: 'var(--t-body)', cursor: 'pointer' }}>
                Include individual invoice PDF copies under <code>invoices/</code> folder
              </label>
            </div>

            {/* Period Details Preview Box */}
            {periodInfo && (
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: 'var(--r-md)',
                  background: 'var(--card2)',
                  border: '1px solid var(--border)',
                  fontSize: 'var(--t-small)',
                  display: 'grid',
                  gap: 4,
                }}
              >
                <div>
                  <strong>Selected Period:</strong> {periodInfo.monthName}
                </div>
                <div>
                  <strong>AD Date Window:</strong> {periodInfo.startAd} to {periodInfo.endAd}
                </div>
                <div>
                  <strong>BS Date Window:</strong> {periodInfo.startBs} to {periodInfo.endBs}
                </div>
                <div>
                  <strong>Archive File:</strong> <code>Accountant_Monthly_Pack_{periodInfo.monthSlug}.zip</code>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-start', marginTop: 8 }}>
              <Button
                variant="primary"
                icon="download"
                onClick={() => void handleGenerateAndDownload()}
                disabled={generating || !periodInfo}
              >
                {generating ? 'Compiling Archive…' : 'Download Monthly Pack (ZIP)'}
              </Button>
            </div>
          </div>
        </Card>

        {/* Contents Checklist Card */}
        <Card title="Package Contents Specification">
          <div style={{ display: 'grid', gap: 'var(--sp-sm)', fontSize: 'var(--t-small)' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <Icon name="check" size={16} />
              <div>
                <strong>1. sales_register_{periodInfo?.monthSlug ?? 'month'}.csv:</strong> Full Nepal IRD Annex 5 (बिक्री खाता) standard sales book with buyer PAN, taxable turnover, and 13% Output VAT.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <Icon name="check" size={16} />
              <div>
                <strong>2. purchase_register_{periodInfo?.monthSlug ?? 'month'}.csv:</strong> Expenses and supplier purchases book (खरिद खाता).
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <Icon name="check" size={16} />
              <div>
                <strong>3. payments_received_{periodInfo?.monthSlug ?? 'month'}.csv:</strong> Cash, bank and wallet collections and client receipts.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <Icon name="check" size={16} />
              <div>
                <strong>4. tds_withheld_{periodInfo?.monthSlug ?? 'month'}.csv:</strong> Crew compensation register with withholding tax (TDS) percentages and amounts.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <Icon name="check" size={16} />
              <div>
                <strong>5. summary.txt:</strong> Executive statutory tax position, taxable turnover, Output VAT, TDS payable, and period receivables.
              </div>
            </div>
            {includePdfs && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', color: 'var(--primary)' }}>
                <Icon name="file" size={16} />
                <div>
                  <strong>6. invoices/:</strong> Individual PDF copies of all non-draft tax invoices in the period.
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Display Summary text if generated */}
        {result && (
          <Card title="Generated Summary (summary.txt)">
            <pre
              style={{
                background: 'var(--card2)',
                padding: '14px',
                borderRadius: 'var(--r-md)',
                overflowX: 'auto',
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
                margin: 0,
              }}
            >
              {result.summaryText}
            </pre>
          </Card>
        )}
      </div>
    </PageBody>
  )
}
