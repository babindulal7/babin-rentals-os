import { safeUpdate, generateClientUuid } from '../../lib/dataAccess'
import { toRupees } from '../../lib/money'
import type { Paisa } from '../../lib/money'
import { approverFor } from '../../lib/damage'
import { canApproveDamage } from '../../lib/rbac'
import type { DamageDisposition } from '../../types/database'
import { createAction, type ActionConfig, type ActionContext } from '../core'
import { EVENT_TYPES } from '../../events/eventBus'

export interface ResolveDamageParams {
  findingId: string
  disposition: DamageDisposition
  chargePaisa: Paisa
  clientUuid?: string | undefined
}

export type ResolveDamageInput = ResolveDamageParams

export interface ResolveDamageResult {
  success: boolean
  findingId: string
  disposition: DamageDisposition
  chargeRupees: number
  approvedAt?: string | undefined
  approvedBy?: string | undefined
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * FORMS-05 — Resolves a pending damage finding.
 * Writes `approval_state = 'Approved'`, records the disposition, and the actual charge amount.
 * Routes the write through `safeUpdate` with Law 8 idempotency key and fail-closed online custody check.
 */
export async function resolveDamageFinding(params: ResolveDamageParams, ctx?: ActionContext) {
  const chargeRupees = toRupees(params.chargePaisa)
  const clientUuid = params.clientUuid || generateClientUuid()

  const payload: Record<string, unknown> = {
    approval_state: 'Approved',
    disposition: params.disposition,
    estimated_cost: chargeRupees,
  }
  if (ctx?.userId) {
    payload.approved_by = ctx.userId
    payload.approved_at = new Date().toISOString()
  }

  const { data, error } = await safeUpdate(
    'damage_findings',
    params.findingId,
    payload,
    clientUuid,
    {
      returningColumns: 'id, approval_state, disposition, approved_at, approved_by',
      queueOnFailure: false,
    },
  )

  if (error) {
    throw error
  }

  return data
}

export const resolveDamageConfig: ActionConfig<ResolveDamageInput, ResolveDamageResult> = {
  name: 'RESOLVE_DAMAGE',
  permissions: ['case.resolve'],
  implemented: true,

  validate: (input) => {
    if (!input.findingId || typeof input.findingId !== 'string') {
      throw new Error('findingId is required')
    }
    if (!input.disposition) {
      throw new Error('disposition is required')
    }
    if (typeof input.chargePaisa !== 'number' || input.chargePaisa < 0 || !Number.isFinite(input.chargePaisa)) {
      throw new Error('chargePaisa must be a non-negative finite number')
    }
    if (input.clientUuid !== undefined && !UUID_RE.test(input.clientUuid)) {
      throw new Error('clientUuid must be a valid RFC 4122 UUID.')
    }
  },

  execute: async (input: ResolveDamageInput, ctx: ActionContext) => {
    if (ctx.isOnline === false || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
      throw new Error('This device is offline. Damage approval requires a live database connection and cannot be queued offline.')
    }

    // Gated by charge threshold (0057_damage_approval_rank.sql / approverFor):
    // Charges >= Rs 25,000 require Owner approval.
    const requiredApprover = approverFor(input.chargePaisa)
    if (!canApproveDamage(ctx.role, requiredApprover)) {
      throw new Error(
        `Damage charge of Rs ${toRupees(input.chargePaisa).toLocaleString()} requires ${requiredApprover} approval. Role ${ctx.role} is not permitted.`,
      )
    }

    const data = await resolveDamageFinding(input, ctx)

    const chargeRupees = toRupees(input.chargePaisa)
    const approvedAt = (data as { approved_at?: string } | null)?.approved_at
    const approvedBy = (data as { approved_by?: string } | null)?.approved_by

    return {
      result: {
        success: true,
        findingId: input.findingId,
        disposition: input.disposition,
        chargeRupees,
        approvedAt,
        approvedBy,
      },
      events: [
        {
          type: EVENT_TYPES.CASE_RESOLVED,
          payload: {
            findingId: input.findingId,
            disposition: input.disposition,
            chargeRupees,
            approvedAt,
            approvedBy,
            userId: ctx.userId,
          },
        },
      ],
    }
  },
}

export const resolveDamage = createAction(resolveDamageConfig)
