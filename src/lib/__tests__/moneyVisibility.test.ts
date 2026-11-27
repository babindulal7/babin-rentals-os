import { describe, it, expect, vi, beforeEach } from 'vitest'

const { useAuthMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
}))

vi.mock('../auth', () => ({
  useAuth: useAuthMock,
}))

import { useCanViewMoney, useCanViewFinancialReports } from '../moneyVisibility'

describe('moneyVisibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns false for both hooks when there is no signed-in user', () => {
    useAuthMock.mockReturnValue({ user: null })
    expect(useCanViewMoney()).toBe(false)
    expect(useCanViewFinancialReports()).toBe(false)
  })

  it.each(['Warehouse', 'Technician', 'Driver', 'Client'] as const)(
    'hides all money from money-blind role %s',
    (role) => {
      useAuthMock.mockReturnValue({ user: { id: 'u1', role } })
      expect(useCanViewMoney()).toBe(false)
      expect(useCanViewFinancialReports()).toBe(false)
    },
  )

  it('allows Coordinator to see booking money but not company-wide financial reports', () => {
    useAuthMock.mockReturnValue({ user: { id: 'u2', role: 'Coordinator' } })
    expect(useCanViewMoney()).toBe(true)
    expect(useCanViewFinancialReports()).toBe(false)
  })

  it.each(['Owner', 'Admin', 'Manager', 'Accounts'] as const)(
    'allows %s to see both money and financial reports',
    (role) => {
      useAuthMock.mockReturnValue({ user: { id: 'u3', role } })
      expect(useCanViewMoney()).toBe(true)
      expect(useCanViewFinancialReports()).toBe(true)
    },
  )
})
