/**
 * RULING 2026-10-20: the crew timesheet reads `crew_shoot_days`; it no longer
 * renders five invented staff. These pin the arithmetic (hours from recorded
 * call/wrap minus break), the week boundaries in the business day, and Law 6
 * (a money-blind session gets `null` rate and pay — withheld, never zero — and a
 * CSV with no money columns).
 */
import { describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  days: [] as unknown[],
  bookings: [] as unknown[],
  members: [] as unknown[],
  error: null as string | null,
  calls: [] as string[],
}))

vi.mock('../../supabase', () => {
  const builder = (table: string) => {
    const result = () => {
      if (state.error) return { data: null, error: { message: state.error } }
      const data = table === 'crew_shoot_days' ? state.days : table === 'crew_bookings_v' ? state.bookings : state.members
      return { data, error: null }
    }
    const b: Record<string, unknown> = {}
    b['select'] = () => b
    b['gte'] = (col: string, v: string) => { state.calls.push(`${table}.gte(${col},${v})`); return b }
    b['lte'] = (col: string, v: string) => { state.calls.push(`${table}.lte(${col},${v})`); return b }
    b['in'] = () => b
    b['then'] = (res: (r: unknown) => unknown) => Promise.resolve(result()).then(res)
    return b
  }
  return { supabase: { from: vi.fn((table: string) => builder(table)) }, IS_MOCK: false }
})

const {
  buildTimesheetRows,
  getTimesheetStats,
  listTimesheetWeek,
  shootDayHours,
  timesheetCsv,
  weekRange,
  addDays,
  formatHours,
  hasOvertime,
  STANDARD_DAY_HOURS,
} = await import('../timesheet')

const day = (over: Record<string, unknown> = {}) => ({
  crew_booking_id: 'b1',
  work_date: '2026-10-19', // a Monday
  actual_start: '2026-10-19T03:00:00Z',
  actual_end: '2026-10-19T11:30:00Z', // 8.5h on the clock
  break_minutes: 30,
  submission_state: 'Not Submitted',
  approval_state: 'Pending',
  ...over,
})
const booking = (over: Record<string, unknown> = {}) => ({ id: 'b1', crew_member_id: 'm1', position: 'Gaffer', day_rate: 4000, ...over })
const member = (over: Record<string, unknown> = {}) => ({ id: 'm1', full_name: 'Suman Rai', position: 'Gaffer', ...over })

describe('week arithmetic', () => {
  it('a Wednesday sits in the Monday–Sunday week that starts on the 19th', () => {
    // 2026-10-21 06:00 UTC = 11:45 in Kathmandu, still Wednesday.
    const r = weekRange('This Week', new Date('2026-10-21T06:00:00Z'))
    expect(r).toEqual({ start: '2026-10-19', end: '2026-10-25', today: '2026-10-21' })
    expect(weekRange('Last Week', new Date('2026-10-21T06:00:00Z'))).toEqual({ start: '2026-10-12', end: '2026-10-18', today: '2026-10-21' })
  })

  it('uses the Kathmandu day, not the browser day, at the week boundary', () => {
    // 2026-10-25 19:00 UTC is already Monday the 26th in Kathmandu (UTC+5:45).
    expect(weekRange('This Week', new Date('2026-10-25T19:00:00Z')).start).toBe('2026-10-26')
  })

  it('addDays crosses month ends', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02')
  })
})

describe('hours', () => {
  it('is call to wrap minus the break', () => {
    expect(shootDayHours(day())).toBe(8)
  })

  it('is 0 when either end is not recorded — never a guess from the plan', () => {
    expect(shootDayHours(day({ actual_end: null }))).toBe(0)
    expect(shootDayHours(day({ actual_start: null }))).toBe(0)
  })

  it('never goes negative on a break longer than the shift', () => {
    expect(shootDayHours(day({ break_minutes: 999 }))).toBe(0)
  })

  it('formats without trailing zeros', () => {
    expect([formatHours(8), formatHours(8.5), formatHours(7.333)]).toEqual(['8', '8.5', '7.3'])
  })
})

describe('buildTimesheetRows', () => {
  it('puts each day in its own column and totals the week', () => {
    const rows = buildTimesheetRows(
      [day(), day({ work_date: '2026-10-21' })],
      [booking()],
      [member()],
      '2026-10-19',
      '2026-10-25',
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]!.hrs).toEqual([8, 0, 8, 0, 0, 0, 0])
    expect(rows[0]!.totalHrs).toBe(16)
    expect(rows[0]!.name).toBe('Suman Rai')
    expect(rows[0]!.role).toBe('Gaffer')
  })

  it('sums two bookings on the same day and prices each at its own rate', () => {
    const rows = buildTimesheetRows(
      [day(), day({ crew_booking_id: 'b2' })],
      [booking(), booking({ id: 'b2', day_rate: 8000 })],
      [member()],
      '2026-10-19',
      '2026-10-25',
    )
    expect(rows[0]!.hrs[0]).toBe(16)
    // 8h × 4000/8 + 8h × 8000/8
    expect(rows[0]!.pay).toBe(4000 + 8000)
  })

  it('estimates pay as hours × day rate ÷ the standard day', () => {
    const [row] = buildTimesheetRows([day()], [booking({ day_rate: 4000 })], [member()], '2026-10-19', '2026-10-25')
    expect(STANDARD_DAY_HOURS).toBe(8)
    expect(row!.pay).toBe(4000)
    expect(row!.rate).toBe(4000)
  })

  it('withholds rate and pay (null, not 0) when the view masked the day rate', () => {
    const [row] = buildTimesheetRows([day()], [booking({ day_rate: null })], [member()], '2026-10-19', '2026-10-25')
    expect(row!.rate).toBeNull()
    expect(row!.pay).toBeNull()
    expect(row!.totalHrs).toBe(8) // hours are not money
  })

  it('leaves out days outside the week and days on a booking with no crew member', () => {
    const rows = buildTimesheetRows(
      [day({ work_date: '2026-10-18' }), day({ work_date: '2026-10-26' }), day({ crew_booking_id: 'open' })],
      [booking(), booking({ id: 'open', crew_member_id: null })],
      [member()],
      '2026-10-19',
      '2026-10-25',
    )
    expect(rows).toEqual([])
  })

  it('counts past shoot days with no recorded times, but not future ones', () => {
    const rows = buildTimesheetRows(
      [
        day({ actual_start: null, actual_end: null }), // Mon, past
        day({ work_date: '2026-10-20', actual_start: null, actual_end: null }), // Tue, today
        day({ work_date: '2026-10-23', actual_start: null, actual_end: null }), // Fri, future
      ],
      [booking()],
      [member()],
      '2026-10-19',
      '2026-10-20',
    )
    expect(rows[0]!.unrecordedDays).toBe(2)
  })

  it('summarises the payout gate: all approved / any submitted / none submitted', () => {
    const approved = { submission_state: 'Submitted', approval_state: 'Approved' }
    const submitted = { submission_state: 'Submitted', approval_state: 'Pending' }
    const approval = (days: unknown[]) =>
      buildTimesheetRows(days as never, [booking()], [member()], '2026-10-19', '2026-10-25')[0]!.approval
    expect(approval([day(approved), day({ work_date: '2026-10-20', ...approved })])).toBe('Approved')
    expect(approval([day(approved), day({ work_date: '2026-10-20', ...submitted })])).toBe('Awaiting approval')
    expect(approval([day()])).toBe('Not submitted')
  })

  it('flags overtime past the standard day', () => {
    const [row] = buildTimesheetRows(
      [day({ actual_end: '2026-10-19T14:30:00Z' })], // 11.5h − 0.5h break = 11h
      [booking()],
      [member()],
      '2026-10-19',
      '2026-10-25',
    )
    expect(hasOvertime(row!)).toBe(true)
  })

  it('sorts by name', () => {
    const rows = buildTimesheetRows(
      [day(), day({ crew_booking_id: 'b2' })],
      [booking(), booking({ id: 'b2', crew_member_id: 'm2' })],
      [member({ full_name: 'Zed' }), member({ id: 'm2', full_name: 'Asha' })],
      '2026-10-19',
      '2026-10-25',
    )
    expect(rows.map((r) => r.name)).toEqual(['Asha', 'Zed'])
  })
})

describe('getTimesheetStats', () => {
  it('has no pay total at all when every row is money-blind', () => {
    const rows = buildTimesheetRows([day()], [booking({ day_rate: null })], [member()], '2026-10-19', '2026-10-25')
    expect(getTimesheetStats(rows).totalPay).toBeNull()
  })

  it('totals hours, pay, who logged, and overtime', () => {
    const rows = buildTimesheetRows([day()], [booking()], [member()], '2026-10-19', '2026-10-25')
    expect(getTimesheetStats(rows)).toEqual({ totalHours: 8, totalPay: 4000, staffLogged: 1, totalStaff: 1, overtimeFlags: 0 })
  })
})

describe('timesheetCsv', () => {
  const rows = buildTimesheetRows([day()], [booking()], [member({ full_name: 'Suman "Gaffer" Rai' })], '2026-10-19', '2026-10-25')

  it('carries day rate and estimated pay only for a money-sighted session', () => {
    const money = timesheetCsv(rows, true)
    expect(money.columns).toEqual(expect.arrayContaining(['Day rate (Rs)', 'Estimated pay (Rs)']))
    expect(money.text).toContain('4000')
    const blind = timesheetCsv(rows, false)
    expect(blind.columns).not.toContain('Day rate (Rs)')
    expect(blind.columns).not.toContain('Estimated pay (Rs)')
    expect(blind.text).not.toContain('4000')
  })

  it('quotes a name with a quote in it', () => {
    expect(timesheetCsv(rows, false).text).toContain('"Suman ""Gaffer"" Rai"')
  })
})

describe('listTimesheetWeek', () => {
  it('queries the business week and builds rows from the three reads', async () => {
    state.error = null
    state.calls = []
    state.days = [day()]
    state.bookings = [booking()]
    state.members = [member()]
    const res = await listTimesheetWeek('This Week', new Date('2026-10-21T06:00:00Z'))
    expect(state.calls).toEqual(['crew_shoot_days.gte(work_date,2026-10-19)', 'crew_shoot_days.lte(work_date,2026-10-25)'])
    expect(res.total).toBe(1)
    expect(res.rows[0]!.totalHrs).toBe(8)
  })

  it('returns an honest empty week when there are no shoot days', async () => {
    state.error = null
    state.days = []
    expect(await listTimesheetWeek('This Week')).toEqual({ rows: [], total: 0 })
  })

  it('throws the database reason so PageBody can show it', async () => {
    state.error = 'permission denied'
    await expect(listTimesheetWeek('This Week')).rejects.toThrow('listTimesheetWeek failed: permission denied')
    state.error = null
  })
})
