import { createAction, type ActionConfig } from '../core'
import { EVENT_TYPES } from '../../events/eventBus'
import { supabase } from '../../lib/supabase'
import { MEMBERSHIP_TIERS, type MembershipTier } from '../../lib/queries/clients'
import { toRupees, type Paisa } from '../../lib/money'

/**
 * # RENEW_CLIENT_MEMBERSHIP — renew a lapsed or ending membership
 *
 * RULING D23 (OPEN_DECISIONS §20). Renewing on a lapsed (or ending) membership:
 * charges the full plan fee (credit = 0), starts a new term from the renewal date,
 * and keeps history (old term is superseded, never deleted or overwritten).
 *
 * Calls `renew_client_membership` RPC (migration 0189).
 *
 * Who may: Owner, Admin, Manager, Coordinator (`client.change_membership`).
 */

export interface RenewMembershipInput {
  /** `clients.id` (the uuid, the record's `dbId`) — not the C-… code. */
  clientDbId: string
  /** The C-… code the screens key on. Carried for the event only. */
  clientCode: string
  planLevel?: MembershipTier | undefined
  planId?: string | undefined
  effectiveDate?: string | undefined
  /** Integer paisa. The RPC's rupee column is converted at this boundary. */
  feePaid?: number | null | undefined
  /** Optional free text, kept as the audit reason. At most 500 characters. */
  note?: string | undefined
  /** One per attempt (Law 8). The caller keeps it across retries of the same request. */
  clientUuid: string
}

export interface RenewMembershipResult {
  client_id: string
  plan_id?: string
  plan_level: MembershipTier
  /** Previous plan level on file. */
  previous_level: MembershipTier | null
  membership_id: string
  superseded_membership_id: string | null
  /** The new row's join date (Kathmandu business day). */
  joined_on: string
  is_renewal: boolean
  old_fee?: number
  days_left?: number
  total_days?: number
  credit?: number
  new_fee?: number
  new_fee_due?: number
  account_credit?: number
}

export const NOTE_MAX = 500

export const renewMembershipConfig: ActionConfig<RenewMembershipInput, RenewMembershipResult> = {
  name: 'RENEW_CLIENT_MEMBERSHIP',
  permissions: ['client.change_membership'],
  implemented: true,

  validate(input) {
    if (!input.clientDbId || !input.clientCode || !input.clientUuid) {
      throw new Error('Client and request key are required.')
    }
    if (input.planLevel && !(MEMBERSHIP_TIERS as readonly string[]).includes(input.planLevel)) {
      throw new Error('Choose one of the membership plans.')
    }
    if (input.feePaid != null && (!Number.isSafeInteger(input.feePaid) || input.feePaid < 0)) {
      throw new Error('Membership fee must be a non-negative amount in integer paisa.')
    }
    if ((input.note ?? '').trim().length > NOTE_MAX) {
      throw new Error(`A note can be at most ${NOTE_MAX} characters.`)
    }
  },

  async execute(input, ctx) {
    if (ctx.isOnline === false) {
      throw new Error('Renewing a membership needs a connection. Nothing was saved.')
    }
    const note = (input.note ?? '').trim()
    const { data, error } = await supabase.rpc('renew_client_membership', {
      p_payload: {
        client_id: input.clientDbId,
        client_uuid: input.clientUuid,
        ...(input.planLevel ? { plan_level: input.planLevel } : {}),
        ...(input.planId ? { plan_id: input.planId } : {}),
        ...(input.effectiveDate ? { effective_date: input.effectiveDate } : {}),
        ...(input.feePaid != null ? { fee_paid: toRupees(input.feePaid as Paisa) } : {}),
        ...(note ? { note } : {}),
      },
    })
    if (error?.code === 'PGRST202') {
      throw new Error('Membership renewals are not available on this server yet. Ask the owner to finish the database update. Nothing was changed.')
    }
    if (error) throw new Error(error.message)

    const result = data as unknown as RenewMembershipResult | null
    if (result?.client_id !== input.clientDbId) {
      throw new Error('The server did not confirm this membership renewal. Retry with the same request.')
    }
    return {
      result,
      events: [
        {
          type: EVENT_TYPES.MEMBERSHIP_TIER_CHANGED,
          payload: { clientId: input.clientCode, newTier: result.plan_level },
        },
      ],
    }
  },
}

export const renewMembership = createAction(renewMembershipConfig)
