import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../../lib/auth'
import { useToast } from '../../../components/ui/Toast'
import { Button } from '../../../components/ui/Page'
import {
  canConfigureAwayMode,
  fetchOnlineBookingAwayStatus,
  saveOnlineBookingAwayStatus,
  type OnlineBookingAwayStatus,
} from '../../../lib/awayMode'

const DEFAULT_AWAY_MESSAGE = 'Back on 15 Feb — call or WhatsApp us'

export function OnlineBookingAwayControl() {
  const { user } = useAuth()
  const role = user?.role ?? 'Client'
  const canEdit = canConfigureAwayMode(role)
  const { showSuccessToast } = useToast()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [online, setOnline] = useState(() => typeof navigator !== 'undefined' ? navigator.onLine : true)

  const [status, setStatus] = useState<OnlineBookingAwayStatus>({
    is_away: false,
    configured_away: false,
    can_accept_requests: true,
    message: DEFAULT_AWAY_MESSAGE,
    resume_date: null,
  })

  // Form states
  const [formIsAway, setFormIsAway] = useState(false)
  const [formMessage, setFormMessage] = useState(DEFAULT_AWAY_MESSAGE)
  const [formResumeDate, setFormResumeDate] = useState('')

  // Track online/offline
  useEffect(() => {
    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const loadStatus = useCallback(async () => {
    setLoading(true)
    try {
      const current = await fetchOnlineBookingAwayStatus()
      setStatus(current)
      setFormIsAway(current.configured_away)
      setFormMessage(current.message || DEFAULT_AWAY_MESSAGE)
      setFormResumeDate(current.resume_date ? current.resume_date.slice(0, 10) : '')
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load online booking away status')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  const isDirty =
    formIsAway !== status.configured_away ||
    formMessage.trim() !== (status.message || DEFAULT_AWAY_MESSAGE) ||
    formResumeDate !== (status.resume_date ? status.resume_date.slice(0, 10) : '')

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canEdit || saving || !online) return

    setSaving(true)
    setError(null)
    try {
      const resumeIso = formResumeDate ? `${formResumeDate}T06:00:00+05:45` : null
      const updated = await saveOnlineBookingAwayStatus({
        isAway: formIsAway,
        message: formMessage.trim(),
        resumeDate: resumeIso,
      })
      setStatus(updated)
      setFormIsAway(updated.configured_away)
      setFormMessage(updated.message || DEFAULT_AWAY_MESSAGE)
      setFormResumeDate(updated.resume_date ? updated.resume_date.slice(0, 10) : '')
      showSuccessToast(
        updated.is_away
          ? 'Away mode turned ON — online booking requests paused.'
          : 'Away mode turned OFF — online booking requests active.'
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update online booking away mode')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Current live status pill */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Online booking status:</span>
        {status.is_away ? (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '3px 10px',
              borderRadius: '999px',
              fontSize: '0.82rem',
              fontWeight: 600,
              background: 'rgba(234, 179, 8, 0.15)',
              color: 'var(--accent-gold, #fef08a)',
              border: '1px solid rgba(234, 179, 8, 0.3)',
            }}
          >
            ⏸ Paused (Away mode)
          </span>
        ) : (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '3px 10px',
              borderRadius: '999px',
              fontSize: '0.82rem',
              fontWeight: 600,
              background: 'rgba(34, 197, 94, 0.12)',
              color: 'var(--green-text, #4ade80)',
              border: '1px solid rgba(34, 197, 94, 0.25)',
            }}
          >
            ✓ Active & accepting requests
          </span>
        )}
      </div>

      {!online && (
        <p role="status" style={{ margin: 0, padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--danger-bg, #451a03)', color: 'var(--danger-text, #fef3c7)', fontSize: '0.85rem' }}>
          You are offline. Away mode changes cannot be saved until you reconnect.
        </p>
      )}

      {error && (
        <p role="alert" style={{ margin: 0, padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: 'rgba(244, 63, 94, 0.15)', color: 'var(--rose-text, #f43f5e)', fontSize: '0.85rem' }}>
          {error}
        </p>
      )}

      {loading ? (
        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Loading away mode status…</div>
      ) : (
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Main Away Toggle */}
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              cursor: canEdit && online ? 'pointer' : 'not-allowed',
              opacity: canEdit ? 1 : 0.7,
            }}
          >
            <input
              type="checkbox"
              checked={formIsAway}
              disabled={!canEdit || !online || saving}
              onChange={(e) => setFormIsAway(e.target.checked)}
              aria-label="Away — not taking online requests"
              style={{ width: 18, height: 18, accentColor: 'var(--accent-gold)' }}
            />
            <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-main)' }}>
              Away — not taking online requests
            </span>
          </label>

          {/* Notice message input */}
          <div>
            <label
              htmlFor="away-message"
              style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: 4 }}
            >
              Public notice message
            </label>
            <input
              id="away-message"
              type="text"
              value={formMessage}
              disabled={!canEdit || !online || saving}
              onChange={(e) => setFormMessage(e.target.value)}
              placeholder={DEFAULT_AWAY_MESSAGE}
              style={{
                width: '100%',
                maxWidth: 480,
                minHeight: 40,
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-surface)',
                color: 'var(--text-main)',
                fontSize: '0.9rem',
              }}
            />
            <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>
              Displayed on public catalogue, items, and checkout drawer while away.
            </span>
          </div>

          {/* Optional back on resume date */}
          <div>
            <label
              htmlFor="away-resume-date"
              style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: 4 }}
            >
              Back on date (optional)
            </label>
            <input
              id="away-resume-date"
              type="date"
              value={formResumeDate}
              disabled={!canEdit || !online || saving}
              onChange={(e) => setFormResumeDate(e.target.value)}
              style={{
                minHeight: 40,
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-surface)',
                color: 'var(--text-main)',
                fontSize: '0.9rem',
              }}
            />
            <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>
              If set, requests will automatically re-enable on this date at 06:00 Kathmandu time.
            </span>
          </div>

          {canEdit ? (
            <div style={{ marginTop: 6 }}>
              <Button
                variant="primary"
                type="submit"
                disabled={!isDirty || !online || saving}
                loading={saving}
              >
                {saving ? 'Saving…' : 'Save online booking availability'}
              </Button>
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Only Owner, Admin, and Manager can configure online booking availability.
            </p>
          )}
        </form>
      )}
    </div>
  )
}
