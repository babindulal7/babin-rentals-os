import { describe, it, expect } from 'vitest'
import {
  addMonthsToDate,
  daysBetweenDates,
  calculateMembershipCredit,
} from '../membershipCredit'
import { rupees } from '../money'

describe('addMonthsToDate', () => {
  it('adds months across standard years', () => {
    expect(addMonthsToDate('2026-01-01', 12)).toBe('2027-01-01')
    expect(addMonthsToDate('2026-03-15', 6)).toBe('2026-09-15')
  })

  it('clips to last day of short month (e.g. Feb in non-leap year)', () => {
    expect(addMonthsToDate('2026-01-31', 1)).toBe('2026-02-28')
  })

  it('clips leap day to Feb 28 in following non-leap year', () => {
    expect(addMonthsToDate('2028-02-29', 12)).toBe('2029-02-28')
  })
})

describe('daysBetweenDates', () => {
  it('counts 366 days in leap year 2028', () => {
    expect(daysBetweenDates('2028-01-01', '2029-01-01')).toBe(366)
  })

  it('counts 365 days in standard year 2026', () => {
    expect(daysBetweenDates('2026-01-01', '2027-01-01')).toBe(365)
  })

  it('counts exactly 122 days from 2028-09-01 to 2029-01-01', () => {
    expect(daysBetweenDates('2028-09-01', '2029-01-01')).toBe(122)
  })
})

describe('calculateMembershipCredit (Ruling D22)', () => {
  it('worked example: fee Rs 12,000, 4 of 12 months left (122 of 366 days in leap year 2028) yields Rs 4,000 credit', () => {
    const res = calculateMembershipCredit({
      oldFeePaisa: rupees(12000), // 1,200,000 paisa
      oldJoinDate: '2028-01-01',
      oldTermMonths: 12,
      effectiveDate: '2028-09-01',
      newFeePaisa: rupees(20000), // 2,000,000 paisa
    })

    expect(res.daysInOldTerm).toBe(366)
    expect(res.daysLeft).toBe(122)
    expect(res.creditPaisa).toBe(rupees(4000)) // exactly Rs 4,000.00
    expect(res.newFeeDuePaisa).toBe(rupees(16000)) // 20,000 - 4,000
    expect(res.accountCreditPaisa).toBe(0)
    expect(res.termEndDate).toBe('2029-01-01')
  })

  it('downgrade example: credit exceeds new fee, excess goes to account credit (Law 5)', () => {
    // Old plan Rs 20,000, 183 of 366 days left (exactly 1/2 of term) -> Rs 10,000 credit
    // New plan Rs 6,000. Credit 10,000 > 6,000.
    // Fee due = 0. Excess credit = 4,000.
    const res = calculateMembershipCredit({
      oldFeePaisa: rupees(20000),
      oldJoinDate: '2028-01-01',
      oldTermMonths: 12,
      effectiveDate: '2028-07-02',
      newFeePaisa: rupees(6000),
    })

    expect(res.daysInOldTerm).toBe(366)
    expect(res.daysLeft).toBe(183)
    expect(res.creditPaisa).toBe(rupees(10000))
    expect(res.newFeeDuePaisa).toBe(0)
    expect(res.accountCreditPaisa).toBe(rupees(4000))
  })

  it('expired plan: 0 days left yields 0 credit and full new fee due', () => {
    const res = calculateMembershipCredit({
      oldFeePaisa: rupees(12000),
      oldJoinDate: '2025-01-01',
      oldTermMonths: 12,
      effectiveDate: '2026-01-01',
      newFeePaisa: rupees(15000),
    })

    expect(res.daysLeft).toBe(0)
    expect(res.creditPaisa).toBe(0)
    expect(res.newFeeDuePaisa).toBe(rupees(15000))
    expect(res.accountCreditPaisa).toBe(0)
  })

  it('same-day change: full fee is credited toward new fee', () => {
    const res = calculateMembershipCredit({
      oldFeePaisa: rupees(10000),
      oldJoinDate: '2026-05-01',
      oldTermMonths: 12,
      effectiveDate: '2026-05-01',
      newFeePaisa: rupees(18000),
    })

    expect(res.daysLeft).toBe(res.daysInOldTerm)
    expect(res.creditPaisa).toBe(rupees(10000))
    expect(res.newFeeDuePaisa).toBe(rupees(8000))
    expect(res.accountCreditPaisa).toBe(0)
  })
})
