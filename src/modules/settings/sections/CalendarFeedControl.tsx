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
import type { SystemRole } from '../../../types/database'

export function CalendarFeedControl() {
  const { user } = useAuth()
  const role = user?.role ?? null
  const { showSuccessToast, showErrorToast } = useToast()

  const [hasToken, setHasToken] = useState(false)
  const [createdAt, setCreatedAt] = useState<string | null>(null)
  const [revokedAt, setRevokedAt] = useState<string | null>(null)
  const [rawToken, setRawToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showToken, setShowToken] = useState(false)

  const canCreate = canCreateCalendarFeedToken(role)
  const canRevoke = canRevokeCalendarFeedToken(role, user?.id, user?.id)
  const canView = canViewCalendarFeedTokenStatus(role, user?.id, user?.id)

  const loadStatus = useCallback(async () => {
    if (!canView) return
    setLoading(true)
    try {
      const response = await getCalendarFeedTokenStatus()
      const result = response.result
      setHasToken(result.hasToken)
      setCreatedAt(result.createdAt)
      setRevokedAt(result.revokedAt)
    } catch (err) {
      console.error('Failed to load calendar feed token status:', err)
    } finally {
      setLoading(false)
    }
  }, [canView])

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  const handleCreate = async () => {
    if (!canCreate) return
    setSaving(true)
    try {
      const response = await createCalendarFeedToken()
      const result = response.result
      setRawToken(result.rawToken)
      setHasToken(true)
      setRevokedAt(null)
      loadStatus()
      showSuccessToast('Calendar feed link created. Copy it now — it won\'t be shown again.')
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : 'Failed to create calendar feed link')
    } finally {
      setSaving(false)
    }
  }

  const handleRevoke = async () => {
    if (!canRevoke || !hasToken) return
    setSaving(true)
    try {
      const response = await revokeCalendarFeedToken({ userId: user?.id })
      const result = response.result
      if (result.revoked) {
        setRawToken(null)
        setHasToken(false)
        loadStatus()
        showSuccessToast('Calendar feed link revoked. The old link no longer works.')
      }
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : 'Failed to revoke calendar feed link')
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
      <Card
        title="Calendar feed"
        subtitle="Access denied"
      >
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
    <Card
      title="Calendar feed"
      subtitle={hasToken ? 'Link active — add to Google Calendar, Apple Calendar, Outlook, etc.' : 'No active link'}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
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
              no amounts, addresses, or phone numbers (B29, K5).
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
              <div style={{ display: 'flex', gap: 'var(--sp-sm)' }}>
                <input
                  type={showToken ? 'text' : 'password'}
                  value={feedUrl || ''}
                  readOnly
                  style={{
                    flex: 1,
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
                <Button variant="secondary" size="sm" onClick={() => copyToClipboard(feedUrl || '')}>
                  <Icon name="copy" size={16} fill />
                </Button>
              </div>
              <div style={{ display: 'flex', gap: 'var(--sp-sm)' }}>
                <a
                  href={feedUrl || ''}
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
                </a>
                <Button variant="danger" size="sm" onClick={handleRevoke} loading={saving}>
                  Revoke link
                </Button>
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