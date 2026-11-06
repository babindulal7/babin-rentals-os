import { beforeEach, describe, expect, it, vi } from 'vitest'
import { recordOpeningBalance, type RecordOpeningBalanceInput } from '../openingBalances'
import { rupees } from '../../money'

const mocks = vi.hoisted(() => ({ insert: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() }))

vi.mock('../../supabase', () => ({
  supabase: { from: () => ({
    insert: mocks.insert,
    select: () => ({ eq: mocks.eq.mockReturnValue({ maybeSingle: mocks.maybeSingle }) }),
  }) },
}))

const input: RecordOpeningBalanceInput = {
  account: { type: 'cash', locationId: 'branch-1' },
  openingDate: '2026-11-05',
  amountPaisa: rupees(1250.25),
  clientUuid: 'entry-1',
  createdBy: 'owner-1',
}

describe('recordOpeningBalance', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.insert.mockResolvedValue({ error: null })
  })

  it('inserts a dated, branch-scoped cash opening in database rupees', async () => {
    await recordOpeningBalance(input)
    expect(mocks.insert).toHaveBeenCalledWith({
      account_type: 'cash', account_id: null, location_id: 'branch-1', scope: 'location',
      opening_date: '2026-11-05', amount: 1250.25, client_uuid: 'entry-1', created_by: 'owner-1',
    })
  })

  it('keeps a bank opening organisation-scoped and preserves a zero balance', async () => {
    await recordOpeningBalance({ ...input, account: { type: 'bank', accountId: 'bank-1' }, amountPaisa: rupees(0) })
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      account_type: 'bank', account_id: 'bank-1', location_id: null, scope: 'org', amount: 0,
    }))
  })

  it('rejects invalid dates before calling the database', async () => {
    await expect(recordOpeningBalance({ ...input, openingDate: '2026-02-30' })).rejects.toThrow('valid opening date')
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  it('recognises a retry only if the recorded values agree', async () => {
    mocks.insert.mockResolvedValue({ error: { code: '23505', message: 'opening_balances_client_uuid_key' } })
    const prior = {
      account_type: 'cash', account_id: null, location_id: 'branch-1', scope: 'location',
      opening_date: '2026-11-05', amount: '1250.25', created_by: 'owner-1',
    }
    mocks.maybeSingle.mockResolvedValueOnce({ data: prior, error: null })
    await expect(recordOpeningBalance(input)).resolves.toBeUndefined()
    expect(mocks.eq).toHaveBeenCalledWith('client_uuid', 'entry-1')
    mocks.maybeSingle.mockResolvedValueOnce({ data: { ...prior, amount: '1300.00' }, error: null })
    await expect(recordOpeningBalance(input)).rejects.toThrow('Could not record opening balance')
  })

  it('surfaces a database refusal', async () => {
    mocks.insert.mockResolvedValue({ error: { code: '42501', message: 'permission denied' } })
    await expect(recordOpeningBalance(input)).rejects.toThrow('permission denied')
  })
})
