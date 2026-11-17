import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listCrewAssignments } from '../crew'

const fixture = vi.hoisted(() => ({
  bookings: [] as Array<Record<string, unknown>>,
  members: [] as Array<Record<string, unknown>>,
  omitMembers: false,
  ranges: [] as Array<[number, number]>,
  memberIds: [] as string[],
}))

vi.mock('../../supabase', () => ({
  IS_MOCK: false,
  supabase: {
    from: (table: string) => ({
      select: () => {
        const rows = () => table === 'crew_bookings_v' ? fixture.bookings : fixture.members
        const query: any = {
          order: () => query,
          range: (from: number, to: number) => {
            fixture.ranges.push([from, to])
            return Promise.resolve({ data: rows().slice(from, to + 1), error: null })
          },
          in: (_column: string, ids: string[]) => {
            fixture.memberIds = ids
            return Promise.resolve({
              data: fixture.omitMembers ? [] : rows().filter((row) => ids.includes(String(row.id))),
              error: null,
            })
          },
          then: (resolve: (result: unknown) => unknown) =>
            Promise.resolve({ data: rows(), error: null }).then(resolve),
        }
        return query
      },
    }),
  },
}))

describe('complete crew assignment reads for accountant exports', () => {
  beforeEach(() => {
    fixture.bookings = Array.from({ length: 401 }, (_, i) => ({
      id: `booking-${i}`,
      crew_booking_no: `CRW-${i}`,
      crew_member_id: `member-${i}`,
      position: 'Grip',
      day_rate: 100,
      days: 1,
      start_date: '2026-07-20',
      end_date: '2026-07-20',
      state: 'Completed',
      payout_state: 'Paid',
      cancelled_at: null,
    }))
    fixture.members = Array.from({ length: 401 }, (_, i) => ({
      id: `member-${i}`,
      full_name: `Crew Member ${i}`,
      position: 'Grip',
      phone: null,
      engagement_type: 'Freelance',
      day_rate: 100,
      deactivated_at: null,
    }))
    fixture.omitMembers = false
    fixture.ranges = []
    fixture.memberIds = []
  })

  it('reads an explicit second page and its referenced crew identity', async () => {
    const page = await listCrewAssignments({ range: { from: 400, to: 799 } })
    expect(page.rows).toHaveLength(1)
    expect(page.rows[0]?.id).toBe('CRW-400')
    expect(page.rows[0]?.name).toBe('Crew Member 400')
    expect(fixture.ranges).toEqual([[400, 799]])
    expect(fixture.memberIds).toEqual(['member-400'])
  })

  it('refuses to fabricate a crew name when the referenced identity is missing', async () => {
    fixture.omitMembers = true
    await expect(listCrewAssignments({ range: { from: 400, to: 799 } })).rejects.toThrow(
      'Crew member lookup incomplete',
    )
  })
})
