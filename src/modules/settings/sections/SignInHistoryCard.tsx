import { useState, useEffect, useCallback } from 'react'
import { Card, Button } from '../../../components/ui/Page'
import { DataTableShell } from '../../../components/ui/DataTable'
import { thStyle as th } from '../../../components/ui/TableHeaderCell'
import { ToneChip, td } from './shared'
import { useAuth } from '../../../lib/auth'
import {
  canViewSignInHistory,
  fetchRecentSignInEvents,
  type RecentSignInEvent,
} from '../../../lib/loginAudit'
import type { StatusKey } from '../../../lib/status'
import type { IconName } from '../../../components/ui/Icon'

function formatEventKind(kind: RecentSignInEvent['kind']): { label: string; tone: StatusKey; icon: IconName } {
  switch (kind) {
    case 'sign-in':
      return { label: 'Sign-in', tone: 'in', icon: 'check' }
    case 'new_device':
      return { label: 'New Device', tone: 'out', icon: 'alert_triangle' }
    case 'pin_switch':
      return { label: 'PIN Switch', tone: 'primary', icon: 'lock' }
    case 'failed':
      return { label: 'Failed Attempt', tone: 'danger', icon: 'alert_circle' }
    default:
      return { label: kind, tone: 'neutral', icon: 'info' }
  }
}

function parseDeviceSummary(event: RecentSignInEvent): string {
  if (event.metadata && typeof event.metadata === 'object') {
    const meta = event.metadata as Record<string, unknown>
    if (meta['browser'] && meta['os']) {
      return `${String(meta['browser'])} on ${String(meta['os'])}`
    }
  }
  if (event.user_agent) {
    if (event.user_agent.includes('iPad')) return 'iPadOS Safari'
    if (event.user_agent.includes('iPhone')) return 'iOS Safari'
    if (event.user_agent.includes('Macintosh')) return 'macOS'
    if (event.user_agent.includes('Windows')) return 'Windows'
    if (event.user_agent.includes('Android')) return 'Android'
    if (event.user_agent.includes('Linux')) return 'Linux'
    return event.user_agent.slice(0, 30)
  }
  return event.device_hash.slice(0, 16)
}

function formatEventTimestamp(isoString: string): string {
  try {
    const d = new Date(isoString)
    if (Number.isNaN(d.getTime())) return isoString
    return d.toLocaleString('en-US', {
      timeZone: 'Asia/Kathmandu',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }) + ' NPT'
  } catch {
    return isoString
  }
}

export function SignInHistoryCard() {
  const { user } = useAuth()
  const role = user?.role ?? 'Client'
  const isAuthorized = canViewSignInHistory(role)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [events, setEvents] = useState<RecentSignInEvent[]>([])

  const loadEvents = useCallback(async () => {
    if (!isAuthorized) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await fetchRecentSignInEvents(50)
      setEvents(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sign-in history')
    } finally {
      setLoading(false)
    }
  }, [isAuthorized])

  useEffect(() => {
    loadEvents()
  }, [loadEvents])

  if (!isAuthorized) {
    return null
  }

  return (
    <Card
      title="Sign-In History"
      action={
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)' }}>
          <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
            Owner & Admin access only (B22)
          </span>
          <Button
            variant="secondary"
            onClick={loadEvents}
            disabled={loading}
            style={{ fontSize: 'var(--t-caption)', height: 32, padding: '0 var(--sp-sm)' }}
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
        <p style={{ margin: 0, fontSize: 'var(--t-caption)', color: 'var(--muted)' }}>
          Server-recorded authentication events, PIN screen-unlock switches, and first-seen device alerts (B23).
        </p>

        {loading && (
          <div style={{ padding: 'var(--sp-lg)', textAlign: 'center', color: 'var(--muted)', fontSize: 'var(--t-caption)' }}>
            Loading sign-in history…
          </div>
        )}

        {error && !loading && (
          <div
            style={{
              padding: 'var(--sp-md)',
              borderRadius: 'var(--rad-sm)',
              background: 'var(--danger-bg, #fee2e2)',
              color: 'var(--danger-fg, #b91c1c)',
              fontSize: 'var(--t-caption)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>{error}</span>
            <Button variant="secondary" onClick={loadEvents} style={{ height: 28, fontSize: 'var(--t-caption)' }}>
              Retry
            </Button>
          </div>
        )}

        {!loading && !error && events.length === 0 && (
          <div style={{ padding: 'var(--sp-lg)', textAlign: 'center', color: 'var(--muted)', fontSize: 'var(--t-caption)' }}>
            No sign-in events recorded yet.
          </div>
        )}

        {!loading && !error && events.length > 0 && (
          <DataTableShell ariaLabel="Sign-in history" data-table-scroll style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
              <thead>
                <tr>
                  <th style={th}>Time (NPT)</th>
                  <th style={th}>Person</th>
                  <th style={th}>Event</th>
                  <th style={th}>Device / Browser</th>
                  <th style={th}>IP Address</th>
                </tr>
              </thead>
              <tbody>
                {events.map((evt) => {
                  const { label, tone, icon } = formatEventKind(evt.kind)
                  return (
                    <tr key={evt.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ ...td, whiteSpace: 'nowrap', fontSize: 'var(--t-caption)', fontFamily: 'var(--font-mono)' }}>
                        {formatEventTimestamp(evt.created_at)}
                      </td>
                      <td style={td}>
                        <div style={{ fontWeight: 600, fontSize: 'var(--t-body)' }}>{evt.full_name}</div>
                        <div style={{ fontSize: 'var(--t-caption)', color: 'var(--muted)' }}>{evt.role}</div>
                      </td>
                      <td style={td}>
                        <ToneChip tone={tone} icon={icon}>
                          {label}
                        </ToneChip>
                      </td>
                      <td style={{ ...td, fontSize: 'var(--t-caption)' }}>
                        {parseDeviceSummary(evt)}
                      </td>
                      <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 'var(--t-caption)', color: 'var(--muted)' }}>
                        {evt.ip_address || '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </DataTableShell>
        )}
      </div>
    </Card>
  )
}
