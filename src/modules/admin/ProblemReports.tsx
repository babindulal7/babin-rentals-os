import { Fragment, useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import Icon from '../../components/ui/Icon'
import type { IconName } from '../../components/ui/Icon'
import { PageHeader, KpiStrip, cardStyle } from '../../components/ui/Page'
import { Button } from '../../components/ui/Button'
import { DataTableShell } from '../../components/ui/DataTable'
import { PageBody } from '../../components/ui/PageBody'
import { useViewport } from '../../lib/device'
import { useAuth } from '../../lib/auth'
import { toBs, formatBs, formatAdDateTime } from '../../lib/bs'
import { useList } from '../../lib/queries/useList'
import type { ListFilters } from '../../lib/queries/listQuery'
import {
  listProblemReports,
  getProblemReportPhotoUrl,
  PROBLEM_REPORT_STATUSES,
  PROBLEM_REPORT_STATUS_LABELS,
  type ProblemReportListRow,
} from '../../lib/queries/problemReports'
import { updateProblemReportStatus, type UpdateProblemReportStatusInput } from '../../actions/problemReports/updateProblemReportStatus'
import { useToast } from '../../components/ui/Toast'

/**
 * **Problem Reports — Admin review screen (T4-11).**
 *
 * ```
 * ┌ ← Problem Reports    [status ▾][search ▾] ┐
 * │ when │ who │ status │ route │ description │ ▸ │
 * │ Owner/Admin see all; staff see only own     │
 * │ Status changes: Open → Seen → Fixed/Won't fix │
 * └─────────────────────────────────────────────┘
 * PHONE: card rows, ▸ expands the full description and context.
 * ```
 *
 * Reads the REAL trail: `problem_reports` via `lib/queries/problemReports.ts`.
 * Filtering and paging are server-side per `listQuery.ts`, with `id` as the
 * stable tiebreak.
 *
 * ## Permissions
 *
 * - Owner/Admin: see all reports, can change status
 * - All other staff: see only their own reports, cannot change status
 * - Client: denied (RLS)
 *
 * The route is reachable by five roles. A Coordinator or Warehouse session gets
 * only their own rows from RLS — which must render as **restricted, never empty**
 * so `problemReportRestriction()` is spread into `PageBody`, whose ladder puts
 * restricted above everything.
 */

const ALL = 'All'
const PAGE_SIZE = 25

/** Stated policy: reports are never deleted (Law 3), only archived via status. */

export default function ProblemReports() {
  const viewport = useViewport()
  const { user } = useAuth()

  /* RLS on `problem_reports` admits Owner/Admin for all, others only own. */
  const restriction = problemReportRestriction(user?.role)

  const [status, setStatus] = useState<string>(ALL)
  const [search, setSearch] = useState<string>('')
  const [page, setPage] = useState(0)
  const [expanded, setExpanded] = useState<string | null>(null)

  const patch = useCallback((apply: () => void) => {
    apply()
    setPage(0)
    setExpanded(null)
  }, [])

  const filters: ListFilters = {
    chips: {
      status: status === ALL ? [] : [status],
      ...(search ? { search: [search] as const } : {}),
    },
    page: { index: page, size: PAGE_SIZE },
    search: search ?? null,
  }

  const fetchReports = useCallback((f: ListFilters) => listProblemReports({ ...f, withCount: true }), [])
  const list = useList<ProblemReportListRow>(fetchReports, filters)

  const pageCount = list.total === null ? null : Math.max(1, Math.ceil(list.total / PAGE_SIZE))
  useEffect(() => {
    if (pageCount !== null && page > pageCount - 1) setPage(Math.max(0, pageCount - 1))
  }, [pageCount, page])

  const canManageStatus = user?.role === 'Owner' || user?.role === 'Admin'
  const { showSuccessToast } = useToast()
  const [actionError, setActionError] = useState<string | null>(null)

  const handleStatusChange = async (reportId: string, newStatus: string, reason: string) => {
    setActionError(null)
    try {
      await updateProblemReportStatus(
        {
          reportId,
          status: newStatus as UpdateProblemReportStatusInput['status'],
          reason: reason || undefined,
        },
        {
          userId: user?.id ?? '',
          role: user?.role ?? 'Owner',
          isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
        }
      )
      showSuccessToast('Status updated')
      list.refetch()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update problem report status'
      setActionError(msg)
    }
  }

  const clearFilters = useCallback(() => {
    patch(() => {
      setStatus(ALL)
      setSearch('')
    })
  }, [patch])

  return (
    <div className="settings-v2" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-lg)' }}>
      <PageHeader
        icon="alert_triangle"
        title="Problem Reports"
        description="Reports submitted by staff from any page. Owner/Admin can review all and update status."
      />

      {actionError && (
        <div role="alert" style={{ padding: 'var(--sp-sm)', background: 'var(--danger-soft)', border: '1px solid var(--danger)', borderRadius: 'var(--r-md)', color: 'var(--danger-text)', display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)' }}>
          <Icon name="alert_circle" size={16} />
          <span>{actionError}</span>
        </div>
      )}

      {!restriction.restricted && (
        <>
          <KpiStrip items={[]} columns={viewport === 'phone' ? 1 : viewport === 'tablet' ? 2 : 4} />

          <div
            role="search"
            aria-label="Filter problem reports"
            style={{
              display: 'grid',
              gridTemplateColumns: viewport === 'phone' ? 'minmax(0,1fr)' : 'repeat(3, minmax(0,1fr))',
              gap: 'var(--sp-sm)',
            }}
          >
            <Filter
              label="Status"
              value={status}
              onChange={(v) => patch(() => setStatus(v))}
              options={PROBLEM_REPORT_STATUSES}
              allLabel="All statuses"
            />
            <Filter
              label="Search"
              value={search}
              onChange={(v) => patch(() => setSearch(v))}
              options={[]}
              allLabel=""
            />
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button
                type="button"
                onClick={clearFilters}
                disabled={status === ALL && !search}
                style={{
                  minHeight: 44,
                  padding: '0 12px',
                  borderRadius: 'var(--r-btn)',
                  border: '1px solid var(--border)',
                  background: 'var(--card)',
                  color: status === ALL && !search ? 'var(--muted)' : 'var(--text)',
                  cursor: status === ALL && !search ? 'default' : 'pointer',
                  fontSize: 'var(--t-ui)',
                  fontWeight: 600,
                  fontFamily: 'inherit',
                }}
              >
                Clear filters
              </button>
            </div>
          </div>
        </>
      )}

      <PageBody
        {...restriction}
        loading={list.loading}
        error={list.error}
        onRetry={list.refetch}
        hasRows={list.rows.length > 0}
        empty={list.isEmpty}
        emptyIsFiltered={list.isFiltered}
        onClearFilters={clearFilters}
        noun="problem reports"
        skeleton="table"
        skeletonRows={6}
        {...(!list.isFiltered
          ? {
              emptyTitle: 'No problem reports yet',
              emptyMessage:
                'Staff can submit problem reports from any page using the user menu. ' +
                'They will appear here automatically.',
            }
          : {})}
      >
        {viewport === 'phone' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
            {list.rows.map((r) => (
              <ProblemReportCard
                key={r.id}
                row={r}
                open={expanded === r.id}
                onToggle={() => setExpanded((cur) => (cur === r.id ? null : r.id))}
                canManageStatus={canManageStatus}
                onStatusChange={(newStatus, reason) => handleStatusChange(r.id, newStatus, reason)}
              />
            ))}
          </div>
        ) : (
          <div className="admin-table-shell" style={{ ...cardStyle, overflow: 'hidden' }}>
            <DataTableShell ariaLabel="Problem reports" data-table-scroll style={{ overflowX: 'auto' }}>
              <table className="admin-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
                <thead>
                  <tr style={{ background: 'var(--th-bg)' }}>
                    <th className="admin-th" style={th}>When</th>
                    <th className="admin-th" style={th}>Who</th>
                    <th className="admin-th" style={th}>Status</th>
                    <th className="admin-th" style={th}>Route</th>
                    <th className="admin-th" style={th}>Description</th>
                    <th className="admin-th" style={th}>Device</th>
                    <th className="admin-th" style={th}>App Version</th>
                    <th className="admin-th" style={{ ...th, width: 44 }}>
                      <span style={srOnly}>Detail</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {list.rows.map((r) => {
                    const open = expanded === r.id
                    return (
                      <Fragment key={r.id}>
                        <tr className="admin-row" style={{ borderTop: '1px solid var(--border)' }}>
                          <td className="admin-td" style={{ ...td, color: 'var(--text2)' }}>
                            <WhenCell iso={r.created_at} />
                          </td>
                          <td className="admin-td" style={{ ...td, fontWeight: 600 }}>
                            {r.author_name ?? '—'}
                            <span
                              className="identifier settings-mono"
                              title={r.author_id ?? undefined}
                              style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--muted)', fontWeight: 500 }}
                            >
                              {shortId(r.author_id)}
                            </span>
                          </td>
                          <td className="admin-td" style={td}>
                            <StatusPill status={r.status} />
                          </td>
                          <td className="admin-td" style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 'var(--t-th)' }}>
                            {r.route_path ?? '—'}
                          </td>
                          <td className="admin-td" style={{ ...td, maxWidth: 300, whiteSpace: 'normal', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {r.description}
                          </td>
                          <td className="admin-td" style={{ ...td, color: 'var(--muted)', fontSize: 'var(--t-meta)' }}>
                            {r.device_category ? `${r.device_category} (${r.viewport_width}×${r.viewport_height})` : '—'}
                          </td>
                          <td className="admin-td" style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                            {r.app_version ?? '—'}
                          </td>
                          <td className="admin-td" style={td}>
                            <DiscloseButton
                              open={open}
                              onToggle={() => setExpanded((cur) => (cur === r.id ? null : r.id))}
                              row={r}
                            />
                          </td>
                        </tr>
                        {open && (
                          <tr style={{ background: 'var(--card2)' }}>
                            <td colSpan={8} className="admin-td" style={{ ...td, whiteSpace: 'normal', padding: '12px 14px' }}>
                              <ProblemReportDetail
                                row={r}
                                canManageStatus={canManageStatus}
                                onStatusChange={(newStatus, reason) => handleStatusChange(r.id, newStatus, reason)}
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </DataTableShell>
          </div>
        )}

        {pageCount !== null && pageCount > 1 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 'var(--sp-md)',
              marginTop: 'var(--sp-md)',
            }}
          >
            <PagerButton
              label="Previous page"
              icon="chevron_left"
              disabled={page === 0}
              onClick={() => {
                setPage((p) => Math.max(0, p - 1))
                setExpanded(null)
              }}
            />
            <span className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
              Page {page + 1} of {pageCount}
              {list.total !== null ? ` · ${list.total} reports` : ''}
            </span>
            <PagerButton
              label="Next page"
              icon="chevron_right"
              disabled={page >= pageCount - 1}
              onClick={() => {
                setPage((p) => p + 1)
                setExpanded(null)
              }}
            />
          </div>
        )}
      </PageBody>

      <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.6 }}>
        Reports are preserved for audit history. Status lifecycle: Open → Seen → Fixed/Won&apos;t fix. Owner/Admin can change status with a reason (at least 10 characters).
      </p>
    </div>
  )
}

/* ── restriction helper ──────────────────────────────────────────────────── */

function problemReportRestriction(role: string | undefined) {
  if (!role) return { restricted: true, reason: 'Please sign in to view problem reports' }
  if (role === 'Client') return { restricted: true, reason: 'This module is for internal staff only' }
  return { restricted: false }
}

/* ── derived view-model ──────────────────────────────────────────────────── */

function shortId(id: string | null): string {
  return id ? `${id.slice(0, 8)}…` : '—'
}

/* ── parts ─────────────────────────────────────────────────────────────── */

function WhenCell({ iso }: { iso: string }) {
  const d = new Date(iso)
  const bs = Number.isNaN(d.getTime()) ? null : toBs(d)
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
      {bs && <span className="figure">{formatBs(bs)}</span>}
      <span className="figure" style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
        {formatAdDateTime(iso)}
      </span>
    </span>
  )
}

const STATUS_TONES: Record<string, { bg: string; fg: string; icon: IconName }> = {
  open: { bg: 'var(--primary-soft)', fg: 'var(--primary-text)', icon: 'dot' },
  seen: { bg: 'var(--progress-soft)', fg: 'var(--progress-text)', icon: 'eye' },
  fixed: { bg: 'var(--success-soft)', fg: 'var(--success-text)', icon: 'check' },
  wont_fix: { bg: 'var(--neutral-soft)', fg: 'var(--text2)', icon: 'x' },
}

function StatusPill({ status }: { status: string }) {
  const tone = STATUS_TONES[status] ?? { bg: 'var(--card2)', fg: 'var(--text2)', icon: 'info' }
  const label = PROBLEM_REPORT_STATUS_LABELS[status as keyof typeof PROBLEM_REPORT_STATUS_LABELS] ?? status
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        height: 21,
        padding: '0 8px',
        borderRadius: 'var(--r-badge)',
        background: tone.bg,
        color: tone.fg,
        fontSize: 'var(--t-th)',
        fontWeight: 700,
        whiteSpace: 'nowrap',
      }}
    >
      <Icon name={tone.icon} size={11} />
      {label}
    </span>
  )
}

function ProblemReportCard({
  row,
  open,
  onToggle,
  canManageStatus,
  onStatusChange,
}: {
  row: ProblemReportListRow
  open: boolean
  onToggle: () => void
  canManageStatus: boolean
  onStatusChange: (status: string, reason: string) => void
}) {
  return (
    <article style={{ ...cardStyle, padding: 14, display: 'flex', flexDirection: 'column', gap: 7 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
        <StatusPill status={row.status} />
        <span className="identifier" style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }} title={row.author_id}>
          {row.author_name} {shortId(row.author_id)}
        </span>
        <span style={{ marginLeft: 'auto' }}>
          <WhenCell iso={row.created_at} />
        </span>
      </div>
      <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
        {row.route_path ?? '—'}
      </div>
      <div style={{ fontSize: 'var(--t-sm)', color: 'var(--text)', lineHeight: 1.5 }}>
        {row.description}
      </div>
      <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
        {row.device_category ? `${row.device_category} · ${row.viewport_width}×${row.viewport_height}` : '—'} · {row.app_version ?? '—'}
      </div>
      <DiscloseButton open={open} onToggle={onToggle} row={row} wide />
      {open && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 9 }}>
          <ProblemReportDetail
            row={row}
            canManageStatus={canManageStatus}
            onStatusChange={onStatusChange}
          />
        </div>
      )}
    </article>
  )
}

function ProblemReportDetail({
  row,
  canManageStatus,
  onStatusChange,
}: {
  row: ProblemReportListRow
  canManageStatus: boolean
  onStatusChange: (status: string, reason: string) => void
}) {
  const [newStatus, setNewStatus] = useState<string>(row.status)
  const [reason, setReason] = useState<string>('')
  const [photoLoading, setPhotoLoading] = useState(false)

  const handleViewPhoto = async () => {
    if (!row.photo_path) return
    setPhotoLoading(true)
    try {
      const url = await getProblemReportPhotoUrl(row.photo_path)
      if (url && typeof window !== 'undefined') {
        window.open(url, '_blank', 'noopener,noreferrer')
      }
    } finally {
      setPhotoLoading(false)
    }
  }

  if (!canManageStatus) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', alignItems: 'baseline' }}>
            <dt style={{ fontSize: 'var(--t-th)', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Description
            </dt>
            <dd style={{ margin: 0, fontSize: 'var(--t-sm)', color: 'var(--text)' }}>
              {row.description}
            </dd>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', alignItems: 'baseline' }}>
            <dt style={{ fontSize: 'var(--t-th)', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Route
            </dt>
            <dd style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 'var(--t-meta)', color: 'var(--text)' }}>
              {row.route_path ?? '—'}
            </dd>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', alignItems: 'baseline' }}>
            <dt style={{ fontSize: 'var(--t-th)', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Error Reference
            </dt>
            <dd style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 'var(--t-meta)', color: 'var(--text)' }}>
              {row.error_reference ?? 'None'}
            </dd>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', alignItems: 'baseline' }}>
            <dt style={{ fontSize: 'var(--t-th)', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Photo
            </dt>
            <dd style={{ margin: 0 }}>
              {row.photo_path ? (
                <button
                  type="button"
                  onClick={handleViewPhoto}
                  disabled={photoLoading}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    color: 'var(--link)',
                    cursor: photoLoading ? 'wait' : 'pointer',
                    fontSize: 'inherit',
                    textDecoration: 'underline',
                    fontFamily: 'inherit',
                  }}
                >
                  {photoLoading ? 'Opening…' : 'View photo'}
                </button>
              ) : (
                <span style={{ color: 'var(--muted)' }}>No photo attached</span>
              )}
            </dd>
          </div>
        </dl>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginTop: 9 }}>
          <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
            <span style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Device</span> {row.device_category ?? '—'}
          </span>
          <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
            <span style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Viewport</span> {row.viewport_width ?? '—'}×{row.viewport_height ?? '—'}
          </span>
          <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
            <span style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>App Version</span> {row.app_version ?? '—'}
          </span>
          <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
            <span style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Submitted By</span> {row.author_name} ({shortId(row.author_id)})
          </span>
        </div>
      </div>
    )
  }

  const handleSubmit = () => {
    if (!reason.trim() || reason.trim().length < 10) {
      return
    }
    onStatusChange(newStatus, reason.trim())
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', alignItems: 'baseline' }}>
          <dt style={{ fontSize: 'var(--t-th)', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Description
          </dt>
          <dd style={{ margin: 0, fontSize: 'var(--t-sm)', color: 'var(--text)' }}>
            {row.description}
          </dd>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', alignItems: 'baseline' }}>
          <dt style={{ fontSize: 'var(--t-th)', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Route
          </dt>
          <dd style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 'var(--t-meta)', color: 'var(--text)' }}>
            {row.route_path ?? '—'}
          </dd>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', alignItems: 'baseline' }}>
          <dt style={{ fontSize: 'var(--t-th)', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Error Reference
          </dt>
          <dd style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 'var(--t-meta)', color: 'var(--text)' }}>
            {row.error_reference ?? 'None'}
          </dd>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', alignItems: 'baseline' }}>
          <dt style={{ fontSize: 'var(--t-th)', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Photo
          </dt>
          <dd style={{ margin: 0 }}>
            {row.photo_path ? (
              <button
                type="button"
                onClick={handleViewPhoto}
                disabled={photoLoading}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  color: 'var(--link)',
                  cursor: photoLoading ? 'wait' : 'pointer',
                  fontSize: 'inherit',
                  textDecoration: 'underline',
                  fontFamily: 'inherit',
                }}
              >
                {photoLoading ? 'Opening…' : 'View photo'}
              </button>
            ) : (
              <span style={{ color: 'var(--muted)' }}>No photo attached</span>
            )}
          </dd>
        </div>
      </dl>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginTop: 9 }}>
        <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
          <span style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Device</span> {row.device_category ?? '—'}
        </span>
        <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
          <span style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Viewport</span> {row.viewport_width ?? '—'}×{row.viewport_height ?? '—'}
        </span>
        <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
          <span style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>App Version</span> {row.app_version ?? '—'}
        </span>
        <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
          <span style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Submitted By</span> {row.author_name} ({shortId(row.author_id)})
        </span>
      </div>

      {canManageStatus && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <h4 style={{ margin: '0 0 8px', fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--text)' }}>Change Status</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-sm)', alignItems: 'center' }}>
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              style={{ minHeight: 44, padding: '8px 12px', borderRadius: 'var(--r-input)', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 'var(--t-body)', fontFamily: 'inherit' }}
            >
              {PROBLEM_REPORT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {PROBLEM_REPORT_STATUS_LABELS[s as keyof typeof PROBLEM_REPORT_STATUS_LABELS]}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Reason (≥10 chars)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              style={{ flex: 1, minWidth: 200, minHeight: 44, padding: '8px 12px', borderRadius: 'var(--r-input)', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 'var(--t-body)', fontFamily: 'inherit' }}
            />
            <Button variant="primary" size="sm" onClick={handleSubmit} disabled={newStatus === row.status || reason.trim().length < 10}>
              Update Status
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Prev/Next — 44×44 (Law 15), disabled honestly rather than hidden. */
function PagerButton({
  label,
  icon,
  disabled,
  onClick,
}: {
  label: string
  icon: 'chevron_left' | 'chevron_right'
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 44,
        minHeight: 44,
        borderRadius: 'var(--r-btn)',
        border: '1px solid var(--border)',
        background: 'var(--card)',
        color: disabled ? 'var(--muted)' : 'var(--text)',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Icon name={icon} size={16} />
    </button>
  )
}

function Filter({
  label,
  value,
  onChange,
  options,
  allLabel,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: readonly string[]
  /** The "no constraint" row. Omit for a select whose options already cover everything (Period's 'All time'). */
  allLabel?: string
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
      <span
        style={{ fontSize: 'var(--t-th)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)' }}
      >
        {label}
      </span>
      <select className="settings-input settings-mono" value={value} onChange={(e) => onChange(e.target.value)} style={selectStyle}>
        {allLabel && <option value={ALL}>{allLabel}</option>}
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  )
}

const th: CSSProperties = {
  textAlign: 'left',
  padding: '9px 12px',
  fontSize: 'var(--t-th)',
  fontWeight: 700,
  color: 'var(--text2)',
  whiteSpace: 'nowrap',
}

const td: CSSProperties = {
  height: 'var(--row-min-h)',
  padding: '11px 12px',
  fontSize: 'var(--t-meta)',
  color: 'var(--text)',
  whiteSpace: 'nowrap',
  verticalAlign: 'top',
}

const srOnly: CSSProperties = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }

const selectStyle: CSSProperties = {
  width: '100%',
  minHeight: 44,
  padding: '8px 12px',
  borderRadius: 'var(--r-input)',
  border: '1px solid var(--input-border)',
  background: 'var(--input-bg)',
  color: 'var(--text)',
  fontSize: 'var(--t-body)',
  fontFamily: 'inherit',
}

/** Disclosure button for expanding row detail. */
function DiscloseButton({
  open,
  onToggle,
  row,
  wide,
}: {
  open: boolean
  onToggle: () => void
  row: ProblemReportListRow
  wide?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={`${open ? 'Hide' : 'Show'} detail for report ${row.id}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        minWidth: 44,
        minHeight: 44,
        width: wide ? '100%' : undefined,
        borderRadius: 'var(--r-btn)',
        border: `1px solid ${wide ? 'var(--border)' : 'transparent'}`,
        background: 'transparent',
        color: 'var(--text2)',
        fontSize: 'var(--t-meta)',
        fontWeight: 600,
        fontFamily: 'inherit',
        cursor: 'pointer',
      }}
    >
      <Icon name={open ? 'chevron_down' : 'chevron_right'} size={15} />
      {wide && (open ? 'Hide detail' : 'Show detail')}
    </button>
  )
}