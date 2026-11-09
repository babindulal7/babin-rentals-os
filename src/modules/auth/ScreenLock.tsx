import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../../components/ui/Icon'
import { PinPad } from '../../components/ui/PinPad'
import { ErrorBanner } from '../../components/ui/StateViews'
import { useAuth, type PinVerdict, type RosterEntry } from '../../lib/auth'
import { useTranslation } from '../../lib/i18n'
import './auth.css'

/**
 * **The session lock & device roster switcher (T1-15).**
 *
 * ## What this is
 * - On shared devices (roster.length > 0): displays the roster of enrolled staff
 *   members (names, avatars, ≤15). Staff tap their name, enter their 4-digit PIN,
 *   and restore their real session via server-side `verify_staff_pin` (0066).
 * - On solo devices (roster.length === 0): displays the session lock curtain for
 *   the active user.
 * - Fails closed: offline switching refuses; wrong PINs decrement server attempts;
 *   5 wrong PINs lock that person only.
 * - Abort / wrong PIN returns to the roster. Never an automatic restore of previous session.
 */
export default function ScreenLock({ onUnlock }: { onUnlock: () => void }) {
  const { user, roster, verifyStaffPin, switchUser, logout, forgetThisDevice } = useAuth()
  const { t } = useTranslation()
  const hasRoster = Boolean(roster && roster.length > 0)

  // On shared devices with enrolled staff, start on the roster list.
  // On solo devices without a roster, start directly on the active user's PIN pad.
  const [selectedUserId, setSelectedUserId] = useState<string | null>(() => {
    return hasRoster ? null : (user?.id ?? null)
  })

  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [verdict, setVerdict] = useState<PinVerdict | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [invalid, setInvalid] = useState(false)
  const [confirmingForget, setConfirmingForget] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const invalidTimer = useRef<number | null>(null)

  const selectedMember = useMemo((): RosterEntry | null => {
    if (!selectedUserId) return null
    if (roster && roster.length > 0) {
      const found = roster.find((m) => m.userId === selectedUserId)
      if (found) return found
    }
    if (user && user.id === selectedUserId) {
      return {
        userId: user.id,
        name: user.name,
        initials: (user.name || 'ST').slice(0, 2).toUpperCase() || 'ST',
        avatarTone: 'var(--accent-blue, #6366f1)',
        hasPin: true,
        lastSeen: Date.now(),
      }
    }
    return null
  }, [selectedUserId, roster, user])

  const flashInvalid = useCallback(() => {
    setInvalid(true)
    if (invalidTimer.current !== null) window.clearTimeout(invalidTimer.current)
    invalidTimer.current = window.setTimeout(() => setInvalid(false), 400)
  }, [])

  useEffect(() => () => {
    if (invalidTimer.current !== null) window.clearTimeout(invalidTimer.current)
  }, [])

  useEffect(() => {
    containerRef.current?.focus()
  }, [])

  // Minimal focus trap within overlay
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const root = containerRef.current
      if (!root) return

      const focusable = Array.from(
        root.querySelectorAll<HTMLElement>('button:not([disabled])'),
      )
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!first || !last) return

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [])

  const lockedUntil =
    (selectedMember?.lockedUntil && new Date(selectedMember.lockedUntil).getTime() > Date.now())
      ? selectedMember.lockedUntil
      : verdict?.reason === 'locked'
        ? verdict.lockedUntil
        : null

  const isLockedOut = Boolean(lockedUntil && new Date(lockedUntil).getTime() > Date.now())
  const unlockTime = lockedUntil
    ? new Date(lockedUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null

  const noPin = selectedMember?.hasPin === false || verdict?.reason === 'no_pin'
  const unavailable = verdict?.reason === 'unavailable'

  const submit = useCallback(
    async (entered: string) => {
      if (busy || !selectedUserId) return
      setBusy(true)
      setErrorMessage(null)

      try {
        if (selectedUserId === user?.id) {
          const result = await verifyStaffPin(entered)
          setVerdict(result)
          if (result.ok) {
            onUnlock()
            return
          }
          setPin('')
          flashInvalid()
          if (result.reason === 'locked') {
            if (hasRoster) {
              setSelectedUserId(null)
            } else {
              logout()
            }
          }
          return
        }

        // Switching to target user
        const outcome = await switchUser(selectedUserId, entered)
        if (outcome.success) {
          onUnlock()
          return
        }

        setPin('')
        flashInvalid()
        setErrorMessage(outcome.error ?? 'Incorrect PIN')
        setVerdict({
          ok: false,
          reason: 'incorrect',
          message: outcome.error,
        })
      } finally {
        setBusy(false)
      }
    },
    [busy, selectedUserId, user?.id, verifyStaffPin, switchUser, onUnlock, flashInvalid, hasRoster, logout],
  )

  const handleSelectUser = (member: RosterEntry) => {
    if (member.lockedUntil && new Date(member.lockedUntil).getTime() > Date.now()) {
      const timeStr = new Date(member.lockedUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      setErrorMessage(`This account is locked until ${timeStr}. Sign in with your password.`)
      return
    }
    setSelectedUserId(member.userId)
    setPin('')
    setVerdict(null)
    setErrorMessage(null)
  }

  const handleBackToRoster = () => {
    setSelectedUserId(null)
    setPin('')
    setVerdict(null)
    setErrorMessage(null)
  }

  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label="Session locked"
      tabIndex={-1}
      className="screenlock-overlay"
    >
      <div className={`screenlock-card ${hasRoster && !selectedUserId ? 'roster-card' : ''}`}>
        <div className="screenlock-icon-badge">
          <Icon name="lock" size={32} />
        </div>

        {/* ── View 1: Roster List (Shared Device) ─────────────────────────── */}
        {hasRoster && !selectedUserId ? (
          <div>
            <h2 style={{ fontSize: 'clamp(20px, 2vw, 24px)', fontWeight: 600, margin: '0 0 8px', color: 'var(--text)' }}>
              {t('auth.screenLock.whoIsWorking', 'Who is working?')}
            </h2>
            <p style={{ margin: '0 0 16px', color: 'var(--text2)', fontSize: 'var(--t-meta)' }}>
              {t('auth.screenLock.tapYourName', 'Tap your name to unlock your session')}
            </p>

            {isOffline && (
              <div style={{ margin: '0 0 16px', textAlign: 'left' }}>
                <ErrorBanner
                  title="Offline"
                  message="Switching users requires a server connection to verify PINs. You can continue on the active session or sign in with your password."
                />
              </div>
            )}

            {errorMessage && (
              <div style={{ margin: '0 0 16px', textAlign: 'left' }}>
                <ErrorBanner title="Account Locked" message={errorMessage} />
              </div>
            )}

            <div className="roster-list" role="list">
              {roster.map((member) => {
                const memberLocked = Boolean(member.lockedUntil && new Date(member.lockedUntil).getTime() > Date.now())
                const memberLockTime = member.lockedUntil
                  ? new Date(member.lockedUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : null

                return (
                  <button
                    key={member.userId}
                    type="button"
                    className="roster-item-btn"
                    onClick={() => handleSelectUser(member)}
                    disabled={busy}
                    aria-label={`Unlock as ${member.name}`}
                  >
                    <div
                      className="roster-avatar"
                      style={{ background: member.avatarTone || 'var(--accent-blue, #6366f1)' }}
                    >
                      {member.initials || 'ST'}
                    </div>

                    <div className="roster-name-col">
                      <span className="roster-name-text">{member.name}</span>
                      {memberLocked && (
                        <span className="roster-status-badge locked">
                          {t('auth.screenLock.lockedUntil', 'Locked until {time}', { time: memberLockTime ?? '' })}
                        </span>
                      )}
                      {!memberLocked && member.userId === user?.id && (
                        <span className="roster-status-badge active">
                          {t('auth.screenLock.activeSession', 'Active session')}
                        </span>
                      )}
                    </div>

                    <Icon name="chevron_right" size={18} />
                  </button>
                )
              })}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 'var(--sp-lg)' }}>
              <button
                type="button"
                onClick={logout}
                style={{
                  minHeight: 44,
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--primary)',
                  fontSize: 'var(--t-meta)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {t('auth.screenLock.switchAccount', 'Sign in with another account')}
              </button>

              {(user?.role === 'Owner' || user?.role === 'Admin') && !confirmingForget && (
                <button
                  type="button"
                  onClick={() => setConfirmingForget(true)}
                  style={{
                    minHeight: 44,
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--muted)',
                    fontSize: 'var(--t-th)',
                    fontWeight: 500,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {t('auth.screenLock.forgetDevice', 'Forget this device')}
                </button>
              )}

              {/* Inline confirmation, not ConfirmDialog: the lock screen sits at --z-system, above
                  the modal layer, so a dialog opened from here would render behind it. */}
              {(user?.role === 'Owner' || user?.role === 'Admin') && confirmingForget && (
                <div
                  role="alertdialog"
                  aria-label={t('auth.screenLock.forgetDevice', 'Forget this device')}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    padding: 'var(--sp-md)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--r-sm)',
                  }}
                >
                  <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text)' }}>
                    {t('auth.screenLock.forgetPrompt', 'Forget every stored session and the roster on this device? Everyone will have to sign in again.')}
                  </span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => setConfirmingForget(false)}
                      style={{
                        flex: 1,
                        minHeight: 44,
                        background: 'transparent',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--r-sm)',
                        color: 'var(--text)',
                        fontSize: 'var(--t-meta)',
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      {t('auth.screenLock.cancel', 'Cancel')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmingForget(false)
                        void forgetThisDevice()
                      }}
                      style={{
                        flex: 1,
                        minHeight: 44,
                        background: 'var(--danger)',
                        border: 'none',
                        borderRadius: 'var(--r-sm)',
                        color: 'var(--btn-primary-fg, #fff)',
                        fontSize: 'var(--t-meta)',
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      {t('auth.screenLock.forgetConfirm', 'Forget this device')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ── View 2: PIN Pad (Selected user or Solo device) ──────────────── */
          <div>
            {hasRoster && (
              <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
                <button
                  type="button"
                  onClick={handleBackToRoster}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    minHeight: 44,
                    padding: '0 8px',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--primary)',
                    fontSize: 'var(--t-meta)',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <Icon name="arrow_left" size={16} />
                  {t('auth.screenLock.backToStaff', 'Back to staff list')}
                </button>
              </div>
            )}

            <h2 style={{ fontSize: 'clamp(20px, 2vw, 24px)', fontWeight: 600, margin: '0 0 8px', color: 'var(--text)' }}>
              {t('auth.screenLock.title', 'Session Locked')}
            </h2>

            <p style={{ margin: '0 0 4px', color: 'var(--text)', fontSize: 'var(--t-meta)', fontWeight: 600 }}>
              {selectedMember?.name
                ? `Signed in as ${selectedMember.name}`
                : user?.name
                  ? `Signed in as ${user.name}`
                  : 'This session has no named staff row'}
            </p>

            <p style={{ margin: '0 0 28px', color: 'var(--text2)', fontSize: 'var(--t-meta)' }}>
              {isLockedOut
                ? 'Too many incorrect attempts.'
                : noPin
                  ? 'No PIN is set for this account.'
                  : 'Enter your PIN to resume this session'}
            </p>

            {(noPin || unavailable) && (
              <div style={{ margin: '0 0 24px', textAlign: 'left' }}>
                <ErrorBanner
                  title={noPin ? 'No PIN is set' : 'Cannot check your PIN right now'}
                  message={
                    noPin
                      ? 'This account has no PIN. Set one in Settings ▸ System ▸ Security once you are back in. Sign out and use your password to continue.'
                      : (verdict?.message ??
                        'The PIN could not be verified. Sign out and use your password to continue.')
                  }
                />
              </div>
            )}

            {isLockedOut ? (
              <p
                role="alert"
                style={{
                  margin: '0 0 24px',
                  padding: '13px 14px',
                  borderRadius: 'var(--r-card)',
                  background: 'var(--st-danger-bg)',
                  color: 'var(--st-danger-fg)',
                  fontSize: 'var(--t-meta)',
                  fontWeight: 600,
                  textAlign: 'left',
                }}
              >
                {t('auth.screenLock.pinLockedUntilPrefix', 'PIN locked until')} {unlockTime}. {t('auth.screenLock.signInWithPassword', 'Sign in with your password.')}
              </p>
            ) : (
              <PinPad
                label="Enter your PIN to resume this session"
                length={4}
                value={pin}
                onChange={setPin}
                onComplete={submit}
                disabled={busy || noPin || unavailable}
                invalid={invalid}
              />
            )}

            {verdict?.reason === 'incorrect' && typeof verdict.attemptsRemaining === 'number' && (
              <p
                role="alert"
                style={{
                  margin: '16px 0 0',
                  fontSize: 'var(--t-meta)',
                  color: 'var(--danger-text)',
                  fontWeight: 600,
                }}
              >
                {t('auth.screenLock.incorrectPinPrefix', 'Incorrect PIN —')}{' '}
                {verdict.attemptsRemaining}{' '}
                {verdict.attemptsRemaining === 1
                  ? t('auth.screenLock.attemptLeft', 'attempt left')
                  : t('auth.screenLock.attemptsLeftPlural', 'attempts left')}
              </p>
            )}

            {verdict?.reason === 'inactive' && (
              <p
                role="alert"
                style={{
                  margin: '16px 0 0',
                  fontSize: 'var(--t-meta)',
                  color: 'var(--danger-text)',
                  fontWeight: 600,
                }}
              >
                {t('auth.screenLock.accountInactive', 'This staff account is no longer active. Sign out to continue.')}
              </p>
            )}

            {errorMessage && !verdict?.attemptsRemaining && (
              <p
                role="alert"
                style={{
                  margin: '16px 0 0',
                  fontSize: 'var(--t-meta)',
                  color: 'var(--danger-text)',
                  fontWeight: 600,
                }}
              >
                {errorMessage}
              </p>
            )}

            <button
              type="button"
              onClick={logout}
              style={{
                marginTop: 'var(--sp-3xl)',
                minHeight: 44,
                background: 'transparent',
                border: 'none',
                color: 'var(--danger)',
                fontSize: 'var(--t-meta)',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {t('auth.screenLock.signOutInstead', 'Sign out instead')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
