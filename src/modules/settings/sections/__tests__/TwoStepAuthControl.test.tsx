// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

const {
  mockFetchOverview,
  mockFetchEnforcement,
  mockSetEnforcement,
  mockResetStaff,
  mockRecordEnrolment,
  mockEnrollTotpFactor,
  mockVerifyTotpFactor,
  successToast,
} = vi.hoisted(() => ({
  mockFetchOverview: vi.fn(),
  mockFetchEnforcement: vi.fn(),
  mockSetEnforcement: vi.fn(),
  mockResetStaff: vi.fn(),
  mockRecordEnrolment: vi.fn(),
  mockEnrollTotpFactor: vi.fn(),
  mockVerifyTotpFactor: vi.fn(),
  successToast: vi.fn(),
}))

let currentRole = 'Owner'
let currentUserId = '00000000-0000-0000-0000-000000000101'

vi.mock('../../../../lib/auth', () => ({
  useAuth: () => ({ user: { id: currentUserId, role: currentRole, name: 'Babin Dulal' } }),
}))

vi.mock('../../../../components/ui/Toast', () => ({
  useToast: () => ({ showSuccessToast: successToast }),
}))

vi.mock('../../../../lib/mfaBoundary', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../lib/mfaBoundary')>()
  return {
    ...actual,
    fetchStaffMfaOverview: (...args: unknown[]) => mockFetchOverview(...args),
    fetchTwoStepAuthEnforcement: (...args: unknown[]) => mockFetchEnforcement(...args),
    setTwoStepAuthEnforcement: (...args: unknown[]) => mockSetEnforcement(...args),
    resetStaffMfa: (...args: unknown[]) => mockResetStaff(...args),
    recordStaffMfaEnrolment: (...args: unknown[]) => mockRecordEnrolment(...args),
    enrollTotpFactor: (...args: unknown[]) => mockEnrollTotpFactor(...args),
    verifyTotpFactor: (...args: unknown[]) => mockVerifyTotpFactor(...args),
  }
})

vi.mock('../../../../components/ui/Page', () => ({
  Button: ({
    children,
    disabled,
    onClick,
  }: {
    children: React.ReactNode
    disabled?: boolean
    onClick?: () => void
  }) => (
    <button type="button" disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
}))

import { TwoStepAuthControl } from '../TwoStepAuthControl'

describe('TwoStepAuthControl', () => {
  let container: HTMLDivElement | null = null
  let root: Root | null = null

  const mockStaffList = [
    {
      user_id: '00000000-0000-0000-0000-000000000101',
      full_name: 'Babin Dulal',
      email: 'babin@babinrentals.com',
      primary_role: 'Owner',
      is_money_role: true,
      mfa_status: 'verified',
      verified_at: '2026-11-01T06:00:00Z',
      last_used_at: '2026-11-23T01:00:00Z',
    },
    {
      user_id: '00000000-0000-0000-0000-000000000104',
      full_name: 'Hari Thapa',
      email: 'hari@babinrentals.com',
      primary_role: 'Coordinator',
      is_money_role: true,
      mfa_status: 'unregistered',
      verified_at: null,
      last_used_at: null,
    },
  ]

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    currentRole = 'Owner'
    currentUserId = '00000000-0000-0000-0000-000000000101'
    vi.clearAllMocks()

    mockFetchEnforcement.mockResolvedValue(false)
    mockFetchOverview.mockResolvedValue(mockStaffList)
    mockSetEnforcement.mockResolvedValue(true)
    mockResetStaff.mockResolvedValue(true)
    mockRecordEnrolment.mockResolvedValue(true)
    mockEnrollTotpFactor.mockResolvedValue({
      factorId: 'mock-factor-123',
      totpSecret: 'JBSWY3DPEHPK3PXP',
      qrCode: 'data:image/svg+xml;utf8,<svg>MOCK</svg>',
      uri: 'otpauth://totp/mock',
    })
    mockVerifyTotpFactor.mockResolvedValue(true)
  })

  afterEach(() => {
    if (root && container) {
      act(() => {
        root!.unmount()
      })
      container.remove()
    }
  })

  it('renders initial staged status and staff roster for Owner', async () => {
    await act(async () => {
      root!.render(<TwoStepAuthControl />)
    })

    expect(container?.textContent).toContain('Staged — Enrolment Mode (Unarmed)')
    expect(container?.textContent).toContain('Babin Dulal')
    expect(container?.textContent).toContain('Hari Thapa')
    expect(container?.textContent).toContain('On since')
    expect(container?.textContent).toContain('Not enrolled')
    expect(container?.textContent).toContain('Arm Enforcement')
  })

  it('allows Owner to toggle enforcement to armed', async () => {
    await act(async () => {
      root!.render(<TwoStepAuthControl />)
    })

    const armButton = Array.from(container!.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Arm Enforcement')
    )
    expect(armButton).toBeDefined()

    await act(async () => {
      armButton!.click()
    })

    expect(mockSetEnforcement).toHaveBeenCalledWith(true)
    expect(successToast).toHaveBeenCalledWith(expect.stringContaining('ARMED'))
  })

  it('shows Reset button for verified staff and triggers reset', async () => {
    await act(async () => {
      root!.render(<TwoStepAuthControl />)
    })

    // Reset button is visible for verified staff (Babin)
    const resetButton = Array.from(container!.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Reset')
    )
    expect(resetButton).toBeDefined()

    // Click Reset opens modal
    await act(async () => {
      resetButton!.click()
    })

    expect(document.body.textContent).toContain('Reset MFA for Babin Dulal')
  })

  it('hides Arm button and shows Set Up button when user is not enrolled', async () => {
    currentRole = 'Coordinator'
    currentUserId = '00000000-0000-0000-0000-000000000104'

    await act(async () => {
      root!.render(<TwoStepAuthControl />)
    })

    expect(container?.textContent).not.toContain('Arm Enforcement')
    expect(container?.textContent).toContain('Set up authenticator')
  })

  it('opens enrollment modal, displays QR code and secret, and verifies with 6 digits', async () => {
    currentRole = 'Coordinator'
    currentUserId = '00000000-0000-0000-0000-000000000104'

    await act(async () => {
      root!.render(<TwoStepAuthControl />)
    })

    const setUpButton = Array.from(container!.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Set up authenticator')
    )
    expect(setUpButton).toBeDefined()

    await act(async () => {
      setUpButton!.click()
    })

    expect(mockEnrollTotpFactor).toHaveBeenCalled()
    expect(document.body.textContent).toContain('Set Up Authenticator App')
    expect(document.body.textContent).toContain('JBSWY3DPEHPK3PXP')

    const input = document.body.querySelector('input')
    expect(input).toBeDefined()

    // Enter 6 digit code
    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set
      nativeInputValueSetter?.call(input, '123456')
      input!.dispatchEvent(new Event('change', { bubbles: true }))
    })

    const verifyButton = Array.from(document.body.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Verify & Enable')
    )
    expect(verifyButton).toBeDefined()
    expect(verifyButton!.disabled).toBe(false)

    await act(async () => {
      verifyButton!.click()
    })

    expect(mockVerifyTotpFactor).toHaveBeenCalledWith(
      'mock-factor-123',
      '123456',
      '00000000-0000-0000-0000-000000000104'
    )
    expect(successToast).toHaveBeenCalledWith(expect.stringContaining('successfully'))
  })

  it('displays error if verification fails and keeps modal open', async () => {
    currentRole = 'Coordinator'
    currentUserId = '00000000-0000-0000-0000-000000000104'
    mockVerifyTotpFactor.mockRejectedValueOnce(new Error('Invalid TOTP code'))

    await act(async () => {
      root!.render(<TwoStepAuthControl />)
    })

    const setUpButton = Array.from(container!.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Set up authenticator')
    )
    await act(async () => {
      setUpButton!.click()
    })

    const input = document.body.querySelector('input')
    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set
      nativeInputValueSetter?.call(input, '000000')
      input!.dispatchEvent(new Event('change', { bubbles: true }))
    })

    const verifyButton = Array.from(document.body.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Verify & Enable')
    )
    await act(async () => {
      verifyButton!.click()
    })

    expect(mockVerifyTotpFactor).toHaveBeenCalled()
    expect(document.body.textContent).toContain('Invalid TOTP code')
    // Modal still open
    expect(document.body.textContent).toContain('Set Up Authenticator App')
  })
})
