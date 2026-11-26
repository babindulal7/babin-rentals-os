/**
 * Morning Digest — query and manual trigger service (T5-04, Ruling O-4).
 *
 * Implements:
 *   - Auto digest at 05:30 NPT before 06:00 operational day start (O-4)
 *   - Operational day query (06:00 -> 06:00 NPT)
 *   - Pickups, returns, overdue returns, open damage cases, shift handovers, payments due
 *   - Law 6: Money blindness (Warehouse, Technician, Driver, Client see no financial figures)
 *   - Empty day fallback: "Nothing scheduled today"
 */

import { supabase, IS_MOCK } from '../supabase'
import { toBs, formatBs } from '../bs'

export interface MorningDigestItem {
  id: string
  booking_no?: string
  client_name?: string
  pickup_at?: string
  pickup_time?: string
  return_at?: string
  return_time?: string
  days_overdue?: number
  delivery_type?: string
  stage?: string
  damage_type?: string
  severity?: string
  description?: string
  approval_state?: string
  created_at?: string
  estimated_cost_paisa?: number | null
  shift_code?: string
  shift_date?: string
  from_user_name?: string
  notes?: string
  status?: string
  invoice_no?: string
  booking_id?: string
  due_date?: string
  outstanding_paisa?: number
}

export interface MorningDigestData {
  recipient: {
    user_id: string
    full_name: string
    email: string
    role: string
  }
  target_date: string
  bs_date?: string
  operational_day_start: string
  operational_day_end: string
  can_view_money: boolean
  has_scheduled_items: boolean
  empty_message: string | null
  total_items_count: number
  pickups: MorningDigestItem[]
  returns: MorningDigestItem[]
  overdue: MorningDigestItem[]
  open_damage: MorningDigestItem[]
  shift_handovers: MorningDigestItem[]
  payments_due: MorningDigestItem[]
}

export const MOCK_MORNING_DIGEST: MorningDigestData = {
  recipient: {
    user_id: '00000000-0000-4000-8000-00000000e001',
    full_name: 'Babin Dulal',
    email: 'babin@babinrentals.com',
    role: 'Owner',
  },
  target_date: '2026-07-31',
  bs_date: '15 Shrawan 2083',
  operational_day_start: '2026-07-31T00:15:00.000Z',
  operational_day_end: '2026-08-01T00:14:59.999Z',
  can_view_money: true,
  has_scheduled_items: true,
  empty_message: null,
  total_items_count: 5,
  pickups: [
    {
      id: 'mock-pk-1',
      booking_no: 'BK-2026-0081',
      client_name: 'Everest Motion Pictures',
      pickup_at: '2026-07-31T03:00:00Z',
      pickup_time: '08:45',
      delivery_type: 'Store Pickup',
      stage: 'Booked',
    },
  ],
  returns: [
    {
      id: 'mock-rt-1',
      booking_no: 'BK-2026-0078',
      client_name: 'Kathmandu Visuals',
      return_at: '2026-07-31T12:00:00Z',
      return_time: '17:45',
      delivery_type: 'Store Return',
      stage: 'On Rent',
    },
  ],
  overdue: [
    {
      id: 'mock-od-1',
      booking_no: 'BK-2026-0074',
      client_name: 'Himalayan Arts',
      return_at: '2026-07-29T12:00:00Z',
      days_overdue: 2,
      delivery_type: 'Store Return',
      stage: 'On Rent',
    },
  ],
  open_damage: [
    {
      id: 'mock-dmg-1',
      damage_type: 'Impact Damage',
      severity: 'Medium',
      description: 'Minor dent on Arri matte box ring',
      approval_state: 'Pending Approval',
      created_at: '2026-07-30T10:00:00Z',
      estimated_cost_paisa: 150000,
    },
  ],
  shift_handovers: [
    {
      id: 'mock-sh-1',
      shift_code: 'A',
      shift_date: '2026-07-30',
      from_user_name: 'Prakash Sharma',
      notes: 'Checked all RED V-Raptor sensor cleanliness',
      status: 'pending',
      created_at: '2026-07-30T09:15:00Z',
    },
  ],
  payments_due: [
    {
      id: 'mock-pay-1',
      invoice_no: 'INV-2026-0045',
      booking_id: 'mock-b-45',
      client_name: 'Everest Motion Pictures',
      due_date: '2026-07-31',
      outstanding_paisa: 3500000,
      status: 'Sent',
    },
  ],
}

/**
 * Formats the morning digest subject with BS and AD dates.
 */
export function formatDigestSubject(adDateStr: string): string {
  const adDate = new Date(`${adDateStr}T00:00:00.000+05:45`)
  const bs = toBs(adDate)
  const bsText = bs ? `${formatBs(bs)} ${bs.year} BS` : ''
  return `[Babin Rentals] Morning Digest — ${bsText ? `${bsText} (` : ''}${adDateStr} AD${bsText ? ')' : ''}`
}

/**
 * Fetches the morning digest for a given user and target date.
 */
export async function fetchMorningDigest(
  targetDate?: string,
  userId?: string
): Promise<MorningDigestData> {
  if (IS_MOCK) {
    const today = targetDate || '2026-07-31'
    const d = new Date(today)
    const bs = toBs(d)
    const bsFormatted = bs ? `${formatBs(bs)} ${bs.year}` : ''

    return {
      ...MOCK_MORNING_DIGEST,
      target_date: today,
      bs_date: bsFormatted,
    }
  }

  const { data: { user } } = await supabase.auth.getUser()
  const targetUser = userId || user?.id
  if (!targetUser) {
    throw new Error('Authenticated user required to fetch morning digest')
  }

  const { data, error } = await supabase.rpc('get_morning_digest', {
    p_user_id: targetUser,
    p_target_date: targetDate || null,
  })

  if (error) {
    throw new Error(`Failed to fetch morning digest: ${error.message}`)
  }

  const result = data as MorningDigestData

  // Attach formatted BS date if not provided
  if (!result.bs_date && result.target_date) {
    const bs = toBs(new Date(result.target_date))
    if (bs) {
      result.bs_date = `${formatBs(bs)} ${bs.year}`
    }
  }

  return result
}

/**
 * Triggers dispatch of the morning digest edge function.
 */
export async function triggerMorningDigestRun(
  targetDate?: string
): Promise<{ success: boolean; processed: number; errors: string[] }> {
  if (IS_MOCK) {
    return {
      success: true,
      processed: 4,
      errors: [],
    }
  }

  const { data, error } = await supabase.functions.invoke('morning-digest', {
    body: { targetDate },
  })

  if (error) {
    throw new Error(`Failed to trigger morning digest: ${error.message}`)
  }

  return data as { success: boolean; processed: number; errors: string[] }
}
