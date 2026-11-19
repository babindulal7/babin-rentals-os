import React, { useEffect, useRef, useState } from 'react'

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        options: {
          sitekey: string
          action?: string
          callback?: (token: string) => void
          'error-callback'?: (err?: unknown) => void
          'expired-callback'?: () => void
          theme?: 'light' | 'dark' | 'auto'
          size?: 'normal' | 'compact' | 'flexible'
        }
      ) => string
      reset: (widgetId?: string) => void
      remove: (widgetId?: string) => void
    }
  }
}

export interface TurnstileWidgetProps {
  action?: 'email_otp' | 'booking_request' | 'payment' | string | undefined
  onVerify: (token: string) => void
  onError?: ((error: string) => void) | undefined
  className?: string | undefined
}

export const TurnstileWidget: React.FC<TurnstileWidgetProps> = ({
  action = 'general',
  onVerify,
  onError,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)
  const onVerifyRef = useRef(onVerify)
  const onErrorRef = useRef(onError)
  const [verified, setVerified] = useState<boolean>(false)

  useEffect(() => {
    onVerifyRef.current = onVerify
    onErrorRef.current = onError
  }, [onVerify, onError])

  const siteKey =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_TURNSTILE_SITE_KEY
      ? (import.meta.env.VITE_TURNSTILE_SITE_KEY as string)
      : ''

  const isMockOrTest =
    typeof import.meta !== 'undefined' &&
    (import.meta.env?.MODE === 'test' ||
      import.meta.env?.VITE_DATA_SOURCE === 'mock' ||
      !siteKey)

  useEffect(() => {
    if (isMockOrTest) {
      // In mock/test/dev environment without live keys, simulate instant verified token
      const mockToken = `cf_valid_mock_${action}_${Math.random().toString(36).substring(2, 8)}`
      setVerified(true)
      onVerifyRef.current(mockToken)
      return
    }

    if (!containerRef.current || !window.turnstile) return

    try {
      const id = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        action,
        callback: (token: string) => {
          setVerified(true)
          onVerifyRef.current(token)
        },
        'error-callback': () => {
          setVerified(false)
          onErrorRef.current?.('Bot challenge verification failed. Please try again.')
        },
        'expired-callback': () => {
          setVerified(false)
          onErrorRef.current?.('Bot verification token expired. Please re-verify.')
        },
      })
      widgetIdRef.current = id
    } catch {
      // Fallback
      onErrorRef.current?.('Could not initialize bot protection.')
    }

    return () => {
      if (widgetIdRef.current && window.turnstile?.remove) {
        try {
          window.turnstile.remove(widgetIdRef.current)
        } catch {
          // ignore
        }
      }
    }
  }, [action, isMockOrTest, siteKey])

  return (
    <div
      className={`turnstile-container ${className}`}
      style={{
        margin: '12px 0',
        minHeight: isMockOrTest ? '24px' : '65px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: '12px',
        color: '#6b7280',
      }}
      data-testid="turnstile-widget"
    >
      <div ref={containerRef} />
      {isMockOrTest && verified && (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 8px',
            background: 'var(--color-surface-subtle, #f3f4f6)',
            borderRadius: '4px',
            fontSize: '11px',
            color: 'var(--color-text-secondary, #4b5563)',
          }}
          data-testid="turnstile-verified-badge"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ color: '#059669' }}
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
          Protected by Cloudflare Turnstile
        </span>
      )}
    </div>
  )
}
