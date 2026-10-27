import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createCaseConfig, type CreateCaseInput } from '../createCase'

const db = vi.hoisted(() => {
  const state = {
    insertedCases: [] as Array<{ table: string; row: Record<string, unknown> }>,
    insertError: null as { message: string } | null,
    rpcCalls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
    rpcResult: null as Record<string, unknown> | null,
    rpcError: null as { message: string } | null,
  }

  return {
    state,
    supabase: {
      from: () => ({
        select: () => ({
          ilike: () => ({
            order: () => ({
              limit: async () => ({ data: [{ case_no: 'CASE-2026-0005' }], error: null }),
            }),
          }),
        }),
      }),
      rpc: async (fn: string, args: Record<string, unknown>) => {
        state.rpcCalls.push({ fn, args })
        if (state.rpcError) return { data: null, error: state.rpcError }
        return { data: state.rpcResult, error: null }
      },
    },
    idempotentInsert: async (table: string, row: Record<string, unknown>) => {
      state.insertedCases.push({ table, row })
      if (state.insertError) {
        throw new Error(`[DataAccess] Insert failed on ${table}: ${state.insertError.message}`)
      }
      return { data: null, error: null }
    },
    generateClientUuid: () => '11111111-2222-3333-4444-555555555555',
  }
})

vi.mock('../../../lib/supabase', () => ({
  supabase: db.supabase,
}))

vi.mock('../../../lib/dataAccess', () => ({
  idempotentInsert: db.idempotentInsert,
  generateClientUuid: db.generateClientUuid,
}))

describe('CREATE_CASE action (T2-15, W44, W23)', () => {
  beforeEach(() => {
    db.state.insertedCases = []
    db.state.insertError = null
    db.state.rpcCalls = []
    db.state.rpcResult = null
    db.state.rpcError = null
  })

  it('declares implemented: true and permissions: [case.create]', () => {
    expect(createCaseConfig.implemented).toBe(true)
    expect(createCaseConfig.permissions).toEqual(['case.create'])
  })

  it('validates input: title, type, counterparty', () => {
    expect(() =>
      createCaseConfig.validate({
        title: '',
        type: 'Damage',
        counterpartyKind: 'Client',
        counterpartyName: 'Aayush',
      } as CreateCaseInput),
    ).toThrow(/Case title of at least 3 characters is required/)

    expect(() =>
      createCaseConfig.validate({
        title: 'Broken Lens',
        type: 'Invalid' as never,
        counterpartyKind: 'Client',
        counterpartyName: 'Aayush',
      } as CreateCaseInput),
    ).toThrow(/Valid case type/)

    expect(() =>
      createCaseConfig.validate({
        title: 'Broken Lens',
        type: 'Damage',
        counterpartyKind: 'Invalid' as never,
        counterpartyName: 'Aayush',
      } as CreateCaseInput),
    ).toThrow(/Valid counterparty kind/)
  })

  it('creates damage case defaulting to Charge Client and Under Review (W44, W23)', async () => {
    const input: CreateCaseInput = {
      title: 'Damage found post-inspection: Nisi Lens',
      type: 'Damage',
      counterpartyKind: 'Client',
      counterpartyName: 'Aayush Maharjan',
      linkedBookingId: '00000000-0000-0000-0000-000000000001',
      unitId: '00000000-0000-0000-0000-000000000002',
      damageType: 'Optical',
      description: 'Scratched coating on front element',
      severity: 'High',
    }

    const res = await createCaseConfig.execute(input, {
      userId: 'user-wh-1',
      role: 'Warehouse',
    })

    expect(res.result.success).toBe(true)
    expect(res.result.type).toBe('Damage')
    expect(res.result.status).toBe('Under Review')
    expect(res.result.disposition).toBe('Charge Client')
    expect(res.result.linkedBookingId).toBe('00000000-0000-0000-0000-000000000001')

    // Verify insert into cases table
    const caseInsert = db.state.insertedCases.find((c) => c.table === 'cases')
    expect(caseInsert).toBeDefined()
    expect(caseInsert?.row['disposition']).toBe('Charge Client')
    expect(caseInsert?.row['status']).toBe('Under Review')
    expect(caseInsert?.row['assessed_amount']).toBe(0)
  })

  it('uses RPC when available for Damage case with booking and unit', async () => {
    db.state.rpcResult = {
      case_id: 'case-uuid-999',
      case_no: 'CASE-2026-0009',
      status: 'Under Review',
      disposition: 'Charge Client',
      finding_id: 'finding-uuid-888',
    }

    const input: CreateCaseInput = {
      title: 'Damage found post-inspection: Sony FX3',
      type: 'Damage',
      counterpartyKind: 'Client',
      counterpartyName: 'Aayush Maharjan',
      linkedBookingId: '00000000-0000-0000-0000-000000000001',
      unitId: '00000000-0000-0000-0000-000000000002',
      damageType: 'Functional',
      description: 'HDMI port loose',
    }

    const res = await createCaseConfig.execute(input, {
      userId: 'user-wh-1',
      role: 'Warehouse',
    })

    expect(res.result.success).toBe(true)
    expect(res.result.id).toBe('case-uuid-999')
    expect(res.result.caseNo).toBe('CASE-2026-0009')
    expect(db.state.rpcCalls.length).toBe(1)
    expect(db.state.rpcCalls[0]?.fn).toBe('create_damage_case')
  })
})
