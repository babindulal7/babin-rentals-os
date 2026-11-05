import { createAction, type ActionConfig, type ActionContext } from '../core'
import { EVENT_TYPES } from '../../events/eventBus'
import { newClientUuid, supabase } from '../../lib/supabase'
import { normaliseGearText } from '../../lib/gearListParser'

/**
 * **T3-12 â€” remember the spelling a staff member corrected a paste-list match to.**
 *
 * This is the whole of "staff corrections are saved as aliases so the next paste matches
 * better": the matcher suggested the wrong product for a line, a person picked the right
 * one, and the words they typed are recorded against that product so the next paste with
 * the same shorthand matches without a correction.
 *
 * The write is one RPC (`remember_product_alias`, migration 0223) rather than a client-side
 * insert, because the row must be unique per spelling and a correction must MOVE that
 * spelling rather than add a rival. Two tabs inserting "fx3" against two different products
 * would otherwise leave the matcher with two exact hits and turn every future paste into a
 * question. The RPC re-checks the role set in Postgres as well, so the rule holds even for
 * a caller that never went through `checkCapability` (N-3, B-1).
 *
 * `alias_normalised` is computed here by `normaliseGearText()` â€” the same function the
 * matcher compares with. The database refuses a key that is not already lower-case, so a
 * future refactor that sends an unfolded string fails loudly instead of storing a row that
 * can never match.
 */

export type RememberProductAliasInput = {
  /** The product the person chose â€” the one the alias should point at. */
  productId: string
  /** The spelling as it appeared in the pasted list, or as the person retyped it. */
  alias: string
  /** Reuse on retry so an interrupted response cannot apply twice (Law 8). */
  clientUuid?: string
}

export type RememberProductAliasResult = {
  success: boolean
  aliasId: string
  productId: string
  /** The spelling as typed, for the confirmation the UI may show. */
  alias: string
  /** The comparison key actually stored. */
  normalised: string
}

export const rememberProductAliasConfig: ActionConfig<
  RememberProductAliasInput,
  RememberProductAliasResult
> = {
  name: 'REMEMBER_PRODUCT_ALIAS',
  permissions: ['inventory.edit_product_aliases'],
  implemented: true,
  validate: (input) => {
    if (!input.productId) throw new Error('Choose the product this spelling belongs to.')
    const alias = (input.alias ?? '').trim()
    if (alias.length < 2) throw new Error('A spelling needs at least two characters.')
    if (alias.length > 120) throw new Error('A spelling cannot be longer than 120 characters.')
    // A line of only punctuation normalises to nothing and would match every line.
    if (normaliseGearText(alias) === '') {
      throw new Error('A spelling needs at least one letter or number.')
    }
  },
  execute: async (input, ctx: ActionContext) => {
    const alias = input.alias.trim()
    const normalised = normaliseGearText(alias)

    const { data, error } = await supabase.rpc('remember_product_alias', {
      p_product_id: input.productId,
      p_alias: alias,
      p_alias_normalised: normalised,
      p_client_uuid: input.clientUuid ?? newClientUuid(),
    })

    if (error) throw error

    /*
     * The RPC returns the row id. A success with no id means the database did not do what
     * we asked â€” the same "read it back" rule the floor verbs follow: never tell the
     * operator a spelling was saved when nothing was written (Law 16).
     */
    if (typeof data !== 'string' || data.length === 0) {
      throw new Error('The database did not confirm the saved spelling. The match stands; nothing was recorded.')
    }

    return {
      result: { success: true, aliasId: data, productId: input.productId, alias, normalised },
      events: [
        {
          type: EVENT_TYPES.PRODUCT_ALIAS_REMEMBERED,
          payload: { productId: input.productId, alias, normalised, userId: ctx.userId },
        },
      ],
    }
  },
}

export const rememberProductAlias = createAction<
  RememberProductAliasInput,
  RememberProductAliasResult
>(rememberProductAliasConfig)
