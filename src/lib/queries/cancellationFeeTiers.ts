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

export async function recordCancellationFeeTier(input: {
  noticeHours: number
  feePercent: number
  clientUuid: string
  createdBy: string
}): Promise<void> {
  if (!Number.isInteger(input.noticeHours) || input.noticeHours < 0 || input.noticeHours > 2_147_483_647) {
    throw new Error('Enter a whole number of notice hours.')
  }
  if (!Number.isFinite(input.feePercent) || input.feePercent < 0 || input.feePercent > 100 ||
      Number(input.feePercent.toFixed(2)) !== input.feePercent) {
    throw new Error('Enter a fee from 0 to 100% with up to two decimal places.')
  }

  const { error } = await supabase.from('cancellation_fee_tiers').insert({
    notice_hours: input.noticeHours,
    fee_percent: input.feePercent,
    client_uuid: input.clientUuid,
    created_by: input.createdBy,
  })
  if (!error) return

  if (error.code === '23505') {
    const { data: prior, error: readError } = await supabase.from('cancellation_fee_tiers')
      .select('notice_hours, fee_percent, created_by')
      .eq('client_uuid', input.clientUuid)
      .maybeSingle()
    if (readError) throw new Error(`Could not confirm the cancellation tier: ${readError.message}`)
    if (prior && prior.notice_hours === input.noticeHours && Number(prior.fee_percent) === input.feePercent &&
        prior.created_by === input.createdBy) return
    if (error.message.includes('cancellation_fee_tiers_active_notice_key')) {
      throw new Error('An active tier already uses that notice period.')
    }
  }

  throw new Error(`Could not record cancellation tier: ${error.message}`)
}
