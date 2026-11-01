import { IS_MOCK, supabase } from '../supabase'
import { formatAd, formatBsOrAd, getBusinessToday } from '../bs'
import { rupees, type Paisa } from '../money'
import type { MembershipTier } from '../../data/clients'
import { MEMBERS, PLANS } from '../../data/membership'

/** Only values backed by the current membership, client and plan views. */
export interface MemberListRow {
  id: string
  clientId: string
  name: string
  kind: string
  level: MembershipTier
  joinedIso: string
  joinedAd: string
  joinedBs: string
  feePaidPaisa: Paisa | null
}

/** Current memberships only. History remains in the database, not the directory. */
export async function listMembers(): Promise<MemberListRow[]> {
  const { data: plans, error: plansError } = await supabase
    .from('membership_plans_v')
    .select('id, level')
  if (plansError) throw new Error(`listMembers plans failed: ${plansError.message}`)
  const planById = new Map((plans ?? []).map((plan) => [plan.id, plan.level]))

  const members: MemberListRow[] = []
  const batchSize = 100
  for (let offset = 0; ; offset += batchSize) {
    const { data: memberships, error } = await supabase
      .from('client_memberships_v')
      .select('id, client_id, plan_id, join_date, fee_paid')
      .is('superseded_at', null)
      .order('id', { ascending: true })
      .range(offset, offset + batchSize - 1)
    if (error) throw new Error(`listMembers failed: ${error.message}`)
    const batch = memberships ?? []
    if (batch.length === 0) break

    const clientIds = [...new Set(batch.map((member) => member.client_id).filter((id): id is string => id !== null))]
    const { data: clients, error: clientsError } = await supabase
      .from('clients_v')
      .select('id, name, type_parent')
      .in('id', clientIds)
    if (clientsError) throw new Error(`listMembers clients failed: ${clientsError.message}`)
    const clientById = new Map((clients ?? []).map((client) => [client.id, client]))

    for (const member of batch) {
      const client = clientById.get(member.client_id)
      const level = planById.get(member.plan_id)
      if (!member.id || !member.client_id || !member.join_date || !client?.name || !level) {
        throw new Error('listMembers failed: a membership has missing client, plan or join date data')
      }
      const joined = new Date(`${member.join_date}T00:00:00Z`)
      members.push({
        id: member.id,
        clientId: member.client_id,
        name: client.name,
        kind: client.type_parent ?? 'Client',
        level,
        joinedIso: member.join_date,
        joinedAd: formatAd(joined),
        joinedBs: formatBsOrAd(joined, { suffix: true }),
        feePaidPaisa: member.fee_paid === null ? null : rupees(member.fee_paid),
      })
    }
    if (batch.length < batchSize) break
  }
  return members
}

export interface MembershipPlanRecord {
  id: string
  clientUuid: string
  level: MembershipTier
  label: string
  annualFee: number | null
  individualDiscountPct: number | null
  bundleDiscountPct: number | null
  monthlyBookingLimit: number | null
  simultaneousRentalLimit: number | null
  authorizedUsers: number | null
  defaultCreditLimit: number | null
  termMonths: number
  perks: string[]
  displayOrder: number
  status: 'Active' | 'Retired'
  retiredAt: string | null
  createdAt: string
  updatedAt: string
}

export async function listMembershipPlans(): Promise<MembershipPlanRecord[]> {
  const { data, error } = await supabase
    .from('membership_plans_v')
    .select('id, client_uuid, level, label, annual_fee, individual_discount_pct, bundle_discount_pct, monthly_booking_limit, simultaneous_rental_limit, authorized_users, default_credit_limit, term_months, perks, display_order, status, retired_at, created_at, updated_at')
    .order('display_order', { ascending: true })

  if (error) throw new Error(`listMembershipPlans failed: ${error.message}`)
  return (data ?? []).map((p) => ({
    id: p.id,
    clientUuid: p.client_uuid,
    level: p.level as MembershipTier,
    label: p.label,
    annualFee: p.annual_fee === null ? null : Number(p.annual_fee),
    individualDiscountPct: p.individual_discount_pct === null ? null : Number(p.individual_discount_pct),
    bundleDiscountPct: p.bundle_discount_pct === null ? null : Number(p.bundle_discount_pct),
    monthlyBookingLimit: p.monthly_booking_limit === null ? null : Number(p.monthly_booking_limit),
    simultaneousRentalLimit: p.simultaneous_rental_limit === null ? null : Number(p.simultaneous_rental_limit),
    authorizedUsers: p.authorized_users === null ? null : Number(p.authorized_users),
    defaultCreditLimit: p.default_credit_limit === null ? null : Number(p.default_credit_limit),
    termMonths: Number(p.term_months ?? 12),
    perks: Array.isArray(p.perks) ? p.perks.map(String) : [],
    displayOrder: Number(p.display_order ?? 0),
    status: (p.status as 'Active' | 'Retired') ?? 'Active',
    retiredAt: p.retired_at,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  }))
}

export interface ClientActiveMembership {
  id?: string | undefined
  clientId?: string | undefined
  planId?: string | undefined
  level: MembershipTier
  label: string
  individualDiscountPct: number | null
  bundleDiscountPct: number | null
  monthlyBookingLimit: number | null
  simultaneousRentalLimit: number | null
  perks: string[]
  status: 'Active' | 'Grace' | 'Lapsed'
  benefitsActive: boolean
}

export async function fetchClientActiveMembership(
  client: { id?: string; dbId?: string; name?: string; membership?: string; membershipLevel?: string | null } | undefined | null,
): Promise<ClientActiveMembership | null> {
  if (!client) return null

  // If client.membershipLevel is explicitly null, this is an unjoined client (no membership)
  if (client.membershipLevel === null) {
    return null
  }

  // 1. Try DB read if client.dbId is present
  if (client.dbId) {
    try {
      const plans = await listMembershipPlans()
      const { data, error } = await supabase
        .from('client_memberships_v')
        .select('id, client_id, plan_id, join_date, fee_paid')
        .eq('client_id', client.dbId)
        .is('superseded_at', null)
        .maybeSingle()

      if (!error && data) {
        const plan = plans.find((p) => p.id === data.plan_id)
        if (plan) {
          const joinDate = new Date(data.join_date)
          const termMonths = plan.termMonths ?? 12
          const termEnd = new Date(joinDate)
          termEnd.setMonth(termEnd.getMonth() + termMonths)
          const graceEnd = new Date(termEnd)
          graceEnd.setDate(graceEnd.getDate() + 30)
          const today = getBusinessToday()

          let status: 'Active' | 'Grace' | 'Lapsed' = 'Active'
          let benefitsActive = true
          if (today > graceEnd) {
            status = 'Lapsed'
            benefitsActive = false
          } else if (today > termEnd) {
            status = 'Grace'
            benefitsActive = true
          }

          return {
            id: data.id,
            clientId: client.dbId,
            planId: plan.id,
            level: plan.level,
            label: plan.label,
            individualDiscountPct: plan.individualDiscountPct,
            bundleDiscountPct: plan.bundleDiscountPct,
            monthlyBookingLimit: plan.monthlyBookingLimit,
            simultaneousRentalLimit: plan.simultaneousRentalLimit,
            perks: plan.perks,
            status,
            benefitsActive,
          }
        }
      }
    } catch {
      // Fallback to sample or tier mapping
    }
  }

  // The demo corpus only (Law 16): a live client whose read failed, or whose
  // plan is not on file, must never have benefits fabricated from sample rows.
  if (!IS_MOCK) return null

  // 2. Sample data fallback (MEMBERS array from data/membership)
  const clientName = client.name?.toLowerCase().trim()
  const memberRow = MEMBERS.find(
    (m) =>
      (client.id && m.id === client.id) ||
      (clientName && m.name.toLowerCase().trim() === clientName),
  )

  if (memberRow) {
    const planFromData = PLANS.find((p) => p.name === memberRow.level)
    const isLapsed = memberRow.bucket === 'Lapsed'
    const isGrace = memberRow.bucket === 'Grace'
    const indPctMatch = planFromData?.discounts[0]?.match(/(\d+)%/)
    const bndPctMatch = planFromData?.discounts[1]?.match(/(\d+)%/)
    const individualDiscountPct = indPctMatch ? Number(indPctMatch[1]) : 0
    const bundleDiscountPct = bndPctMatch ? Number(bndPctMatch[1]) : 0

    const monthlyLimitMatch = planFromData?.limits[0]?.value
    const simLimitMatch = planFromData?.limits[1]?.value
    const monthlyBookingLimit = monthlyLimitMatch && monthlyLimitMatch !== 'Unlimited' ? Number(monthlyLimitMatch) : null
    const simultaneousRentalLimit = simLimitMatch && simLimitMatch !== 'Unlimited' ? Number(simLimitMatch) : null
    const perks = (planFromData?.features ?? []).filter((f) => f.kind !== 'off').map((f) => f.text)

    return {
      level: memberRow.level,
      label: planFromData?.badge ?? 'Access Member',
      individualDiscountPct,
      bundleDiscountPct,
      monthlyBookingLimit,
      simultaneousRentalLimit,
      perks,
      status: isLapsed ? 'Lapsed' : isGrace ? 'Grace' : 'Active',
      benefitsActive: !isLapsed,
    }
  }

  // 3. If client has an explicit membership tier (e.g. from props/tests)
  const tier = (client.membershipLevel || client.membership) as MembershipTier | undefined
  if (tier && tier !== 'Academy' && ['Creator', 'Cinematographer', 'Production Alliance', 'Elite'].includes(tier)) {
    const planFromData = PLANS.find((p) => p.name === tier)
    const indPctMatch = planFromData?.discounts[0]?.match(/(\d+)%/)
    const bndPctMatch = planFromData?.discounts[1]?.match(/(\d+)%/)
    const individualDiscountPct = indPctMatch ? Number(indPctMatch[1]) : 0
    const bundleDiscountPct = bndPctMatch ? Number(bndPctMatch[1]) : 0

    const monthlyLimitMatch = planFromData?.limits[0]?.value
    const simLimitMatch = planFromData?.limits[1]?.value
    const monthlyBookingLimit = monthlyLimitMatch && monthlyLimitMatch !== 'Unlimited' ? Number(monthlyLimitMatch) : null
    const simultaneousRentalLimit = simLimitMatch && simLimitMatch !== 'Unlimited' ? Number(simLimitMatch) : null
    const perks = (planFromData?.features ?? []).filter((f) => f.kind !== 'off').map((f) => f.text)

    return {
      level: tier,
      label: planFromData?.badge ?? 'Access Member',
      individualDiscountPct,
      bundleDiscountPct,
      monthlyBookingLimit,
      simultaneousRentalLimit,
      perks,
      status: 'Active',
      benefitsActive: true,
    }
  }

  return null
}

export async function fetchClientMonthlyBookingsCount(clientId: string): Promise<number> {
  if (!clientId || typeof (supabase as unknown as { from?: unknown })?.from !== 'function') return 0
  const now = new Date()
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
  try {
    const { count, error } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .gte('created_at', startOfMonth)

    if (error) return 0
    return count ?? 0
  } catch {
    return 0
  }
}

