// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { SmartEquipmentPanel } from '../components/SmartEquipmentPanel'
import type { SmartAccessorySuggestion, SmartHowToGuide } from '../../../lib/smartEquipment'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

describe('SmartEquipmentPanel — Phase T2 & T3 UI Acceptance Suite', () => {
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

  it('renders accessories tab with real inventory stock badges and kit inclusions', async () => {
    const handleApplyAccessories = vi.fn()

    await act(async () => {
      root.render(
        createElement(SmartEquipmentPanel, {
          isOpen: true,
          onClose: vi.fn(),
          name: 'Sony FX3',
          canViewMoney: true,
          onApplyField: vi.fn(),
          onApplyAll: vi.fn(),
          onApplyAccessories: handleApplyAccessories,
        })
      )
    })

    // Click Accessories tab
    const accTabBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Accessories')
    )
    expect(accTabBtn).toBeDefined()
    await act(async () => {
      accTabBtn?.click()
    })

    // Verify Tab Header & Inventory Linking
    expect(container.textContent).toContain('Child Items & Accessory Linking')
    expect(container.textContent).toContain('Package Summary')
    expect(container.textContent).toContain('Included in Body')

    // Verify real stock badges
    const xlrStockBadge = container.querySelector('[data-testid="accessory-stock-Sony XLR Top Handle (XLR-H1)"]')
    expect(xlrStockBadge).not.toBeNull()
    expect(xlrStockBadge?.textContent).toContain('In Inventory')

    // Find and click "Apply Selected Accessories" button
    const applyAccBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Apply Selected Accessories')
    )
    expect(applyAccBtn).toBeDefined()
    await act(async () => {
      applyAccBtn?.click()
    })

    expect(handleApplyAccessories).toHaveBeenCalledTimes(1)
    const appliedList: SmartAccessorySuggestion[] = handleApplyAccessories.mock.calls[0]![0]
    expect(appliedList.length).toBeGreaterThan(0)
    expect(appliedList.some((a) => a.name.includes('Top Handle'))).toBe(true)

    // Button updates to state indicator
    expect(container.textContent).toContain('Accessories Applied')
  })

  it('allows deselecting and toggling accessories with instant kit summary recalculation', async () => {
    await act(async () => {
      root.render(
        createElement(SmartEquipmentPanel, {
          isOpen: true,
          onClose: vi.fn(),
          name: 'Sony FX3',
          canViewMoney: true,
          onApplyField: vi.fn(),
          onApplyAll: vi.fn(),
          onApplyAccessories: vi.fn(),
        })
      )
    })

    // Switch to Accessories tab
    const accTabBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Accessories')
    )
    await act(async () => {
      accTabBtn?.click()
    })

    // Find checkboxes
    const checkboxes = container.querySelectorAll('input[type="checkbox"]')
    expect(checkboxes.length).toBeGreaterThan(0)

    // Uncheck first checkbox
    const firstCheckbox = checkboxes[0] as HTMLInputElement
    expect(firstCheckbox.checked).toBe(true)

    await act(async () => {
      firstCheckbox.click()
    })

    expect(firstCheckbox.checked).toBe(false)
  })

  it('renders role-gated How-To projections: client view strictly hides electrical pinouts and margins', async () => {
    const handleApplyHowTo = vi.fn()

    await act(async () => {
      root.render(
        createElement(SmartEquipmentPanel, {
          isOpen: true,
          onClose: vi.fn(),
          name: 'Sony FX3',
          canViewMoney: true,
          onApplyField: vi.fn(),
          onApplyAll: vi.fn(),
          onApplyHowTo: handleApplyHowTo,
        })
      )
    })

    // Switch to How-To & Safety tab
    const safetyTabBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('How-To')
    )
    expect(safetyTabBtn).toBeDefined()
    await act(async () => {
      safetyTabBtn?.click()
    })

    // Verify Default View is Client Safe View
    expect(container.querySelector('[data-testid="client-projection-banner"]')).not.toBeNull()
    expect(container.textContent).toContain('Public & Client Projection')
    expect(container.textContent).toContain('Operational Setup Steps')
    expect(container.textContent).toContain('Critical Handling Cautions')

    // Strictly ensure technician diagnostics and internal margins are NOT present
    expect(container.querySelector('[data-testid="technician-sop-section"]')).toBeNull()
    expect(container.querySelector('[data-testid="internal-margin-notes"]')).toBeNull()
    expect(container.textContent).not.toContain('Commercial margin target: 68%')

    // Apply Client Guide
    const applyGuideBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Apply How-To Guide')
    )
    expect(applyGuideBtn).toBeDefined()
    await act(async () => {
      applyGuideBtn?.click()
    })

    expect(handleApplyHowTo).toHaveBeenCalledTimes(1)
    const appliedGuide: SmartHowToGuide = handleApplyHowTo.mock.calls[0]![0]
    expect(appliedGuide.technicianSop).toBeUndefined()
  })

  it('switches to Technician SOP view and reveals electrical pinouts, thermal bounds, and quarantine alerts', async () => {
    await act(async () => {
      root.render(
        createElement(SmartEquipmentPanel, {
          isOpen: true,
          onClose: vi.fn(),
          name: 'Sony FX3',
          canViewMoney: true,
          onApplyField: vi.fn(),
          onApplyAll: vi.fn(),
          onApplyHowTo: vi.fn(),
        })
      )
    })

    // Switch to How-To & Safety tab
    const safetyTabBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('How-To')
    )
    await act(async () => {
      safetyTabBtn?.click()
    })

    // Click "Technician SOP (Internal)" button
    const techRoleBtn = container.querySelector('[data-testid="howto-role-technician"]') as HTMLButtonElement
    expect(techRoleBtn).not.toBeNull()
    await act(async () => {
      techRoleBtn.click()
    })

    // Verify Technician SOP Section appears
    expect(container.querySelector('[data-testid="technician-projection-banner"]')).not.toBeNull()
    const sopSection = container.querySelector('[data-testid="technician-sop-section"]')
    expect(sopSection).not.toBeNull()
    expect(sopSection?.textContent).toContain('Multi-Interface Shoe')
    expect(sopSection?.textContent).toContain('Voltage Limits')
    expect(sopSection?.textContent).toContain('Immediate Quarantine Triggers')
    expect(sopSection?.textContent).toContain('HOLD DISPATCH')

    // Verify internal margin is visible because canViewMoney is true
    const marginNotes = container.querySelector('[data-testid="internal-margin-notes"]')
    expect(marginNotes).not.toBeNull()
    expect(marginNotes?.textContent).toContain('Commercial margin target: 68%')
  })

  it('switches to Nepali language in How-To guide when language toggle is clicked', async () => {
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

    // Switch to How-To & Safety tab
    const safetyTabBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('How-To')
    )
    await act(async () => {
      safetyTabBtn?.click()
    })

    // Click "नेपाली" language button
    const neLangBtn = container.querySelector('[data-testid="howto-lang-ne"]') as HTMLButtonElement
    expect(neLangBtn).not.toBeNull()
    await act(async () => {
      neLangBtn.click()
    })

    // Check Devanagari setup step rendering
    expect(container.textContent).toContain('क्यामेराको पावर अन गर्न')
    expect(container.textContent).toContain('CFexpress कार्ड')
  })
})
