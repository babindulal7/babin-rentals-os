/**
 * NotificationsDrawer — Staff In-App Notification Centre.
 *
 * T5-02 (Lane B · 21 Jul lock, S6, S13, Law 3, Law 6, Law 8, Law 15).
 * - Realtime notification drawer for authenticated staff members.
 * - Displays in-app notifications: online payments, shift handovers, damage cases,
 *   delivery dispatches, return deadlines.
 * - Unread bold, tap opens entity link and marks read, "Mark all read" action.
 * - Desktop/tablet: slide-over panel on the right (400px).
 * - Phone (< 768px): bottom sheet with grab handle and safe-area padding.
 * - Touch targets >= 44px; keyboard reachable with Escape to close and focus trap.
 * - Never colour alone: numeric count badges, clear text labels.
 */
import { useEffect, useRef, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon, { type IconName } from '../ui/Icon'
import { useAuth } from '../../lib/auth'
import { useViewport } from '../../lib/device'
import { supabase, IS_MOCK } from '../../lib/supabase'
import { useOptionalToast } from '../ui/Toast'
import {
  fetchNotifications,
  getMockNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  type AppNotification,
} from '../../lib/queries/notifications'

interface NotificationsDrawerProps {
  isOpen: boolean
  onClose: () => void
}

const TRANSITION_MS = 200
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Format relative time since notification creation */
function formatRelativeTime(isoString: string): string {
  try {
    const diffMs = Date.now() - new Date(isoString).getTime()
    if (diffMs < 0) return 'Just now'
    const diffSec = Math.floor(diffMs / 1000)
    if (diffSec < 60) return 'Just now'
    const diffMin = Math.floor(diffSec / 60)
    if (diffMin < 60) return `${diffMin}m ago`
    const diffHours = Math.floor(diffMin / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    const diffDays = Math.floor(diffHours / 24)
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays}d ago`
    return new Date(isoString).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  } catch {
    return 'Recent'
  }
}

/** Resolve icon and label for notification types */
function resolveNotificationMeta(type: string): { icon: IconName; label: string; badgeBg: string } {
  switch (type) {
    case 'online_payment':
      return { icon: 'card', label: 'Payment', badgeBg: 'var(--success-surface, rgba(16, 185, 129, 0.12))' }
    case 'shift_handover_waiting':
    case 'shift_handover':
      return { icon: 'clock', label: 'Handover', badgeBg: 'var(--info-surface, rgba(14, 165, 233, 0.12))' }
    case 'damage_case_opened':
    case 'damage_case':
      return { icon: 'alert_triangle', label: 'Damage', badgeBg: 'var(--danger-surface, rgba(239, 68, 68, 0.12))' }
    case 'delivery_dispatched':
    case 'delivery_status_changed':
    case 'delivery':
      return { icon: 'truck', label: 'Delivery', badgeBg: 'var(--accent-surface, rgba(99, 102, 241, 0.12))' }
    case 'return_overdue':
    case 'return_due':
      return { icon: 'calendar', label: 'Return', badgeBg: 'var(--warning-surface, rgba(245, 158, 11, 0.12))' }
    case 'approval_requested':
    case 'approval':
      return { icon: 'checklist', label: 'Approval', badgeBg: 'var(--warning-surface, rgba(245, 158, 11, 0.12))' }
    default:
      return { icon: 'bell', label: 'Alert', badgeBg: 'var(--card2, rgba(100, 116, 139, 0.12))' }
  }
}

export default function NotificationsDrawer({ isOpen, onClose }: NotificationsDrawerProps) {
  const { user } = useAuth()
  const vp = useViewport()
  const isPhone = vp === 'phone'
  const navigate = useNavigate()
  const toast = useOptionalToast()

  const [notifications, setNotifications] = useState<AppNotification[]>(() =>
    IS_MOCK ? getMockNotifications() : [],
  )
  const [filterMode, setFilterMode] = useState<'all' | 'unread'>('all')
  const [isLoading, setIsLoading] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true))
  const [markingAll, setMarkingAll] = useState(false)

  const drawerRef = useRef<HTMLDivElement>(null)
  const openerRef = useRef<Element | null>(null)

  // Track online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Load notifications from data layer
  const loadNotifications = async () => {
    setIsLoading(true)
    setHasError(false)
    try {
      const data = await fetchNotifications()
      setNotifications(data)
    } catch (err) {
      console.warn('Failed to load notifications:', err)
      setHasError(true)
    } finally {
      setIsLoading(false)
    }
  }

  // Load when opened
  useEffect(() => {
    if (isOpen) {
      loadNotifications()
    }
  }, [isOpen])

  // Realtime subscription and window event listeners
  useEffect(() => {
    let cleanupRealtime: (() => void) | undefined

    if (!IS_MOCK && supabase?.channel) {
      const channel = supabase
        .channel('realtime:notifications-drawer')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => {
          loadNotifications()
        })
        .subscribe()

      cleanupRealtime = () => {
        supabase.removeChannel(channel)
      }
    }

    const handleUpdate = () => {
      if (isOpen) loadNotifications()
    }
    const handleFocus = () => {
      if (isOpen) loadNotifications()
    }

    window.addEventListener('babin:notifications-updated', handleUpdate)
    window.addEventListener('focus', handleFocus)

    return () => {
      cleanupRealtime?.()
      window.removeEventListener('babin:notifications-updated', handleUpdate)
      window.removeEventListener('focus', handleFocus)
    }
  }, [isOpen])

  // Keyboard navigation, focus trap, and body scroll lock
  useEffect(() => {
    if (!isOpen) return
    openerRef.current = document.activeElement

    const focusables = (): HTMLElement[] =>
      Array.from(drawerRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const list = focusables()
      const first = list[0]
      const last = list[list.length - 1]
      if (!first || !last) return

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)

    const focusTimer = window.setTimeout(() => {
      const firstBtn = drawerRef.current?.querySelector<HTMLElement>('button')
      firstBtn?.focus()
    }, 50)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
      window.clearTimeout(focusTimer)
      if (openerRef.current instanceof HTMLElement) openerRef.current.focus()
    }
  }, [isOpen, onClose])

  const unreadCount = useMemo(() => notifications.filter((n) => !n.isRead).length, [notifications])

  const displayedNotifications = useMemo(() => {
    if (filterMode === 'unread') {
      return notifications.filter((n) => !n.isRead)
    }
    return notifications
  }, [notifications, filterMode])

  const handleMarkAsRead = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    try {
      await markNotificationAsRead(id)
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)))
    } catch (err) {
      console.warn('Failed to mark notification as read:', err)
    }
  }

  const handleMarkAllRead = async () => {
    if (unreadCount === 0 || markingAll) return
    setMarkingAll(true)
    try {
      await markAllNotificationsAsRead()
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })))
      toast?.showSuccessToast('All read', 'All notifications marked as read.')
    } catch (err) {
      console.warn('Failed to mark all notifications as read:', err)
    } finally {
      setMarkingAll(false)
    }
  }

  const handleNotificationClick = async (notif: AppNotification) => {
    if (!notif.isRead) {
      await handleMarkAsRead(notif.id)
    }
    onClose()
    if (notif.linkUrl) {
      navigate(notif.linkUrl)
    }
  }

  if (!isOpen) return <div hidden aria-hidden="true" />

  // Restricted check: Client seat cannot view internal staff notifications
  const isClient = user?.role === 'Client'

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: isPhone ? 'flex-end' : 'stretch',
        justifyContent: isPhone ? 'center' : 'flex-end',
        background: 'rgba(0, 0, 0, 0.45)',
        opacity: isOpen ? 1 : 0,
        transition: `opacity ${TRANSITION_MS}ms ease`,
      }}
    >
      {/* Click-through backdrop */}
      <div style={{ position: 'fixed', inset: 0 }} onClick={onClose} aria-hidden="true" />

      {/* Drawer / Sheet surface */}
      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Notification Centre"
        style={{
          position: 'relative',
          zIndex: 1,
          width: isPhone ? '100%' : '400px',
          maxWidth: '100vw',
          height: isPhone ? 'auto' : '100%',
          maxHeight: isPhone ? '85vh' : '100vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--card)',
          borderLeft: isPhone ? 'none' : '1px solid var(--border)',
          borderTop: isPhone ? '1px solid var(--border)' : 'none',
          borderRadius: isPhone ? '16px 16px 0 0' : 0,
          boxShadow: 'var(--shadow-modal)',
          transform: isOpen
            ? isPhone
              ? 'translateY(0)'
              : 'translateX(0)'
            : isPhone
              ? 'translateY(100%)'
              : 'translateX(100%)',
          transition: `transform ${TRANSITION_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`,
          paddingBottom: isPhone ? 'env(safe-area-inset-bottom, 12px)' : 0,
          boxSizing: 'border-box',
          overflow: 'hidden',
        }}
      >
        {/* Mobile grab handle */}
        {isPhone && (
          <div
            style={{
              width: '100%',
              display: 'flex',
              justifyContent: 'center',
              paddingTop: 10,
              paddingBottom: 4,
            }}
            aria-hidden="true"
          >
            <div
              style={{
                width: 36,
                height: 4,
                borderRadius: 2,
                background: 'var(--border)',
              }}
            />
          </div>
        )}

        {/* Drawer Header (Law 15: min 44px touch targets) */}
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid var(--border)',
            minHeight: 56,
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 'var(--r-btn, 8px)',
                background: 'var(--ext-bg, rgba(2, 132, 199, 0.08))',
                color: 'var(--primary, #0284c7)',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Icon name="bell" size={18} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text)' }}>
                  Notifications
                </h2>
                {unreadCount > 0 && (
                  <span
                    style={{
                      background: 'var(--primary, #0284c7)',
                      color: '#fff',
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '1px 7px',
                      borderRadius: 'var(--r-badge, 999px)',
                      lineHeight: '16px',
                    }}
                    aria-label={`${unreadCount} unread`}
                  >
                    {unreadCount} unread
                  </span>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {!isClient && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={unreadCount === 0 || markingAll}
                aria-label="Mark all notifications as read"
                title="Mark all notifications as read"
                style={{
                  minHeight: 44,
                  minWidth: 44,
                  padding: '0 10px',
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r-btn, 8px)',
                  color: unreadCount === 0 ? 'var(--text3)' : 'var(--primary, #0284c7)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: unreadCount === 0 ? 'default' : 'pointer',
                  opacity: unreadCount === 0 ? 0.6 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <Icon name="check" size={14} />
                <span>Mark all read</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              aria-label="Close notifications"
              title="Close notifications (Esc)"
              style={{
                width: 44,
                height: 44,
                minWidth: 44,
                minHeight: 44,
                borderRadius: 'var(--r-btn, 8px)',
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--text2)',
                cursor: 'pointer',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Icon name="x" size={17} />
            </button>
          </div>
        </header>

        {/* Offline indicator banner if device is offline */}
        {!isOnline && (
          <div
            role="status"
            style={{
              padding: '8px 16px',
              background: 'var(--warning-surface, #fffbeb)',
              borderBottom: '1px solid var(--warning-border, #fef3c7)',
              color: 'var(--warning-text, #b45309)',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexShrink: 0,
            }}
          >
            <Icon name="alert_triangle" size={15} />
            <span>Offline — notifications will update when connection restores.</span>
          </div>
        )}

        {/* Filter chips (All / Unread) */}
        {!isClient && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 16px',
              borderBottom: '1px solid var(--border)',
              background: 'var(--card2)',
              flexShrink: 0,
            }}
          >
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              aria-pressed={filterMode === 'all'}
              style={{
                minHeight: 36,
                padding: '0 12px',
                borderRadius: 'var(--r-badge, 999px)',
                border: filterMode === 'all' ? '1px solid var(--primary, #0284c7)' : '1px solid var(--border)',
                background: filterMode === 'all' ? 'var(--primary, #0284c7)' : 'var(--card)',
                color: filterMode === 'all' ? '#fff' : 'var(--text2)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span>All</span>
              <span
                style={{
                  fontSize: '11px',
                  opacity: 0.85,
                  padding: '1px 5px',
                  borderRadius: '10px',
                  background: filterMode === 'all' ? 'rgba(255,255,255,0.2)' : 'var(--border)',
                }}
              >
                {notifications.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setFilterMode('unread')}
              aria-pressed={filterMode === 'unread'}
              style={{
                minHeight: 36,
                padding: '0 12px',
                borderRadius: 'var(--r-badge, 999px)',
                border: filterMode === 'unread' ? '1px solid var(--primary, #0284c7)' : '1px solid var(--border)',
                background: filterMode === 'unread' ? 'var(--primary, #0284c7)' : 'var(--card)',
                color: filterMode === 'unread' ? '#fff' : 'var(--text2)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span>Unread</span>
              <span
                style={{
                  fontSize: '11px',
                  opacity: 0.85,
                  padding: '1px 5px',
                  borderRadius: '10px',
                  background: filterMode === 'unread' ? 'rgba(255,255,255,0.2)' : 'var(--border)',
                }}
              >
                {unreadCount}
              </span>
            </button>
          </div>
        )}

        {/* Notification List Scroll Area */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            padding: '8px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          {/* State 1: Restricted Client state */}
          {isClient ? (
            <div
              style={{
                padding: '36px 20px',
                textAlign: 'center',
                color: 'var(--text3)',
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  background: 'var(--card2)',
                  display: 'grid',
                  placeItems: 'center',
                  margin: '0 auto 12px',
                  color: 'var(--text3)',
                }}
              >
                <Icon name="bell" size={24} />
              </div>
              <p style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>
                Client Portal
              </p>
              <p style={{ margin: '6px 0 0', fontSize: '13px' }}>
                Booking updates will be sent to your confirmed email address.
              </p>
            </div>
          ) : isLoading && notifications.length === 0 ? (
            /* State 2: Loading */
            <div
              role="status"
              style={{
                padding: '36px 20px',
                textAlign: 'center',
                color: 'var(--text3)',
              }}
            >
              <p style={{ margin: 0, fontSize: '14px' }}>Loading notifications…</p>
            </div>
          ) : hasError ? (
            /* State 3: Error / Retry */
            <div
              role="alert"
              style={{
                padding: '24px 16px',
                textAlign: 'center',
                background: 'var(--danger-surface, rgba(239, 68, 68, 0.08))',
                borderRadius: 'var(--r-card, 10px)',
                border: '1px solid var(--danger-border, rgba(239, 68, 68, 0.2))',
                margin: '12px 4px',
              }}
            >
              <p style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--danger, #ef4444)' }}>
                Unable to load notifications
              </p>
              <p style={{ margin: '4px 0 12px', fontSize: '12px', color: 'var(--text2)' }}>
                Could not connect to the notifications service.
              </p>
              <button
                type="button"
                onClick={loadNotifications}
                style={{
                  minHeight: 44,
                  padding: '0 16px',
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r-btn, 8px)',
                  color: 'var(--text)',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Retry
              </button>
            </div>
          ) : displayedNotifications.length === 0 ? (
            /* State 4: Empty */
            <div
              style={{
                padding: '48px 20px',
                textAlign: 'center',
                color: 'var(--text3)',
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  background: 'var(--card2)',
                  display: 'grid',
                  placeItems: 'center',
                  margin: '0 auto 12px',
                  color: 'var(--text3)',
                }}
              >
                <Icon name="check" size={24} />
              </div>
              <p style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>
                {filterMode === 'unread' ? 'No unread notifications' : "You're all caught up"}
              </p>
              <p style={{ margin: '4px 0 0', fontSize: '12px' }}>
                {filterMode === 'unread'
                  ? 'All notifications have been reviewed.'
                  : 'New activity, dispatches and payments will appear here.'}
              </p>
            </div>
          ) : (
            /* State 5: Populated list */
            displayedNotifications.map((notif) => {
              const meta = resolveNotificationMeta(notif.type)
              return (
                <div
                  key={notif.id}
                  onClick={() => handleNotificationClick(notif)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      handleNotificationClick(notif)
                    }
                  }}
                  aria-label={`${notif.title}. ${notif.body}. ${notif.isRead ? 'Read' : 'Unread'}`}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                    padding: '12px 14px',
                    borderRadius: 'var(--r-card, 10px)',
                    background: notif.isRead ? 'var(--card)' : 'var(--card2)',
                    border: notif.isRead ? '1px solid var(--border)' : '1px solid var(--primary, #0284c7)',
                    cursor: 'pointer',
                    transition: 'background var(--dur, 150ms) ease, border-color var(--dur, 150ms) ease',
                    minHeight: 56,
                    position: 'relative',
                  }}
                >
                  {/* Unread indicator dot */}
                  {!notif.isRead && (
                    <span
                      style={{
                        position: 'absolute',
                        top: 14,
                        left: 6,
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: 'var(--primary, #0284c7)',
                      }}
                      aria-hidden="true"
                    />
                  )}

                  {/* Icon badge */}
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      minWidth: 36,
                      minHeight: 36,
                      borderRadius: 'var(--r-btn, 8px)',
                      background: meta.badgeBg,
                      color: 'var(--text)',
                      display: 'grid',
                      placeItems: 'center',
                      flexShrink: 0,
                    }}
                    aria-hidden="true"
                  >
                    <Icon name={meta.icon} size={18} />
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        justifyContent: 'space-between',
                        gap: 8,
                        marginBottom: 2,
                      }}
                    >
                      <span
                        style={{
                          fontSize: '13px',
                          fontWeight: notif.isRead ? 600 : 700,
                          color: 'var(--text)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {notif.title}
                      </span>
                      <span
                        style={{
                          fontSize: '11px',
                          color: 'var(--text3)',
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                        }}
                      >
                        {formatRelativeTime(notif.createdAt)}
                      </span>
                    </div>

                    <p
                      style={{
                        margin: 0,
                        fontSize: '12px',
                        lineHeight: 1.4,
                        color: notif.isRead ? 'var(--text2)' : 'var(--text)',
                        fontWeight: notif.isRead ? 400 : 500,
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                      }}
                    >
                      {notif.body}
                    </p>

                    {/* Metadata line: tag & link indicator */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        marginTop: 6,
                      }}
                    >
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          color: 'var(--text3)',
                        }}
                      >
                        {meta.label}
                      </span>
                      {notif.linkUrl && (
                        <span
                          style={{
                            fontSize: '11px',
                            color: 'var(--primary, #0284c7)',
                            fontWeight: 600,
                          }}
                        >
                          View details →
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Single mark as read button if unread */}
                  {!notif.isRead && (
                    <button
                      type="button"
                      onClick={(e) => handleMarkAsRead(notif.id, e)}
                      aria-label="Mark as read"
                      title="Mark as read"
                      style={{
                        width: 44,
                        height: 44,
                        minWidth: 44,
                        minHeight: 44,
                        display: 'grid',
                        placeItems: 'center',
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text3)',
                        cursor: 'pointer',
                        borderRadius: 'var(--r-btn, 8px)',
                        flexShrink: 0,
                        padding: 0,
                      }}
                    >
                      <Icon name="check" size={16} />
                    </button>
                  )}
                </div>
              )
            })
          )}
        </div>
      </aside>
    </div>
  )
}
