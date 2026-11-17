import { createAction, type ActionConfig, type ActionContext } from '../core'
import { supabase } from '../../lib/supabase'

export interface DecideClashingExtensionInput {
  clashId: string
  decision: 'extend_alternative' | 'extend_at_risk' | 'refuse'
  decisionReason: string
  clientUuid?: string | null
}

export interface DecideClashingExtensionResult {
  success: boolean
  clashId: string
  status: string
  decision: string
  alreadyDecided?: boolean | undefined
}

export const decideClashingExtensionConfig: ActionConfig<
  DecideClashingExtensionInput,
  DecideClashingExtensionResult
> = {
  name: 'DECIDE_CLASHING_EXTENSION',
  permissions: ['gate.extend.clash'],
  implemented: true,

  validate: (input) => {
    if (!input.clashId || !input.clashId.trim()) {
      throw new Error('Clash ID is required.')
    }
    if (!['extend_alternative', 'extend_at_risk', 'refuse'].includes(input.decision)) {
      throw new Error(`Invalid decision '${input.decision}'. Must be extend_alternative, extend_at_risk, or refuse.`)
    }
    if (!input.decisionReason || input.decisionReason.trim().length < 10) {
      throw new Error('Decision reason of at least 10 characters is required.')
    }
  },

  execute: async (input, _ctx: ActionContext) => {
    const clientUuid = input.clientUuid || crypto.randomUUID()

    const { data, error } = await supabase.rpc('decide_clashing_extension', {
      p_payload: {
        clash_id: input.clashId.trim(),
        decision: input.decision,
        decision_reason: input.decisionReason.trim(),
        client_uuid: clientUuid,
      },
    })

    if (error) {
      throw new Error(`Failed to record extension clash decision: ${error.message}`)
    }

    const res = data as {
      success: boolean
      clash_id: string
      status: string
      decision: string
      already_decided?: boolean
    }

    return {
      result: {
        success: res.success,
        clashId: res.clash_id,
        status: res.status,
        decision: res.decision,
        alreadyDecided: res.already_decided,
      },
      events: [
        {
          type: 'RENTAL_EXTENSION_CLASH_DECIDED',
          payload: {
            clashId: res.clash_id,
            decision: res.decision,
            status: res.status,
          },
        },
      ],
    }
  },
}

export const decideClashingExtension = createAction<
  DecideClashingExtensionInput,
  DecideClashingExtensionResult
>(decideClashingExtensionConfig)
