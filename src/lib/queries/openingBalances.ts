import { supabase } from '../supabase'
import { rupees, type Paisa } from '../money'

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