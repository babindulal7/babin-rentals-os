import { describe, it, expect, vi } from 'vitest'

const { setParamsMock } = vi.hoisted(() => ({
  setParamsMock: vi.fn(),
}))

vi.mock('react', () => ({
  useMemo: <T,>(fn: () => T) => fn(),
}))

vi.mock('react-router-dom', () => ({
  useSearchParams: () => [new URLSearchParams('from=2026-11-10&to=2026-11-10'), setParamsMock],
}))

import { dayValue, startOfDayUtc, addDaysUtc, useRentalWindowParams } from '../rentalWindowParams'

describe('rentalWindowParams', () => {
  it('formats and advances UTC day strings', () => {
    expect(dayValue('2026-11-10T00:00:00.000Z')).toBe('2026-11-10')
    expect(startOfDayUtc('2026-11-10')).toBe('2026-11-10T00:00:00.000Z')
    expect(addDaysUtc('2026-11-10T00:00:00.000Z', 3)).toBe('2026-11-13T00:00:00.000Z')
  })

  it('enforces a minimum 1-day half-open window when URL to <= from and updates search params', () => {
    const onChange = vi.fn()
    const res = useRentalWindowParams(onChange)

    expect(res.window).toEqual({
      fromAd: '2026-11-10T00:00:00.000Z',
      toAd: '2026-11-11T00:00:00.000Z',
    })
    expect(res.search).toBe('?from=2026-11-10&to=2026-11-11')

    res.setWindow('to', '2026-11-14')
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(setParamsMock).toHaveBeenCalledTimes(1)
  })
})
