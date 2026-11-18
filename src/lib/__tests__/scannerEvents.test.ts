// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import {
  toggleScanner,
  openItemCard,
  registerScannerToggleListener,
  registerItemCardListener,
} from '../scannerEvents'

describe('ScannerFab lazy-load event preservation', () => {
  it('replays a scan tap made before lazy ScannerFab registers', () => {
    toggleScanner()
    const onToggle = vi.fn()
    const unsubscribe = registerScannerToggleListener(onToggle)
    expect(onToggle).toHaveBeenCalledTimes(1)
    unsubscribe()
  })

  it('keeps toggle parity while the scanner chunk is pending', () => {
    toggleScanner()
    toggleScanner()
    const onToggle = vi.fn()
    const unsubscribe = registerScannerToggleListener(onToggle)
    expect(onToggle).not.toHaveBeenCalled()
    toggleScanner()
    expect(onToggle).toHaveBeenCalledTimes(1)
    unsubscribe()
  })

  it('replays the last item-card request after lazy component mount', () => {
    openItemCard('FX3-SERIAL-01')
    openItemCard('FX3-SERIAL-02')
    const onCard = vi.fn()
    const unsubscribe = registerItemCardListener(onCard)
    expect(onCard).toHaveBeenCalledTimes(1)
    expect((onCard.mock.calls[0]?.[0] as CustomEvent<{ code: string }>).detail.code).toBe('FX3-SERIAL-02')
    openItemCard('KOMODO-03')
    expect(onCard).toHaveBeenCalledTimes(2)
    expect((onCard.mock.calls[1]?.[0] as CustomEvent<{ code: string }>).detail.code).toBe('KOMODO-03')
    unsubscribe()
  })

  it('does not queue empty card requests', () => {
    openItemCard('  ')
    const onCard = vi.fn()
    const unsubscribe = registerItemCardListener(onCard)
    expect(onCard).not.toHaveBeenCalled()
    unsubscribe()
  })
})
