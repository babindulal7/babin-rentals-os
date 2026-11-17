import { createAction, type ActionConfig, type ActionContext } from '../core'
import { EVENT_TYPES } from '../../events/eventBus'
import { supabase } from '../../lib/supabase'

export type ResolveAtRiskInput = {
  atRiskId: string
  resolution: 'sub_rent' | 'similar_item' | 'refund' | 'credit' | 'client_change' | 'cancelled'
  notes?: string | undefined
  creditAmount?: number | undefined
  clientUuid?: string | undefined
}

export type ResolveAtRiskResult = {
  success: boolean
  atRiskId: string
  resolution: string
  resolvedAt: string
}

export const resolveAtRiskConfig: ActionConfig<ResolveAtRiskInput, ResolveAtRiskResult> = {
  name: 'RESOLVE_AT_RISK',
  permissions: ['rental.resolve_at_risk'],
  implemented: true,

  validate: (input) => {
    if (!input.atRiskId || !input.atRiskId.trim()) {
      throw new Error('atRiskId is required to resolve an at-risk booking.')
    }
    const validResolutions = ['sub_rent', 'similar_item', 'refund', 'credit', 'client_change', 'cancelled']
    if (!validResolutions.includes(input.resolution)) {
      throw new Error(`Invalid resolution: ${input.resolution}`)
    }
  },

  execute: async (input, ctx: ActionContext) => {
    const atRiskId = input.atRiskId.trim()
    const { data, error } = await supabase.rpc('resolve_booking_at_risk', {
      p_payload: {
        at_risk_id: atRiskId,
        resolution: input.resolution,
        notes: input.notes ?? null,
        credit_amount: input.creditAmount ?? 0,
        client_uuid: input.clientUuid ?? null,
      },
    })

    if (error) {
      throw new Error(`Failed to resolve at-risk booking: ${error.message}`)
    }

    const res = data as { success: boolean; at_risk_id: string; resolution: string; resolved_at: string }

    const events = [
      {
        type: EVENT_TYPES.BOOKING_AT_RISK_RESOLVED,
        payload: {
          atRiskId,
          resolution: input.resolution,
          notes: input.notes,
          timestamp: new Date().toISOString(),
          userId: ctx.userId,
        },
      },
    ]

    return {
      result: {
        success: true,
        atRiskId: res.at_risk_id,
        resolution: res.resolution,
        resolvedAt: res.resolved_at,
      },
      events,
    }
  },
}

export const resolveAtRisk = createAction<ResolveAtRiskInput, ResolveAtRiskResult>(resolveAtRiskConfig)
