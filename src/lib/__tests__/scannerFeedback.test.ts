// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  playScanSound,
  triggerScanVibration,
  triggerVisualScanFlash,
  dispatchScanFeedback,
} from '../scannerFeedback'
import { setAudioFeedbackMuted } from '../acousticFeedback'

describe('scannerFeedback', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setAudioFeedbackMuted(false)
  })

  afterEach(() => {
    vi.useRealTimers()
    const el = document.getElementById('br-scanner-peripheral-flash')
    if (el) el.remove()
  })

  describe('playScanSound', () => {
    it('does not crash when AudioContext is missing', () => {
      expect(() => playScanSound('ok')).not.toThrow()
    })

    it('returns early when audio is muted', () => {
      setAudioFeedbackMuted(true)
      expect(() => playScanSound('ok')).not.toThrow()
    })
  })

  describe('triggerScanVibration', () => {
    it('calls navigator.vibrate when available', () => {
      const vibrateMock = vi.fn()
      // @ts-expect-error mock navigator.vibrate
      navigator.vibrate = vibrateMock

      triggerScanVibration('ok')
      expect(vibrateMock).toHaveBeenCalledWith(60)

      triggerScanVibration('wrong')
      expect(vibrateMock).toHaveBeenCalledWith([120, 60, 120])

      triggerScanVibration('error')
      expect(vibrateMock).toHaveBeenCalledWith([180, 80, 180, 80, 250])
    })
  })

  describe('triggerVisualScanFlash', () => {
    it('creates flash element and dims it after 220ms', () => {
      triggerVisualScanFlash('ok')
      const el = document.getElementById('br-scanner-peripheral-flash')
      expect(el).not.toBeNull()
      expect(el?.style.opacity).toBe('1')

      vi.advanceTimersByTime(220)
      expect(el?.style.opacity).toBe('0')
    })

    it('resets timeout when called rapidly in succession', () => {
      triggerVisualScanFlash('ok')
      const el = document.getElementById('br-scanner-peripheral-flash')
      expect(el?.style.opacity).toBe('1')

      // Call again at 150ms
      vi.advanceTimersByTime(150)
      triggerVisualScanFlash('wrong')
      expect(el?.style.opacity).toBe('1')

      // Advance by 100ms (total 250ms from first call, but only 100ms from second)
      vi.advanceTimersByTime(100)
      expect(el?.style.opacity).toBe('1')

      // Advance another 120ms (now 220ms from second call)
      vi.advanceTimersByTime(120)
      expect(el?.style.opacity).toBe('0')
    })
  })

  describe('dispatchScanFeedback', () => {
    it('triggers all feedback channels without error', () => {
      expect(() => dispatchScanFeedback('ok')).not.toThrow()
    })
  })
})
