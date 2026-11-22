// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

const { getAwayStatus, saveAwayStatus, successToast } = vi.hoisted(() => ({
  getAwayStatus: vi.fn(),
  saveAwayStatus: vi.fn(),
  successToast: vi.fn(),
}))

let currentRole = 'Owner'

vi.mock('../../../../lib/auth', () => ({
  useAuth: () => ({ user: { id: 'test-user', role: currentRole } }),
}))

vi.mock('../../../../components/ui/Toast', () => ({
  useToast: () => ({ showSuccessToast: successToast }),
}))

vi.mock('../../../../lib/awayMode', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../lib/awayMode')>()
  return {
    ...actual,
    fetchOnlineBookingAwayStatus: (...args: unknown[]) => getAwayStatus(...args),
    saveOnlineBookingAwayStatus: (...args: unknown[]) => saveAwayStatus(...args),
  }
})

vi.mock('../../../../components/ui/Page', () => ({
  Button: ({
    children,
    type = 'button',
    disabled,
    loading,
    onClick,
  }: {
    children: React.ReactNode
    type?: 'button' | 'submit'
    disabled?: boolean
    loading?: boolean
    onClick?: () => void
  }) => (
    <button type={type} disabled={disabled || loading} onClick={onClick}>
      {children}
    </button>
  ),
}))

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const { OnlineBookingAwayControl } = await import('../OnlineBookingAwayControl')

let container: HTMLDivElement
let root: Root

async function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<OnlineBookingAwayControl />)
  })
}

async function unmount() {
  if (root) {
    await act(async () => {
      root.unmount()
    })
  }
  container?.remove()
}

describe('T7-14 OnlineBookingAwayControl', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    currentRole = 'Owner'
    getAwayStatus.mockResolvedValue({
      is_away: false,
      configured_away: false,
      can_accept_requests: true,
      message: 'Back on 15 Feb — call or WhatsApp us',
      resume_date: null,
    })
    saveAwayStatus.mockResolvedValue({
      is_away: true,
      configured_away: true,
      can_accept_requests: false,
      message: 'Holiday closure',
      resume_date: '2026-11-25T06:00:00+05:45',
    })
  })

  afterEach(async () => {
    await unmount()
  })

  it('renders active status badge when away mode is off', async () => {
    await mount()
    expect(container.textContent).toContain('Active & accepting requests')
    const checkbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]')
    expect(checkbox).not.toBeNull()
    expect(checkbox?.checked).toBe(false)
  })

  it('renders paused badge when away mode is on', async () => {
    getAwayStatus.mockResolvedValue({
      is_away: true,
      configured_away: true,
      can_accept_requests: false,
      message: 'Closed for maintenance',
      resume_date: null,
    })
    await mount()
    expect(container.textContent).toContain('Paused (Away mode)')
    const checkbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]')
    expect(checkbox?.checked).toBe(true)
  })

  it('allows Owner to toggle away mode and save changes', async () => {
    await mount()
    const checkbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    await act(async () => {
      checkbox.click()
    })

    const messageInput = container.querySelector<HTMLInputElement>('input#away-message')!
    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set
      nativeInputValueSetter?.call(messageInput, 'Holiday closure')
      messageInput.dispatchEvent(new Event('input', { bubbles: true }))
      messageInput.dispatchEvent(new Event('change', { bubbles: true }))
    })

    const submitBtn = container.querySelector<HTMLButtonElement>('button[type="submit"]')!
    expect(submitBtn.disabled).toBe(false)

    await act(async () => {
      container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true }))
    })

    expect(saveAwayStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        isAway: true,
      })
    )
    expect(successToast).toHaveBeenCalled()
  })

  it('disables editing for non-management roles (e.g. Warehouse)', async () => {
    currentRole = 'Warehouse'
    await mount()

    const checkbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    expect(checkbox.disabled).toBe(true)

    const messageInput = container.querySelector<HTMLInputElement>('input#away-message')!
    expect(messageInput.disabled).toBe(true)

    expect(container.textContent).toContain('Only Owner, Admin, and Manager can configure online booking availability')
    expect(container.querySelector('button[type="submit"]')).toBeNull()
  })
})
