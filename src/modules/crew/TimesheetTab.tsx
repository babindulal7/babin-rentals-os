/**
 * Crew timesheet — the week's hours per person, with per-day bar charts, a KPI
 * strip, the approval state and a CSV export.
 *
 * RULING 2026-10-20: the hours come from `crew_shoot_days` (recorded call/wrap
 * minus break), not the five invented staff this page used to render. Pay is an
 * hours-based estimate (⭐ unruled — see `lib/queries/timesheet.ts`), and money
 * is withheld from a money-blind role (Law 6) rather than shown as zero.
 */
import { useState, useMemo, useCallback, Fragment } from 'react'
import { Card, KpiStrip, PageHeader } from '../../components/ui/Page'
import type { Kpi } from '../../components/ui/Page'
import { PageActions } from '../../components/ui/PageActions'
import { Button } from '../../components/ui/Button'
import Icon from '../../components/ui/Icon'
import { Badge } from '../../components/ui/Badge'
import { SearchInput } from '../../components/ui/SearchInput'
import { PageShell } from '../../components/ui/PageShell'
import { DataTableShell } from '../../components/ui/DataTable'
import { PageBody } from '../../components/ui/PageBody'
import { EmptyState } from '../../components/ui/StateViews'
import { useToast } from '../../components/ui/Toast'
import { recordExport } from '../../lib/exportAudit'
import { formatMoney, rupees } from '../../lib/money'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { useViewport } from '../../lib/device'
import {
  TIMESHEET_DAYS,
  STANDARD_DAY_HOURS,
  getTimesheetStats,
  hasOvertime,
  formatHours,
  timesheetCsv,
  downloadTimesheetCsv,
  type TimesheetApproval,
  type TimesheetWeek,
  type TimesheetRow,
} from '../../lib/queries/timesheet'
import { useTimesheetWeek } from '../../lib/queries/useTimesheet'

// ── Small shared pieces ──────────────────────────────────────────────

/** The payout gate, in words — never colour alone. */
const APPROVAL_TONE: Record<TimesheetApproval, 'in' | 'progress' | 'dim'> = {
  Approved: 'in',
  'Awaiting approval': 'progress',
  'Not submitted': 'dim',
}

function ApprovalBadge({ approval }: { approval: TimesheetApproval }) {
  return <Badge tone={APPROVAL_TONE[approval]} label={approval} />
}

/** Hours the grid cannot show: shoot days up to today with no recorded call/wrap. */
function unrecordedNote(days: number): string | null {
  if (days === 0) return null
  return `${days} shoot day${days === 1 ? '' : 's'} with no recorded call/wrap time`
}

// ── Styles ───────────────────────────────────────────────────────────

const chipRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  flexWrap: 'wrap',
}

const weekChipBase: React.CSSProperties = {
  minHeight: 'var(--tap, 44px)',
  padding: '7px 14px',
  borderRadius: '9px',
  fontSize: '12px',
  fontWeight: 600,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--text3)',
  transition: 'all 0.15s',
}

const weekChipActive: React.CSSProperties = {
  ...weekChipBase,
  background: 'rgba(47, 125, 255, 0.14)',
  color: 'var(--info)',
  border: '1px solid rgba(47, 125, 255, 0.4)',
}

const dayBarWrapStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-end',
  gap: '4px',
  height: 50,
  padding: '8px 0',
}

const dayBarColStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '2px',
  flex: 1,
  minWidth: 0,
}

// ── Phone card layout ────────────────────────────────────────────────

function StaffCard({
  row,
  isOpen,
  onToggle,
  canViewMoney,
}: {
  row: TimesheetRow
  isOpen: boolean
  onToggle: () => void
  canViewMoney: boolean
}) {
  return (
    <Card>
      <div
        style={{ padding: '14px 16px', cursor: 'pointer' }}
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 'var(--t-body)' }}>{row.name}</div>
            <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text3)', marginTop: '2px' }}>{row.role}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 600, fontSize: 'var(--t-body)' }}>{formatHours(row.totalHrs)}h</div>
              {canViewMoney && row.pay !== null && (
                <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text3)' }}>
                  {formatMoney(rupees(row.pay))}
                </div>
              )}
            </div>
            <Icon name={isOpen ? 'chevron_down' : 'chevron_right'} size={14} />
          </div>
        </div>

        {/* Daily hours summary */}
        <div style={{ display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
          {row.hrs.map((h, i) => (
            <div key={i} style={{ fontSize: '11px', display: 'flex', gap: '2px' }}>
              <span style={{ color: 'var(--text3)' }}>{TIMESHEET_DAYS[i]}</span>
              <span style={{
                fontWeight: 600,
                color: h === 0 ? 'var(--text3)' : h > STANDARD_DAY_HOURS ? 'var(--warn-text)' : 'var(--text)',
              }}>
                {formatHours(h)}h
              </span>
            </div>
          ))}
        </div>

        <div style={{ marginTop: '8px' }}>
          <ApprovalBadge approval={row.approval} />
        </div>
        {unrecordedNote(row.unrecordedDays) && (
          <div style={{ marginTop: '6px', fontSize: 'var(--t-meta)', color: 'var(--text3)' }}>{unrecordedNote(row.unrecordedDays)}</div>
        )}

        {/* Expanded bar chart */}
        {isOpen && (
          <div style={dayBarWrapStyle}>
            {row.hrs.map((h, i) => (
              <div key={i} style={dayBarColStyle}>
                <div
                  style={{
                    width: '100%',
                    height: Math.round((h / 9) * 40),
                    borderRadius: '3px 3px 0 0',
                    background: h === 0 ? 'var(--border)' : h >= STANDARD_DAY_HOURS ? 'var(--success)' : 'var(--ready)',
                    minHeight: h > 0 ? 4 : 2,
                    transition: 'height 0.2s',
                  }}
                />
                <span style={{ fontSize: '10px', color: 'var(--text3)' }}>{TIMESHEET_DAYS[i]}</span>
              </div>
            ))}
          </div>
        )}

        {/* Overtime flag */}
        {hasOvertime(row) && (
          <div style={{ marginTop: '6px' }}>
            <Badge tone="warning" label="Overtime" />
          </div>
        )}
      </div>
    </Card>
  )
}

// ── Main component ───────────────────────────────────────────────────

export default function TimesheetTab() {
  const { showSuccessToast } = useToast()
  const viewport = useViewport()
  const isPhone = viewport === 'phone'
  const canViewMoney = useCanViewMoney()

  const [week, setWeek] = useState<TimesheetWeek>('This Week')
  const [search, setSearch] = useState('')
  const [openIdx, setOpenIdx] = useState<number | null>(null)

  const sheet = useTimesheetWeek(week)
  const rows = sheet.rows
  const stats = useMemo(() => getTimesheetStats(rows), [rows])

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows
    const q = search.toLowerCase()
    return rows.filter(
      (r) => r.name.toLowerCase().includes(q) || r.role.toLowerCase().includes(q),
    )
  }, [rows, search])

  const handleExport = useCallback(() => {
    const { columns, text } = timesheetCsv(rows, canViewMoney)
    downloadTimesheetCsv(text, week)
    recordExport({ list: 'crew.timesheet', module: 'Operations', rowCount: rows.length, columns, filter: week })
    showSuccessToast(`Exported timesheet CSV for ${week.toLowerCase()}`)
  }, [rows, week, canViewMoney, showSuccessToast])

  const kpis: Kpi[] = useMemo(() => [
    { label: 'Total Hours', value: `${formatHours(stats.totalHours)}h`, icon: 'timer', accent: 'primary' },
    ...(canViewMoney
      ? [
          {
            label: 'Estimated Pay',
            value: formatMoney(rupees(stats.totalPay ?? 0)),
            icon: 'card' as const,
            accent: 'success' as const,
            definition: `Sum of hours × day rate ÷ ${STANDARD_DAY_HOURS} across the crew this week. An estimate: crew payouts are days booked × day rate, and the hourly basis is not ruled yet.`,
          },
        ]
      : []),
    { label: 'Staff Logged', value: `${stats.staffLogged} / ${stats.totalStaff}`, icon: 'users', accent: 'progress' },
    { label: 'Overtime Flags', value: String(stats.overtimeFlags), icon: 'alert_triangle', accent: 'warn' },
  ], [stats, canViewMoney])

  return (
    <PageShell
      header={
        <PageHeader
          title="Presence Log & Timesheet"
          description="Hours worked on crew shoot days, from recorded call and wrap times."
          search={{
            value: search,
            onChange: setSearch,
            placeholder: 'Search staff, role… (press /)',
          }}
          actions={
            canViewMoney ? (
              <PageActions
                secondary={
                  <Button onClick={handleExport}>
                    <Icon name="download" size={14} />
                    Export CSV
                  </Button>
                }
              />
            ) : undefined
          }
        />
      }
    >
      {/* KPI strip */}
      <KpiStrip items={kpis} columns={isPhone ? 2 : (canViewMoney ? 4 : 3)} />

      {/* Controls row: week chips + search */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', margin: 'var(--sp-md) 0' }}>
        <div style={chipRowStyle}>
          {(['This Week', 'Last Week'] as TimesheetWeek[]).map((label) => (
            <button
              key={label}
              type="button"
              aria-pressed={week === label}
              style={week === label ? weekChipActive : weekChipBase}
              onClick={() => { setWeek(label); setOpenIdx(null) }}
            >
              {label}
            </button>
          ))}
        </div>
        <div style={{ minWidth: 200, maxWidth: 300 }}>
          <SearchInput value={search} onChange={setSearch} placeholder="Search staff…" />
        </div>
      </div>

      <PageBody
        loading={sheet.loading}
        error={sheet.error}
        onRetry={sheet.refetch}
        hasRows={rows.length > 0}
        empty={sheet.isEmpty}
        noun="timesheet"
        skeleton="table"
        emptyTitle={`No crew shoot days ${week === 'This Week' ? 'this week' : 'last week'}`}
        emptyMessage="Hours appear here once crew are booked onto shoot days and their call and wrap times are recorded."
      >
      {/* ── Phone: card layout ─────────────────────────────────────── */}
      {isPhone ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
          {filteredRows.length === 0 && (
            <EmptyState
              kind={search.trim() ? 'no-results' : 'nothing-yet'}
              title={search.trim() ? `No staff matching "${search}"` : 'No timesheet entries this period'}
              description={search.trim() ? 'Try searching for a different staff member or role.' : 'No staff hours have been recorded for this period.'}
              {...(search.trim() ? { actionLabel: 'Clear Search', onAction: () => setSearch('') } : {})}
            />
          )}
          {filteredRows.map((row, i) => (
            <StaffCard
              key={row.name}
              row={row}
              isOpen={openIdx === i}
              onToggle={() => setOpenIdx(openIdx === i ? null : i)}
              canViewMoney={canViewMoney}
            />
          ))}
        </div>
      ) : (
        /* ── Desktop: table layout ──────────────────────────────────── */
        <Card>
          <DataTableShell ariaLabel="Staff timesheet">
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--t-meta)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '10px 16px', fontWeight: 600, color: 'var(--text2)', whiteSpace: 'nowrap' }}>Staff</th>
                  <th style={{ padding: '10px 8px', fontWeight: 600, color: 'var(--text2)' }}>Role</th>
                  {TIMESHEET_DAYS.map((d) => (
                    <th key={d} style={{ padding: '10px 6px', fontWeight: 600, color: 'var(--text3)', textAlign: 'center', minWidth: 36 }}>{d}</th>
                  ))}
                  <th style={{ padding: '10px 8px', fontWeight: 600, color: 'var(--text2)', textAlign: 'right' }}>Hours</th>
                  {canViewMoney && (
                    <th style={{ padding: '10px 16px', fontWeight: 600, color: 'var(--text2)', textAlign: 'right' }}>Est. pay</th>
                  )}
                  <th style={{ padding: '10px 8px', fontWeight: 600, color: 'var(--text2)' }}>Approval</th>
                  <th style={{ width: 32 }} />
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={canViewMoney ? 12 : 11} style={{ padding: '24px 16px' }}>
                      <EmptyState
                        kind={search.trim() ? 'no-results' : 'nothing-yet'}
                        title={search.trim() ? `No staff matching "${search}"` : 'No timesheet entries this period'}
                        description={search.trim() ? 'Try searching for a different staff member or role.' : 'No staff hours have been recorded for this period.'}
                        {...(search.trim() ? { actionLabel: 'Clear Search', onAction: () => setSearch('') } : {})}
                      />
                    </td>
                  </tr>
                )}
                {filteredRows.map((row, i) => {
                  const isOpen = openIdx === i
                  return (
                    /* RULING 2026-10-13: a keyed Fragment, not a nested <tbody> —
                       <tbody> inside <tbody> is invalid HTML (React validateDOMNesting). */
                    <Fragment key={row.key}>
                      <tr
                        role="row"
                        tabIndex={0}
                        aria-expanded={isOpen}
                        aria-label={`Timesheet details for ${row.name}`}
                        style={{
                          borderBottom: isOpen ? 'none' : '1px solid var(--border)',
                          cursor: 'pointer',
                          transition: 'background 0.1s',
                        }}
                        onClick={() => setOpenIdx(isOpen ? null : i)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setOpenIdx(isOpen ? null : i)
                          }
                        }}
                      >
                        <td style={{ padding: '10px 16px', fontWeight: 500, whiteSpace: 'nowrap' }}>{row.name}</td>
                        <td style={{ padding: '10px 8px', color: 'var(--text2)' }}>{row.role}</td>
                        {row.hrs.map((h, di) => (
                          <td
                            key={di}
                            style={{
                              padding: '10px 6px',
                              textAlign: 'center',
                              fontWeight: h > STANDARD_DAY_HOURS ? 600 : 400,
                              color: h === 0 ? 'var(--text3)' : h > STANDARD_DAY_HOURS ? 'var(--warn-text)' : 'var(--text)',
                            }}
                          >
                            {h > 0 ? `${formatHours(h)}h` : '—'}
                          </td>
                        ))}
                        <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 600 }}>{formatHours(row.totalHrs)}h</td>
                        {canViewMoney && (
                          <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 500 }}>
                            {row.pay === null ? '—' : formatMoney(rupees(row.pay))}
                          </td>
                        )}
                        <td style={{ padding: '10px 8px' }}>
                          <ApprovalBadge approval={row.approval} />
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                          <Icon name={isOpen ? 'chevron_down' : 'chevron_right'} size={12} />
                        </td>
                      </tr>

                      {/* Expanded row: daily bar chart */}
                      {isOpen && (
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                          <td colSpan={canViewMoney ? 12 : 11} style={{ padding: '0 16px 12px' }}>
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', padding: '8px 0', maxWidth: 400 }}>
                              {row.hrs.map((h, di) => (
                                <div key={di} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', flex: 1 }}>
                                  <span style={{ fontSize: '10px', fontWeight: 600, color: h > 0 ? 'var(--text)' : 'var(--text3)' }}>{formatHours(h)}h</span>
                                  <div
                                    style={{
                                      width: '100%',
                                      height: Math.max(Math.round((h / 9) * 40), h > 0 ? 4 : 2),
                                      borderRadius: '3px 3px 0 0',
                                      background: h === 0 ? 'var(--border)' : h >= STANDARD_DAY_HOURS ? 'var(--success)' : 'var(--ready)',
                                      transition: 'height 0.2s',
                                    }}
                                  />
                                  <span style={{ fontSize: '10px', color: 'var(--text3)' }}>{TIMESHEET_DAYS[di]}</span>
                                </div>
                              ))}
                            </div>

                            {/* Rate & overtime info */}
                            {unrecordedNote(row.unrecordedDays) && (
                              <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text3)', marginTop: '4px' }}>{unrecordedNote(row.unrecordedDays)}</div>
                            )}
                            {((canViewMoney && row.rate !== null) || hasOvertime(row)) && (
                              <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text3)', marginTop: '4px' }}>
                                {canViewMoney && row.rate !== null && (
                                  <span>
                                    Rate: {formatMoney(rupees(row.rate))}/day · {formatMoney(rupees(Math.round(row.rate / STANDARD_DAY_HOURS)))}/hr
                                  </span>
                                )}
                                {hasOvertime(row) && (
                                  <span style={{ marginLeft: canViewMoney && row.rate !== null ? '8px' : 0 }}>
                                    <Badge tone="warning" label="Overtime flagged" />
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </DataTableShell>
        </Card>
      )}
      </PageBody>

      {canViewMoney && rows.length > 0 && (
        <p style={{ margin: 'var(--sp-md) 0 0', fontSize: 'var(--t-meta)', color: 'var(--text3)', lineHeight: 1.55 }}>
          Pay is an estimate: hours × day rate ÷ {STANDARD_DAY_HOURS}. Crew payouts on Crew Assist are days booked × day rate,
          and an approved timesheet is what releases a payout — so treat this column as a cross-check, not the payout.
        </p>
      )}
    </PageShell>
  )
}
