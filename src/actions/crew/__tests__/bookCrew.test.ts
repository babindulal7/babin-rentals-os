import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bookCrewConfig } from '../bookCrew'
const state = vi.hoisted(() => ({
  booking: { id: '11111111-1111-4111-8111-111111111111', booking_no: 'B-1', pickup_at: '2026-09-13T04:15:00Z', return_at: '2026-09-15T04:15:00Z', stage: 'Booked', cancelled_at: null as string | null, closed_at: null },
  people: [{ id: '22222222-2222-4222-8222-222222222222', crew_code: 'CR-1', primary_role: 'Sound', full_name: 'Crew One', daily_rate: 6500, is_active: true }],
  inserted: [] as Record<string, unknown>[], missingBooking: false, bookingError: false, insertError: false, duplicate: false,
  duplicateApproverOverride: undefined as string | undefined,
}))
vi.mock('../../../lib/supabase', () => ({
  newClientUuid: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  supabase: {
    from: (table: string) => {
      let field = ''
      let value: unknown
      let inField = ''
      let inValues: unknown[] = []
      let rowsToInsert: Record<string, unknown>[] = []

      const query: any = {
        select: vi.fn(() => query),
        eq: (key: string, val: unknown) => {
          field = key
          value = val
          return query
        },
        in: (key: string, vals: unknown[]) => {
          inField = key
          inValues = vals
          return query
        },
        insert: (data: Record<string, unknown> | Record<string, unknown>[]) => {
          rowsToInsert = Array.isArray(data) ? data : [data]
          return query
        },
        maybeSingle: async () => {
          if (table === 'bookings') return { data: state.missingBooking ? null : state.booking, error: state.bookingError ? { message: 'Connection failed' } : null }
          if (table === 'crew_profiles_v2_v') return { data: state.people.find((p) => p[field as 'id' | 'crew_code'] === value) ?? null, error: null }
          return { data: state.duplicate ? { ...state.inserted[state.inserted.length - 1], id: 'saved' } : null, error: null }
        },
        single: async () => {
          state.inserted.push(...rowsToInsert)
          return { data: state.insertError || state.duplicate ? null : { id: `saved-${state.inserted.length}` }, error: state.insertError ? { code: '408', message: 'Network failed' } : state.duplicate ? { code: '23505', message: 'duplicate client_uuid' } : null }
        },
        then: (resolve: (val: any) => void, reject?: (err: any) => void) => {
          if (table === 'crew_profiles_v2_v') {
            const matches = state.people.filter((p) => inValues.includes(p[inField as 'id' | 'crew_code']))
            return Promise.resolve({ data: matches, error: null }).then(resolve, reject)
          }
          if (table === 'crew_assignments') {
            if (state.insertError) {
              return Promise.resolve({ data: null, error: { code: '408', message: 'Network failed' } }).then(resolve, reject)
            }
            if (state.duplicate) {
              state.inserted.push(...rowsToInsert)
              return Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate client_uuid' } }).then(resolve, reject)
            }
            state.inserted.push(...rowsToInsert)
            const savedData = rowsToInsert.map((_, i) => ({ id: `saved-${state.inserted.length - rowsToInsert.length + i + 1}` }))
            return Promise.resolve({ data: savedData, error: null }).then(resolve, reject)
          }
          if (table === 'crew_assignments_v') {
            if (state.duplicate) {
              const matched = state.inserted.map((ins) => ({ ...ins, id: 'saved', overtime_approved_by: state.duplicateApproverOverride ?? ins.overtime_approved_by }))
              return Promise.resolve({ data: matched, error: null }).then(resolve, reject)
            }
            return Promise.resolve({ data: [], error: null }).then(resolve, reject)
          }
          return Promise.resolve({ data: null, error: null }).then(resolve, reject)
        },
      }
      return query
    },
  },
}))
const ctx = { userId: '55555555-5555-4555-8555-555555555555', role: 'Owner' as const }
const input = () => ({ bookingId: state.booking.id, crewIds: [state.people[0]!.id], clientUuid: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' })
beforeEach(() => { state.duplicateApproverOverride = undefined; state.inserted = []; state.missingBooking = false; state.bookingError = false; state.insertError = false; state.duplicate = false; state.booking.cancelled_at = null; state.booking.stage = 'Booked'; state.people[0]!.is_active = true })
describe('bookCrew confirmed writes', () => {
  it('saves the chosen booking and person with real default dates and rate', async () => {
    const { result, events } = await bookCrewConfig.execute(input(), ctx)
    expect(result).toEqual({ success: true, count: 1, assignmentIds: ['saved-1'] })
    expect(state.inserted[0]).toMatchObject({ booking_id: state.booking.id, crew_id: state.people[0]!.id, days: 3, daily_rate: 6500, line_total: 19500, call_time: state.booking.pickup_at, client_uuid: input().clientUuid })
    expect(events).toHaveLength(1)
  })
  it('persists supplied role, times, rate, days and notes', async () => {
    await bookCrewConfig.execute({ ...input(), role: 'Audio lead', callTime: '2026-09-13T05:00:00Z', wrapTime: '2026-09-13T10:00:00Z', days: 1, dailyRate: 0, notes: '  Stage A  ' }, ctx)
    expect(state.inserted[0]).toMatchObject({ role_on_shoot: 'Audio lead', days: 1, daily_rate: 0, line_total: 0, notes: 'Stage A', wrap_time: '2026-09-13T10:00:00Z' })
  })
  it('never falls back to another booking when the target is missing', async () => {
    state.missingBooking = true
    await expect(bookCrewConfig.execute(input(), ctx)).rejects.toThrow('not found')
    expect(state.inserted).toHaveLength(0)
  })
  it('propagates booking read failure without writing', async () => {
    state.bookingError = true
    await expect(bookCrewConfig.execute(input(), ctx)).rejects.toThrow('Connection failed')
    expect(state.inserted).toHaveLength(0)
  })
  it.each(['Closed', 'cancelled'])('refuses terminal booking %s', async (stage) => {
    if (stage === 'Closed') state.booking.stage = stage
    else state.booking.cancelled_at = '2026-09-13T00:00:00Z'
    await expect(bookCrewConfig.execute(input(), ctx)).rejects.toThrow('cancelled or closed')
  })
  it('refuses inactive crew', async () => {
    state.people[0]!.is_active = false
    await expect(bookCrewConfig.execute(input(), ctx)).rejects.toThrow('inactive')
    expect(state.inserted).toHaveLength(0)
  })
  it('preflights every crew member before writing a batch', async () => {
    await expect(bookCrewConfig.execute({ ...input(), crewIds: [state.people[0]!.id, 'missing'] }, ctx)).rejects.toThrow('unavailable')
    expect(state.inserted).toHaveLength(0)
  })
  it('does not report a network failure as a saved or queued assignment', async () => {
    state.insertError = true
    await expect(bookCrewConfig.execute(input(), ctx)).rejects.toThrow('not saved')
  })
  it('confirms duplicate requests by reading the existing row', async () => {
    state.duplicate = true
    const { result } = await bookCrewConfig.execute(input(), ctx)
    expect(result.assignmentIds).toEqual(['saved'])
  })
  it('refuses a retried request when the stored approver differs', async () => {
    state.duplicate = true
    state.duplicateApproverOverride = '44444444-4444-4444-8444-444444444444'
    await expect(bookCrewConfig.execute({ ...input(), overtimeDays: 0.5 }, ctx))
      .rejects.toThrow('different assignment details')
  })
  it('refuses a priced assignment for Coordinator', async () => {
    await expect(bookCrewConfig.execute(input(), { ...ctx, role: 'Coordinator' })).rejects.toThrow('Owner, Admin, or Manager')
    expect(state.inserted).toHaveLength(0)
  })
  it('batches lookups and atomically inserts multiple crew members', async () => {
    state.people.push({
      id: '33333333-3333-4333-8333-333333333333',
      crew_code: 'CR-2',
      primary_role: 'Gaffer',
      full_name: 'Crew Two',
      daily_rate: 8000,
      is_active: true,
    })
    const { result, events } = await bookCrewConfig.execute(
      {
        ...input(),
        crewIds: [state.people[0]!.id, state.people[1]!.id],
      },
      ctx,
    )
    expect(result).toEqual({ success: true, count: 2, assignmentIds: ['saved-1', 'saved-2'] })
    expect(state.inserted).toHaveLength(2)
    expect(state.inserted[0]).toMatchObject({ crew_id: state.people[0]!.id, daily_rate: 6500 })
    expect(state.inserted[1]).toMatchObject({ crew_id: state.people[1]!.id, daily_rate: 8000 })
    expect(events[0]?.payload).toMatchObject({ crewCount: 2 })
  })
  it('calculates overtime at day rate and attributes it to the signed-in operator (D24, T8-06)', async () => {
    const { result, events } = await bookCrewConfig.execute(
      { ...input(), days: 3, dailyRate: 5000, overtimeDays: 0.5 },
      ctx,
    )
    expect(result).toEqual({ success: true, count: 1, assignmentIds: ['saved-1'] })
    // 3 days + 0.5 day overtime = 3.5 days @ 5000 = 17500
    expect(state.inserted[0]).toMatchObject({
      days: 3,
      overtime_days: 0.5,
      overtime_approved_by: ctx.userId,
      daily_rate: 5000,
      line_total: 17500,
    })
    expect(events[0]?.payload).toMatchObject({
      days: 3,
      overtimeDays: 0.5,
      billableDays: 3.5,
    })
  })
  it('rejects a supplied approver different from the signed-in user without writing', async () => {
    await expect(bookCrewConfig.execute({
      ...input(), overtimeDays: 0.5, overtimeApprovedBy: '44444444-4444-4444-8444-444444444444',
    }, ctx)).rejects.toThrow('must match the signed-in operator')
    expect(state.inserted).toHaveLength(0)
  })
  it('accepts a matching approver but still persists the session user ID', async () => {
    await bookCrewConfig.execute({ ...input(), overtimeDays: 1, overtimeApprovedBy: ctx.userId }, ctx)
    expect(state.inserted[0]).toMatchObject({ overtime_days: 1, overtime_approved_by: ctx.userId })
  })
  it('rejects crew overtime without a valid authenticated actor UUID', async () => {
    await expect(bookCrewConfig.execute({ ...input(), overtimeDays: 0.5 }, { ...ctx, userId: 'operator' }))
      .rejects.toThrow('authenticated user UUID')
    expect(state.inserted).toHaveLength(0)
  })
  it.each([{ days: 1.5 }, { days: NaN }, { dailyRate: Infinity }, { dailyRate: -1 }, { clientUuid: 'bad-key' }, { bookingId: '' }, { callTime: 'bad date' }, { wrapTime: '2026-09-12T00:00:00Z' }, { overtimeDays: 0.3 }, { overtimeDays: -0.5 }, { overtimeApprovedBy: 'not-a-uuid' }])('refuses invalid input %j', async (override) => {
    await expect(bookCrewConfig.execute({ ...input(), ...override }, ctx)).rejects.toThrow()
    expect(state.inserted).toHaveLength(0)
  })
})

