import { beforeEach, describe, expect, it, vi } from 'vitest'
import { rupees } from '../../money'
import { fetchDepositSettlementDetails } from '../depositSettlement'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  listBankAccounts: vi.fn(),
}))

vi.mock('../../supabase', () => ({ supabase: { from: mocks.from } }))
vi.mock('../bankAccounts', () => ({ listBankAccounts: mocks.listBankAccounts }))

describe('deposit settlement details', () => {
  const accounts = [{ id: 'drawer' }, { id: 'bank' }]

  beforeEach(() => {
    mocks.from.mockReset()
    mocks.listBankAccounts.mockResolvedValue(accounts)
  })

  function ledger(accountIds: (string | null)[], receiptCount = accountIds.length) {
    const depositFilter = vi.fn().mockReturnValue({ maybeSingle: async () => ({
      data: { id: 'deposit-1', received_amount: '125.50', refunded_amount: '10.10', applied_amount: '5.20' },
      error: null,
    }) })
    const movementTypeFilter = vi.fn().mockResolvedValue({
      data: accountIds.map(bank_account_id => ({ bank_account_id })),
      count: receiptCount,
      error: null,
    })
    const movementDepositFilter = vi.fn().mockReturnValue({ eq: movementTypeFilter })
    mocks.from.mockImplementation((table: string) => ({
      select: () => ({ eq: table === 'security_deposits' ? depositFilter : movementDepositFilter }),
    }))
    return { depositFilter, movementDepositFilter, movementTypeFilter }
  }

  it('subtracts earlier releases and applications and selects the shared receipt account', async () => {
    const { depositFilter, movementDepositFilter, movementTypeFilter } = ledger(['drawer', 'drawer'])
    expect(await fetchDepositSettlementDetails('booking-1')).toEqual({
      heldPaisa: rupees(110.20), accounts, originalAccountId: 'drawer',
    })
    expect(depositFilter).toHaveBeenCalledWith('booking_id', 'booking-1')
    expect(movementDepositFilter).toHaveBeenCalledWith('security_deposit_id', 'deposit-1')
    expect(movementTypeFilter).toHaveBeenCalledWith('movement_type', 'Received')
  })

  it.each([
    { ids: ['drawer', 'bank'], count: 2 },
    { ids: ['drawer', null], count: 2 },
    { ids: ['retired-account'], count: 1 },
    { ids: ['drawer'], count: 2 },
  ])('leaves the choice blank for mixed, unknown, inactive or incomplete receipt data', async ({ ids, count }) => {
    ledger(ids, count)
    expect((await fetchDepositSettlementDetails('booking-1')).originalAccountId).toBeNull()
  })
})
