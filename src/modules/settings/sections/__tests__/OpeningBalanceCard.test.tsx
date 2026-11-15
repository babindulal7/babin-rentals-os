// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { OpeningBalanceCard } from '../OpeningBalanceCard'
import * as auth from '../../../../lib/auth'
import * as bankAccountsApi from '../../../../lib/queries/bankAccounts'
import * as financeApi from '../../../../lib/queries/finance'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

describe('OpeningBalanceCard (T3-07)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.restoreAllMocks()
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

  it('renders nothing for non-Owner roles (Law 6 money-role protection)', async () => {
    vi.spyOn(auth, 'useAuth').mockReturnValue({
      user: { id: 'staff-1', name: 'Technician Staff', role: 'Technician' as const, isSharedDevice: false },
    } as any)

    await act(async () => {
      root.render(<OpeningBalanceCard />)
    })

    expect(container.innerHTML).toBe('')
  })

  it('renders opening balance card and form for Owner', async () => {
    vi.spyOn(auth, 'useAuth').mockReturnValue({
      user: { id: 'owner-1', name: 'Babin Dulal', role: 'Owner' as const, isSharedDevice: false },
    } as any)

    vi.spyOn(bankAccountsApi, 'listBankAccounts').mockResolvedValue([
      { id: 'bank-1', accountName: 'Nabil Bank Main', bankName: 'Nabil Bank', channelGroup: 'Bank', accountNumber: '123' } as any,
    ])
    vi.spyOn(financeApi, 'listExpenseBranches').mockResolvedValue([
      { id: 'branch-1', name: 'Kathmandu HQ' } as any,
    ])

    await act(async () => {
      root.render(<OpeningBalanceCard />)
    })

    // Allow useLoad promises to resolve
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(container.textContent).toContain('Opening balances')
    expect(container.textContent).toContain('Organisation cash drawer')
    expect(container.textContent).toContain('Record opening balance')
  })
})
