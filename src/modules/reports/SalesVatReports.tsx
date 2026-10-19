import { formatAd } from '../../lib/bs'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, KpiStrip, cardStyle } from '../../components/ui/Page'
import type { Kpi } from '../../components/ui/Page'
import { PageBody } from '../../components/ui/PageBody'
import { useLoad } from '../../lib/queries/useLoad'
import { reportFilterOptions, hasReportFilters, NoMatchRow } from './reportStates'
import { DataTableShell } from '../../components/ui/DataTable'
import { ReportToolbar } from '../../components/ui/ReportToolbar'
import type { ReportCsvRow, ReportFilters } from '../../components/ui/ReportToolbar'
import { Donut, Legend, type Slice } from '../../components/ui/Charts'
import Icon from '../../components/ui/Icon'
import { formatMoney, type Paisa } from '../../lib/money'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { useViewport } from '../../lib/device'
import { getSalesVatReport } from '../../lib/queries/salesVatReports'

/** A date the read did not return reads as a dash, never "Invalid Date". */
const dateOrDash = (iso: string): string => (iso && !Number.isNaN(Date.parse(iso)) ? formatAd(new Date(iso)) : '—')

type FinanceReportTab = 'sales' | 'vat'

const th = {
  textAlign: 'left' as const,
  padding: '10px 12px',
  fontSize: 'var(--t-th)',
  fontWeight: 600,
  color: 'var(--text2)',
  whiteSpace: 'nowrap' as const,
  borderBottom: '1px solid var(--border)',
}

const td = {
  height: 'var(--row-min-h)',
  padding: '10px 12px',
  fontSize: 'var(--t-meta)',
  color: 'var(--text)',
  borderBottom: '1px solid var(--border)',
}

export default function SalesVatReports() {
  const money = useCanViewMoney()
  const viewport = useViewport()
  const [activeTab, setActiveTab] = useState<FinanceReportTab>('sales')
  const [filters, setFilters] = useState<ReportFilters>({})
  /* Phase 6 — the read used to return seed figures on failure and on an empty
     period (and could only ever return them on live: it selected columns the
     invoices table does not have). It now throws, and `PageBody` draws loading ·
     Error + Retry · nothing-yet vs "nothing in this period". A money-blind role
     never sends the read (Law 6). */
  const filtered = hasReportFilters(filters)
  const load = useLoad(() => getSalesVatReport(reportFilterOptions(filters)), {
    key: JSON.stringify(filters),
    enabled: money,
  })
  const data = load.data

  // Sales KPI Strip
  const salesKpis = useMemo<Kpi[]>(() => {
    if (!data) return []
    const m = data.sales.metrics
    return [
      {
        label: 'Total Invoiced',
        value: formatMoney(m.totalInvoiced),
        icon: 'dollar',
        accent: 'primary',
        note: `${m.invoiceCount} invoices issued in period`,
        definition: 'Total invoiced amount in the period, including VAT.',
      },
      {
        label: 'Collections',
        value: formatMoney(m.totalCollected),
        icon: 'check',
        accent: 'success',
        note: `${m.collectionRate}% payment recovery rate`,
        definition: 'Payments received against invoices issued in the period.',
      },
      {
        label: 'Outstanding Balance',
        value: formatMoney(m.totalOutstanding),
        icon: 'alert_triangle',
        accent: m.totalOutstanding > 0 ? 'warn' : 'neutral',
        note: 'Pending client settlements',
        definition: 'Unpaid portion of issued invoices; sum of outstanding balances.',
      },
      {
        label: '13% VAT Invoiced',
        value: formatMoney(m.totalVat),
        icon: 'file',
        accent: 'neutral',
        note: 'Output tax accrued',
        definition: '13% VAT charged on taxable sales in the period.',
      },
    ]
  }, [data])

  // VAT KPI Strip
  const vatKpis = useMemo<Kpi[]>(() => {
    if (!data) return []
    const m = data.vat.metrics
    return [
      {
        label: 'Gross Turnover',
        value: formatMoney(m.totalGrossTurnover),
        icon: 'dollar',
        accent: 'primary',
        note: 'Total billing including 13% VAT',
        definition: 'Gross turnover = taxable sales + 13% VAT.',
      },
      {
        label: 'Taxable Turnover',
        value: formatMoney(m.taxableTurnover),
        icon: 'dollar',
        accent: 'neutral',
        note: 'Sales subject to statutory VAT',
        definition: 'Sales excluding VAT, subject to 13% output tax.',
      },
      {
        label: '13% Output VAT',
        value: formatMoney(m.totalOutputVat),
        icon: 'file',
        accent: 'success',
        note: 'Statutory liability to IRD Nepal',
        definition: 'Output VAT owed to IRD Nepal for the period.',
      },
      {
        label: 'Effective VAT Rate',
        value: `${m.effectiveVatRate}%`,
        icon: 'sparkles',
        accent: 'neutral',
        note: `Exempt or zero-rated: ${formatMoney(m.exemptTurnover)}`,
      },
    ]
  }, [data])

  // CSV export generator
  const getCsvRows = (): ReportCsvRow[] => {
    if (activeTab === 'sales') {
      return [
        ['Invoiced Sales Report'],
        ['Metric', 'Value'],
        ['Total Invoiced', formatMoney(data?.sales.metrics.totalInvoiced ?? (0 as Paisa))],
        ['Net Sales (Subtotal)', formatMoney(data?.sales.metrics.netSales ?? (0 as Paisa))],
        ['Total VAT (13%)', formatMoney(data?.sales.metrics.totalVat ?? (0 as Paisa))],
        ['Total Collected', formatMoney(data?.sales.metrics.totalCollected ?? (0 as Paisa))],
        ['Outstanding Balance', formatMoney(data?.sales.metrics.totalOutstanding ?? (0 as Paisa))],
        ['Collection Rate', `${data?.sales.metrics.collectionRate ?? 0}%`],
        [],
        ['Invoice Status Breakdown'],
        ['Status', 'Count', 'Amount', 'Share %'],
        ...(data?.sales.statusBreakdown.map((sb): ReportCsvRow => [
          sb.status,
          sb.count,
          formatMoney(sb.amount),
          `${sb.percent}%`,
        ]) ?? []),
        [],
        ['Sales Invoices Register'],
        ['Invoice No', 'Booking No', 'Client', 'PAN', 'Issue Date', 'Due Date', 'Subtotal', '13% VAT', 'Grand Total', 'Paid', 'Status'],
        ...(data?.sales.invoices.map((inv): ReportCsvRow => [
          inv.invoiceNo,
          inv.bookingNo,
          inv.clientName,
          inv.clientPan || 'N/A',
          dateOrDash(inv.issueDate),
          dateOrDash(inv.dueDate),
          formatMoney(inv.subtotal),
          formatMoney(inv.taxAmount),
          formatMoney(inv.grandTotal),
          formatMoney(inv.paidAmount),
          inv.status,
        ]) ?? []),
      ]
    } else {
      return [
        ['Nepal Statutory 13% VAT Register (Inland Revenue Department)'],
        ['Metric', 'Value'],
        ['Gross Invoiced Turnover', formatMoney(data?.vat.metrics.totalGrossTurnover ?? (0 as Paisa))],
        ['Taxable Sales Turnover', formatMoney(data?.vat.metrics.taxableTurnover ?? (0 as Paisa))],
        ['Total Output VAT (13%)', formatMoney(data?.vat.metrics.totalOutputVat ?? (0 as Paisa))],
        ['Effective VAT Rate', `${data?.vat.metrics.effectiveVatRate ?? 0}%`],
        [],
        ['Monthly IRD Filing Schedule (Bikram Sambat Fiscal Periods)'],
        ['Month (AD)', 'BS Month', 'Taxable Sales', '13% Output VAT', 'Exempt Sales', 'Gross Sales'],
        ...(data?.vat.monthlySchedule.map((ms): ReportCsvRow => [
          ms.month,
          ms.bsMonth,
          formatMoney(ms.taxableSales),
          formatMoney(ms.vatAmount),
          formatMoney(ms.exemptSales),
          formatMoney(ms.grossSales),
        ]) ?? []),
        [],
        ['Tax Invoices Register'],
        ['Invoice No', 'Date', 'Client', 'Client PAN', 'Taxable Amount', '13% VAT', 'Grand Total'],
        ...(data?.vat.taxRegister.map((tr): ReportCsvRow => [
          tr.invoiceNo,
          dateOrDash(tr.issueDate),
          tr.clientName,
          tr.clientPan || 'Unregistered',
          formatMoney(tr.subtotal),
          formatMoney(tr.taxAmount),
          formatMoney(tr.grandTotal),
        ]) ?? []),
      ]
    }
  }

  // Slices for Donut charts
  const statusSlices: Slice[] = useMemo(() => {
    if (!data) return []
    return data.sales.statusBreakdown.map((sb) => ({
      label: sb.status,
      value: sb.count,
      display: `${sb.count} (${sb.percent}%)`,
      percent: `${sb.percent}%`,
    }))
  }, [data])

  // Law 6: Sales & VAT reports are purely financial ledgers
  if (!money) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        <PageHeader
          icon="file"
          title="Sales & VAT Register"
          description="Statutory sales ledger, payment collection status, and Nepal 13% VAT register for IRD filing."
        />
        <PageBody
          restricted
          restrictedReason="Sales and VAT reports contain statutory financial ledgers, invoice totals, and tax returns, so there is no version of this page your role can see."
          restrictedRequiredRole="Owner, Admin, Coordinator or Accounts"
        >
          {null}
        </PageBody>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader
        icon="file"
        title="Sales & VAT Register"
        description="Statutory sales ledger, payment collection status, and Nepal 13% VAT register for IRD filing."
      />

      {/* Shared Toolbar */}
      <ReportToolbar
        title="Sales & VAT Register"
        value={filters}
        onChange={setFilters}
        dateColumn="issue_date"
        csv={{
          filename: `finance-${activeTab}`,
          build: getCsvRows,
        }}
      >
        <div
          role="group"
          aria-label="Finance report views"
          className="report-view-toggle"
          style={{ display: 'inline-flex' }}
        >
          {([
            ['Invoiced Sales', 'sales'],
            ['Nepal 13% VAT Register', 'vat'],
          ] as const).map(([label, key]) => {
            const on = activeTab === key
            return (
              <button
                key={key}
                type="button"
                aria-pressed={on}
                onClick={() => setActiveTab(key)}
                className={`report-toggle-btn ${on ? 'is-active' : ''}`}
              >
                {label}
              </button>
            )
          })}
        </div>
      </ReportToolbar>

      <PageBody
        noun="sales and VAT figures"
        loading={load.loading}
        error={load.error}
        onRetry={load.reload}
        hasRows={data !== null}
        skeleton="kpi"
        empty={data !== null && data.sales.metrics.invoiceCount === 0}
        emptyIsFiltered={filtered}
        onClearFilters={() => setFilters({})}
        emptyTitle={filtered ? 'No invoices in this period' : 'No invoices issued yet'}
        emptyMessage={
          filtered
            ? 'No invoice was issued in the selected period or branch. Clear the filters to see every invoice.'
            : 'Sales and the VAT register appear here once the first invoice is issued.'
        }
      >
      {/* TAB 1: INVOICED SALES */}
      {activeTab === 'sales' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
          <KpiStrip items={salesKpis} />

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: viewport === 'desktop' ? '1fr 1fr' : '1fr',
              gap: 'var(--sp-md)',
            }}
          >
            {/* Status Breakdown Donut */}
            <div style={cardStyle}>
              <h3 style={{ fontSize: 'var(--t-h3)', fontWeight: 600, marginBottom: 'var(--sp-sm)' }}>
                Invoices by Settlement Status
              </h3>
              <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginBottom: 'var(--sp-md)' }}>
                Collection progress across issued sales invoices.
              </p>
              {statusSlices.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', alignItems: 'center' }}>
                  <Donut slices={statusSlices} size={180} />
                  <Legend slices={statusSlices} />
                </div>
              )}
            </div>

            {/* Top Clients by Invoiced Volume */}
            <div style={cardStyle}>
              <h3 style={{ fontSize: 'var(--t-h3)', fontWeight: 600, marginBottom: 'var(--sp-sm)' }}>
                Top Invoiced Clients
              </h3>
              <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginBottom: 'var(--sp-md)' }}>
                Primary revenue contributors and open balance status.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
                {data?.sales.topClients.map((c) => (
                  <div
                    key={c.clientId}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 14px',
                      background: 'var(--surface-hover)',
                      borderRadius: 'var(--r-sm)',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 'var(--t-body)' }}>{c.clientName}</div>
                      <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                        {c.invoiceCount} invoices · Paid {formatMoney(c.totalPaid)}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 600, fontSize: 'var(--t-body)' }}>{formatMoney(c.totalInvoiced)}</div>
                      {(c.balance as number) > 0 && (
                        <div style={{ fontSize: 'var(--t-meta)', color: 'var(--status-warn-text)', fontWeight: 600 }}>
                          Bal: {formatMoney(c.balance)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Invoices Table */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-sm)' }}>
              <div>
                <h3 style={{ fontSize: 'var(--t-h3)', fontWeight: 600 }}>Sales Invoices Register</h3>
                <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                  Statutory billing document register for client contracts.
                </p>
              </div>
              <Link
                to="/finance?tab=invoices"
                style={{
                  fontSize: 'var(--t-meta)',
                  color: 'var(--primary)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  textDecoration: 'none',
                }}
              >
                Go to Invoices Tab <Icon name="chevron_right" size={12} />
              </Link>
            </div>

            <DataTableShell ariaLabel="Sales Invoices Register">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>Invoice No</th>
                    <th style={th}>Client</th>
                    <th style={th}>PAN</th>
                    <th style={th}>Issue Date</th>
                    <th style={{ ...th, textAlign: 'right' }}>Subtotal</th>
                    <th style={{ ...th, textAlign: 'right' }}>13% VAT</th>
                    <th style={{ ...th, textAlign: 'right' }}>Grand Total</th>
                    <th style={th}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.sales.invoices.length === 0 && <NoMatchRow colSpan={11} noun="invoices" />}
                  {data?.sales.invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td style={{ ...td, fontWeight: 600, color: 'var(--primary)' }}>{inv.invoiceNo}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{inv.clientName}</td>
                      <td style={{ ...td, fontFamily: 'var(--font-id, sans-serif)', fontVariantNumeric: 'tabular-nums' }}>{inv.clientPan || '—'}</td>
                      <td style={td}>{dateOrDash(inv.issueDate)}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{formatMoney(inv.subtotal)}</td>
                      <td style={{ ...td, textAlign: 'right', color: 'var(--text2)' }}>{formatMoney(inv.taxAmount)}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{formatMoney(inv.grandTotal)}</td>
                      <td style={td}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 'var(--r-sm)',
                            fontSize: 'var(--t-meta)',
                            fontWeight: 600,
                            background:
                              inv.status === 'Paid'
                                ? 'var(--status-success-bg)'
                                : inv.status === 'Overdue'
                                  ? 'var(--status-danger-bg)'
                                  : 'var(--status-warn-bg)',
                            color:
                              inv.status === 'Paid'
                                ? 'var(--status-success-text)'
                                : inv.status === 'Overdue'
                                  ? 'var(--status-danger-text)'
                                  : 'var(--status-warn-text)',
                          }}
                        >
                          {inv.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTableShell>
          </div>
        </div>
      )}

      {/* TAB 2: NEPAL 13% VAT REGISTER */}
      {activeTab === 'vat' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
          <KpiStrip items={vatKpis} />

          {/* Monthly IRD Schedule */}
          <div style={cardStyle}>
            <h3 style={{ fontSize: 'var(--t-h3)', fontWeight: 600, marginBottom: 'var(--sp-sm)' }}>
              Monthly VAT Filing Schedule (Inland Revenue Department Format)
            </h3>
            <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginBottom: 'var(--sp-md)' }}>
              Summary of monthly taxable turnover and 13% VAT collected for monthly return submission on IRD Taxpayer Portal.
            </p>

            <DataTableShell ariaLabel="Monthly VAT Filing Schedule">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>Tax Period (AD)</th>
                    <th style={th}>Bikram Sambat Month</th>
                    <th style={{ ...th, textAlign: 'right' }}>Taxable Sales (Rs)</th>
                    <th style={{ ...th, textAlign: 'right' }}>13% Output VAT (Rs)</th>
                    <th style={{ ...th, textAlign: 'right' }}>Exempt Sales</th>
                    <th style={{ ...th, textAlign: 'right' }}>Gross Invoiced Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.vat.monthlySchedule.length === 0 && <NoMatchRow colSpan={6} noun="tax periods" />}
                  {data?.vat.monthlySchedule.map((ms) => (
                    <tr key={ms.month}>
                      <td style={td}>{ms.month}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{ms.bsMonth}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{formatMoney(ms.taxableSales)}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: 'var(--status-success-text)' }}>
                        {formatMoney(ms.vatAmount)}
                      </td>
                      <td style={{ ...td, textAlign: 'right', color: 'var(--text2)' }}>{formatMoney(ms.exemptSales)}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{formatMoney(ms.grossSales)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTableShell>
          </div>

          {/* Detailed Tax Register Table */}
          <div style={cardStyle}>
            <h3 style={{ fontSize: 'var(--t-h3)', fontWeight: 600, marginBottom: 'var(--sp-sm)' }}>
              Statutory Sales Tax Invoices Register
            </h3>
            <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginBottom: 'var(--sp-md)' }}>
              Detailed register of tax invoices issued in compliance with Nepal VAT Act 2052.
            </p>

            <DataTableShell ariaLabel="Statutory Sales Tax Invoices Register">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>Tax Invoice No</th>
                    <th style={th}>Issue Date</th>
                    <th style={th}>Buyer / Client Name</th>
                    <th style={th}>Buyer PAN</th>
                    <th style={{ ...th, textAlign: 'right' }}>Taxable Amount</th>
                    <th style={{ ...th, textAlign: 'right' }}>13% VAT Amount</th>
                    <th style={{ ...th, textAlign: 'right' }}>Total Invoice Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.vat.taxRegister.length === 0 && <NoMatchRow colSpan={7} noun="invoices" />}
                  {data?.vat.taxRegister.map((tr) => (
                    <tr key={tr.id}>
                      <td style={{ ...td, fontWeight: 600, color: 'var(--primary)' }}>{tr.invoiceNo}</td>
                      <td style={td}>{dateOrDash(tr.issueDate)}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{tr.clientName}</td>
                      <td style={{ ...td, fontFamily: 'var(--font-id, sans-serif)', fontVariantNumeric: 'tabular-nums' }}>{tr.clientPan || 'Unregistered'}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{formatMoney(tr.subtotal)}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: 'var(--status-success-text)' }}>
                        {formatMoney(tr.taxAmount)}
                      </td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{formatMoney(tr.grandTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTableShell>
          </div>
        </div>
      )}
      </PageBody>
    </div>
  )
}
