// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

const { mockResolveScannedCode, mockLookupItemCard } = vi.hoisted(() => ({
  mockResolveScannedCode: vi.fn(),
  mockLookupItemCard: vi.fn(),
}))

vi.mock('../../../lib/scannerLookup', () => ({
  resolveScannedCode: (code: string) => mockResolveScannedCode(code),
  lookupItemCard: (...args: unknown[]) => mockLookupItemCard(...args),
  lookupItemBarcode: vi.fn(),
  lookupClientBarcode: vi.fn(),
}))

vi.mock('@zxing/browser', () => ({
  BrowserMultiFormatReader: class {
    decodeFromVideoDevice = vi.fn().mockReturnValue(new Promise(() => {}))
  },
}))

vi.mock('../../../lib/device', () => ({
  useViewport: () => 'desktop',
}))

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u-1', role: 'Owner', email: 'owner@example.com' },
    loading: false,
  }),
}))

vi.mock('../../../lib/moneyVisibility', () => ({
  useCanViewMoney: () => true,
}))

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        or: () => ({
          maybeSingle: async () => ({ data: null }),
        }),
      }),
    }),
  },
}))

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const { default: ScannerFab, toggleScanner } = await import('../ScannerFab')

describe('ScannerFab — UX-01 Floor Scan Outcome vs Item Recognition', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.clearAllMocks()
    window.history.pushState({}, '', '/rentals/BK-1001/packing')
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount()
      })
    }
    host?.remove()
    document.body.innerHTML = ''
  })

  it('contains a permanent sr-only aria-live polite status region', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/rentals/BK-1001/packing']}>
          <ScannerFab />
        </MemoryRouter>
      )
    })

    const liveRegion = host.querySelector<HTMLDivElement>('.sr-only[role="status"][aria-live="polite"]')
    expect(liveRegion).not.toBeNull()
    expect(liveRegion?.getAttribute('aria-atomic')).toBe('true')
  })

  it('dispatches to active workspace input when present on floor route', async () => {
    // Simulate workspace ambient input and submit form
    const form = document.createElement('form')
    const workspaceInput = document.createElement('input')
    workspaceInput.className = 'floor-scanner-input'
    const onSubmit = vi.fn((e: Event) => e.preventDefault())
    form.addEventListener('submit', onSubmit)
    form.appendChild(workspaceInput)
    document.body.appendChild(form)

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/rentals/BK-1001/packing']}>
          <ScannerFab />
        </MemoryRouter>
      )
    })

    // Open scanner dialog
    await act(async () => {
      toggleScanner()
    })

    const manualInput = host.querySelector<HTMLInputElement>('input[placeholder*="Type code"]')
    expect(manualInput).not.toBeNull()

    // Trigger scan of SONY-FX3-01
    await act(async () => {
      if (manualInput) {
        manualInput.value = 'SONY-FX3-01'
        manualInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      }
    })

    // Assert workspace input received the value and form was submitted
    expect(workspaceInput.value).toBe('SONY-FX3-01')
    expect(onSubmit).toHaveBeenCalled()

    // Feedback shows dispatched
    const liveRegion = host.querySelector<HTMLDivElement>('.sr-only[role="status"][aria-live="polite"]')
    expect(liveRegion?.textContent).toContain('Dispatched to active workspace: SONY-FX3-01')

    form.remove()
  })

  it('clearly labels item as recognized without claiming custody write when no active input exists', async () => {
    mockResolveScannedCode.mockResolvedValueOnce({
      status: 'unit_matched',
      code: 'SONY-FX3-01',
      label: 'Sony FX3 Body',
      unitId: 'unit-1',
      serialNo: 'SN-FX3-999',
      assetTag: 'TAG-888',
      productName: 'Sony FX3',
      unitStatus: 'available',
    })

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/rentals/BK-1001/packing']}>
          <ScannerFab />
        </MemoryRouter>
      )
    })

    await act(async () => {
      toggleScanner()
    })

    const manualInput = host.querySelector<HTMLInputElement>('input[placeholder*="Type code"]')
    await act(async () => {
      if (manualInput) {
        manualInput.value = 'SONY-FX3-01'
        manualInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      }
    })

    expect(mockResolveScannedCode).toHaveBeenCalledWith('SONY-FX3-01')

    const liveRegion = host.querySelector<HTMLDivElement>('.sr-only[role="status"][aria-live="polite"]')
    expect(liveRegion?.textContent).toContain('Item recognized — not yet checked in/out: Sony FX3 Body (SN-FX3-999)')
  })

  it('clearly labels product as recognized without claiming custody write', async () => {
    mockResolveScannedCode.mockResolvedValueOnce({
      status: 'product_matched',
      code: 'CAM-FX3',
      label: 'Sony FX3',
      productId: 'p-1',
      assetCode: 'CAM-FX3',
      productName: 'Sony FX3',
    })

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/rentals/BK-1001/packing']}>
          <ScannerFab />
        </MemoryRouter>
      )
    })

    await act(async () => {
      toggleScanner()
    })

    const manualInput = host.querySelector<HTMLInputElement>('input[placeholder*="Type code"]')
    await act(async () => {
      if (manualInput) {
        manualInput.value = 'CAM-FX3'
        manualInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      }
    })

    const liveRegion = host.querySelector<HTMLDivElement>('.sr-only[role="status"][aria-live="polite"]')
    expect(liveRegion?.textContent).toContain('Product recognized — not yet checked in/out: Sony FX3 (CAM-FX3)')
  })

  it('fails closed immediately when device is offline without attempting database query', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/rentals/BK-1001/packing']}>
          <ScannerFab />
        </MemoryRouter>
      )
    })

    await act(async () => {
      toggleScanner()
    })

    const manualInput = host.querySelector<HTMLInputElement>('input[placeholder*="Type code"]')
    await act(async () => {
      if (manualInput) {
        manualInput.value = 'OFFLINE-CODE'
        manualInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      }
    })

    // No DB resolution attempted while offline
    expect(mockResolveScannedCode).not.toHaveBeenCalled()

    const liveRegion = host.querySelector<HTMLDivElement>('.sr-only[role="status"][aria-live="polite"]')
    expect(liveRegion?.textContent).toBe('Offline — scan not recorded: OFFLINE-CODE')
  })

  it('prevents rapid repeated scans and fires duplicate warning', async () => {
    mockResolveScannedCode.mockResolvedValue({
      status: 'unit_matched',
      code: 'REPEAT-01',
      label: 'Cable 10m',
      unitId: 'unit-c',
      serialNo: 'CBL-10',
      assetTag: null,
      productName: 'Cable 10m',
      unitStatus: 'available',
    })

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/rentals/BK-1001/packing']}>
          <ScannerFab />
        </MemoryRouter>
      )
    })

    await act(async () => {
      toggleScanner()
    })

    const manualInput = host.querySelector<HTMLInputElement>('input[placeholder*="Type code"]')

    // First scan
    await act(async () => {
      if (manualInput) {
        manualInput.value = 'REPEAT-01'
        manualInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      }
    })
    expect(mockResolveScannedCode).toHaveBeenCalledTimes(1)

    // Immediate second scan within cooldown
    await act(async () => {
      if (manualInput) {
        manualInput.value = 'REPEAT-01'
        manualInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      }
    })

    // No second resolution
    expect(mockResolveScannedCode).toHaveBeenCalledTimes(1)

    const liveRegion = host.querySelector<HTMLDivElement>('.sr-only[role="status"][aria-live="polite"]')
    expect(liveRegion?.textContent).toBe('REPEAT-01 already scanned — wait 2s')
  })

  it('identifies foreign equipment with wrong-job feedback', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/rentals/BK-1001/packing']}>
          <ScannerFab />
        </MemoryRouter>
      )
    })

    await act(async () => {
      toggleScanner()
    })

    const manualInput = host.querySelector<HTMLInputElement>('input[placeholder*="Type code"]')
    await act(async () => {
      if (manualInput) {
        manualInput.value = 'ERR-WRONG-BOOKING'
        manualInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      }
    })

    const liveRegion = host.querySelector<HTMLDivElement>('.sr-only[role="status"][aria-live="polite"]')
    expect(liveRegion?.textContent).toBe('ERR-WRONG-BOOKING belongs to another job')
  })
})
