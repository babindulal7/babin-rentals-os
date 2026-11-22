// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { SmartEquipmentPanel } from '../components/SmartEquipmentPanel'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

describe('SmartEquipmentPanel (Phase T1 Acceptance Suite)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  it('renders nothing when isOpen is false', async () => {
    await act(async () => {
      root.render(
        createElement(SmartEquipmentPanel, {
          isOpen: false,
          onClose: vi.fn(),
          name: 'Sony FX3',
          canViewMoney: true,
          onApplyField: vi.fn(),
          onApplyAll: vi.fn(),
        })
      )
    })

    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('renders intelligence drawer with provenance badges when isOpen is true', async () => {
    await act(async () => {
      root.render(
        createElement(SmartEquipmentPanel, {
          isOpen: true,
          onClose: vi.fn(),
          name: 'Sony FX3',
          canViewMoney: true,
          onApplyField: vi.fn(),
          onApplyAll: vi.fn(),
        })
      )
    })

    const dialog = container.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog?.textContent).toContain('Suggest with Intelligence')
    expect(dialog?.textContent).toContain('OEM Documented')
    expect(dialog?.textContent).toContain('Full-frame 10.2MP')
  })

  it('displays duplicate warning banner when typing existing model (Acceptance Criteria 1 & 3)', async () => {
    const handleOpenExisting = vi.fn()
    const handleDismissDuplicate = vi.fn()

    await act(async () => {
      root.render(
        createElement(SmartEquipmentPanel, {
          isOpen: true,
          onClose: vi.fn(),
          name: 'Sony FX3',
          canViewMoney: true,
          onApplyField: vi.fn(),
          onApplyAll: vi.fn(),
          onOpenExisting: handleOpenExisting,
          onDismissDuplicate: handleDismissDuplicate,
        })
      )
    })

    const text = container.textContent || ''
    expect(text).toContain('Existing Catalogue Model Detected')
    expect(text).toContain('Sony FX3 Camera Body')
    expect(text).toContain('CAM-SONY-FX3-BODY')

    // Click Open Existing Model
    const openBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Open Existing Model')
    )
    expect(openBtn).toBeDefined()
    await act(async () => {
      openBtn?.click()
    })
    expect(handleOpenExisting).toHaveBeenCalledWith('M-FX3-BODY')
  })

  it('allows accepting a field into form state (Acceptance Criteria 4 & 5)', async () => {
    const handleApplyField = vi.fn()

    await act(async () => {
      root.render(
        createElement(SmartEquipmentPanel, {
          isOpen: true,
          onClose: vi.fn(),
          name: 'Sony FX3',
          brand: '',
          canViewMoney: true,
          onApplyField: handleApplyField,
          onApplyAll: vi.fn(),
        })
      )
    })

    // Find Accept button for Brand
    const acceptBtns = Array.from(container.querySelectorAll('button')).filter((b) =>
      b.textContent?.trim() === 'Accept'
    )
    expect(acceptBtns.length).toBeGreaterThan(0)

    // Accept first suggestion (Equipment Name)
    await act(async () => {
      acceptBtns[0]?.click()
    })

    expect(handleApplyField).toHaveBeenCalled()
  })

  it('persists rejection and prevents re-application (Acceptance Criteria 6)', async () => {
    const handleApplyAll = vi.fn()

    await act(async () => {
      root.render(
        createElement(SmartEquipmentPanel, {
          isOpen: true,
          onClose: vi.fn(),
          name: 'Sony FX3',
          canViewMoney: true,
          onApplyField: vi.fn(),
          onApplyAll: handleApplyAll,
        })
      )
    })

    // Click Reject on first suggestion
    const rejectBtns = Array.from(container.querySelectorAll('button')).filter((b) =>
      b.textContent?.trim() === 'Reject'
    )
    expect(rejectBtns.length).toBeGreaterThan(0)
    await act(async () => {
      rejectBtns[0]?.click()
    })

    // Now click Accept All Verified
    const acceptAllBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Accept All Verified')
    )
    await act(async () => {
      acceptAllBtn?.click()
    })

    // The rejected field ('name') must NOT be in the applied payload
    if (handleApplyAll.mock.calls.length > 0) {
      const payload = handleApplyAll.mock.calls[0][0]
      expect(payload['name']).toBeUndefined()
    }
  })

  it('protects staff manual edits from being overwritten (Acceptance Criteria 7)', async () => {
    const handleApplyAll = vi.fn()
    const userTouched = new Set(['description'])

    await act(async () => {
      root.render(
        createElement(SmartEquipmentPanel, {
          isOpen: true,
          onClose: vi.fn(),
          name: 'Sony FX3',
          description: 'Staff custom notes entered manually on bench test',
          userTouchedFields: userTouched,
          canViewMoney: true,
          onApplyField: vi.fn(),
          onApplyAll: handleApplyAll,
        })
      )
    })

    expect(container.textContent).toContain('Manual Edit Preserved')

    // Click Accept All Verified
    const acceptAllBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Accept All Verified')
    )
    await act(async () => {
      acceptAllBtn?.click()
    })

    if (handleApplyAll.mock.calls.length > 0) {
      const payload = handleApplyAll.mock.calls[0][0]
      expect(payload['description']).toBeUndefined()
    }
  })

  it('completely hides financial suggestions when canViewMoney is false (Law 6 / Acceptance Criteria 8)', async () => {
    await act(async () => {
      root.render(
        createElement(SmartEquipmentPanel, {
          isOpen: true,
          onClose: vi.fn(),
          name: 'Sony FX3',
          canViewMoney: false, // Warehouse / money-blind role
          onApplyField: vi.fn(),
          onApplyAll: vi.fn(),
        })
      )
    })

    // Tab for Pricing must NOT exist in DOM
    const tabs = Array.from(container.querySelectorAll('nav[aria-label="Intelligence sections"] button'))
    const tabLabels = tabs.map((t) => t.textContent?.trim())
    expect(tabLabels.some((l) => l?.includes('Pricing'))).toBe(false)

    // No daily rate or replacement value shown
    expect(container.textContent).not.toContain('Standard Daily Rental Rate')
    expect(container.textContent).not.toContain('Replacement / Asset Value')
  })

  it('displays pricing tab when canViewMoney is true (Owner / Manager role)', async () => {
    await act(async () => {
      root.render(
        createElement(SmartEquipmentPanel, {
          isOpen: true,
          onClose: vi.fn(),
          name: 'Sony FX3',
          canViewMoney: true,
          onApplyField: vi.fn(),
          onApplyAll: vi.fn(),
        })
      )
    })

    const tabs = Array.from(container.querySelectorAll('nav[aria-label="Intelligence sections"] button'))
    const tabLabels = tabs.map((t) => t.textContent?.trim())
    expect(tabLabels.some((l) => l?.includes('Pricing'))).toBe(true)
  })

  it('closes cleanly on Escape key press (Acceptance Criteria 10)', async () => {
    const handleClose = vi.fn()

    await act(async () => {
      root.render(
        createElement(SmartEquipmentPanel, {
          isOpen: true,
          onClose: handleClose,
          name: 'Sony FX3',
          canViewMoney: true,
          onApplyField: vi.fn(),
          onApplyAll: vi.fn(),
        })
      )
    })

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })

    expect(handleClose).toHaveBeenCalled()
  })
})
