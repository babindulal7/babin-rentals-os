import { supabase } from '../supabase'
import type { Paisa } from '../money'

export interface PaymentIntentRow {
  id: string
  clientUuid: string
  bookingId: string | null
  bookingRequestId: string | null
  clientId: string | null
  provider: 'fonepay' | 'esewa' | 'khalti'
  amountPaisa: Paisa
  status: 'pending' | 'paid' | 'allocated' | 'failed' | 'expired'
  providerRef: string | null
  expiresAt: string
  paidAt: string | null
  allocatedAt: string | null
  paymentId: string | null
  createdAt: string
}

/**
 * List unallocated paid payment intents for a given calendar day.
 * Represents online advance payments received but not yet allocated to confirmed bookings.
 * Displayed in daily closing under digital wallets (T7-05).
 */
export async function listUnallocatedPaidIntents(dayAd: string): Promise<{ amountPaisa: Paisa; provider: string }[]> {
  try {
    const start = `${dayAd}T00:00:00.000Z`
    const end = `${dayAd}T23:59:59.999Z`
    const { data, error } = await supabase
      .from('payment_intents')
      .select('amount_paisa, provider')
      .eq('status', 'paid')
      .is('allocated_at', null)
      .gte('paid_at', start)
      .lte('paid_at', end)

    if (error || !data) return []
    return (data as Array<{ amount_paisa: number; provider: string }>).map((r) => ({
      amountPaisa: r.amount_paisa as Paisa,
      provider: r.provider,
    }))
  } catch {
    return []
  }
}
