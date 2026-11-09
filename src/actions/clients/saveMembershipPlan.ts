import { createAction, type ActionConfig, type ActionContext } from '../core'
import { newClientUuid, supabase } from '../../lib/supabase'
import { canManageMembershipPlans } from '../../lib/rbac'

export interface SaveMembershipPlanInput {
  planId?: string | undefined
  level: string
  label: string
  annualFee: number | null
  individualDiscountPct: number | null
  bundleDiscountPct: number | null
  monthlyBookingLimit: number | null
  simultaneousRentalLimit: number | null
  authorizedUsers: number | null
  defaultCreditLimit: number | null
  termMonths?: number | undefined
  perks?: string[] | undefined
  displayOrder?: number | undefined
  clientUuid?: string | undefined
}

export interface SaveMembershipPlanResult {
  ok: boolean
  plan_id: string
  level: string
  status: string
}

const VALID_LEVELS = ['Academy', 'Creator', 'Cinematographer', 'Production Alliance', 'Elite']
const VALID_LABELS = ['Access Member', 'Partner', 'Elite Member']

export const saveMembershipPlanConfig: ActionConfig<SaveMembershipPlanInput, SaveMembershipPlanResult> = {
  name: 'SAVE_MEMBERSHIP_PLAN',
  permissions: ['client.update'],
  implemented: true,
  validate(input) {
    if (!input.level || !VALID_LEVELS.includes(input.level)) {
      throw new Error(`Level must be one of: ${VALID_LEVELS.join(', ')}`)
    }
    if (!input.label || !VALID_LABELS.includes(input.label)) {
      throw new Error(`Label must be one of: ${VALID_LABELS.join(', ')}`)
    }
    if (input.individualDiscountPct != null && (input.individualDiscountPct < 0 || input.individualDiscountPct > 25)) {
      throw new Error('Individual discount cannot exceed 25% (hard cap).')
    }
    if (input.bundleDiscountPct != null && (input.bundleDiscountPct < 0 || input.bundleDiscountPct > 25)) {
      throw new Error('Bundle discount cannot exceed 25% (hard cap).')
    }
    if (input.termMonths != null && (!Number.isSafeInteger(input.termMonths) || input.termMonths <= 0)) {
      throw new Error('Term months must be a positive integer.')
    }
    if (input.annualFee != null && input.annualFee < 0) {
      throw new Error('Annual fee cannot be negative.')
    }
    if (input.defaultCreditLimit != null && input.defaultCreditLimit < 0) {
      throw new Error('Default credit limit cannot be negative.')
    }
  },
  async execute(input, ctx: ActionContext) {
    if (!canManageMembershipPlans(ctx.role)) {
      throw new Error('Only Manager, Admin, or Owner can create or edit membership plans.')
    }
    if (ctx.isOnline === false) throw new Error('Connect to save membership plan.')

    const { data, error } = await supabase.rpc('save_membership_plan', {
      p_level: input.level,
      p_label: input.label,
      p_annual_fee: input.annualFee,
      p_individual_discount_pct: input.individualDiscountPct,
      p_bundle_discount_pct: input.bundleDiscountPct,
      p_monthly_booking_limit: input.monthlyBookingLimit,
      p_simultaneous_rental_limit: input.simultaneousRentalLimit,
      p_authorized_users: input.authorizedUsers,
      p_default_credit_limit: input.defaultCreditLimit ?? 0,
      p_term_months: input.termMonths ?? 12,
      p_perks: input.perks ?? [],
      p_display_order: input.displayOrder ?? null,
      p_client_uuid: input.clientUuid ?? newClientUuid(),
      p_plan_id: input.planId ?? null,
    })

    if (error) throw new Error(error.message)
    const result = (typeof data === 'string' ? JSON.parse(data) : data) as SaveMembershipPlanResult
    return { result, events: [] }
  },
}

export const saveMembershipPlan = createAction(saveMembershipPlanConfig)
