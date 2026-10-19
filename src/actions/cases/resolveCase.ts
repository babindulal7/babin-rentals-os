import { createAction, type ActionConfig, type ActionContext } from '../core'
import { EVENT_TYPES } from '../../events/eventBus'
import { supabase } from '../../lib/supabase'
import { safeUpdate } from '../../lib/dataAccess'

export type ResolveCaseInput = {
  caseId: string
  resolution?: string | null | undefined
  status?: 'Resolved' | 'Closed' | undefined
  chargedToClientAmount?: number | undefined
  absorbedAmount?: number | undefined
  depositAppliedAmount?: number | undefined
  insuranceClaimedAmount?: number | undefined
  warrantyCoveredAmount?: number | undefined
  recoveredFromPartnerAmount?: number | undefined
  clientUuid?: string | undefined
}

export type ResolveCaseResult = {
  success: boolean
  caseId: string
  caseNo?: string | undefined
  status: 'Resolved' | 'Closed'
  disposition: string
  settledAt: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const resolveCaseConfig: ActionConfig<ResolveCaseInput, ResolveCaseResult> = {
  name: 'RESOLVE_CASE',
  permissions: ['case.resolve'],
  implemented: true,

  validate: (input) => {
    if (!input.caseId || input.caseId.trim() === '') {
      throw new Error('Case ID is required.')
    }
    if (input.status && input.status !== 'Resolved' && input.status !== 'Closed') {
      throw new Error('Resolution status must be either Resolved or Closed.')
    }
  },

  execute: async (input, ctx: ActionContext) => {
    if (ctx.isOnline === false || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
      throw new Error('This device is offline. Case resolution affects rental closing gates and cannot be queued offline.')
    }

    const rawId = input.caseId.trim()
    const now = new Date().toISOString()
    const targetStatus = input.status ?? 'Resolved'
    const disposition = input.resolution?.trim() || 'Resolved'

    const lookupCol = UUID_RE.test(rawId) ? 'id' : 'case_no'
    const { data, error } = await supabase
      .from('cases_v')
      .select('id, case_no, status')
      .eq(lookupCol, rawId)
      .maybeSingle()

    if (error || !data) {
      throw new Error(`Case ${rawId} was not found: ${error?.message ?? 'no matching row'}`)
    }

    const realCaseId = data.id
    const caseNo = data.case_no

    const patch: Record<string, unknown> = {
      status: targetStatus,
      disposition,
      settled_at: now,
      updated_at: now,
    }

    if (input.chargedToClientAmount !== undefined) patch.charged_to_client_amount = input.chargedToClientAmount
    if (input.absorbedAmount !== undefined) patch.absorbed_amount = input.absorbedAmount
    if (input.depositAppliedAmount !== undefined) patch.deposit_applied_amount = input.depositAppliedAmount
    if (input.insuranceClaimedAmount !== undefined) patch.insurance_claimed_amount = input.insuranceClaimedAmount
    if (input.warrantyCoveredAmount !== undefined) patch.warranty_covered_amount = input.warrantyCoveredAmount
    if (input.recoveredFromPartnerAmount !== undefined) patch.recovered_from_partner_amount = input.recoveredFromPartnerAmount

    const updateRes = await safeUpdate('cases' as never, realCaseId, patch as never, input.clientUuid, {
      returnRow: false,
    })

    if (updateRes?.error) {
      throw new Error(
        `Case ${caseNo ?? realCaseId} could not be resolved: ${
          (updateRes.error as { message?: string }).message ?? String(updateRes.error)
        }`,
      )
    }

    return {
      result: {
        success: true,
        caseId: realCaseId,
        caseNo,
        status: targetStatus,
        disposition,
        settledAt: now,
      },
      events: [
        {
          type: EVENT_TYPES.CASE_RESOLVED,
          payload: {
            caseId: realCaseId,
            caseNo,
            resolution: disposition,
            status: targetStatus,
            timestamp: now,
            userId: ctx.userId,
          },
        },
      ],
    }
  },
}

export const resolveCase = createAction<ResolveCaseInput, ResolveCaseResult>(resolveCaseConfig)
