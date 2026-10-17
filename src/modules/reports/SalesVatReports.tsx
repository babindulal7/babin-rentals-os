import { formatAd } from '../../lib/bs'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, KpiStrip, cardStyle } from '../../components/ui/Page'
import type { Kpi } from '../../components/ui/Page'
import { PageBody } from '../../components/ui/PageBody'
import { DataTableShell } from '../../components/ui/DataTable'
import { ReportToolbar } from '../../components/ui/ReportToolbar'
import type { ReportCsvRow, ReportFilters } from '../../components/ui/ReportToolbar'
import { Donut, Legend, type Slice } from '../../components/ui/Charts'
import Icon from '../../components/ui/Icon'
import { formatMoney, type Paisa } from '../../lib/money'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { useViewport } from '../../lib/device'
import { IS_MOCK } from '../../lib/supabase'
import {
  getSalesVatReport,
  type SalesReportData,
  type VatTaxReportData,
  type ReportFilterOptions,
} from '../../lib/queries/salesVatReports'

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
  const [data, setData] = useState<{ sales: SalesReportData; vat: VatTaxReportData } | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    const branchId = filters.chips?.branch_id?.[0]
    const queryOpts: ReportFilterOptions = {
      from: filters.dateRange?.fromAd,
      to: filters.dateRange?.toAd,
      branchId,
    }

    setLoading(true)
    setLoadError(null)
    setData(null)

    void getSalesVatReport(queryOpts)
      .then((res) => {
        if (active) setData(res)
      })
      .catch((error: unknown) => {
        if (active) {
          setLoadError(error instanceof Error ? error.message : 'Sales/VAT report unavailable.')
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [filters])

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
        definition: 'Payments received against invoices issued in the selected period (not all cash received in window).',
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
        note: 'Total issued-invoice billing including VAT',
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
        note: 'Output VAT on issued invoices; verify before filing',
        definition: 'Output VAT owed to IRD Nepal for the period.',
      },
      {
        label: 'Effective Tax Rate',
        value: `${m.effectiveVatRate}%`,
        icon: 'sparkles',
        accent: 'neutral',
        note: 'Output VAT divided by VAT-taxable sales',
      },
      {
        label: '0% VAT Sales',
        value: formatMoney(m.exemptTurnover),
        icon: 'file',
        accent: 'neutral',
        note: 'Invoice VAT rate is 0%; legal tax category needs review',
        definition: 'Issued invoices with 0% VAT rate. Classification review required.',
      },
    ]
  }, [data])

  // CSV export generator
  const getCsvRows = (): ReportCsvRow[] => {
    if (activeTab === 'sales') {
      return [
        ['Invoiced Sales Report — Internal Accounting Review, Not a Statutory Filing Receipt'],
        ['Metric', 'Value'],
        ['Total Invoiced (Gross)', formatMoney(data?.sales.metrics.totalInvoiced ?? (0 as Paisa))],
        ['Net Taxable Sales', formatMoney(data?.sales.metrics.netSales ?? (0 as Paisa))],
        ['Total 13% Output VAT', formatMoney(data?.sales.metrics.totalVat ?? (0 as Paisa))],
        ['Total Discounts Allowed', formatMoney(data?.sales.metrics.totalDiscounts ?? (0 as Paisa))],
        ['Total Collections Received', formatMoney(data?.sales.metrics.totalCollected ?? (0 as Paisa))],
        ['Outstanding Receivables', formatMoney(data?.sales.metrics.totalOutstanding ?? (0 as Paisa))],
        ['Invoices Issued Count', String(data?.sales.metrics.invoiceCount ?? 0)],
        ['Payment Collection Rate', `${data?.sales.metrics.collectionRate ?? 0}%`],
        [],
        ['Invoice Status Breakdown'],
        ['Status', 'Count', 'Amount (Rs)', 'Share (%)'],
        ...(data?.sales.statusBreakdown.map((sb): ReportCsvRow => [
          sb.status,
          sb.count,
          formatMoney(sb.amount),
          `${sb.percent}%`,
        ]) ?? []),
        [],
        ['Top Clients by Invoiced Sales'],
        ['Client Name', 'Invoices', 'Total Invoiced (Rs)', 'Total Paid (Rs)', 'Balance (Rs)'],
        ...(data?.sales.topClients.map((tc): ReportCsvRow => [
          tc.clientName,
          tc.invoiceCount,
          formatMoney(tc.totalInvoiced),
          formatMoney(tc.totalPaid),
          formatMoney(tc.balance),
        ]) ?? []),
        [],
        ['Issued Sales Invoices Detail'],
        ['Invoice No', 'Booking No', 'Client Name', 'PAN/VAT No', 'Issue Date', 'Due Date', 'Subtotal', 'Taxable Amount', '13% VAT', 'Grand Total', 'Paid Amount', 'Status'],
        ...(data?.sales.invoices.map((inv): ReportCsvRow => [
          inv.invoiceNo,
          inv.bookingNo,
          inv.clientName,
          inv.clientPan || 'Unregistered',
          formatAd(new Date(inv.issueDate)),
          formatAd(new Date(inv.dueDate)),
          formatMoney(inv.subtotal),
          formatMoney(inv.taxableAmount ?? inv.subtotal),
          formatMoney(inv.taxAmount),
          formatMoney(inv.grandTotal),
          formatMoney(inv.paidAmount),
          inv.status,
        ]) ?? []),
      ]
    } else {
      return [
        ['Nepal VAT Sales Register — Internal Review, Not a Filing Receipt'],
        ['Metric', 'Value'],
        ['Gross Invoiced Turnover', formatMoney(data?.vat.metrics.totalGrossTurnover ?? (0 as Paisa))],
        ['Taxable Sales Turnover', formatMoney(data?.vat.metrics.taxableTurnover ?? (0 as Paisa))],
        ['Total Output VAT', formatMoney(data?.vat.metrics.totalOutputVat ?? (0 as Paisa))],
        ['0%-VAT Sales Turnover (Review)', formatMoney(data?.vat.metrics.exemptTurnover ?? (0 as Paisa))],
        ['Statutory Tax Rate', `${data?.vat.metrics.effectiveVatRate ?? 0}%`],
        [],
        ['Monthly IRD Filing Schedule (Bikram Sambat Fiscal Periods)'],
        ['AD invoice-date span', 'BS Month', 'VAT-taxable Sales', 'Output VAT', '0%-VAT Sales (review)', 'Gross Sales'],
        ...(data?.vat.monthlySchedule.map((ms): ReportCsvRow => [
          ms.month,
          ms.bsMonth,
          formatMoney(ms.taxableSales),
          formatMoney(ms.vatAmount),
          formatMoney(ms.exemptSales),
          formatMoney(ms.grossSales),
        ]) ?? []),
        [],
        ['Tax Invoices Register Detail'],
        ['Invoice No', 'Issue Date', 'Client Name', 'PAN/VAT No', 'VAT-taxable Base', '13% Output VAT', 'Gross Invoice Total'],
        ...(data?.vat.taxRegister.map((tr): ReportCsvRow => [
          tr.invoiceNo,
          formatAd(new Date(tr.issueDate)),
          tr.clientName,
          tr.clientPan || 'Unregistered',
          formatMoney(tr.taxableAmount ?? tr.subtotal),
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
          description="Issued-invoice sales and VAT register; verify classification and reconciliation before filing."
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
        description="Issued-invoice sales and VAT register; verify classification and reconciliation before filing."
      />

      {/* Shared Toolbar */}
      <ReportToolbar
        title="Sales & VAT Register"
        value={filters}
        onChange={setFilters}
        dateColumn="issue_date"
        csv={
          !loading && !loadError && data && data.sales.metrics.invoiceCount > 0
            ? {
                filename: `finance-${activeTab}`,
                build: getCsvRows,
              }
            : undefined
        }
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

      {IS_MOCK && (
        <div
          role="note"
          style={{
            padding: '8px 16px',
            background: 'color-mix(in srgb, var(--warn) 15%, transparent)',
            border: '1px solid var(--warn)',
            borderRadius: 'var(--r-card)',
            color: 'var(--warn-text)',
            fontSize: 'var(--t-meta)',
            fontWeight: 600,
          }}
        >
          Demo Mode Active — Showing sample sales and VAT register figures for preview. Not real production accounting data.
        </div>
      )}

      {(loading || loadError || !data || data.sales.metrics.invoiceCount === 0) && (
        <div
          role={loadError ? 'alert' : 'status'}
          style={{
            ...cardStyle,
            padding: 'var(--sp-lg)',
            color: loadError ? 'var(--status-danger-text)' : 'var(--text2)',
            border: loadError ? '1px solid var(--danger)' : undefined,
          }}
        >
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="refresh" size={16} className="spin" />
              <span>Loading real invoice records…</span>
            </div>
          ) : loadError ? (
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--danger-text)' }}>
                Sales/VAT report unavailable
              </div>
              <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                {loadError}
              </div>
              <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 8 }}>
                The invoice database could not be certified; no sample totals or CSV exports can be displayed.
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontWeight: 600 }}>No issued invoices in this period</div>
              <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 4 }}>
                There are no issued, non-void invoices matching the selected filters. There are no figures to export.
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 1: INVOICED SALES */}
      {!loading && !loadError && data && data.sales.metrics.invoiceCount > 0 && activeTab === 'sales' && (
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
                  {data?.sales.invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td style={{ ...td, fontWeight: 600, color: 'var(--primary)' }}>{inv.invoiceNo}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{inv.clientName}</td>
                      <td style={{ ...td, fontFamily: 'var(--font-id, sans-serif)', fontVariantNumeric: 'tabular-nums' }}>{inv.clientPan || '—'}</td>
                      <td style={td}>{formatAd(new Date(inv.issueDate))}</td>
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
                            background: inv.status === 'Paid' ? 'color-mix(in srgb, var(--success) 12%, transparent)' : 'var(--surface-hover)',
                            color: inv.status === 'Paid' ? 'var(--status-success-text)' : 'var(--text2)',
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
      {!loading && !loadError && data && data.sales.metrics.invoiceCount > 0 && activeTab === 'vat' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
          <KpiStrip items={vatKpis} />

          {/* Monthly IRD Schedule */}
          <div style={cardStyle}>
            <h3 style={{ fontSize: 'var(--t-h3)', fontWeight: 600, marginBottom: 'var(--sp-sm)' }}>
              Monthly BS VAT Sales Schedule (Review Before Filing)
            </h3>
            <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginBottom: 'var(--sp-md)' }}>
              Summary of issued invoice VAT and zero-VAT amounts grouped by Nepal (BS) month. Validate rates, exemptions and totals with Accounts before statutory filing.
            </p>

            <DataTableShell ariaLabel="Monthly VAT Filing Schedule">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>AD invoice-date span</th>
                    <th style={th}>Bikram Sambat Month</th>
                    <th style={{ ...th, textAlign: 'right' }}>VAT-taxable Sales (Rs)</th>
                    <th style={{ ...th, textAlign: 'right' }}>13% Output VAT (Rs)</th>
                    <th style={{ ...th, textAlign: 'right' }}>0%-VAT Sales (review)</th>
                    <th style={{ ...th, textAlign: 'right' }}>Gross Invoiced Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.vat.monthlySchedule.map((row, idx) => (
                    <tr key={idx}>
                      <td style={{ ...td, fontWeight: 600 }}>{row.month}</td>
                      <td style={{ ...td, color: 'var(--primary)', fontWeight: 600 }}>{row.bsMonth}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{formatMoney(row.taxableSales)}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: 'var(--status-success-text)' }}>
                        {formatMoney(row.vatAmount)}
                      </td>
                      <td style={{ ...td, textAlign: 'right', color: 'var(--text2)' }}>{formatMoney(row.exemptSales)}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{formatMoney(row.grossSales)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTableShell>
          </div>

          {/* Tax Register Detail */}
          <div style={cardStyle}>
            <div style={{ marginBottom: 'var(--sp-sm)' }}>
              <h3 style={{ fontSize: 'var(--t-h3)', fontWeight: 600 }}>VAT Invoices Tax Register</h3>
              <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                Detailed tax breakdown per issued invoice for IRD monthly sales annex submission.
              </p>
            </div>

            <DataTableShell ariaLabel="VAT Invoices Tax Register">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>Invoice No</th>
                    <th style={th}>Issue Date</th>
                    <th style={th}>Client</th>
                    <th style={th}>PAN</th>
                    <th style={{ ...th, textAlign: 'right' }}>VAT-taxable Sales (Rs)</th>
                    <th style={{ ...th, textAlign: 'right' }}>13% VAT</th>
                    <th style={{ ...th, textAlign: 'right' }}>Gross Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.vat.taxRegister.map((tr) => (
                    <tr key={tr.id}>
                      <td style={{ ...td, fontWeight: 600, color: 'var(--primary)' }}>{tr.invoiceNo}</td>
                      <td style={td}>{formatAd(new Date(tr.issueDate))}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{tr.clientName}</td>
                      <td style={{ ...td, fontFamily: 'var(--font-id, sans-serif)', fontVariantNumeric: 'tabular-nums' }}>{tr.clientPan || 'Unregistered'}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{formatMoney(tr.taxableAmount ?? tr.subtotal)}</td>
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
    </div>
  )
}
