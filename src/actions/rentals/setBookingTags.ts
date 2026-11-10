import { createAction, type ActionConfig, type ActionContext } from '../core'
import { EVENT_TYPES } from '../../events/eventBus'
import { supabase, newClientUuid } from '../../lib/supabase'
import { parseBookingNoSearch } from '../../lib/format'

export type SetBookingTagsInput = {
  /** Booking uuid or `B-` / bare number. */
  id: string
  /** **Law 8.** Minted where the operator pressed Save; reused on retry. */
  clientUuid?: string
  /** Array of tag strings. */
  tags: string[]
}

export type SetBookingTagsResult = {
  success: true
  bookingId: string
  tags: string[]
  idempotent: boolean
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function sanitizeTags(rawTags: string[]): string[] {
  const cleaned: string[] = []
  for (const t of rawTags) {
    if (typeof t !== 'string') continue
    const trimmed = t.trim()
    if (trimmed.length === 0) continue
    if (trimmed.length > 30) {
      throw new Error(`Tag "${trimmed}" exceeds the 30-character limit. Keep tags under 30 characters.`)
    }
    const lower = trimmed.toLowerCase()
    if (!cleaned.some((x) => x.toLowerCase() === lower)) {
      cleaned.push(trimmed)
    }
  }
  return cleaned
}

/**
 * # SET_BOOKING_TAGS — booking tag management (T3-25, B16, B55)
 *
 * Adds and removes free tags on a booking (Owner · Admin · Manager · Coordinator).
 * Tags are trimmed, case-insensitive deduplicated, up to 30 characters.
 * Tags never affect a booking's stage or financial calculations.
 */
export const setBookingTagsConfig: ActionConfig<SetBookingTagsInput, SetBookingTagsResult> = {
  name: 'SET_BOOKING_TAGS',
  permissions: ['rental.tag'],
  implemented: true,

  validate: (input) => {
    if (!input.id || input.id.trim() === '') {
      throw new Error('A booking reference is required — pass the booking uuid or its booking number. Nothing was sent.')
    }
    if (input.clientUuid !== undefined && input.clientUuid.trim() === '') {
      throw new Error('The idempotency key is present but empty. Pass a valid UUID or omit it.')
    }
    if (!Array.isArray(input.tags)) {
      throw new Error('Tags must be provided as an array of strings.')
    }
    // Validation runs the tag length and format check
    sanitizeTags(input.tags)
  },

  execute: async (input, _ctx: ActionContext) => {
    const isUuid = UUID_RE.test(input.id)
    let bookingId = input.id

    if (!isUuid) {
      const parsedNo = parseBookingNoSearch(input.id)
      const { data, error } = await supabase
        .from('bookings')
        .select('id')
        .eq('booking_no', parsedNo)
        .maybeSingle()
      if (error) {
        throw new Error(`Could not resolve booking ${input.id}: ${error.message}`)
      }
      if (!data) {
        throw new Error(`Booking ${input.id} was not found. Nothing was saved.`)
      }
      bookingId = (data as { id: string }).id
    }

    const key = input.clientUuid ?? newClientUuid()
    const sanitized = sanitizeTags(input.tags)

    const { data, error } = await supabase.rpc('set_booking_tags', {
      p_client_uuid: key,
      p_booking_id: bookingId,
      p_tags: sanitized,
    })

    if (error) {
      throw new Error(`Failed to update booking tags: ${error.message}`)
    }

    const res = data as {
      booking_id: string
      tags: string[]
      idempotent?: boolean
    }

    return {
      result: {
        success: true,
        bookingId: res.booking_id,
        tags: res.tags ?? sanitized,
        idempotent: Boolean(res.idempotent),
      },
      events: [
        {
          type: EVENT_TYPES.RENTAL_TAGS_UPDATED,
          payload: {
            bookingId,
            tags: res.tags ?? sanitized,
          },
        },
      ],
    }
  },
}

export const setBookingTags = createAction(setBookingTagsConfig)
