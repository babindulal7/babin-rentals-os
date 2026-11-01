import { createAction, type ActionConfig, type ActionContext } from '../core'
import { EVENT_TYPES } from '../../events/eventBus'
import { safeUpdate, idempotentInsert } from '../../lib/dataAccess'
import type { Database } from '../../types/database'
import { supabase } from '../../lib/supabase'
import { getClientRecord } from '../../lib/queries/clients'
import { isValidLocalPhone, canonicalPhone, PHONE_STORED_RE } from '../../lib/phone'

export type UpdateClientInput = {
  clientId: string
  patch: Record<string, unknown>
  clientUuid?: string | undefined
}

export type UpdateClientResult = {
  success: boolean
  clientId: string
  clientCode?: string | undefined
  changedKeys: string[]
}

const CLIENT_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const FORBIDDEN_KEYS = new Set([
  'id',
  'client_code',
  'client_uuid',
  'created_at',
  'created_by',
  'status',
  'deactivated_at',
  'deactivated_by',
  'deactivation_reason',
  'merged_into_client_id',
  // 0005:162-164 & 0130: Written ONLY by an Approved client_commercial_overrides row.
  'approved_credit_limit',
  'approvedCreditLimit',
  'payment_terms',
  'paymentTerms',
])

export const updateClientConfig: ActionConfig<UpdateClientInput, UpdateClientResult> = {
  name: 'UPDATE_CLIENT',
  permissions: ['client.update'],
  implemented: true,

  validate: (input) => {
    if (!input.clientId || input.clientId.trim() === '') {
      throw new Error('Client ID is required.')
    }
    if (!input.patch || Object.keys(input.patch).length === 0) {
      throw new Error('Nothing to update — the patch is empty.')
    }

    for (const key of Object.keys(input.patch)) {
      if (FORBIDDEN_KEYS.has(key)) {
        throw new Error(`Field '${key}' cannot be modified through updateClient.`)
      }
    }

    if ('phone' in input.patch) {
      const rawPhone = input.patch.phone
      if (rawPhone === null || rawPhone === undefined || String(rawPhone).trim() === '') {
        throw new Error('Phone is required — duplicate detection and merge match on it.')
      }
      const strPhone = String(rawPhone).trim()
      if (!PHONE_STORED_RE.test(strPhone) && !isValidLocalPhone(strPhone)) {
        throw new Error('Must be a 10-digit Nepali mobile starting 97 or 98 — for example 9801234567.')
      }
    }

    if ('pan' in input.patch || 'pan_vat' in input.patch) {
      const rawPan = input.patch.pan ?? input.patch.pan_vat
      if (rawPan !== null && rawPan !== undefined && String(rawPan).trim() !== '') {
        const strPan = String(rawPan).trim()
        if (!/^[0-9]{9}$/.test(strPan)) {
          throw new Error('PAN/VAT must be exactly 9 digits.')
        }
      }
    }
  },

  execute: async (input, ctx: ActionContext) => {
    if (ctx.isOnline === false || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
      throw new Error('This device is offline. Client edits are not queued offline — try again when back online.')
    }

    const rawId = input.clientId.trim()
    let resolvedId = rawId
    let clientCode: string | undefined

    if (CLIENT_UUID_RE.test(rawId)) {
      resolvedId = rawId
      try {
        const profile = await getClientRecord(rawId)
        if (profile) clientCode = profile.record.id
      } catch {
        // Fall back to resolvedId
      }
    } else {
      const profile = await getClientRecord(rawId)
      if (!profile) {
        throw new Error(`No client with identifier '${rawId}' exists, so nothing was changed.`)
      }
      resolvedId = profile.id
      clientCode = profile.record.id
    }

    const patch = input.patch
    const clientPayload: Record<string, unknown> = {}

    if ('name' in patch && patch.name !== undefined) clientPayload.name = String(patch.name).trim()
    if ('phone' in patch && patch.phone !== undefined) {
      const p = String(patch.phone).trim()
      clientPayload.phone = PHONE_STORED_RE.test(p) ? p : canonicalPhone(p)
    }
    if ('email' in patch) clientPayload.email = patch.email ? String(patch.email).trim() : null
    if ('pan' in patch) clientPayload.pan_vat = patch.pan ? String(patch.pan).trim() : null
    if ('pan_vat' in patch) clientPayload.pan_vat = patch.pan_vat ? String(patch.pan_vat).trim() : null
    if ('address' in patch) clientPayload.address_line = patch.address ? String(patch.address).trim() : null
    if ('address_line' in patch) clientPayload.address_line = patch.address_line ? String(patch.address_line).trim() : null
    if ('city' in patch) clientPayload.city = patch.city ? String(patch.city).trim() : null
    if ('district' in patch) clientPayload.district = patch.district ? String(patch.district).trim() : null
    if ('postalCode' in patch) clientPayload.postal_code = patch.postalCode ? String(patch.postalCode).trim() : null
    if ('postal_code' in patch) clientPayload.postal_code = patch.postal_code ? String(patch.postal_code).trim() : null
    if ('country' in patch && patch.country !== undefined) clientPayload.country = String(patch.country).trim()
    if ('businessRegistrationNo' in patch) {
      clientPayload.business_registration = patch.businessRegistrationNo ? String(patch.businessRegistrationNo).trim() : null
    }
    if ('business_registration' in patch) {
      clientPayload.business_registration = patch.business_registration ? String(patch.business_registration).trim() : null
    }
    if ('website' in patch) clientPayload.website = patch.website ? String(patch.website).trim() : null
    if ('billingAddress' in patch) clientPayload.billing_address = patch.billingAddress ? String(patch.billingAddress).trim() : null
    if ('billing_address' in patch) clientPayload.billing_address = patch.billing_address ? String(patch.billing_address).trim() : null
    if ('notes' in patch) clientPayload.notes = patch.notes ? String(patch.notes).trim() : null
    if ('tags' in patch) clientPayload.tags = patch.tags ?? []
    if ('clientType' in patch) clientPayload.type_parent = patch.clientType ?? null
    if ('type_parent' in patch) clientPayload.type_parent = patch.type_parent ?? null
    if ('organisationType' in patch) clientPayload.org_subtype = patch.organisationType ?? null
    if ('org_subtype' in patch) clientPayload.org_subtype = patch.org_subtype ?? null
    if ('portal_default_language' in patch) clientPayload.portal_default_language = patch.portal_default_language
    if ('preferred_contact_channels' in patch) clientPayload.preferred_contact_channels = patch.preferred_contact_channels
    if ('is_staff' in patch) clientPayload.is_staff = Boolean(patch.is_staff)
    if ('isStaff' in patch) clientPayload.is_staff = Boolean(patch.isStaff)
    if ('isStaffClient' in patch) clientPayload.is_staff = Boolean(patch.isStaffClient)
    if ('staff_user_id' in patch) clientPayload.staff_user_id = patch.staff_user_id ?? null
    if ('staffUserId' in patch) clientPayload.staff_user_id = patch.staffUserId ?? null

    const hasContactFields = 'contact_name' in patch || 'contact_designation' in patch || 'contact_phone' in patch
    if (hasContactFields) {
      const { data: existingContact, error: contactReadErr } = await supabase
        .from('client_contacts')
        .select('id')
        .eq('client_id', resolvedId)
        .eq('is_primary', true)
        .eq('status', 'Active')
        .maybeSingle()

      if (contactReadErr) {
        throw new Error(`Could not read primary contact for client '${resolvedId}': ${contactReadErr.message}`)
      }

      if (existingContact && (existingContact as { id: string }).id) {
        const contactUpdate: Record<string, unknown> = {}
        if ('contact_name' in patch && patch.contact_name !== undefined) {
          contactUpdate.full_name = String(patch.contact_name).trim()
        }
        if ('contact_designation' in patch) {
          contactUpdate.designation = patch.contact_designation ? String(patch.contact_designation).trim() : null
        }
        if ('contact_phone' in patch) {
          contactUpdate.phone = patch.contact_phone ? String(patch.contact_phone).trim() : null
        }
        if (Object.keys(contactUpdate).length > 0) {
          const contactRes = await safeUpdate(
            'client_contacts' as unknown as keyof Database['public']['Tables'],
            (existingContact as { id: string }).id,
            contactUpdate as unknown as Database['public']['Tables']['branches']['Update'],
            input.clientUuid,
          )
          if (contactRes.error) {
            throw new Error(`Failed to update primary contact: ${String((contactRes.error as { message?: string }).message ?? contactRes.error)}`)
          }
        }
      } else if (patch.contact_name && String(patch.contact_name).trim()) {
        const contactIns = await idempotentInsert('client_contacts' as unknown as keyof Database['public']['Tables'], {
          client_id: resolvedId,
          full_name: String(patch.contact_name).trim(),
          designation: patch.contact_designation ? String(patch.contact_designation).trim() : null,
          phone: patch.contact_phone ? String(patch.contact_phone).trim() : null,
          is_primary: true,
          client_uuid: input.clientUuid,
        } as unknown as Database['public']['Tables']['branches']['Insert'])
        if (contactIns.error) {
          throw new Error(`Failed to create primary contact: ${String((contactIns.error as { message?: string }).message ?? contactIns.error)}`)
        }
      }
    }

    if (Object.keys(clientPayload).length > 0) {
      const { data: updatedRow, error } = await safeUpdate(
        'clients' as unknown as keyof Database['public']['Tables'],
        resolvedId,
        clientPayload as unknown as Database['public']['Tables']['branches']['Update'],
        input.clientUuid,
        { returnRow: true, returningColumns: 'id, client_code, name, phone, updated_at' },
      )
      if (error) {
        throw new Error(`Failed to update client: ${String((error as { message?: string }).message ?? error)}`)
      }
      if (!updatedRow) {
        throw new Error(`Update returned no row for client '${resolvedId}'. Nothing was saved.`)
      }
      if ((updatedRow as unknown as { client_code?: string }).client_code) {
        clientCode = (updatedRow as unknown as { client_code: string }).client_code
      }
    }

    const changedKeys = Object.keys(input.patch)
    return {
      result: {
        success: true,
        clientId: resolvedId,
        clientCode,
        changedKeys,
      },
      events: [
        {
          type: EVENT_TYPES.CLIENT_UPDATED,
          payload: {
            clientId: resolvedId,
            clientCode,
            changedKeys,
            timestamp: new Date().toISOString(),
            userId: ctx.userId,
          },
        },
      ],
    }
  },
}

export const updateClient = createAction<UpdateClientInput, UpdateClientResult>(updateClientConfig)
