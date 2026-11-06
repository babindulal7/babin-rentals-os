import { rupees, type Paisa } from '../money'
import { supabase } from '../supabase'
import { listBankAccounts, type BankAccountRow } from './bankAccounts'

interface DepositSettlementDetails {
  heldPaisa: Paisa
  accounts: BankAccountRow[]
  originalAccountId: string | null
}

export async function fetchDepositSettlementDetails(bookingId: string): Promise<DepositSettlementDetails> {
  const { data: deposit, error } = await supabase
    .from('security_deposits')
    .select('id, received_amount, refunded_amount, applied_amount')
    .eq('booking_id', bookingId)
    .maybeSingle()

  if (error) throw new Error(`Could not read the deposit balance: ${error.message}`)
  if (!deposit) return { heldPaisa: rupees(0), accounts: [], originalAccountId: null }

  const heldPaisa = (rupees(Number(deposit.received_amount)) -
    rupees(Number(deposit.refunded_amount)) - rupees(Number(deposit.applied_amount))) as Paisa
  if (heldPaisa <= 0) return { heldPaisa, accounts: [], originalAccountId: null }

  const [accounts, receipts] = await Promise.all([
    listBankAccounts(),
    supabase.from('deposit_movements')
      .select('bank_account_id', { count: 'exact' })
      .eq('security_deposit_id', deposit.id)
      .eq('movement_type', 'Received'),
  ])
  if (receipts.error) throw new Error(`Could not read deposit receipt methods: ${receipts.error.message}`)

  const rows = receipts.data ?? []
  const receiptAccountId = rows[0]?.bank_account_id
  const originalAccountId = receiptAccountId && rows.length === receipts.count &&
    rows.every(row => row.bank_account_id === receiptAccountId) &&
    accounts.some(account => account.id === receiptAccountId) ? receiptAccountId : null

  return { heldPaisa, accounts, originalAccountId }
}
