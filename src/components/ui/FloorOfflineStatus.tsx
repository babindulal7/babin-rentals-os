import { useEffect, useState } from 'react'
import Icon from './Icon'
import { useSync } from '../../lib/syncContext'

export interface FloorOfflineStatusProps {
  className?: string
  verb?: 'pack' | 'handover' | 'return' | 'reset'
  compact?: boolean
}

function formatLastFlush(date: Date | null): string {
  if (!date || isNaN(date.getTime())) return 'Never'
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000)
  if (diffSec < 10) return 'Just now'
  if (diffSec < 60) return `${diffSec}s ago`
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function FloorOfflineStatus({ className, verb = 'pack', compact = false }: FloorOfflineStatusProps) {
  const sync = useSync()
  const [online, setOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true)
  const [, setTick] = useState<number>(0)

  useEffect(() => {
    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    const timer = setInterval(() => setTick((t) => t + 1), 5000)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearInterval(timer)
    }
  }, [])

  const pendingCount = sync.pendingCount
  const lastSyncTime = sync.lastSyncTime
  const isOffline = !online || sync.status === 'offline'
  const lastFlushText = formatLastFlush(lastSyncTime)

  if (compact) {
    return (
      <div
        className={`floor-offline-status-compact ${className ?? ''}`}
        data-floor-verb={verb}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 10px',
          borderRadius: 'var(--r-badge)',
          fontSize: 'var(--t-meta)',
          fontWeight: 600,
          background: isOffline ? 'rgba(212, 112, 38, 0.12)' : pendingCount > 0 ? 'rgba(56, 106, 247, 0.1)' : 'var(--card2)',
          border: `1px solid ${isOffline ? 'var(--st-warn-border)' : pendingCount > 0 ? 'var(--primary)' : 'var(--border)'}`,
          color: isOffline ? 'var(--st-warn-fg)' : pendingCount > 0 ? 'var(--primary-text)' : 'var(--muted)',
        }}
      >
        <Icon name={isOffline ? 'alert_triangle' : pendingCount > 0 ? 'refresh' : 'check'} size={14} />
        <span>
          {isOffline
            ? `Offline · ${pendingCount} queued · Last flush: ${lastFlushText}`
            : pendingCount > 0
            ? `Flushing outbox: ${pendingCount} queued · Last flush: ${lastFlushText}`
            : `Outbox synced · Last flush: ${lastFlushText}`}
        </span>
      </div>
    )
  }

  return (
    <div
      className={`floor-offline-status ${className ?? ''}`}
      role="status"
      data-floor-verb={verb}
      aria-live="polite"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
        padding: '10px 14px',
        borderRadius: 'var(--r-card)',
        background: isOffline
          ? 'var(--st-warn-bg, rgba(212, 112, 38, 0.08))'
          : pendingCount > 0
          ? 'rgba(56, 106, 247, 0.06)'
          : 'var(--card2)',
        border: `1px solid ${isOffline ? 'var(--st-warn-border, #d47026)' : pendingCount > 0 ? 'var(--primary, #386af7)' : 'var(--border)'}`,
        color: 'var(--text)',
        fontSize: 'var(--t-meta)',
        marginBottom: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: isOffline ? 'var(--st-warn-fg, #d47026)' : pendingCount > 0 ? 'var(--primary, #386af7)' : 'var(--st-ready-fg, #1e864a)',
            color: '#fff',
            flexShrink: 0,
          }}
        >
          <Icon name={isOffline ? 'alert_triangle' : pendingCount > 0 ? 'refresh' : 'check'} size={16} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ fontWeight: 700, fontSize: 'var(--t-ui)', color: isOffline ? 'var(--st-warn-fg, #d47026)' : 'var(--text)' }}>
            {isOffline ? 'Offline Mode (Airplane / Network Dropped)' : pendingCount > 0 ? 'Outbox Pending Sync' : 'Floor Outbox Synced'}
          </div>
          <div style={{ color: 'var(--text2)', fontSize: 'var(--t-meta)' }}>
            {isOffline ? (
              <span>
                <strong>{pendingCount}</strong> scan/tick{pendingCount === 1 ? '' : 's'} queued in outbox · Will auto-flush once network restores · <em>Custody completion requires connection</em>
              </span>
            ) : pendingCount > 0 ? (
              <span>
                Flushing <strong>{pendingCount}</strong> queued event{pendingCount === 1 ? '' : 's'} to server…
              </span>
            ) : (
              <span>All floor scans and checklist ticks are recorded in cloud database.</span>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <div style={{ textAlign: 'right', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
          <div>Last flush:</div>
          <div style={{ fontWeight: 600, color: 'var(--text2)' }}>{lastFlushText}</div>
        </div>
        {!isOffline && pendingCount > 0 && (
          <button
            type="button"
            onClick={() => void sync.triggerSync()}
            style={{
              padding: '6px 12px',
              borderRadius: 'var(--r-btn)',
              fontSize: 'var(--t-meta)',
              fontWeight: 600,
              background: 'var(--primary)',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Flush Now
          </button>
        )}
      </div>
    </div>
  )
}
export default FloorOfflineStatus
