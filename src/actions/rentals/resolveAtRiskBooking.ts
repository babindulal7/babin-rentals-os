import { createAction, type ActionConfig, type ActionContext } from '../core'
import { supabase } from '../../lib/supabase'

export interface ResolveAtRiskBookingInput {
  atRiskId: string
  resolutionType: 'Covered_Subrent' | 'Covered_Similar' | 'Refunded' | 'Credit_Applied' | 'Cancelled'
  resolutionNotes: string
  clientUuid?: string | null
}

export interface ResolveAtRiskBookingResult {
  success: boolean
  atRiskId: string
  status: string
}

export const resolveAtRiskBookingConfig: ActionConfig<
  ResolveAtRiskBookingInput,
  ResolveAtRiskBookingResult
> = {
  name: 'RESOLVE_AT_RISK_BOOKING',
  permissions: ['rental.at_risk_resolve'],
  implemented: true,

  validate: (input) => {
    if (!input.atRiskId || !input.atRiskId.trim()) {
      throw new Error('At-Risk record ID is required.')
    }
    const valid = ['Covered_Subrent', 'Covered_Similar', 'Refunded', 'Credit_Applied', 'Cancelled']
    if (!valid.includes(input.resolutionType)) {
      throw new Error(`Invalid resolution type '${input.resolutionType}'.`)
    }
    if (!input.resolutionNotes || input.resolutionNotes.trim().length < 10) {
      throw new Error('Resolution notes of at least 10 characters are required.')
    }
  },

  execute: async (input, _ctx: ActionContext) => {
    const { data, error } = await supabase.rpc('resolve_at_risk_booking', {
      p_payload: {
        at_risk_id: input.atRiskId.trim(),
        resolution_type: input.resolutionType,
        resolution_notes: input.resolutionNotes.trim(),
        client_uuid: input.clientUuid ?? crypto.randomUUID(),
      },
    })

    if (error) {
      throw new Error(`Failed to resolve At-Risk booking: ${error.message}`)
    }

    const res = data as {
      success: boolean
      at_risk_id: string
      status: string
    }

    return {
      result: {
        success: res.success,
        atRiskId: res.at_risk_id,
        status: res.status,
      },
      events: [
        {
          type: 'RENTAL_AT_RISK_RESOLVED',
          payload: {
            atRiskId: res.at_risk_id,
            status: res.status,
          },
        },
      ],
    }
  },
}

export const resolveAtRiskBooking = createAction<
  ResolveAtRiskBookingInput,
  ResolveAtRiskBookingResult
>(resolveAtRiskBookingConfig)
