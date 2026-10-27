import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { BarcodeBurstDetector } from '../barcodeBurst'

describe('BarcodeBurstDetector (T2-09)', () => {
  let detector: BarcodeBurstDetector
  let onScan: ReturnType<typeof vi.fn>
  let virtualTime = 100000
  let nowSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    virtualTime = 100000
    nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => virtualTime)
    onScan = vi.fn()
    detector = new BarcodeBurstDetector({
      onScan,
      minChars: 3,
      maxIntervalMs: 50,
      cooldownMs: 1000,
    })
  })

  afterEach(() => {
    nowSpy.mockRestore()
  })

  function simulateKeystrokeBurst(
    detectorInstance: BarcodeBurstDetector,
    chars: string,
    intervalMs = 15,
    endWithEnter = true
  ) {
    for (const char of chars) {
      detectorInstance.handleKeyDown({
        key: char,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        ctrlKey: false,
        metaKey: false,
        altKey: false,
      } as unknown as KeyboardEvent)
      virtualTime += intervalMs
    }

    if (endWithEnter) {
      const preventDefault = vi.fn()
      const stopPropagation = vi.fn()
      detectorInstance.handleKeyDown({
        key: 'Enter',
        preventDefault,
        stopPropagation,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
      } as unknown as KeyboardEvent)
    }
  }

  it('detects a rapid hardware barcode scanner burst (<50ms per key) ending in Enter', () => {
    simulateKeystrokeBurst(detector, 'CAM-FX3-001', 10, true)
    expect(onScan).toHaveBeenCalledTimes(1)
    expect(onScan).toHaveBeenCalledWith('CAM-FX3-001')
  })

  it('ignores slow human typing (e.g. 150ms per key) ending in Enter', () => {
    simulateKeystrokeBurst(detector, 'CAM-FX3-001', 200, true)
    expect(onScan).not.toHaveBeenCalled()
  })

  it('rejects bursts shorter than minChars', () => {
    simulateKeystrokeBurst(detector, 'AB', 10, true)
    expect(onScan).not.toHaveBeenCalled()
  })

  it('prevents double submits: suppresses exact duplicate scan within cooldown window', () => {
    // First scan
    simulateKeystrokeBurst(detector, 'LENS-2470-09', 10, true)
    expect(onScan).toHaveBeenCalledTimes(1)
    expect(onScan).toHaveBeenLastCalledWith('LENS-2470-09')

    // Immediate duplicate scan 300ms later (scanner trigger double-pull)
    virtualTime += 300
    simulateKeystrokeBurst(detector, 'LENS-2470-09', 10, true)
    expect(onScan).toHaveBeenCalledTimes(1) // suppressed!

    // Duplicate scan after cooldown (1500ms later)
    virtualTime += 1500
    simulateKeystrokeBurst(detector, 'LENS-2470-09', 10, true)
    expect(onScan).toHaveBeenCalledTimes(2) // accepted after cooldown
  })

  it('accepts consecutive scans of DIFFERENT items with zero delay between them', () => {
    simulateKeystrokeBurst(detector, 'UNIT-AAA-1', 10, true)
    expect(onScan).toHaveBeenCalledWith('UNIT-AAA-1')

    virtualTime += 200
    simulateKeystrokeBurst(detector, 'UNIT-BBB-2', 10, true)
    expect(onScan).toHaveBeenCalledWith('UNIT-BBB-2')

    expect(onScan).toHaveBeenCalledTimes(2)
  })

  it('acceptance test: reliably captures 50 serials scanned in a row with no missed or doubled scans', () => {
    for (let i = 1; i <= 50; i++) {
      const code = `SN-2026-${String(i).padStart(4, '0')}`
      virtualTime += 100
      simulateKeystrokeBurst(detector, code, 12, true)
    }

    expect(onScan).toHaveBeenCalledTimes(50)
    for (let i = 1; i <= 50; i++) {
      const expectedCode = `SN-2026-${String(i).padStart(4, '0')}`
      expect(onScan).toHaveBeenNthCalledWith(i, expectedCode)
    }
  })

  it('focus trap: redirects focus to target input when scanner burst begins', () => {
    const focusFn = vi.fn()
    const targetInput = { focus: focusFn } as unknown as HTMLInputElement
    const targetRef = { current: targetInput }

    const trappedDetector = new BarcodeBurstDetector({
      onScan,
      minChars: 3,
      targetInputRef: targetRef,
    })

    const event = {
      key: 'S',
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    } as unknown as KeyboardEvent

    trappedDetector.handleKeyDown(event)
    trappedDetector.handleKeyDown({ ...event, key: 'N' } as unknown as KeyboardEvent)

    expect(focusFn).toHaveBeenCalled()
  })
})
