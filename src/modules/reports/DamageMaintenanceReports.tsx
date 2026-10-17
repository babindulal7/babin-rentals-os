import { formatAd, formatAdDateTime } from '../../lib/bs'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, KpiStrip, cardStyle } from '../../components/ui/Page'
import type { Kpi } from '../../components/ui/Page'
import { DataTableShell } from '../../components/ui/DataTable'
import { PageBody } from '../../components/ui/PageBody'
import { useLoad } from '../../lib/queries/useLoad'
import { NOT_TRACKED } from '../../lib/queries/reportSupport'
import { reportFilterOptions, hasReportFilters, NoMatchRow } from './reportStates'
import { ReportToolbar } from '../../components/ui/ReportToolbar'
import type { ReportCsvRow, ReportFilters } from '../../components/ui/ReportToolbar'
import { Donut, Legend, type Slice } from '../../components/ui/Charts'
import Icon from '../../components/ui/Icon'
import { formatMoney, type Paisa } from '../../lib/money'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { useViewport } from '../../lib/device'
import { getDamageMaintenanceReport } from '../../lib/queries/damageMaintenanceReports'

/** A date the read did not return reads as a dash, never "Invalid Date". */
const dateOrDash = (iso: string): string => (iso && !Number.isNaN(Date.parse(iso)) ? formatAd(new Date(iso)) : '—')

type DmTab = 'damage' | 'repairs' | 'servicing' | 'availability'

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

export default function DamageMaintenanceReports() {
  const money = useCanViewMoney()
  const viewport = useViewport()
  const [activeTab, setActiveTab] = useState<DmTab>('damage')
  const [filters, setFilters] = useState<ReportFilters>({})
  /* Phase 6 — the read used to return seed figures on failure, on an empty
     database, and per figure (`|| MOCK_DM`); it now throws, and `PageBody`
     draws loading · Error + Retry · nothing-yet vs "nothing in this period". */
  const filtered = hasReportFilters(filters)
  const load = useLoad(() => getDamageMaintenanceReport(reportFilterOptions(filters)), { key: JSON.stringify(filters) })
  const data = load.data
  const nothing =
    data !== null &&
    data.incidents.length === 0 &&
    data.repairs.length === 0 &&
    data.servicing.length === 0 &&
    // The fleet tab has figures whenever any unit exists, findings or not.
    data.metrics.fleetAvailabilityRate === null

  // Damage KPI Strip
  const damageKpis = useMemo<Kpi[]>(() => {
    if (!data) return []
    const m = data.metrics
    return [
      {
        label: 'Damage Incidents',
        value: String(m.totalFindings),
        icon: 'alert_triangle',
        accent: m.totalFindings > 0 ? 'danger' : 'neutral',
        note: 'Triage return inspection findings',
      },
      {
        label: 'Assessed Damage',
        value: money ? formatMoney(m.totalDamageCost) : '—',
        icon: 'dollar',
        accent: 'danger',
        note: money ? 'Total hardware repair quote' : /* Restricted (Law 6) */ "Restricted",
      },
      {
        label: 'Client Recovered',
        value: money ? formatMoney(m.totalChargedToClient) : '—',
        icon: 'check',
        accent: 'success',
        note: money ? 'Charged to the client on the linked case' : /* Restricted (Law 6) */ "Restricted",
      },
      {
        label: 'Pending Approval',
        value: String(data.incidents.filter((i) => i.approvalState === 'Pending Approval').length),
        icon: 'timer',
        accent: 'warn',
        note: 'Findings awaiting approval',
      },
    ]
  }, [data, money])

  // Repairs KPI Strip
  const repairKpis = useMemo<Kpi[]>(() => {
    if (!data) return []
    const m = data.metrics
    return [
      {
        label: 'Active Repairs',
        value: String(m.activeRepairs),
        icon: 'tool',
        accent: 'primary',
        note: 'Units currently in shop',
      },
      {
        label: 'Avg Turnaround',
        value: m.averageTurnaroundDays === null ? '—' : `${m.averageTurnaroundDays} Days`,
        icon: 'timer',
        accent: 'neutral',
        note: m.averageTurnaroundDays === null ? 'No repair has both a start and a finish yet' : 'Started to completed',
      },
      {
        label: 'Repair Expenditure',
        value: money ? formatMoney(m.totalRepairSpend) : '—',
        icon: 'dollar',
        accent: 'neutral',
        note: money ? 'Parts & technician servicing' : /* Restricted (Law 6) */ "Restricted",
      },
      {
        label: 'In-House Ratio',
        value: NOT_TRACKED,
        icon: 'sparkles',
        accent: 'neutral',
        note: 'Repairs do not record in-house vs outside shop',
      },
    ]
  }, [data, money])

  // Servicing KPI Strip
  const servicingKpis = useMemo<Kpi[]>(() => {
    if (!data) return []
    const m = data.metrics
    return [
      {
        label: 'Routine Servicing',
        value: String(m.routineServicesCompleted),
        icon: 'check',
        accent: 'success',
        note: 'Non-repair maintenance completed',
      },
      {
        label: 'Upcoming Scheduled',
        value: String(data.servicing.filter((s) => s.status === 'Scheduled').length),
        icon: 'calendar',
        accent: 'primary',
        note: 'Non-repair maintenance with status Scheduled',
      },
      {
        label: 'Calibration Compliance',
        value: NOT_TRACKED,
        icon: 'sparkles',
        accent: 'neutral',
        note: 'No calibration record exists yet',
      },
      {
        label: 'Firmware Up-to-date',
        value: NOT_TRACKED,
        icon: 'check',
        accent: 'neutral',
        note: 'No firmware record exists yet',
      },
    ]
  }, [data])

  // Availability KPI Strip
  const availabilityKpis = useMemo<Kpi[]>(() => {
    if (!data) return []
    const m = data.metrics
    return [
      {
        label: 'Fleet Availability',
        value: m.fleetAvailabilityRate === null ? '—' : `${m.fleetAvailabilityRate}%`,
        icon: 'chart',
        accent: 'neutral',
        note: 'Units In Stock of all units not retired, now',
      },
      {
        label: 'Sidelined Units',
        value: String(m.sidelinedUnitsCount),
        icon: 'alert_triangle',
        accent: m.sidelinedUnitsCount > 5 ? 'warn' : 'neutral',
        note: 'In inspection, cleaning, maintenance or missing',
      },
      {
        label: 'Workshop Downtime',
        value: NOT_TRACKED,
        icon: 'timer',
        accent: 'neutral',
        note: 'Needs unit state history over time',
      },
      {
        label: 'Rental Ready Fleet',
        value: `${m.rentalReadyUnits} Units`,
        icon: 'box',
        accent: 'primary',
        note: 'Units In Stock right now',
      },
    ]
  }, [data])

  // CSV export generator
  const getCsvRows = (): ReportCsvRow[] => {
    if (activeTab === 'damage') {
      return [
        ['Damage Findings & Liabilities Report'],
        ['Metric', 'Value'],
        ['Total Damage Incidents', data?.metrics.totalFindings ?? 0],
        ['Total Assessed Damage Cost', money ? formatMoney(data?.metrics.totalDamageCost ?? (0 as Paisa)) : 'Restricted'],
        ['Total Recovered from Clients', money ? formatMoney(data?.metrics.totalChargedToClient ?? (0 as Paisa)) : 'Restricted'],
        [],
        ['Severity Breakdown'],
        ['Severity', 'Incidents Count', 'Share %', 'Total Cost'],
        ...(data?.severityBreakdown.map((s): ReportCsvRow => [
          s.severity,
          s.count,
          `${s.percent}%`,
          money ? formatMoney(s.totalCost) : 'Restricted',
        ]) ?? []),
        [],
        ['Damage Incidents Log'],
        ['Finding ID', 'Booking No', 'Client', 'Equipment Unit', 'Serial', 'Severity', 'Estimated Cost', 'Disposition'],
        ...(data?.incidents.map((i): ReportCsvRow => [
          i.id,
          i.bookingNo,
          i.clientName,
          i.unitName,
          i.serial,
          i.severity,
          money ? formatMoney(i.estimatedCost) : 'Restricted',
          i.disposition,
        ]) ?? []),
      ]
    } else if (activeTab === 'repairs') {
      return [
        ['Equipment Repairs & Workshop Turnaround Report'],
        ['Metric', 'Value'],
        ['Active Repairs in Shop', data?.metrics.activeRepairs ?? 0],
        ['Average Turnaround Days', data?.metrics.averageTurnaroundDays == null ? '—' : `${data.metrics.averageTurnaroundDays} Days`],
        ['Total Repair Spend', money ? formatMoney(data?.metrics.totalRepairSpend ?? (0 as Paisa)) : 'Restricted'],
        [],
        ['Repairs Log'],
        ['Record No', 'Equipment Unit', 'Serial', 'Issue Description', 'Vendor / Shop', 'Priority', 'Status', 'Turnaround Days', 'Cost'],
        ...(data?.repairs.map((r): ReportCsvRow => [
          r.recordNo,
          r.unitName,
          r.serial,
          r.issue,
          r.vendorOrShop,
          r.priority,
          r.status,
          `${r.turnaroundDays} days`,
          money ? formatMoney(r.cost) : 'Restricted',
        ]) ?? []),
      ]
    } else if (activeTab === 'servicing') {
      return [
        ['Preventive Servicing & Calibration Report'],
        ['Metric', 'Value'],
        ['Routine Services Completed', data?.metrics.routineServicesCompleted ?? 0],
        [],
        ['Servicing Schedule Log'],
        ['Record No', 'Equipment Unit', 'Serial', 'Service Type', 'Scheduled Date', 'Assigned Tech', 'Status'],
        ...(data?.servicing.map((s): ReportCsvRow => [
          s.recordNo,
          s.unitName,
          s.serial,
          s.serviceType,
          s.scheduledDate,
          s.performedBy,
          s.status,
        ]) ?? []),
      ]
    } else {
      return [
        ['Fleet Downtime & Out-of-Service Rate Report'],
        ['Metric', 'Value'],
        ['Fleet Availability Rate', data?.metrics.fleetAvailabilityRate == null ? '—' : `${data.metrics.fleetAvailabilityRate}%`],
        ['Total Sidelined Units', data?.metrics.sidelinedUnitsCount ?? 0],
        [],
        ['Sidelined Fleet Units Register'],
        ['Serial', 'Model Name', 'Current Status', 'Sidelined Since', 'Downtime Reason'],
        ...(data?.sidelinedUnits.map((u): ReportCsvRow => [
          u.serial,
          u.modelName,
          u.status,
          u.sidelinedSince,
          u.reason,
        ]) ?? []),
      ]
    }
  }

  // Slices for Donut charts
  const severitySlices: Slice[] = useMemo(() => {
    if (!data) return []
    return data.severityBreakdown.map((s) => ({
      label: s.severity,
      value: s.count,
      display: `${s.count} incidents`,
      percent: `${s.percent}%`,
    }))
  }, [data])

  const typeSlices: Slice[] = useMemo(() => {
    if (!data) return []
    return data.damageTypeBreakdown.map((t) => ({
      label: t.damageType,
      value: t.count,
      display: `${t.count} (${t.percent}%)`,
      percent: `${t.percent}%`,
    }))
  }, [data])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader
        icon="tool"
        title="Damage & Maintenance Reports"
        description="Physical condition findings, workshop turnaround, preventive calibration servicing, and sidelined fleet units."
      />

      {/* Shared Toolbar */}
      <ReportToolbar
        title="Damage & Maintenance Reports"
        value={filters}
        onChange={setFilters}
        dateColumn="created_at"
        csv={{
          filename: `damage-maintenance-${activeTab}`,
          build: getCsvRows,
        }}
      >
        <div
          role="group"
          aria-label="Damage report views"
          className="report-view-toggle"
          style={{ display: 'inline-flex' }}
        >
          {([
            ['Damage Findings', 'damage'],
            ['Equipment Repairs', 'repairs'],
            ['Scheduled Servicing', 'servicing'],
            ['Fleet Availability', 'availability'],
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

      {/* TAB 1: DAMAGE FINDINGS */}
      <PageBody
        noun="damage and maintenance figures"
        loading={load.loading}
        error={load.error}
        onRetry={load.reload}
        hasRows={data !== null}
        skeleton="kpi"
        empty={nothing}
        emptyIsFiltered={filtered}
        onClearFilters={() => setFilters({})}
        emptyTitle={filtered ? 'No damage or maintenance in this period' : 'No damage or maintenance recorded yet'}
        emptyMessage={
          filtered
            ? 'Nothing was recorded in the selected period. Clear the filters to see everything.'
            : 'Findings, repairs and servicing appear here once the first one is recorded.'
        }
      >
      {activeTab === 'damage' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
          <KpiStrip items={damageKpis} />

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: viewport === 'desktop' ? '1fr 1fr' : '1fr',
              gap: 'var(--sp-md)',
            }}
          >
            {/* Severity Distribution */}
            <div style={cardStyle}>
              <h3 style={{ fontSize: 'var(--t-h3)', fontWeight: 600, marginBottom: 'var(--sp-sm)' }}>
                Findings by Severity Rating
              </h3>
              <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginBottom: 'var(--sp-md)' }}>
                Classification of physical condition findings recorded at check-in.
              </p>
              {severitySlices.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', alignItems: 'center' }}>
                  <Donut slices={severitySlices} size={180} />
                  <Legend slices={severitySlices} />
                </div>
              )}
            </div>

            {/* Damage Types Breakdown */}
            <div style={cardStyle}>
              <h3 style={{ fontSize: 'var(--t-h3)', fontWeight: 600, marginBottom: 'var(--sp-sm)' }}>
                Primary Damage Categories
              </h3>
              <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginBottom: 'var(--sp-md)' }}>
                Hardware failure and handling incident distribution.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
                {typeSlices.map((ts) => (
                  <div
                    key={ts.label}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 14px',
                      background: 'var(--surface-hover)',
                      borderRadius: 'var(--r-sm)',
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 'var(--t-body)' }}>{ts.label}</div>
                    <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                      {ts.display}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Incidents Table */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-sm)' }}>
              <div>
                <h3 style={{ fontSize: 'var(--t-h3)', fontWeight: 600 }}>Recorded Damage Findings</h3>
                <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                  Audit log of returned equipment issues, assessed liability, and repair disposition.
                </p>
              </div>
              <Link
                to="/cases"
                style={{
                  fontSize: 'var(--t-meta)',
                  color: 'var(--primary)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  textDecoration: 'none',
                }}
              >
                View Cases Workspace <Icon name="chevron_right" size={12} />
              </Link>
            </div>

            <DataTableShell ariaLabel="Recorded Damage Findings">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>Finding ID</th>
                    <th style={th}>Booking</th>
                    <th style={th}>Equipment Unit</th>
                    <th style={th}>Serial</th>
                    <th style={th}>Severity</th>
                    <th style={th}>Description</th>
                    {money && <th style={{ ...th, textAlign: 'right' }}>Assessed Cost</th>}
                    <th style={th}>Disposition</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.incidents.length === 0 && <NoMatchRow colSpan={money ? 8 : 7} noun="damage findings" />}
                  {data?.incidents.map((inc) => (
                    <tr key={inc.id}>
                      <td style={{ ...td, fontWeight: 600, color: 'var(--primary)' }}>{inc.id}</td>
                      <td style={td}>
                        {inc.bookingNo === '—' ? (
                          '—'
                        ) : (
                          <Link
                            to={`/rentals/${inc.bookingNo}`}
                            style={{ color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}
                          >
                            {inc.bookingNo}
                          </Link>
                        )}
                      </td>
                      <td style={{ ...td, fontWeight: 600 }}>{inc.unitName}</td>
                      <td style={{ ...td, fontFamily: 'var(--font-id, sans-serif)', fontVariantNumeric: 'tabular-nums' }}>{inc.serial}</td>
                      <td style={td}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 'var(--r-sm)',
                            fontSize: 'var(--t-meta)',
                            fontWeight: 600,
                            background:
                              inc.severity === 'Critical' || inc.severity === 'Severe'
                                ? 'var(--status-danger-bg)'
                                : inc.severity === 'Moderate'
                                  ? 'var(--status-warn-bg)'
                                  : 'var(--surface-hover)',
                            color:
                              inc.severity === 'Critical' || inc.severity === 'Severe'
                                ? 'var(--status-danger-text)'
                                : inc.severity === 'Moderate'
                                  ? 'var(--status-warn-text)'
                                  : 'var(--text)',
                          }}
                        >
                          {inc.severity}
                        </span>
                      </td>
                      <td style={{ ...td, maxWidth: 260 }}>{inc.description}</td>
                      {money && (
                        <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>
                          {formatMoney(inc.estimatedCost)}
                        </td>
                      )}
                      <td style={td}>{inc.disposition}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTableShell>
          </div>
        </div>
      )}

      {/* TAB 2: EQUIPMENT REPAIRS */}
      {activeTab === 'repairs' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
          <KpiStrip items={repairKpis} />

          <div style={cardStyle}>
            <h3 style={{ fontSize: 'var(--t-h3)', fontWeight: 600, marginBottom: 'var(--sp-sm)' }}>
              Workshop Repair Jobs Log
            </h3>
            <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginBottom: 'var(--sp-md)' }}>
              Active and completed corrective maintenance jobs across in-house workshop and authorized service partners.
            </p>

            <DataTableShell ariaLabel="Workshop Repair Jobs Log">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>Record No</th>
                    <th style={th}>Equipment</th>
                    <th style={th}>Serial</th>
                    <th style={th}>Fault / Issue Description</th>
                    <th style={th}>Repair Facility</th>
                    <th style={th}>Turnaround</th>
                    <th style={th}>Priority</th>
                    <th style={th}>Status</th>
                    {money && <th style={{ ...th, textAlign: 'right' }}>Cost</th>}
                  </tr>
                </thead>
                <tbody>
                  {data?.repairs.length === 0 && <NoMatchRow colSpan={money ? 9 : 8} noun="repairs" />}
                  {data?.repairs.map((rep) => (
                    <tr key={rep.id}>
                      <td style={{ ...td, fontWeight: 600, color: 'var(--primary)' }}>{rep.recordNo}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{rep.unitName}</td>
                      <td style={{ ...td, fontFamily: 'var(--font-id, sans-serif)', fontVariantNumeric: 'tabular-nums' }}>{rep.serial}</td>
                      <td style={{ ...td, maxWidth: 250 }}>{rep.issue}</td>
                      <td style={td}>{rep.vendorOrShop}</td>
                      <td style={td}>{rep.turnaroundDays === null ? '—' : `${rep.turnaroundDays} days`}</td>
                      <td style={td}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 'var(--r-sm)',
                            fontSize: 'var(--t-meta)',
                            fontWeight: 600,
                            background: rep.priority === 'Urgent' ? 'var(--status-danger-bg)' : 'var(--surface-hover)',
                            color: rep.priority === 'Urgent' ? 'var(--status-danger-text)' : 'var(--text)',
                          }}
                        >
                          {rep.priority}
                        </span>
                      </td>
                      <td style={td}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 'var(--r-sm)',
                            fontSize: 'var(--t-meta)',
                            background: rep.status === 'Completed' ? 'var(--status-success-bg)' : 'var(--status-warn-bg)',
                            color: rep.status === 'Completed' ? 'var(--status-success-text)' : 'var(--status-warn-text)',
                            fontWeight: 600,
                          }}
                        >
                          {rep.status}
                        </span>
                      </td>
                      {money && (
                        <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>
                          {formatMoney(rep.cost)}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTableShell>
          </div>
        </div>
      )}

      {/* TAB 3: SCHEDULED SERVICING */}
      {activeTab === 'servicing' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
          <KpiStrip items={servicingKpis} />

          <div style={cardStyle}>
            <h3 style={{ fontSize: 'var(--t-h3)', fontWeight: 600, marginBottom: 'var(--sp-sm)' }}>
              Preventive Maintenance & Calibration Schedule
            </h3>
            <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginBottom: 'var(--sp-md)' }}>
              Calendar of sensor cleaning, firmware upgrades, and lens collimation checks to ensure zero on-set failure.
            </p>

            <DataTableShell ariaLabel="Preventive Maintenance Schedule">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>Record No</th>
                    <th style={th}>Equipment</th>
                    <th style={th}>Serial</th>
                    <th style={th}>Servicing Scope</th>
                    <th style={th}>Scheduled Date</th>
                    <th style={th}>Technician</th>
                    <th style={th}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.servicing.length === 0 && <NoMatchRow colSpan={7} noun="servicing records" />}
                  {data?.servicing.map((srv) => (
                    <tr key={srv.id}>
                      <td style={{ ...td, fontWeight: 600, color: 'var(--primary)' }}>{srv.recordNo}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{srv.unitName}</td>
                      <td style={{ ...td, fontFamily: 'var(--font-id, sans-serif)', fontVariantNumeric: 'tabular-nums' }}>{srv.serial}</td>
                      <td style={td}>{srv.serviceType}</td>
                      <td style={td}>{dateOrDash(srv.scheduledDate)}</td>
                      <td style={td}>{srv.performedBy}</td>
                      <td style={td}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 'var(--r-sm)',
                            fontSize: 'var(--t-meta)',
                            background: srv.status === 'Completed' ? 'var(--status-success-bg)' : 'var(--surface-hover)',
                            color: srv.status === 'Completed' ? 'var(--status-success-text)' : 'var(--text)',
                          }}
                        >
                          {srv.status}
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

      {/* TAB 4: FLEET AVAILABILITY */}
      {activeTab === 'availability' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
          <KpiStrip items={availabilityKpis} />

          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-sm)' }}>
              <div>
                <h3 style={{ fontSize: 'var(--t-h3)', fontWeight: 600 }}>Sidelined Fleet Units Register</h3>
                <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                  Equipment currently withheld from booking inventory due to maintenance, QC inspection, or cleaning.
                </p>
              </div>
              <Link
                to="/inventory"
                style={{
                  fontSize: 'var(--t-meta)',
                  color: 'var(--primary)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  textDecoration: 'none',
                }}
              >
                View Fleet Inventory <Icon name="chevron_right" size={12} />
              </Link>
            </div>

            <DataTableShell ariaLabel="Sidelined Fleet Units Register">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>Unit ID</th>
                    <th style={th}>Serial</th>
                    <th style={th}>Model Name</th>
                    <th style={th}>Current Bay / Status</th>
                    <th style={th}>Last Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.sidelinedUnits.length === 0 && <NoMatchRow colSpan={5} noun="sidelined units" />}
                  {data?.sidelinedUnits.map((unit) => (
                    <tr key={unit.id}>
                      <td style={td}>{unit.id}</td>
                      <td style={{ ...td, fontFamily: 'var(--font-id, sans-serif)', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{unit.serial}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{unit.modelName}</td>
                      <td style={td}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 'var(--r-sm)',
                            fontSize: 'var(--t-meta)',
                            background: unit.status === 'Missing' ? 'var(--status-danger-bg)' : 'var(--status-warn-bg)',
                            color: unit.status === 'Missing' ? 'var(--status-danger-text)' : 'var(--status-warn-text)',
                            fontWeight: 600,
                          }}
                        >
                          {unit.status}
                        </span>
                      </td>
                      <td style={td}>{unit.sidelinedSince ? formatAdDateTime(unit.sidelinedSince) : '—'}</td>
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
