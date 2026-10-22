import { createAction, type ActionConfig } from '../core'
import { EVENT_TYPES } from '../../events/eventBus'
import { supabase } from '../../lib/supabase'
import { MEMBERSHIP_TIERS, type MembershipTier } from '../../lib/queries/clients'

/**
 * # CHANGE_CLIENT_MEMBERSHIP — put a client on a plan, or move them to another
 *
 * RULING 2026-10-22 (Babin: "activate membership"). Before this, the Change
 * Tier dialog's save was deliberately blocked — "no tier-change action exists" —
 * because a tier lives in `client_memberships`, not `clients`, and nothing wrote
 * it. This is that action. It is one RPC, `change_client_membership` (0171),
 * because 0005 allows exactly one LIVE membership per client and a level change
 * must supersede the old row and add the new one atomically; three separate
 * writes from here could strand a client with none, which reads as Lapsed and
 * zeroes their credit.
 *
 * There is no "None" plan. A client with no live membership is simply *activated*
 * onto the plan; a client with one is *moved*. Same write.
 *
 * What it does not do, on purpose:
 *  - it records no fee (`fee_paid` stays NULL) — payments stay on the invoice flow;
 *  - it does not renew a lapsed membership (the function refuses "already on this
 *    plan"); renewal is a different action that has not been built;
 *  - it does not decide whether a change restarts the term — the new row's join date
 *    is today's business day, and that open question is OPEN_DECISIONS §19.
 *
 * Who may: Owner, Admin, Manager, Coordinator (`client.change_membership`,
 * mirroring `client_memberships_all`). The function checks the same list itself
 * because it is SECURITY DEFINER.
 *
 * The domain event is emitted here, after the write is confirmed — never before,
 * and never by the dialog (the old dialog emitted it for a save that wrote nothing).
 */

export interface ChangeMembershipInput {
  /** `clients.id` (the uuid, the record's `dbId`) — not the C-… code. */
  clientDbId: string
  /** The C-… code the screens key on. Carried for the event only. */
  clientCode: string
  planLevel: MembershipTier
  /** Optional free text, kept as the audit reason. At most 500 characters. */
  note?: string | undefined
  /** One per attempt (Law 8). The caller keeps it across retries of the same request. */
  clientUuid: string
}

export interface ChangeMembershipResult {
  client_id: string
  plan_level: MembershipTier
  /** `null` when the client had no live membership — i.e. this was an activation. */
  previous_level: MembershipTier | null
  membership_id: string
  superseded_membership_id: string | null
  /** The new row's join date (Kathmandu business day). */
  joined_on: string
}

export const NOTE_MAX = 500

export const changeMembershipConfig: ActionConfig<ChangeMembershipInput, ChangeMembershipResult> = {
  name: 'CHANGE_CLIENT_MEMBERSHIP',
  permissions: ['client.change_membership'],
  implemented: true,

  validate(input) {
    if (!input.clientDbId || !input.clientCode || !input.clientUuid) {
      throw new Error('Client and request key are required.')
    }
    if (!(MEMBERSHIP_TIERS as readonly string[]).includes(input.planLevel)) {
      throw new Error('Choose one of the membership plans.')
    }
    if ((input.note ?? '').trim().length > NOTE_MAX) {
      throw new Error(`A note can be at most ${NOTE_MAX} characters.`)
    }
  },

  async execute(input, ctx) {
    if (ctx.isOnline === false) {
      throw new Error('Changing a membership needs a connection. Nothing was saved.')
    }
    const note = (input.note ?? '').trim()
    const { data, error } = await supabase.rpc('change_client_membership', {
      p_payload: {
        client_id: input.clientDbId,
        client_uuid: input.clientUuid,
        plan_level: input.planLevel,
        ...(note ? { note } : {}),
      },
    })
    if (error?.code === 'PGRST202') {
      // Written locally, applied only when the owner approves (N-5). Until then the function does not exist.
      throw new Error('Membership changes are not available on this server yet. Ask the owner to finish the database update. Nothing was changed.')
    }
    if (error) throw new Error(error.message)

    const result = data as unknown as ChangeMembershipResult | null
    if (result?.client_id !== input.clientDbId || result.plan_level !== input.planLevel) {
      throw new Error('The server did not confirm this membership change. Retry with the same request.')
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

export const changeMembership = createAction(changeMembershipConfig)
