// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { storageAvailable, readLocal, writeLocal, removeLocal, localKeys, onMediaChange } from '../safeStorage'

describe('safeStorage', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.restoreAllMocks()
  })

  it('reads, writes, lists, and removes keys safely', () => {
    expect(storageAvailable()).toBe(true)
    expect(writeLocal('br.test.key', 'value-1')).toBe(true)
    expect(readLocal('br.test.key')).toBe('value-1')
    expect(localKeys()).toContain('br.test.key')
    removeLocal('br.test.key')
    expect(readLocal('br.test.key')).toBeNull()
  })

  it('never throws when localStorage access throws SecurityError or QuotaExceededError', () => {
    const spy = vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError')
    })

    expect(storageAvailable()).toBe(false)
    expect(readLocal('any')).toBeNull()
    expect(writeLocal('any', 'v')).toBe(false)
    expect(localKeys()).toEqual([])
    expect(() => removeLocal('any')).not.toThrow()
    spy.mockRestore()
  })

  it('returns a safe unsubscribe from onMediaChange even when matchMedia is absent', () => {
    const unsub = onMediaChange('(prefers-color-scheme: dark)', () => {})
    expect(typeof unsub).toBe('function')
    expect(() => unsub()).not.toThrow()
  })
})
