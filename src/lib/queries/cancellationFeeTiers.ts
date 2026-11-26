import { supabase } from '../supabase'

export interface CancellationFeeTier {
  id: string
  noticeHours: number
  feePercent: number
  retiredAt: string | null
  createdAt: string
}

export async function fetchCancellationFeeTiers(): Promise<CancellationFeeTier[]> {
  const { data, error } = await supabase
    .from('cancellation_fee_tiers')
    .select('id, notice_hours, fee_percent, retired_at, created_at')
    .is('retired_at', null)
    .order('notice_hours', { ascending: false })

  if (error) throw new Error(`Could not read cancellation fee tiers: ${error.message}`)

  return ((data ?? []) as unknown as Array<{
    id: string
    notice_hours: number
    fee_percent: number | string
    retired_at: string | null
    created_at: string
  }>).map((row) => ({
    id: row.id,
    noticeHours: row.notice_hours,
    feePercent: Number(row.fee_percent),
    retiredAt: row.retired_at,
    createdAt: row.created_at,
  }))
}

export async function suggestCancellationFee(
  noticeHours: number,
  tiers: CancellationFeeTier[],
): Promise<number | null> {
  if (tiers.length === 0) return null
  // Find the tier with the smallest notice_hours that is >= the actual notice
  // (i.e., the most generous tier the booking qualifies for)
  const sorted = [...tiers].sort((a, b) => a.noticeHours - b.noticeHours)
  let best: CancellationFeeTier | null = null
  for (const tier of sorted) {
    if (noticeHours >= tier.noticeHours) {
      if (!best || tier.noticeHours > best.noticeHours) {
        best = tier
      }
    }
  }
  return best ? best.feePercent : null
}
