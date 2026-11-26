import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../../lib/auth'
import { Button, Card } from '../../../components/ui/Page'
import { useToast } from '../../../components/ui/Toast'
import Icon from '../../../components/ui/Icon'
import {
  createCalendarFeedToken,
  revokeCalendarFeedToken,
  getCalendarFeedTokenStatus,
} from '../../../actions/delivery'
import { canCreateCalendarFeedToken, canRevokeCalendarFeedToken, canViewCalendarFeedTokenStatus } from '../../../lib/rbac'

export function CalendarFeedControl() {
  const { user } = useAuth()
  const role = user?.role ?? null
  const userId = user?.id ?? null
  const { showSuccessToast } = useToast()

  const [hasToken, setHasToken] = useState(false)
  // Only a completed lookup can say "No active link". A failed lookup cannot.
  const [statusKnown, setStatusKnown] = useState(false)
  const [createdAt, setCreatedAt] = useState<string | null>(null)
  const [revokedAt, setRevokedAt] = useState<string | null>(null)
  const [rawToken, setRawToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showToken, setShowToken] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canCreate = canCreateCalendarFeedToken(role)
  const canRevoke = canRevokeCalendarFeedToken(role, user?.id, user?.id)
  const canView = canViewCalendarFeedTokenStatus(role, user?.id, user?.id)

  const loadStatus = useCallback(async () => {
    if (!canView) return
    setLoading(true)
    try {
      // The dispatcher refuses a call without the signed-in identity (`ActionContext`).
      const result = await getCalendarFeedTokenStatus({}, userId && role ? { userId, role } : undefined)
      setHasToken(result.hasToken)
      setCreatedAt(result.createdAt)
      setRevokedAt(result.revokedAt)
      setStatusKnown(true)
      setError(null)
    } catch {
      // Inline, never a toast: a failed read is not a success (UI copy rule).
      // The raw error stays out of view: it names internal calls, not something staff can act on.
      setError('Could not load your calendar feed link. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [canView, userId, role])

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  const handleCreate = async () => {
    if (!canCreate) return
    setSaving(true)
    try {
      const result = await createCalendarFeedToken({}, userId && role ? { userId, role } : undefined)
      setRawToken(result.rawToken)
      setHasToken(true)
      setCreatedAt(new Date().toISOString())
      setRevokedAt(null)
      setError(null)
      showSuccessToast('Calendar feed link created. Copy it now — it won\'t be shown again.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create calendar feed link')
    } finally {
      setSaving(false)
    }
  }

  const handleRevoke = async () => {
    if (!canRevoke || !hasToken) return
    setSaving(true)
    try {
      const result = await revokeCalendarFeedToken(userId ? { userId } : {}, userId && role ? { userId, role } : undefined)
      if (result.revoked) {
        setRawToken(null)
        setHasToken(false)
        setRevokedAt(new Date().toISOString())
        setError(null)
        showSuccessToast('Calendar feed link revoked. The old link no longer works.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke calendar feed link')
    } finally {
      setSaving(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    showSuccessToast('Copied to clipboard')
  }

  if (!canView) {
    return (
      <Card title="Calendar feed">
        <p style={{ color: 'var(--text3)', margin: 0 }}>
          Your role cannot view the calendar feed settings.
        </p>
      </Card>
    )
  }

  const feedUrl = rawToken
    ? `${typeof window !== 'undefined' ? window.location.origin : 'https://app.babinrentals.com'}/calendar-feed?token=${rawToken}`
    : null

  return (
    <Card title="Calendar feed">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        <p style={{ margin: 0, fontSize: 'var(--t-th)', color: 'var(--text2)' }}>
          {hasToken ? 'Link active — add to Google Calendar, Apple Calendar, Outlook, etc.' : statusKnown ? 'No active link' : null}
        </p>

        {error && (
          <p role="alert" style={{ margin: 0, padding: '8px 12px', borderRadius: 'var(--r-btn)', background: 'var(--danger-bg)', color: 'var(--danger-text)', fontSize: 'var(--t-th)' }}>
            {error}
          </p>
        )}

        {loading && (
          <div style={{ padding: '8px', background: 'var(--surface2)', borderRadius: '6px', fontSize: 'var(--t-th)', color: 'var(--text2)' }}>
            Loading…
          </div>
        )}

        {!loading && !hasToken && (
          <div>
            <p style={{ margin: '0 0 var(--sp-sm)', fontSize: 'var(--t-th)', color: 'var(--text2)' }}>
              Create a private iCal feed link to add your jobs to your phone calendar.
              The link contains <strong>only</strong> booking number, time, and client name —
              no amounts, addresses, or phone numbers.
            </p>
            <Button variant="primary" onClick={handleCreate} loading={saving}>
              Create calendar feed link
            </Button>
          </div>
        )}

        {hasToken && !revokedAt && (
          <div>
            <p style={{ margin: '0 0 var(--sp-sm)', fontSize: 'var(--t-th)', color: 'var(--text2)' }}>
              Your calendar feed link is active. Created {createdAt ? new Date(createdAt).toLocaleString() : 'recently'}.
            </p>
            {!feedUrl && (
              <p role="status" style={{ margin: '0 0 var(--sp-sm)', fontSize: 'var(--t-th)', color: 'var(--text2)' }}>
                This private link is still active, but its URL was shown only when created and cannot be recovered here.
                {canRevoke ? ' Revoke it to create a replacement link.' : ' Ask an authorized administrator to revoke it if you need a new link.'}
              </p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
              {feedUrl && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-sm)' }}>
                <input
                  type={showToken ? 'text' : 'password'}
                  value={feedUrl}
                  readOnly
                  style={{
                    flex: '1 1 220px',
                    minWidth: 0,
                    padding: '8px 12px',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    fontSize: 'var(--t-th)',
                    background: 'var(--surface)',
                    color: 'var(--text)',
                  }}
                />
                <Button variant="secondary" size="sm" onClick={() => setShowToken(!showToken)}>
                  {showToken ? 'Hide' : 'Show'}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => copyToClipboard(feedUrl)}>
                  <Icon name="copy" size={16} fill />
                </Button>
              </div>}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-sm)' }}>
                {feedUrl && <a
                  href={feedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 'var(--sp-xs)',
                    padding: '8px 12px',
                    background: 'var(--primary)',
                    color: 'white',
                    borderRadius: '6px',
                    fontSize: 'var(--t-th)',
                    fontWeight: 500,
                    textDecoration: 'none',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <Icon name="external_link" size={16} />
                  Open in Calendar
                </a>}
                {canRevoke && <Button variant="danger" size="sm" onClick={handleRevoke} loading={saving}>
                  Revoke link
                </Button>}
              </div>
            </div>
            <p style={{ margin: 'var(--sp-sm) 0 0', fontSize: 'var(--t-th)', color: 'var(--text3)' }}>
              ⚠ <strong>Reset your link</strong> to revoke the old one and generate a new one.
              The old link stops working immediately. Owner and Admin can revoke anyone's link.
            </p>
          </div>
        )}

        {revokedAt && (
          <div>
            <p style={{ margin: '0 0 var(--sp-sm)', fontSize: 'var(--t-th)', color: 'var(--text2)' }}>
              Previous link was revoked {new Date(revokedAt).toLocaleString()}.
            </p>
            <Button variant="primary" onClick={handleCreate} loading={saving}>
              Create new calendar feed link
            </Button>
          </div>
        )}
      </div>
    </Card>
  )
}