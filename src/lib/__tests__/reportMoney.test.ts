import { describe, expect, it } from 'vitest'
import { databaseMoney, reportPaisa } from '../reportMoney'

describe('recorded report amounts', () => {
  it('decodes decimal SQL strings before summing integer paisa', () => {
    expect(databaseMoney('0.10')).toBe(10)
    expect(reportPaisa(databaseMoney('0.10') + databaseMoney('0.20'))).toBe(30)
    expect(databaseMoney('-10.25')).toBe(-1025)
    expect(databaseMoney('1000.00')).toBe(100000)
  })
  it.each([null, undefined, '', 'not available', 'Rs 10', Infinity, '900719925474099.99'])(
    'refuses an unavailable or inexact amount: %s', value => {
      expect(() => databaseMoney(value)).toThrow()
    },
  )
  it('refuses overflowing totals instead of rounding them into business figures', () => {
    expect(() => reportPaisa(Number.MAX_SAFE_INTEGER + 1)).toThrow()
  })
})
