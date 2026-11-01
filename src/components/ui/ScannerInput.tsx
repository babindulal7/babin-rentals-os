import React, { useState, useRef, useEffect, useCallback } from 'react'
import { IconBarcode, IconCheck, IconCornerDownLeft, IconCamera } from '@tabler/icons-react'
import { useBarcodeBurst } from '../../lib/barcodeBurst'
import { dispatchScanFeedback } from '../../lib/scannerFeedback'

export interface ScannerInputProps {
  onScan: (code: string) => void
  onCameraClick?: () => void
  placeholder?: string
  autoFocus?: boolean
  continuous?: boolean
  className?: string
  /** Whether to intercept hardware Bluetooth/USB scanner bursts anywhere on the floor screen (default: true) */
  ambient?: boolean
  /** Whether to retain focus or route stray scanner strokes back to the field (default: true) */
  focusTrap?: boolean
  /** Duplicate scan suppression window in ms (default: 1200ms) */
  cooldownMs?: number
  /** Controlled value (optional) */
  value?: string
  /** Controlled value setter (optional) */
  onChange?: (val: string) => void
  /** Optional custom status indicator */
  statusMessage?: { text: string; error?: boolean } | null
}

export const ScannerInput: React.FC<ScannerInputProps> = ({
  onScan,
  onCameraClick,
  placeholder = 'Scan barcode / QR or enter asset code...',
  autoFocus = true,
  continuous = true,
  className = '',
  ambient = true,
  focusTrap = true,
  cooldownMs = 1200,
  value: controlledValue,
  onChange: onControlledChange,
  statusMessage,
}) => {
  const [internalValue, setInternalValue] = useState('')
  const [recentScan, setRecentScan] = useState<string | null>(null)
  const [pulse, setPulse] = useState<'success' | 'error' | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const lastAcceptedScan = useRef<{ code: string; at: number } | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      if (timerRef.current) clearTimeout(timerRef.current)
      if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current)
    }
  }, [])

  const value = controlledValue !== undefined ? controlledValue : internalValue
  const setValue = useCallback(
    (next: string) => {
      if (onControlledChange) onControlledChange(next)
      else setInternalValue(next)
    },
    [onControlledChange]
  )

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus()
    }
  }, [autoFocus])

  // Global ⌘+B / Ctrl+B scanner shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const triggerPulse = useCallback((type: 'success' | 'error') => {
    setPulse(type)
    try {
      dispatchScanFeedback(type === 'success' ? 'ok' : 'wrong')
    } catch {
      // Audio feedback fallback in non-browser or mock environments
    }
    if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current)
    pulseTimerRef.current = setTimeout(() => {
      if (isMountedRef.current) setPulse(null)
    }, 600)
  }, [])

  const executeScan = useCallback(
    (code: string) => {
      const trimmed = code.trim()
      if (!trimmed) return

      const now = Date.now()
      const previous = lastAcceptedScan.current
      if (previous?.code === trimmed.toLowerCase() && now - previous.at < cooldownMs) return
      onScan(trimmed)
      lastAcceptedScan.current = { code: trimmed.toLowerCase(), at: now }
      setRecentScan(trimmed)
      setValue('')
      triggerPulse('success')

      if (continuous) {
        inputRef.current?.focus()
      }

      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        if (isMountedRef.current) setRecentScan(null)
      }, 2500)
    },
    [onScan, setValue, continuous, triggerPulse, cooldownMs]
  )

  // Attach hardware Bluetooth / USB scanner burst listener (T2-09)
  useBarcodeBurst({
    onScan: executeScan,
    enabled: ambient,
    cooldownMs,
    ...(focusTrap ? { targetInputRef: inputRef } : {}),
  })

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current)
    }
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    executeScan(value)
  }

  return (
    <div className={className || undefined} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <form onSubmit={handleSubmit} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div
          style={{
            position: 'relative',
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            borderRadius: 'var(--r-card)',
            outline:
              pulse === 'success'
                ? '2px solid var(--st-in-fg, #22c55e)'
                : pulse === 'error'
                ? '2px solid var(--st-danger-fg, #ef4444)'
                : 'none',
            boxShadow:
              pulse === 'success'
                ? '0 0 12px color-mix(in srgb, var(--st-in-fg, #22c55e) 40%, transparent)'
                : pulse === 'error'
                ? '0 0 12px color-mix(in srgb, var(--st-danger-fg, #ef4444) 40%, transparent)'
                : 'var(--shadow-card)',
            transition: 'outline 0.15s ease-in-out, box-shadow 0.15s ease-in-out',
          }}
        >
          <div style={{ position: 'absolute', left: 14, display: 'flex', alignItems: 'center', pointerEvents: 'none', color: 'var(--nav-active-accent)' }}>
            <IconBarcode size={20} />
          </div>

          <input
            ref={inputRef}
            type="text"
            aria-label={placeholder || 'Scan barcode or enter asset code'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            style={{
              width: '100%',
              minHeight: 46,
              paddingLeft: 44,
              paddingRight: 96,
              paddingTop: 10,
              paddingBottom: 10,
              fontSize: 'var(--t-ui)',
              fontFamily: 'var(--font-id, sans-serif)',
              fontVariantNumeric: 'tabular-nums',
              borderRadius: 'var(--r-card)',
              background: 'var(--card2)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              outline: 'none',
              transition: 'border-color var(--dur) var(--ease)',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--nav-active-accent)'
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--border)'
            }}
          />

          <div style={{ position: 'absolute', right: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
            <button
              type="submit"
              disabled={!value.trim()}
              /* Law 15 — 44×44 touch target */
              style={{
                minHeight: 44,
                minWidth: 44,
                padding: '0 12px',
                borderRadius: 'var(--r-sm)',
                background: 'var(--btn-primary-bg)',
                color: 'var(--btn-primary-fg)',
                border: 'none',
                fontWeight: 600,
                fontSize: 'var(--t-meta)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                cursor: !value.trim() ? 'not-allowed' : 'pointer',
                opacity: !value.trim() ? 0.4 : 1,
                transition: 'opacity var(--dur) var(--ease)',
              }}
            >
              <span>Scan</span>
              <IconCornerDownLeft size={14} />
            </button>
          </div>
        </div>

        {/* Camera scanning stays accessible on every floor screen (S14) */}
        {onCameraClick && (
          <button
            type="button"
            onClick={onCameraClick}
            aria-label="Scan with Camera"
            style={{
              minHeight: 44,
              minWidth: 44,
              padding: '0 12px',
              borderRadius: 'var(--r-sm)',
              background: 'var(--card2)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontWeight: 600,
              fontSize: 'var(--t-meta)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            <IconCamera size={18} />
            <span>Camera</span>
          </button>
        )}
      </form>

      {/* Real-time scan confirmation feedback */}
      {recentScan && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 'var(--t-meta)',
            color: 'var(--st-in-fg)',
            background: 'var(--st-in-bg)',
            border: '1px solid var(--st-in-border)',
            padding: '6px 12px',
            borderRadius: 'var(--r-sm)',
          }}
        >
          <IconCheck size={16} style={{ flexShrink: 0 }} />
          <span>
            Scanned: <span style={{ fontFamily: 'var(--font-id, sans-serif)', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: 'var(--text)' }}>{recentScan}</span>
          </span>
        </div>
      )}

      {/* Custom status message (e.g. error banner or warning) */}
      {statusMessage && (
        <div
          role={statusMessage.error ? 'alert' : 'status'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 'var(--t-meta)',
            color: statusMessage.error ? 'var(--st-danger-fg)' : 'var(--st-in-fg)',
            background: statusMessage.error ? 'var(--st-danger-bg)' : 'var(--st-in-bg)',
            border: `1px solid ${statusMessage.error ? 'var(--st-danger-border)' : 'var(--st-in-border)'}`,
            padding: '6px 12px',
            borderRadius: 'var(--r-sm)',
          }}
        >
          <span>{statusMessage.text}</span>
        </div>
      )}
    </div>
  )
}
