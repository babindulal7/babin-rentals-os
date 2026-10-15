import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, cardStyle } from '../../components/ui/Page'
import { ReportFamiliesNav } from '../../components/ui/ReportFamiliesNav'
import { ReportToolbar } from '../../components/ui/ReportToolbar'
import type { ReportCsvRow, ReportFilters } from '../../components/ui/ReportToolbar'
import { InteractiveRevenueTrend } from '../../components/ui/charts/InteractiveRevenueTrend'
import { formatMoney } from '../../lib/money'
import { businessDayAd } from '../../lib/bs'
import { useAuth } from '../../lib/auth'
import { getIssuedRevenueTrend, type IssuedRevenueReport } from '../../lib/queries/reportRevenueTrend'

/**
 * This report displays ONLY successfully fetched taxable issued-invoice values.
 * It does not pretend that a 100-row register, pulse fixture or seeded category
 * split represents the full ledger. Credit adjustments require a separate
 * reconciled ledger definition and are intentionally not claimed here.
 */
const EXECUTIVE_ROLES = new Set(['Owner', 'Admin', 'Manager', 'Accounts'])

function daysAgo(day: string, count: number): string {
  const d = new Date(day + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - count)
  return d.toISOString().slice(0, 10)
}

function readReportDate(value: string | undefined, fallback: string): string {
  if (!value) return fallback
  // ReportToolbar supplies Nepal-local date instants. The date-only portion
  // is the intended AD civil date, without coercing it through browser TZ.
  return value.slice(0, 10)
}

export default function RevenueReport() {
  const { user } = useAuth()
  const permitted = Boolean(user && EXECUTIVE_ROLES.has(user.role))
  const today = businessDayAd()
  const [filters, setFilters] = useState<ReportFilters>({})
  const [report, setReport] = useState<IssuedRevenueReport | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)

  const from = readReportDate(filters.dateRange?.fromAd, daysAgo(today, 89))
  const to = readReportDate(filters.dateRange?.toAd, today)
  const windowIsValid = from <= to && (
    (new Date(to + 'T00:00:00Z').getUTCFullYear() - new Date(from + 'T00:00:00Z').getUTCFullYear())*12 +
    new Date(to + 'T00:00:00Z').getUTCMonth() - new Date(from + 'T00:00:00Z').getUTCMonth() < 24
  )

  useEffect(() => {
    if (!permitted || !windowIsValid) return
    let active = true
    setPending(true)
    setError(null)
    setReport(null)
    void getIssuedRevenueTrend(from, to).then(data => {
      if (active) setReport(data)
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : 'Revenue report unavailable')
    }).finally(() => {
      if (active) setPending(false)
    })
    return () => { active = false }
  }, [permitted, from, to, windowIsValid, revision])

  const rows = useMemo<ReportCsvRow[]>(() => {
    if (!report) return []
    return [
      ['Issued invoice taxable revenue — actual (NPR), before VAT'],
      ['AD window', report.fromAd, report.toAd],
      ['Status', 'Issued nonvoid invoices; credit notes reconciled as paid-amount records, not subtracted from taxable sales'],
      ['Credit notes on invoices issued in window', report.creditReconciliation.creditNoteCount],
      ['Credit-note paid amounts (not taxable deductions)', formatMoney(report.creditReconciliation.creditNoteAmountPaisa)],
      ['Voided invoice taxable amounts excluded', formatMoney(report.creditReconciliation.voidedTaxablePaisa)],
      ['Paid voids needing credit review', report.creditReconciliation.paidVoidMismatchCount],
      ['Credit notes on active invoices for review', report.creditReconciliation.activeInvoiceCreditNoteCount],
      ['Month', 'Taxable value', 'Issued invoices'],
      ...report.months.map(m => [m.label, formatMoney(m.amountPaisa), m.invoiceCount] as ReportCsvRow),
      ['Total', formatMoney(report.totalPaisa), report.issuedCount],
    ]
  }, [report])

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'var(--sp-md)' }}>
      <PageHeader icon="dollar" title="Revenue Reports" description="Issued invoice taxable revenue, excluding VAT and unissued or void invoices." />
      <ReportFamiliesNav current="Revenue" />
      {!permitted ? (
        <section style={cardStyle} aria-label="Restricted revenue report">
          <p>Revenue intelligence is restricted to Owner, Admin, Manager and Accounts.</p>
        </section>
      ) : (
        <>
          <ReportToolbar title="Revenue Reports" value={filters} onChange={setFilters} dateColumn="issue_date"
            {...(!pending && !error && report ? { csv: { filename:'revenue-issued-monthly', build: () => rows } } : {})}
          />
          <section style={{...cardStyle,padding:'var(--sp-md)'}} aria-label="Issued invoice revenue trend">
            <h3 style={{margin:'0 0 8px',color:'var(--text)'}}>Monthly issued invoice revenue</h3>
            <p style={{color:'var(--text2)',fontSize:'var(--t-meta)',margin:'0 0 14px'}}>
              Actual taxable invoice amounts before VAT · AD calendar months · {from} to {to}.
              Draft and void invoices excluded. Credit notes record paid amounts, not taxable sales deductions. They are checked separately;
              this chart is not a full audited net-sales statement.
            </p>
            {!windowIsValid ? (
              <p role="alert">Choose a valid report window of no more than 24 calendar months.</p>
            ) : pending ? (
              <p role="status">Loading verified invoice records…</p>
            ) : error ? (
              <div role="alert"><p>{error}</p><button type="button" onClick={() => setRevision(r=>r+1)}
                style={{minHeight:44,padding:'0 14px'}}>Retry</button></div>
            ) : report ? (
              <>
                <div style={{display:'flex',flexWrap:'wrap',gap:26,marginBottom:20}}>
                  <div><small>Taxable amount (before VAT)</small><strong style={{display:'block',fontSize:23}}>{formatMoney(report.totalPaisa)}</strong></div>
                  <div><small>Issued invoices</small><strong style={{display:'block',fontSize:23}}>{report.issuedCount}</strong></div>
                </div>
                <InteractiveRevenueTrend months={report.months} />
                <section aria-label="Credit-note reconciliation for selected invoice dates" style={{marginTop:20,paddingTop:14,borderTop:'1px solid var(--border)'}}>
                  <h4 style={{margin:'0 0 8px'}}>Credit-note reconciliation</h4>
                  <p style={{color:'var(--text2)',fontSize:'var(--t-meta)'}}>
                    For invoices issued {from} to {to}, including voided invoices omitted from the chart.
                    Credit-note amounts reflect paid-value corrections, not taxable sales credits;
                    notes issued for invoices outside this period are not in this check.
                  </p>
                  <dl style={{display:'flex',flexWrap:'wrap',gap:24}}>
                    <div><dt>Voided invoice taxable amount excluded</dt><dd>{formatMoney(report.creditReconciliation.voidedTaxablePaisa)} ({report.creditReconciliation.voidedInvoiceCount} invoices)</dd></div>
                    <div><dt>Credit-note amount (settlement basis)</dt><dd>{formatMoney(report.creditReconciliation.creditNoteAmountPaisa)} ({report.creditReconciliation.creditNoteCount} notes)</dd></div>
                  </dl>
                  {report.creditReconciliation.paidVoidMismatchCount > 0 || report.creditReconciliation.activeInvoiceCreditNoteCount > 0 ? (
                    <p role="alert">
                      Manual ledger review needed: {report.creditReconciliation.paidVoidMismatchCount} paid voided invoice(s)
                      with credit-note amounts not matching paid amounts, and {report.creditReconciliation.activeInvoiceCreditNoteCount}
                      credit note(s) on nonvoid invoices. Do not treat this as audited net sales.
                    </p>
                  ) : (
                    <p role="status">No paid-void credit mismatches found in this invoice-date window. This is not an audited net-sales statement.</p>
                  )}
                </section>
                {report.issuedCount===0 && <p>No issued invoices recorded for the selected period.</p>}
              </>
            ) : <p role="status">Loading…</p>}
          </section>
          <p style={{fontSize:'var(--t-meta)',color:'var(--text2)'}}>
            Detailed invoice records and settlement corrections remain available in <Link to="/finance?tab=invoices">Finance invoices</Link>.
            Previously hardcoded category and project-revenue figures are withheld until their attribution can be verified.
          </p>
        </>
      )}
    </div>
  )
}
