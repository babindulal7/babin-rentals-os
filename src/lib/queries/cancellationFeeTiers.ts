import { supabase } from '../supabase'

export interface CancellationFeeTier {
  id: string
  noticeHours: number
  feePercent: number
  retiredAt: string | null
  createdAt: string
  updatedAt: string
}

export async function fetchCancellationFeeTiers(): Promise<CancellationFeeTier[]> {
  const { data, error } = await supabase
    .from('cancellation_fee_tiers')
    .select('id, notice_hours, fee_percent, retired_at, created_at, updated_at')
    .is('retired_at', null)
    .order('notice_hours', { ascending: false })

  if (error) throw new Error(`Could not read cancellation fee tiers: ${error.message}`)

  return ((data ?? []) as unknown as Array<{
    id: string
    notice_hours: number
    fee_percent: number | string
    retired_at: string | null
    created_at: string
    updated_at: string
  }>).map((row) => ({
    id: row.id,
    noticeHours: row.notice_hours,
    feePercent: Number(row.fee_percent),
    retiredAt: row.retired_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
}

export function suggestCancellationFee(
  noticeHours: number,
  tiers: readonly CancellationFeeTier[],
): number | null {
  let best: CancellationFeeTier | null = null
  for (const tier of tiers) {
    if (tier.retiredAt === null && noticeHours >= tier.noticeHours &&
        (best === null || tier.noticeHours > best.noticeHours)) {
      best = tier
    }
  }
  return best?.feePercent ?? null
}

function validateTier(noticeHours: number, feePercent: number) {
  if (!Number.isInteger(noticeHours) || noticeHours < 0 || noticeHours > 2_147_483_647) {
    throw new Error('Enter a whole number of notice hours.')
  }
  if (!Number.isFinite(feePercent) || feePercent < 0 || feePercent > 100 ||
      Number(feePercent.toFixed(2)) !== feePercent) {
    throw new Error('Enter a fee from 0 to 100% with up to two decimal places.')
  }
}

export async function recordCancellationFeeTier(input: {
  noticeHours: number
  feePercent: number
  clientUuid: string
  createdBy: string
}): Promise<void> {
  validateTier(input.noticeHours, input.feePercent)

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


export async function updateCancellationFeeTier(
  tier: CancellationFeeTier,
  change: { noticeHours: number; feePercent: number } | 'retire',
): Promise<void> {
  if (change !== 'retire') validateTier(change.noticeHours, change.feePercent)
  const updatedAt = new Date().toISOString()
  const patch = change === 'retire'
    ? { retired_at: updatedAt, updated_at: updatedAt }
    : { notice_hours: change.noticeHours, fee_percent: change.feePercent, updated_at: updatedAt }

  const { data, error } = await supabase.from('cancellation_fee_tiers')
    .update(patch)
    .eq('id', tier.id)
    .eq('updated_at', tier.updatedAt)
    .eq('notice_hours', tier.noticeHours)
    .eq('fee_percent', tier.feePercent)
    .is('retired_at', null)
    .select('id')
    .maybeSingle()
  if (error?.code === '23505' && error.message.includes('cancellation_fee_tiers_active_notice_key')) {
    throw new Error('An active tier already uses that notice period.')
  }
  if (error) throw new Error(`Could not update cancellation tier: ${error.message}`)
  if (data) return

  const { data: current, error: readError } = await supabase.from('cancellation_fee_tiers')
    .select('notice_hours, fee_percent, retired_at')
    .eq('id', tier.id)
    .maybeSingle()
  if (readError) throw new Error(`Could not confirm the cancellation tier: ${readError.message}`)
  if (current && (change === 'retire'
    ? current.retired_at !== null
    : current.retired_at === null && current.notice_hours === change.noticeHours &&
      Number(current.fee_percent) === change.feePercent)) return
  throw new Error('This tier changed while it was open. Reload the tiers and try again.')
}
