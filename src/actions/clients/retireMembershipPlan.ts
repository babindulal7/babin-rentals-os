import { createAction, type ActionConfig, type ActionContext } from '../core'
import { newClientUuid, supabase } from '../../lib/supabase'
import { canManageMembershipPlans } from '../../lib/rbac'

export interface RetireMembershipPlanInput {
  planId: string
  retire?: boolean | undefined
  clientUuid?: string | undefined
}

export interface RetireMembershipPlanResult {
  ok: boolean
  plan_id: string
  level: string
  status: string
}

export const retireMembershipPlanConfig: ActionConfig<RetireMembershipPlanInput, RetireMembershipPlanResult> = {
  name: 'RETIRE_MEMBERSHIP_PLAN',
  permissions: ['client.update'],
  implemented: true,
  validate(input) {
    if (!input.planId) {
      throw new Error('Membership Plan ID is required.')
    }
  },
  async execute(input, ctx: ActionContext) {
    if (!canManageMembershipPlans(ctx.role)) {
      throw new Error('Only Manager, Admin, or Owner can retire or reactivate membership plans.')
    }
    if (ctx.isOnline === false) throw new Error('Connect to retire membership plan.')

    const { data, error } = await supabase.rpc('retire_membership_plan', {
      p_plan_id: input.planId,
      p_retire: input.retire ?? true,
      p_client_uuid: input.clientUuid ?? newClientUuid(),
    })

    if (error) throw new Error(error.message)
    const result = (typeof data === 'string' ? JSON.parse(data) : data) as RetireMembershipPlanResult
    return { result, events: [] }
  },
}

export const retireMembershipPlan = createAction(retireMembershipPlanConfig)
