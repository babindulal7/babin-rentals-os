import { useMemo, useState } from 'react'
import { PageHeader, KpiStrip, cardStyle } from '../../components/ui/Page'
import type { Kpi } from '../../components/ui/Page'
import { PageBody } from '../../components/ui/PageBody'
import { DataTableShell } from '../../components/ui/DataTable'
import { ReportToolbar } from '../../components/ui/ReportToolbar'
import type { ReportCsvRow, ReportFilters } from '../../components/ui/ReportToolbar'
import { formatMoney } from '../../lib/money'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { useAuth } from '../../lib/auth'
import { useLoad } from '../../lib/queries/useLoad'
import { reportFilterOptions, hasReportFilters } from './reportStates'
import { getCrewTdsReport, type CrewTdsReportData } from '../../lib/queries/crewTdsReport'

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

export default function CrewTdsReport() {
  const money = useCanViewMoney()
  const { user } = useAuth()
  const [filters, setFilters] = useState<ReportFilters>({})
  const filtered = hasReportFilters(filters)

  const load = useLoad(() => getCrewTdsReport(reportFilterOptions(filters)), {
    key: JSON.stringify(filters),
    enabled: money,
  })
  const data: CrewTdsReportData | null = load.data

  const kpis = useMemo<Kpi[]>(() => {
    if (!data) return []
    const m = data.metrics
    return [
      {
        label: 'Total Gross Payouts',
        value: formatMoney(m.totalGross),
        icon: 'dollar',
        accent: 'primary',
        note: `${m.payoutCount} crew assignments (${m.paidCount} paid, ${m.pendingCount} pending)`,
        definition: 'Total gross liability for crew days booked across confirmed shoots.',
      },
      {
        label: 'TDS Withholding Rate',
        value: m.configuredRate !== null ? `${m.configuredRate}%` : 'Rate not set',
        icon: 'receipt',
        accent: m.configuredRate !== null ? 'neutral' : 'warn',
        note: m.configuredRate !== null ? 'Configured in Settings ▸ Financial' : 'Accountant must set rate (O-5)',
        definition: 'Applicable TDS rate for contractor / crew service payments in Nepal.',
      },
      {
        label: 'TDS Withheld',
        value: m.totalTds !== null ? formatMoney(m.totalTds) : 'TDS: rate not set',
        icon: 'file',
        accent: m.totalTds !== null ? 'success' : 'warn',
        note: m.totalTds !== null ? 'Statutory tax withheld for IRD' : 'Withholding cannot be derived without a rate',
        definition: 'Tax deducted at source from crew payouts for statutory remittance.',
      },
      {
        label: 'Net Payable / Paid',
        value: m.totalNet !== null ? formatMoney(m.totalNet) : 'TDS: rate not set',
        icon: 'check',
        accent: 'neutral',
        note: m.totalNet !== null ? 'Net disbursement to crew' : 'Awaiting accountant rate configuration',
        definition: 'Gross crew payouts minus statutory TDS deduction.',
      },
    ]
  }, [data])

  const getCsvRows = (): ReportCsvRow[] => {
    if (!data) return []
    return [
      ['Crew Payouts & TDS Withholding Report (Nepal IRD)'],
      ['Metric', 'Value'],
      ['Total Gross Payouts', formatMoney(data.metrics.totalGross)],
      ['TDS Rate', data.metrics.configuredRate !== null ? `${data.metrics.configuredRate}%` : 'Rate not set'],
      ['Total TDS Withheld', data.metrics.totalTds !== null ? formatMoney(data.metrics.totalTds) : 'TDS: rate not set'],
      ['Total Net Payable', data.metrics.totalNet !== null ? formatMoney(data.metrics.totalNet) : 'TDS: rate not set'],
      ['Total Assignments', String(data.metrics.payoutCount)],
      ['Paid Assignments', String(data.metrics.paidCount)],
      ['Pending Assignments', String(data.metrics.pendingCount)],
      [],
      ['Monthly IRD TDS Schedule (Bikram Sambat Fiscal Periods)'],
      ['Month (AD)', 'BS Month', 'Payouts', 'Gross Payouts', 'TDS Withheld', 'Net Paid', 'Rate Status'],
      ...data.monthlySchedule.map((m): ReportCsvRow => [
        m.monthAd,
        m.monthBs,
        m.payoutCount,
        formatMoney(m.grossPayouts),
        m.tdsWithheld !== null ? formatMoney(m.tdsWithheld) : 'TDS: rate not set',
        m.netPaid !== null ? formatMoney(m.netPaid) : 'TDS: rate not set',
        m.rateStatus,
      ]),
      [],
      ['Crew Payouts Register'],
      ['Booking No', 'Crew Member', 'Position', 'Start Date (AD)', 'Start Date (BS)', 'Days', 'Gross', 'TDS %', 'TDS Withheld', 'Net Payout', 'Status', 'Paid At', 'Notes'],
      ...data.payouts.map((p): ReportCsvRow => [
        p.crewBookingNo,
        p.crewMemberName,
        p.position,
        p.startDateAd,
        p.startDateBs,
        p.days,
        formatMoney(p.grossPayout),
        p.tdsRatePercent !== null ? `${p.tdsRatePercent}%` : 'Rate not set',
        p.tdsAmount !== null ? formatMoney(p.tdsAmount) : 'TDS: rate not set',
        p.netPayout !== null ? formatMoney(p.netPayout) : 'TDS: rate not set',
        p.payoutStatus,
        p.paidAt || '—',
        p.notes || '—',
      ]),
    ]
  }

  // Law 6: money roles only (Owner, Admin, Manager, Accounts)
  if (!money) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        <PageHeader icon="receipt" title="Crew TDS Report" description="Monthly crew payouts, TDS withheld, and net payable for the accountant." />
        <PageBody
          restricted
          restrictedReason="Crew payout rates and TDS deductions are restricted to money roles."
          restrictedRequiredRole="Owner, Admin, Manager, or Accounts"
        >
          {null}
        </PageBody>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader
        icon="receipt"
        title="Crew TDS Report"
        description="Monthly crew payouts, TDS withheld, and net payable for the accountant (Ruling D25 / O-5)."
      />

      <ReportToolbar
        title="Crew TDS Report"
        value={filters}
        onChange={setFilters}
        dateColumn="start_date"
        csv={{
          filename: 'crew-tds-report',
          build: getCsvRows,
          ...(user?.name ? { generatedBy: user.name } : {}),
        }}
      />

      <PageBody
        noun="crew TDS payouts"
        loading={load.loading}
        error={load.error}
        onRetry={load.reload}
        empty={!data || data.payouts.length === 0}
        emptyIsFiltered={filtered}
        onClearFilters={() => setFilters({})}
      >
        {data && (
          <>
            <KpiStrip items={kpis} />

            {/* Monthly TDS Schedule */}
            <div style={cardStyle}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                <h3 style={{ margin: 0, fontSize: 'var(--t-h3)', fontWeight: 600 }}>Monthly TDS Withholding Schedule</h3>
                <p style={{ margin: '4px 0 0', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                  Aggregated per Bikram Sambat fiscal month for Nepal IRD filing reconciliation.
                </p>
              </div>

              <DataTableShell ariaLabel="Monthly TDS Withholding Schedule">
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={th}>Month (AD)</th>
                      <th style={th}>BS Month</th>
                      <th style={{ ...th, textAlign: 'right' }}>Payouts</th>
                      <th style={{ ...th, textAlign: 'right' }}>Gross Payouts (Rs)</th>
                      <th style={{ ...th, textAlign: 'right' }}>TDS Withheld (Rs)</th>
                      <th style={{ ...th, textAlign: 'right' }}>Net Paid (Rs)</th>
                      <th style={th}>TDS Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.monthlySchedule.map((m) => (
                      <tr key={m.monthKey}>
                        <td style={td}>{m.monthAd}</td>
                        <td style={td}>
                          <span className="eyebrow-pill" style={{ textTransform: 'none', fontSize: 'var(--t-th)' }}>
                            {m.monthBs}
                          </span>
                        </td>
                        <td style={{ ...td, textAlign: 'right' }}>{m.payoutCount}</td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{formatMoney(m.grossPayouts)}</td>
                        <td style={{ ...td, textAlign: 'right', color: m.tdsWithheld !== null ? 'var(--text)' : 'var(--muted)' }}>
                          {m.tdsWithheld !== null ? formatMoney(m.tdsWithheld) : 'TDS: rate not set'}
                        </td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: m.netPaid !== null ? 'var(--text)' : 'var(--muted)' }}>
                          {m.netPaid !== null ? formatMoney(m.netPaid) : 'TDS: rate not set'}
                        </td>
                        <td style={td}>
                          <span style={{ fontSize: 'var(--t-th)', color: m.rateStatus.includes('not set') ? 'var(--warn-fg, #b45309)' : 'var(--text2)' }}>
                            {m.rateStatus}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DataTableShell>
            </div>

            {/* Detailed Payouts Register */}
            <div style={cardStyle}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                <h3 style={{ margin: 0, fontSize: 'var(--t-h3)', fontWeight: 600 }}>Crew Payouts Register</h3>
                <p style={{ margin: '4px 0 0', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                  Individual shoot lines with stored immutable TDS figures and payment states.
                </p>
              </div>

              <DataTableShell ariaLabel="Detailed Crew Payouts Register">
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={th}>Booking</th>
                      <th style={th}>Crew Member</th>
                      <th style={th}>Role</th>
                      <th style={th}>Date</th>
                      <th style={{ ...th, textAlign: 'right' }}>Days</th>
                      <th style={{ ...th, textAlign: 'right' }}>Gross (Rs)</th>
                      <th style={{ ...th, textAlign: 'right' }}>TDS Withheld (Rs)</th>
                      <th style={{ ...th, textAlign: 'right' }}>Net Payable (Rs)</th>
                      <th style={th}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.payouts.map((p) => (
                      <tr key={p.id}>
                        <td style={{ ...td, fontWeight: 600 }}>{p.crewBookingNo}</td>
                        <td style={td}>
                          <div>{p.crewMemberName}</div>
                          <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>{p.phone || 'No phone'}</div>
                        </td>
                        <td style={td}>{p.position}</td>
                        <td style={td}>
                          <div>{p.startDateAd}</div>
                          <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>{p.startDateBs}</div>
                        </td>
                        <td style={{ ...td, textAlign: 'right' }}>{p.days}</td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{formatMoney(p.grossPayout)}</td>
                        <td style={{ ...td, textAlign: 'right', color: p.tdsAmount !== null ? 'var(--text)' : 'var(--muted)' }}>
                          {p.tdsAmount !== null ? formatMoney(p.tdsAmount) : 'TDS: rate not set'}
                          {p.tdsRatePercent !== null && (
                            <span style={{ marginLeft: 4, fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                              ({p.tdsRatePercent}%)
                            </span>
                          )}
                        </td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: p.netPayout !== null ? 'var(--text)' : 'var(--muted)' }}>
                          {p.netPayout !== null ? formatMoney(p.netPayout) : 'TDS: rate not set'}
                        </td>
                        <td style={td}>
                          <span
                            className="eyebrow-pill"
                            style={{
                              textTransform: 'none',
                              background: p.payoutStatus === 'Paid' ? 'var(--success-bg, #ecfdf5)' : 'var(--badge-bg)',
                              color: p.payoutStatus === 'Paid' ? 'var(--success-fg, #065f46)' : 'var(--text2)',
                            }}
                          >
                            {p.payoutStatus}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DataTableShell>
            </div>
          </>
        )}
      </PageBody>
    </div>
  )
}
