import { supabase } from '../supabase'
import { rupees, toRupees, type Paisa } from '../money'

export interface OpeningBalance {
  id: string
  accountType: 'cash' | 'bank'
  accountId: string | null
  openingDate: string
  amountPaisa: Paisa
  createdAt: string
}

export async function fetchOpeningBalances(): Promise<OpeningBalance[]> {
  const { data, error } = await supabase
    .from('opening_balances')
    .select('id, account_type, account_id, opening_date, amount, created_at')
    .is('retired_at', null)
    .order('opening_date', { ascending: false })

  if (error) throw new Error(`Could not read opening balances: ${error.message}`)

  return ((data ?? []) as unknown as Array<{
    id: string
    account_type: string
    account_id: string | null
    opening_date: string
    amount: number | string
    created_at: string
  }>).map((row) => ({
    id: row.id,
    accountType: row.account_type as 'cash' | 'bank',
    accountId: row.account_id,
    openingDate: row.opening_date,
    amountPaisa: rupees(Number(row.amount)) as Paisa,
    createdAt: row.created_at,
  }))
}

export async function fetchLatestOpeningBalance(
  accountType: 'cash' | 'bank',
  accountId: string | null,
  asOfDate: string,
  locationId?: string,
): Promise<OpeningBalance | null> {
  let query = supabase
    .from('opening_balances')
    .select('id, account_type, account_id, opening_date, amount, created_at')
    .eq('account_type', accountType)
    .eq('scope', locationId ? 'location' : 'org')
    .is('retired_at', null)
    .lte('opening_date', asOfDate)

  query = accountId === null ? query.is('account_id', null) : query.eq('account_id', accountId)
  query = locationId ? query.eq('location_id', locationId) : query.is('location_id', null)

  const { data, error } = await query
    .order('opening_date', { ascending: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)

  if (error) throw new Error(`Could not read opening balance: ${error.message}`)

  const rows = (data ?? []) as unknown as Array<{
    id: string
    account_type: string
    account_id: string | null
    opening_date: string
    amount: number | string
    created_at: string
  }>

  if (rows.length === 0) return null

  const row = rows[0]!
  return {
    id: row.id,
    accountType: row.account_type as 'cash' | 'bank',
    accountId: row.account_id,
    openingDate: row.opening_date,
    amountPaisa: rupees(Number(row.amount)) as Paisa,
    createdAt: row.created_at,
  }
}
export interface RecordOpeningBalanceInput {
  account: { type: 'cash'; locationId: string | null } | { type: 'bank'; accountId: string }
  openingDate: string
  amountPaisa: Paisa
  clientUuid: string
  createdBy: string
}

export async function recordOpeningBalance(input: RecordOpeningBalanceInput): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.openingDate)) {
    throw new Error('Choose an opening date.')
  }
  const date = new Date(input.openingDate)
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== input.openingDate) {
    throw new Error('Choose a valid opening date.')
  }
  if (!Number.isSafeInteger(input.amountPaisa) || Math.abs(input.amountPaisa) > 99_999_999_999_999) {
    throw new Error('Enter a valid opening amount.')
  }

  const locationId = input.account.type === 'cash' ? input.account.locationId : null
  const payload = {
    client_uuid: input.clientUuid,
    account_type: input.account.type,
    account_id: input.account.type === 'bank' ? input.account.accountId : null,
    opening_date: input.openingDate,
    amount: toRupees(input.amountPaisa),
    scope: locationId ? 'location' : 'org',
    location_id: locationId,
    created_by: input.createdBy,
  }
  const { error } = await supabase.from('opening_balances').insert(payload)
  if (!error) return

  if (error.code === '23505' && error.message.includes('opening_balances_client_uuid_key')) {
    const { data: existing, error: readError } = await supabase.from('opening_balances')
      .select('account_type, account_id, opening_date, amount, scope, location_id, created_by')
      .eq('client_uuid', input.clientUuid)
      .maybeSingle()
    if (!readError && existing &&
        existing.account_type === payload.account_type && existing.account_id === payload.account_id &&
        existing.opening_date === payload.opening_date && rupees(Number(existing.amount)) === input.amountPaisa &&
        existing.scope === payload.scope && existing.location_id === payload.location_id &&
        existing.created_by === payload.created_by) return
  }

  throw new Error(`Could not record opening balance: ${error.message}`)
}
