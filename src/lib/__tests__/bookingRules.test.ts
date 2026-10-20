// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { getAllowOverbooking, setAllowOverbooking } from '../bookingRules'

describe('bookingRules — allowOverbooking toggle', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('defaults to false when unset', () => {
    expect(getAllowOverbooking()).toBe(false)
  })

  it('persists true when enabled', () => {
    setAllowOverbooking(true)
    expect(getAllowOverbooking()).toBe(true)
    expect(localStorage.getItem('br.bookingRules.allowOverbooking')).toBe('true')
  })

  it('persists false when disabled', () => {
    setAllowOverbooking(true)
    setAllowOverbooking(false)
    expect(getAllowOverbooking()).toBe(false)
    expect(localStorage.getItem('br.bookingRules.allowOverbooking')).toBe('false')
  })
})
