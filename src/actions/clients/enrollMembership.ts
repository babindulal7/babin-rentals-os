import { createAction, type ActionConfig, type ActionContext } from '../core'
import { newClientUuid, supabase } from '../../lib/supabase'

export interface EnrollClientMembershipInput {
  clientId: string
  planId: string
  joinDate?: string | undefined
  feePaid?: number | null | undefined
  notes?: string | undefined
  clientUuid?: string | undefined
}

export interface EnrollClientMembershipResult {
  id: string
  client_id: string
  plan_id: string
  level: string
  plan_label: string
  join_date: string
  fee_paid: number | null
  superseded_membership_id: string | null
}

export const enrollClientMembershipConfig: ActionConfig<EnrollClientMembershipInput, EnrollClientMembershipResult> = {
  name: 'ENROLL_CLIENT_MEMBERSHIP',
  permissions: ['client.update'],
  implemented: true,
  validate(input) {
    if (!input.clientId) throw new Error('Client ID is required.')
    if (!input.planId) throw new Error('Membership Plan ID is required.')
  },
  async execute(input, ctx: ActionContext) {
    if (!['Owner', 'Admin', 'Manager', 'Coordinator'].includes(ctx.role)) {
      throw new Error('Only Owner, Admin, Manager, or Coordinator may enroll a membership.')
    }
    if (ctx.isOnline === false) throw new Error('Connect to update client membership.')
    const { data, error } = await supabase.rpc('enroll_client_membership', {
      p_client_id: input.clientId,
      p_plan_id: input.planId,
      p_join_date: input.joinDate ?? null,
      p_fee_paid: input.feePaid ?? null,
      p_notes: input.notes ?? null,
      p_key: input.clientUuid ?? newClientUuid(),
    })
    if (error) throw new Error(error.message)
    if (!data || typeof data !== 'object') {
      throw new Error('Membership enrollment was not confirmed by the server.')
    }
    return { result: data as EnrollClientMembershipResult, events: [] }
  },
}
export const enrollClientMembership = createAction(enrollClientMembershipConfig)
