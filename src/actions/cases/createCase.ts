import { createAction, type ActionConfig, type ActionContext } from '../core'
import { EVENT_TYPES } from '../../events/eventBus'
import { supabase } from '../../lib/supabase'
import { generateClientUuid, idempotentInsert } from '../../lib/dataAccess'
import type { DamageDisposition } from '../../types/database'

export type CreateCaseInput = {
  type: 'Damage' | 'Missing' | 'Theft' | 'Dispute' | 'Vendor'
  title: string
  counterpartyKind: 'Client' | 'Partner' | 'Vendor'
  counterpartyName: string
  linkedBookingId?: string | undefined
  priority?: 'Critical' | 'High' | 'Medium' | 'Low' | undefined
  status?: 'Open' | 'Under Review' | 'In Progress' | undefined
  disposition?: string | undefined
  description?: string | undefined
  unitId?: string | undefined
  damageType?: string | undefined
  severity?: string | undefined
  ownerId?: string | undefined
  clientUuid?: string | undefined
}

export type CreateCaseResult = {
  success: boolean
  id: string
  caseNo: string
  type: string
  status: string
  disposition: string | null
  linkedBookingId: string | null
  findingId?: string | undefined
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function mintNextCaseNo(): Promise<string> {
  const year = new Date().getFullYear()
  const { data } = await supabase
    .from('cases_v')
    .select('case_no')
    .ilike('case_no', `CASE-${year}-%`)
    .order('case_no', { ascending: false })
    .limit(1)

  let nextSeq = 1
  if (data && data.length > 0 && data[0]?.case_no) {
    const parts = data[0].case_no.split('-')
    const lastNum = parseInt(parts[2] ?? '0', 10)
    if (!isNaN(lastNum)) {
      nextSeq = lastNum + 1
    }
  }
  return `CASE-${year}-${String(nextSeq).padStart(4, '0')}`
}

export const createCaseConfig: ActionConfig<CreateCaseInput, CreateCaseResult> = {
  name: 'CREATE_CASE',
  permissions: ['case.create'],
  implemented: true,

  validate: (input) => {
    if (!input.title || input.title.trim().length < 3) {
      throw new Error('Case title of at least 3 characters is required.')
    }
    if (!input.type || !['Damage', 'Missing', 'Theft', 'Dispute', 'Vendor'].includes(input.type)) {
      throw new Error('Valid case type (Damage, Missing, Theft, Dispute, Vendor) is required.')
    }
    if (!input.counterpartyKind || !['Client', 'Partner', 'Vendor'].includes(input.counterpartyKind)) {
      throw new Error('Valid counterparty kind (Client, Partner, Vendor) is required.')
    }
    if (!input.counterpartyName || input.counterpartyName.trim() === '') {
      throw new Error('Counterparty name is required.')
    }
    if (input.linkedBookingId && !UUID_RE.test(input.linkedBookingId)) {
      throw new Error('Linked booking ID must be a valid UUID.')
    }
  },

  execute: async (input: CreateCaseInput, ctx: ActionContext) => {
    if (ctx.isOnline === false || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
      throw new Error('This device is offline. Case creation requires a live database connection and cannot be queued offline.')
    }

    // Fast path: if Damage with booking + unit, invoke database RPC
    if (input.type === 'Damage' && input.linkedBookingId && input.unitId) {
      try {
        const { data: rpcData, error: rpcError } = await supabase.rpc('create_damage_case', {
          p_booking_id: input.linkedBookingId,
          p_unit_id: input.unitId,
          p_damage_type: input.damageType || 'Not stated',
          p_description: input.description || input.title,
          p_severity: input.severity || 'Medium',
          p_disposition: input.disposition || 'Charge Client',
          p_client_uuid: input.clientUuid || generateClientUuid(),
        })

        if (!rpcError && rpcData && typeof rpcData === 'object') {
          const res = rpcData as {
            case_id: string
            case_no: string
            status: string
            disposition: string
            finding_id?: string
          }
          return {
            result: {
              success: true,
              id: res.case_id,
              caseNo: res.case_no,
              type: 'Damage',
              status: res.status || 'Under Review',
              disposition: res.disposition || 'Charge Client',
              linkedBookingId: input.linkedBookingId,
              findingId: res.finding_id,
            },
            events: [
              {
                type: EVENT_TYPES.CASE_CREATED,
                payload: {
                  id: res.case_id,
                  caseNo: res.case_no,
                  type: 'Damage',
                  linkedBookingId: input.linkedBookingId,
                },
              },
            ],
          }
        }
      } catch {
        // Fall back to direct insert below
      }
    }

    const caseId = generateClientUuid()
    const caseNo = await mintNextCaseNo()
    const now = new Date().toISOString()
    const defaultStatus = input.type === 'Damage' ? 'Under Review' : 'Open'
    const defaultDisposition = input.type === 'Damage' ? 'Charge Client' : null

    const casePayload = {
      id: caseId,
      client_uuid: input.clientUuid || generateClientUuid(),
      case_no: caseNo,
      type: input.type,
      title: input.title.trim(),
      counterparty_kind: input.counterpartyKind,
      counterparty_name: input.counterpartyName.trim(),
      priority: input.priority || 'High',
      status: input.status || defaultStatus,
      disposition: input.disposition || defaultDisposition,
      linked_booking_id: input.linkedBookingId || null,
      owner_id: input.ownerId || ctx.userId,
      created_by: ctx.userId,
      assessed_amount: 0,
      deposit_held_amount: 0,
      charged_to_client_amount: 0,
      opened_at: now,
    }

    await idempotentInsert('cases' as never, casePayload as never, {
      queueOnFailure: false,
      returnRow: false,
    })

    let findingId: string | undefined
    if (input.type === 'Damage' && input.unitId) {
      findingId = generateClientUuid()
      await idempotentInsert(
        'damage_findings',
        {
          id: findingId,
          client_uuid: generateClientUuid(),
          source: 'Cleaning',
          unit_id: input.unitId,
          case_id: caseId,
          damage_type: input.damageType || 'Not stated',
          description: (input.description || input.title).trim(),
          severity: input.severity || 'Medium',
          disposition: (input.disposition || 'Charge Client') as DamageDisposition,
          created_by: ctx.userId,
        },
        { returnRow: false },
      )
    }

    return {
      result: {
        success: true,
        id: caseId,
        caseNo,
        type: input.type,
        status: input.status || defaultStatus,
        disposition: input.disposition || defaultDisposition,
        linkedBookingId: input.linkedBookingId || null,
        findingId,
      },
      events: [
        {
          type: EVENT_TYPES.CASE_CREATED,
          payload: {
            id: caseId,
            caseNo,
            type: input.type,
            linkedBookingId: input.linkedBookingId,
          },
        },
      ],
    }
  },
}

export const createCase = createAction<CreateCaseInput, CreateCaseResult>(createCaseConfig)
