// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  EQUIPMENT_STAGES,
  getEquipmentStageState,
  EquipmentWizardStepper,
  UnitBarcodeModal,
  EquipmentCatalogPreviewModal,
} from '../equipmentAssist'
import type { RecordValues } from '../../../lib/recordEditor'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

describe('equipmentAssist — 5-Stage Precision Cinema Equipment Intake', () => {
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

  it('defines 5 clear sequential operational stages', () => {
    expect(EQUIPMENT_STAGES).toHaveLength(5)
    expect(EQUIPMENT_STAGES.map((s) => s.shortName)).toEqual([
      'Basic Info',
      'Structure',
      'Pricing & Terms',
      'Relationships',
      'Review & Save',
    ])
  })

  it('correctly calculates stage 1 completion', () => {
    const values: RecordValues = {
      name: 'Sony FX3',
      category_id: 'cat-camera',
      brand: 'Sony',
      tracking_mode: 'Serialised',
    }
    const rows: RecordValues[] = [
      { serial_no: 'SN-001', warehouse_id: 'wh-1' },
    ]
    const stage1 = getEquipmentStageState(1, values, rows, true, {})
    expect(stage1.state).toBe('complete')
  })

  it('marks stage 1 as todo when name or category is missing', () => {
    const values: RecordValues = {
      name: '',
      category_id: '',
      brand: 'Sony',
      tracking_mode: 'Serialised',
    }
    const rows: RecordValues[] = []
    const stage1 = getEquipmentStageState(1, values, rows, true, {})
    expect(stage1.state).toBe('todo')
    expect(stage1.label).toBe('Required')
  })

  it('enforces money-blind RBAC in Stage 3 (Pricing)', () => {
    const values: RecordValues = {
      name: 'Sony FX3',
      tracking_mode: 'Serialised',
      daily_rate: '',
    }
    const rows: RecordValues[] = []
    // When canViewMoney is false (Warehouse, Technician), Stage 3 is complete with 'RBAC Blind'
    const stage3Blind = getEquipmentStageState(3, values, rows, false, {})
    expect(stage3Blind.state).toBe('complete')
    expect(stage3Blind.label).toBe('RBAC Blind')

    // When canViewMoney is true (Owner, Admin), daily rate is required
    const stage3Privileged = getEquipmentStageState(3, values, rows, true, {})
    expect(stage3Privileged.state).toBe('todo')
  })

  it('renders EquipmentWizardStepper with all 5 steps and mode toggle', async () => {
    const onSelectStage = vi.fn()
    const onToggleWizardMode = vi.fn()

    await act(async () => {
      root.render(
        createElement(EquipmentWizardStepper, {
          currentStage: 1,
          onSelectStage,
          wizardMode: true,
          onToggleWizardMode,
          values: { tracking_mode: 'Serialised' },
          rows: [],
          canViewMoney: true,
          errors: {},
        })
      )
    })

    const nav = container.querySelector('nav[aria-label="Add Equipment 5 Stages"]')
    expect(nav).not.toBeNull()
    expect(container.textContent).toContain('Basic Info')
    expect(container.textContent).toContain('Structure')
    expect(container.textContent).toContain('Review & Save')

    const stepButtons = container.querySelectorAll('.equipment-wizard-step')
    expect(stepButtons.length).toBe(5)

    // Click step 2
    await act(async () => {
      const step2Btn = stepButtons[1] as HTMLButtonElement
      step2Btn.click()
    })
    expect(onSelectStage).toHaveBeenCalledWith(2)

    // Toggle mode
    const allSectionsBtn = container.querySelectorAll('.equipment-mode-btn')[1] as HTMLButtonElement
    await act(async () => {
      allSectionsBtn.click()
    })
    expect(onToggleWizardMode).toHaveBeenCalledWith(false)
  })

  it('renders UnitBarcodeModal with Code128 SVG and unit metadata', async () => {
    const onClose = vi.fn()
    await act(async () => {
      root.render(
        createElement(UnitBarcodeModal, {
          isOpen: true,
          unit: { serial_no: 'SN-FX3-999', asset_tag: 'EQ-CAM-01', condition: 'Excellent' },
          index: 0,
          assetCode: 'EQ-CAM',
          equipmentName: 'Sony FX3 Cinema Body',
          onClose,
        })
      )
    })

    const dialog = container.querySelector('div[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(container.textContent).toContain('Unit Barcode & Tag')
    expect(container.textContent).toContain('SN-FX3-999')
    expect(container.textContent).toContain('EQ-CAM-01')

    const buttons = Array.from(container.querySelectorAll('button'))
    const doneBtn = buttons.find((b) => b.textContent?.includes('Done'))
    expect(doneBtn).toBeDefined()
    await act(async () => {
      doneBtn?.click()
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('renders EquipmentCatalogPreviewModal and hides rates when money-blind', async () => {
    const onClose = vi.fn()
    await act(async () => {
      root.render(
        createElement(EquipmentCatalogPreviewModal, {
          isOpen: true,
          values: {
            name: 'Sony FX3',
            brand: 'Sony',
            model: 'ILME-FX3',
            tracking_mode: 'Serialised',
            daily_rate: 4500,
          },
          rows: [{ serial_no: 'SN-1' }, { serial_no: 'SN-2' }],
          categoryName: 'Cinema Cameras',
          assetCode: 'EQ-CAM-001',
          canViewMoney: false,
          imagePreviewUrl: null,
          onClose,
        })
      )
    })

    expect(container.textContent).toContain('Operational Catalogue Preview')
    expect(container.textContent).toContain('Sony FX3')
    expect(container.textContent).toContain('Restricted (Law 1)')
    expect(container.textContent).not.toContain('Rs 4,500')

    // When canViewMoney is true, displays formatted rupees
    await act(async () => {
      root.render(
        createElement(EquipmentCatalogPreviewModal, {
          isOpen: true,
          values: {
            name: 'Sony FX3',
            brand: 'Sony',
            model: 'ILME-FX3',
            tracking_mode: 'Serialised',
            daily_rate: 4500,
          },
          rows: [{ serial_no: 'SN-1' }, { serial_no: 'SN-2' }],
          categoryName: 'Cinema Cameras',
          assetCode: 'EQ-CAM-001',
          canViewMoney: true,
          imagePreviewUrl: null,
          onClose,
        })
      )
    })
    expect(container.textContent).toMatch(/Rs\s*4,500\s*\/\s*day/)
  })
})
