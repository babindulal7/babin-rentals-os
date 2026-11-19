// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { TurnstileWidget } from '../components/TurnstileWidget'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

describe('TurnstileWidget Component (T7-09)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it('renders turnstile widget container and emits token in test/mock mode', () => {
    const onVerify = vi.fn()
    const onError = vi.fn()

    act(() => {
      root.render(
        <TurnstileWidget
          action="email_otp"
          onVerify={onVerify}
          onError={onError}
        />
      )
    })

    const widget = container.querySelector('[data-testid="turnstile-widget"]')
    expect(widget).not.toBeNull()

    const badge = container.querySelector('[data-testid="turnstile-verified-badge"]')
    expect(badge).not.toBeNull()
    expect(badge?.textContent).toContain('Cloudflare Turnstile')

    expect(onVerify).toHaveBeenCalledTimes(1)
    expect(onVerify).toHaveBeenCalledWith(expect.stringMatching(/^cf_valid_mock_email_otp_/))
    expect(onError).not.toHaveBeenCalled()
  })
})
