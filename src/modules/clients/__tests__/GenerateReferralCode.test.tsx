// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import GenerateReferralCode from '../GenerateReferralCode'

// @ts-expect-error React 18 act flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'usr-admin-1', role: 'Admin', email: 'admin@babinrentals.com' },
  }),
}))

vi.mock('../../../lib/moneyVisibility', () => ({
  useCanViewMoney: () => true,
}))

vi.mock('../../../lib/queries/clients', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/queries/clients')>()
  return {
    ...actual,
    listReferrerOptions: async () => [
      { clientCode: 'CL-001', name: 'Kathmandu Films', phone: '9801234567', isBlocked: false },
      { clientCode: 'CL-002', name: 'Pokhara Productions', phone: '9812345678', isBlocked: false },
    ],
  }
})

describe('GenerateReferralCode (#18 Preview / Specification Sandbox)', () => {
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
    vi.restoreAllMocks()
  })

  it('renders prominent Preview / Specification Only badge and notice banner', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <GenerateReferralCode />
        </MemoryRouter>,
      )
    })

    expect(container.textContent).toContain('Preview / Specification Only')
    expect(container.textContent).toContain('Preview / Specification Mode — Issuing Action Not Connected')
    expect(container.textContent).toContain('Referral code issuance is not connected in the backend')
  })

  it('renders disabled Create Referral Code button guarded by Unavailable', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <GenerateReferralCode />
        </MemoryRouter>,
      )
    })

    const submitBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Create Referral Code'),
    )
    expect(submitBtn).toBeDefined()
    expect(submitBtn?.disabled).toBe(true)
  })

  it('calls onDone when Cancel button is clicked', async () => {
    const handleDone = vi.fn()

    await act(async () => {
      root.render(
        <MemoryRouter>
          <GenerateReferralCode onDone={handleDone} />
        </MemoryRouter>,
      )
    })

    const cancelBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Cancel',
    )
    expect(cancelBtn).toBeDefined()

    act(() => {
      cancelBtn?.click()
    })

    expect(handleDone).toHaveBeenCalledTimes(1)
  })
})
