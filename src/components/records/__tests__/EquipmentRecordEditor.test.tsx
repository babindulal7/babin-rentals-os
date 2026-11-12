// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ToastProvider } from '../../ui/Toast'
import { EquipmentRecordEditor } from '../EquipmentRecordEditor'
import type { RecordValues } from '../../../lib/recordEditor'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

describe('EquipmentRecordEditor — one page, seven sections (T3-08, D19)', () => {
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

  const baseValues: RecordValues = {
    name: 'Sony FX3 Camera Body',
    tracking_mode: 'Serialised',
    category_id: 'cat-1',
    brand: 'Sony',
    daily_rate: '4500',
  }

  const baseRows: RecordValues[] = [
    { serial_no: 'SN-FX3-001', warehouse_id: 'wh-1', condition: 'Excellent' },
  ]

  const options = {
    categories: [{ id: 'cat-1', name: 'Cameras' }],
    warehouses: [{ id: 'wh-1', name: 'Kathmandu Main' }],
  }

  it('renders all seven sections on one page with matching anchor jump links and no wizard toggle', async () => {
    await act(async () => {
      root.render(
        createElement(
          ToastProvider,
          null,
          createElement(EquipmentRecordEditor, {
            snapshot: null,
            values: baseValues,
            rows: baseRows,
            setValues: vi.fn(),
            setRows: vi.fn(),
            errors: {},
            setErrors: vi.fn(),
            busy: false,
            options,
            canViewMoney: true,
            manufacturerDiffers: false,
            setManufacturerDiffers: vi.fn(),
          })
        )
      )
    })

    const expectedIds = [
      'record-section-identity',
      'record-section-stock-units',
      'record-section-relationships',
      'record-section-location',
      'record-section-purchase',
      'record-section-pricing-rental',
      'record-section-maintenance-documents',
    ]

    for (const id of expectedIds) {
      expect(container.querySelector(`#${id}`)).not.toBeNull()
      expect(container.querySelector(`a.record-section-link[href="#${id}"]`)).not.toBeNull()
    }

    expect(container.querySelectorAll('a.record-section-link')).toHaveLength(7)
    expect(container.textContent).not.toContain('Step by Step')
    expect(container.querySelector('.equipment-mode-toggle')).toBeNull()
    expect(container.querySelector('.equipment-wizard-stepper')).toBeNull()
  })

  it('hides Purchase and Pricing & Rental sections for money-blind roles (Law 6)', async () => {
    await act(async () => {
      root.render(
        createElement(
          ToastProvider,
          null,
          createElement(EquipmentRecordEditor, {
            snapshot: null,
            values: baseValues,
            rows: baseRows,
            setValues: vi.fn(),
            setRows: vi.fn(),
            errors: {},
            setErrors: vi.fn(),
            busy: false,
            options,
            canViewMoney: false,
            manufacturerDiffers: false,
            setManufacturerDiffers: vi.fn(),
          })
        )
      )
    })

    expect(container.querySelector('#record-section-purchase')).toBeNull()
    expect(container.querySelector('#record-section-pricing-rental')).toBeNull()
    expect(container.querySelectorAll('a.record-section-link')).toHaveLength(5)
    expect(container.textContent).toContain('Money-blind role')
  })
})
