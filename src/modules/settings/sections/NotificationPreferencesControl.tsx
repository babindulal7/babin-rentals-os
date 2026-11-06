import { useCallback, useEffect, useState } from 'react'
import Icon from '../../../components/ui/Icon'
import { ErrorBanner, LoadingSkeleton } from '../../../components/ui/StateViews'
import { useAuth } from '../../../lib/auth'
import {
  NOTIFICATION_CATEGORIES,
  fetchNotificationPreferences,
  updateNotificationPreference,
  type NotificationCategory,
  type NotificationPreference,
} from '../../../lib/queries/notificationPreferences'
import {
  isPushSupported,
  isVapidConfigured,
  getActiveDeviceSubscription,
  subscribeCurrentDevice,
  unsubscribeCurrentDevice,
  detectDeviceLabel,
} from '../../../lib/push'

export function ToggleSwitch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      className="tap"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => {
        if (!disabled) onChange(!checked)
      }}
      style={{
        minWidth: 44,
        minHeight: 44,
        padding: 4,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        flexShrink: 0,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 36,
          height: 20,
          borderRadius: 'var(--r-badge)',
          border: '1px solid var(--border)',
          padding: 2,
          background: disabled
            ? 'var(--card2)'
            : checked
            ? 'var(--nav-active-accent)'
            : 'var(--disabled)',
          opacity: disabled ? 0.45 : 1,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: checked ? 'flex-end' : 'flex-start',
          transition: 'background 0.15s ease',
        }}
      >
        <span
          style={{
            width: 14,
            height: 14,
            borderRadius: 'var(--r-badge)',
            background: 'var(--card)',
            boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
            display: 'block',
          }}
        />
      </span>
    </button>
  )
}

export function NotificationPreferencesControl() {
  const { user } = useAuth()
  const role = user?.role || 'Owner'
  const isMoneyBlind = ['warehouse', 'technician', 'driver', 'client'].includes(role.toLowerCase())
  const isClient = role.toLowerCase() === 'client'

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<Map<NotificationCategory, NotificationPreference>>(new Map())
  const [savingKey, setSavingKey] = useState<NotificationCategory | null>(null)

  const [pushSupported, setPushSupported] = useState(false)
  const [pushConfigured, setPushConfigured] = useState(true)
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)
  const [deviceLabel, setDeviceLabel] = useState('')

  useEffect(() => {
    const supported = isPushSupported()
    const configured = isVapidConfigured()
    setPushSupported(supported)
    setPushConfigured(configured)
    setDeviceLabel(detectDeviceLabel())
    if (supported && configured) {
      void getActiveDeviceSubscription().then((sub) => {
        setPushEnabled(sub !== null)
      })
    } else {
      setPushEnabled(false)
    }
  }, [])

  const handlePushToggle = async (nextVal: boolean) => {
    setPushBusy(true)
    setError(null)
    try {
      if (nextVal) {
        if (!pushConfigured) {
          throw new Error('Push not configured: server VAPID keys are missing.')
        }
        await subscribeCurrentDevice()
        setPushEnabled(true)
      } else {
        await unsubscribeCurrentDevice()
        setPushEnabled(false)
      }
    } catch (err) {
      setPushEnabled(false)
      setError(err instanceof Error ? err.message : 'Push registration failed')
    } finally {
      setPushBusy(false)
    }
  }

  const loadPreferences = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const prefs = await fetchNotificationPreferences(user?.id)
      const map = new Map<NotificationCategory, NotificationPreference>()
      for (const item of prefs) {
        map.set(item.category, item)
      }
      setItems(map)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load preferences')
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    loadPreferences()
  }, [loadPreferences])

  const handleToggle = async (
    category: NotificationCategory,
    channel: 'in_app' | 'email',
    nextVal: boolean,
  ) => {
    const current = items.get(category) ?? {
      category,
      notificationType: category,
      inAppEnabled: true,
      emailEnabled: category === 'digest',
      isDefault: true,
    }

    const nextInApp = channel === 'in_app' ? nextVal : current.inAppEnabled
    const nextEmail = channel === 'email' ? nextVal : current.emailEnabled

    // Optimistic UI update
    setItems((prev) => {
      const nextMap = new Map(prev)
      nextMap.set(category, {
        ...current,
        inAppEnabled: nextInApp,
        emailEnabled: nextEmail,
        isDefault: false,
      })
      return nextMap
    })

    setSavingKey(category)
    try {
      await updateNotificationPreference(category, nextInApp, nextEmail, user?.id)
    } catch (err) {
      setError(`Failed to save preference for ${category}. Reverting change.`)
      // Revert optimistic change
      setItems((prev) => {
        const nextMap = new Map(prev)
        nextMap.set(category, current)
        return nextMap
      })
    } finally {
      setSavingKey(null)
    }
  }

  // 1. Restricted state: Client seats cannot configure staff internal notifications
  if (isClient) {
    return (
      <div
        role="region"
        aria-label="Notification Preferences Restricted"
        style={{
          padding: '16px',
          borderRadius: 'var(--r-card)',
          border: '1px solid var(--border)',
          background: 'var(--card2)',
          fontSize: 'var(--t-meta)',
          color: 'var(--muted)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="lock" size={16} />
          <strong>Client portal access</strong>
        </div>
        <p style={{ margin: '6px 0 0', lineHeight: 1.5 }}>
          Transactional booking receipts and reminder emails are dispatched automatically to your registered client email.
        </p>
      </div>
    )
  }

  // 2. Loading state
  if (loading) {
    return (
      <div style={{ padding: '8px 0' }}>
        <LoadingSkeleton />
      </div>
    )
  }

  return (
    <div
      role="region"
      aria-label="Notification Preferences Configuration"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        width: '100%',
      }}
    >
      {/* 3. Error state */}
      {error && (
        <ErrorBanner
          title="Notification preference error"
          message={error}
          onRetry={loadPreferences}
        />
      )}

      {/* Device Push Notifications Card (W62, T5-09) */}
      <div
        role="region"
        aria-label="Phone and iPad Push Alerts"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 16px',
          borderRadius: 'var(--r-card)',
          border: '1px solid var(--border)',
          background: 'var(--card)',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--t-body)', fontWeight: 600 }}>
            <Icon name="bell" size={16} />
            <span>Phone &amp; iPad Pop-ups (W62)</span>
            <span
              style={{
                padding: '2px 8px',
                borderRadius: 'var(--r-badge)',
                fontSize: '11px',
                fontWeight: 600,
                background: pushEnabled ? 'var(--badge-success-bg, #10b98120)' : 'var(--card2)',
                color: pushEnabled ? 'var(--success)' : 'var(--muted)',
              }}
            >
              {pushEnabled ? 'Active' : 'Off'}
            </span>
          </div>
          <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.4 }}>
            {!pushSupported
              ? 'Push notifications are not supported on this browser or platform.'
              : !pushConfigured
              ? 'Push not configured — server VAPID keys are missing.'
              : `Instant pop-up alerts on ${deviceLabel || 'your device'} for late returns (at 30 min, all staff on shift), new booking requests, payments, and damage.${isMoneyBlind ? ' Amounts are concealed for floor roles.' : ''}`}
          </div>
        </div>
        <div style={{ flexShrink: 0 }}>
          <ToggleSwitch
            checked={pushEnabled}
            disabled={pushBusy || !pushSupported || !pushConfigured}
            label="Phone & iPad Pop-ups"
            onChange={handlePushToggle}
          />
        </div>
      </div>

      <div
        style={{
          fontSize: 'var(--t-meta)',
          color: 'var(--muted)',
          lineHeight: 1.45,
          marginBottom: 4,
        }}
      >
        Mute individual notification types without missing the daily morning digest (21 Jul lock).
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 'var(--r-card)',
          border: '1px solid var(--border)',
          background: 'var(--card)',
          overflow: 'hidden',
        }}
      >
        {/* Table / Grid Header */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(180px, 1fr) 100px 100px',
            alignItems: 'center',
            padding: '10px 16px',
            background: 'var(--card2)',
            borderBottom: '1px solid var(--border)',
            fontSize: 'var(--t-th)',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: 'var(--text2)',
          }}
        >
          <div>Notification Category</div>
          <div style={{ textAlign: 'center' }}>In-App</div>
          <div style={{ textAlign: 'center' }}>Email</div>
        </div>

        {/* Categories rows */}
        {NOTIFICATION_CATEGORIES.map((cat, idx) => {
          const pref = items.get(cat.category) ?? {
            category: cat.category,
            notificationType: cat.category,
            inAppEnabled: cat.inAppDefault,
            emailEnabled: cat.emailDefault,
            isDefault: true,
          }
          const isRowMoneyBlindDisabled = Boolean(cat.moneySensitive && isMoneyBlind)
          const inAppOn = isRowMoneyBlindDisabled ? false : pref.inAppEnabled
          const emailOn = isRowMoneyBlindDisabled ? false : pref.emailEnabled
          const isSaving = savingKey === cat.category

          return (
            <div
              key={cat.category}
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(180px, 1fr) 100px 100px',
                alignItems: 'center',
                padding: '10px 16px',
                borderBottom:
                  idx < NOTIFICATION_CATEGORIES.length - 1
                    ? '1px solid var(--border)'
                    : 'none',
                background: isSaving ? 'var(--select-bg)' : 'transparent',
                transition: 'background 0.2s ease',
              }}
            >
              {/* Category Info */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingRight: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, fontSize: 'var(--t-body)', color: 'var(--text)' }}>
                    {cat.label}
                  </span>
                  {cat.category === 'digest' && (
                    <span
                      style={{
                        padding: '1px 6px',
                        borderRadius: 'var(--r-badge)',
                        background: 'var(--select-bg)',
                        color: 'var(--nav-active-accent)',
                        fontSize: '11px',
                        fontWeight: 600,
                      }}
                    >
                      Default On (05:30 NPT)
                    </span>
                  )}
                  {isRowMoneyBlindDisabled && (
                    <span
                      style={{
                        padding: '1px 6px',
                        borderRadius: 'var(--r-badge)',
                        background: 'var(--card2)',
                        color: 'var(--muted)',
                        fontSize: '11px',
                        fontWeight: 500,
                      }}
                    >
                      Role Blind
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.4 }}>
                  {cat.description}
                </div>
              </div>

              {/* In-App Toggle */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <ToggleSwitch
                  checked={inAppOn}
                  disabled={isRowMoneyBlindDisabled || isSaving}
                  label={`${cat.title} In-App`}
                  onChange={(next) => handleToggle(cat.category, 'in_app', next)}
                />
              </div>

              {/* Email Toggle */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <ToggleSwitch
                  checked={emailOn}
                  disabled={isRowMoneyBlindDisabled || isSaving}
                  label={`${cat.title} Email`}
                  onChange={(next) => handleToggle(cat.category, 'email', next)}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
