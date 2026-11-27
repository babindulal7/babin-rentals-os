import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('react', () => ({
  useState: (init: boolean | (() => boolean)) => [typeof init === 'function' ? init() : init, vi.fn()],
  useEffect: () => {},
}))

import { useNetwork } from '../network'

describe('useNetwork', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reads navigator.onLine when available', () => {
    vi.stubGlobal('navigator', { onLine: true })
    expect(useNetwork()).toBe(true)

    vi.stubGlobal('navigator', { onLine: false })
    expect(useNetwork()).toBe(false)
  })
})
