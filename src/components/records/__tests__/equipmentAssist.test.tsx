// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  equipmentSectionState,
  EquipmentSectionLinks,
  UnitBarcodeModal,
  EquipmentCatalogPreviewModal,
  EquipmentInformationDrawerContent,
} from '../equipmentAssist'
import type { RecordValues } from '../../../lib/recordEditor'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

describe('equipmentAssist — One-page seven-section Equipment Intake (D19, T3-08)', () => {
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

  it('computes section state for each of the seven sections', () => {
    const completeValues: RecordValues = {
      name: 'Sony FX3',
      category_id: 'cat-camera',
      brand: 'Sony',
      tracking_mode: 'Serialised',
      daily_rate: '4500',
      replacement_value: '450000',
    }
    const completeRows: RecordValues[] = [
      { serial_no: 'SN-001', warehouse_id: 'wh-1' },
    ]
    expect(equipmentSectionState('Identity', completeValues, completeRows)).toBe('complete')
    expect(equipmentSectionState('Stock & Units', completeValues, completeRows)).toBe('complete')
    expect(equipmentSectionState('Location', completeValues, completeRows)).toBe('complete')
    expect(equipmentSectionState('Pricing & Rental', completeValues, completeRows)).toBe('complete')
    expect(equipmentSectionState('Purchase', completeValues, completeRows)).toBe('complete')
    expect(equipmentSectionState('Relationships', completeValues, completeRows)).toBe('optional')
    expect(equipmentSectionState('Maintenance & Documents', completeValues, completeRows)).toBe('optional')

    const incompleteValues: RecordValues = {
      name: '',
      category_id: '',
      brand: '',
      tracking_mode: 'Serialised',
    }
    expect(equipmentSectionState('Identity', incompleteValues, [])).toBe('todo')
    expect(equipmentSectionState('Stock & Units', incompleteValues, [])).toBe('todo')
    expect(equipmentSectionState('Pricing & Rental', incompleteValues, [])).toBe('todo')
  })

  it('renders EquipmentSectionLinks with all seven section anchors and no wizard toggle', async () => {
    const sections = [
      'Identity',
      'Stock & Units',
      'Relationships',
      'Location',
      'Purchase',
      'Pricing & Rental',
      'Maintenance & Documents',
    ]
    const idOf = (sec: string) => `record-section-${sec.toLowerCase().replace(/[^a-z]+/g, '-')}`

    await act(async () => {
      root.render(
        createElement(EquipmentSectionLinks, {
          sections,
          stateOf: (sec) => equipmentSectionState(sec, { tracking_mode: 'Serialised' }, []),
          idOf,
        })
      )
    })

    const nav = container.querySelector('nav[aria-label="Form sections"]')
    expect(nav).not.toBeNull()
    const links = Array.from(container.querySelectorAll('a.record-section-link')) as HTMLAnchorElement[]
    expect(links).toHaveLength(7)
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '#record-section-identity',
      '#record-section-stock-units',
      '#record-section-relationships',
      '#record-section-location',
      '#record-section-purchase',
      '#record-section-pricing-rental',
      '#record-section-maintenance-documents',
    ])
    expect(container.textContent).not.toContain('Step by Step')
    expect(container.querySelector('.equipment-mode-toggle')).toBeNull()
    expect(container.querySelector('.equipment-wizard-stepper')).toBeNull()
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
    expect(container.textContent).toContain('Restricted')
    expect(container.textContent).not.toContain('Law 1')
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
  it('does not generate a barcode from a record code when a unit tag is missing', async () => {
    await act(async () => {
      root.render(createElement(UnitBarcodeModal, {
        isOpen: true, unit: {}, index: 0, assetCode: 'EQ-RECORDED-42',
        equipmentName: 'Recorded equipment', onClose: vi.fn(),
      }))
    })
    expect(container.querySelector('.equipment-barcode-svg')).toBeNull()
    expect(container.textContent).toContain('after the unit has an assigned asset tag')
    expect(container.textContent).not.toMatch(/EQ-RECORDED-42-01|Excellent|NO-SERIAL/)
    expect([...container.querySelectorAll('button')].find(b => b.textContent === 'Copy Tag')?.disabled).toBe(true)
  })

  it('does not invent an assigned code, persisted status or relationships for unsaved equipment', async () => {
    const generate = vi.fn()
    await act(async () => {
      root.render(createElement(EquipmentInformationDrawerContent, {
        values: { tracking_mode: 'Serialised' }, rows: [{ serial_no: 'REAL-SERIAL' }],
        categoryName: undefined, editing: false, onGenerateAssetTags: generate,
      }))
    })
    expect(container.textContent).toContain('Assigned on save')
    expect(container.textContent).toContain('Not saved')
    expect(container.textContent).not.toMatch(/EQ000234|Direct Shelf|No unit carries a booking|Draft/)
    expect(container.querySelector('.equipment-barcode-svg')).toBeNull()
    const copy = container.querySelector<HTMLButtonElement>('[aria-label="Copy Asset Code"]')
    expect(copy?.disabled).toBe(true)
    const tags = [...container.querySelectorAll('button')].find(b => b.textContent?.includes('Generate Tags'))
    expect(tags?.disabled).toBe(true)
    expect(tags?.title).toContain('Save equipment')
    await act(async () => tags?.click())
    expect(generate).not.toHaveBeenCalled()
  })

  it('presents a saved code and recorded status without assuming an active catalogue record', async () => {
    await act(async () => {
      root.render(createElement(EquipmentInformationDrawerContent, {
        values: { status: 'Inactive', tracking_mode: 'Serialised' }, rows: [],
        categoryName: undefined, editing: true, assetCode: 'EQ-RECORDED-42',
      }))
    })
    expect(container.querySelector('.equipment-status-pill')?.textContent).toContain('Inactive')
    expect(container.querySelector('.equipment-code-val')?.textContent).toBe('EQ-RECORDED-42')
    expect(container.querySelector('.equipment-barcode-svg svg')).not.toBeNull()
    expect(container.querySelector<HTMLButtonElement>('[aria-label="Copy Asset Code"]')?.disabled).toBe(false)
    expect(container.textContent).not.toContain('Direct Shelf')
  })
})
