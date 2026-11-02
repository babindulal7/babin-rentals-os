// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DeliveryZonesControl } from '../DeliveryZonesControl'
import { listDeliveryZones } from '../../../../actions/deliveryZones/listDeliveryZones'
import { createDeliveryZone } from '../../../../actions/deliveryZones/createDeliveryZone'
import { updateDeliveryZone } from '../../../../actions/deliveryZones/updateDeliveryZone'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('../../../../lib/auth', () => ({
  useAuth: () => ({ user: { role: 'Coordinator' } }),
}))

vi.mock('../../../../lib/rbac', () => ({
  canManageDeliveryZones: () => true,
}))

vi.mock('../../../../actions/deliveryZones/listDeliveryZones', () => ({
  listDeliveryZones: vi.fn(),
}))

vi.mock('../../../../actions/deliveryZones/createDeliveryZone', () => ({
  createDeliveryZone: vi.fn(),
}))

vi.mock('../../../../actions/deliveryZones/updateDeliveryZone', () => ({
  updateDeliveryZone: vi.fn(),
}))

vi.mock('../../../../components/ui/Toast', () => ({
  useToast: () => ({
    showSuccessToast: vi.fn(),
  }),
}))

const mockListDeliveryZones = vi.mocked(listDeliveryZones)
const mockCreateDeliveryZone = vi.mocked(createDeliveryZone)
const mockUpdateDeliveryZone = vi.mocked(updateDeliveryZone)

function clickButton(label: string) {
  const button = Array.from(document.body.querySelectorAll('button'))
    .find(candidate => candidate.textContent?.trim() === label)
  if (!button) throw new Error(`Button "${label}" not found`)
  act(() => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  if (!setter) throw new Error('Input value setter not found')
  act(() => {
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('DeliveryZonesControl', () => {
  let container: HTMLDivElement | null = null
  let root: Root | null = null

  beforeEach(() => {
    vi.clearAllMocks()
    mockListDeliveryZones.mockResolvedValue({ zones: [] } as any)
    mockCreateDeliveryZone.mockResolvedValue({ zoneId: 'zone-new' })
    mockUpdateDeliveryZone.mockResolvedValue({ updated: true })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount()
      })
    }
    container?.remove()
    container = null
    root = null
  })

  it('renders loading state initially', async () => {
    mockListDeliveryZones.mockImplementation(() => new Promise(() => {}))
    await act(async () => {
      root?.render(<DeliveryZonesControl />)
    })
    expect(container?.textContent).toContain('Loading delivery zones…')
  })

  it('shows empty state when no zones exist', async () => {
    mockListDeliveryZones.mockResolvedValue({ zones: [] } as any)
    await act(async () => {
      root?.render(<DeliveryZonesControl />)
    })
    expect(container?.textContent).toContain('No delivery zones yet')
  })

  it('displays zones in a list', async () => {
    const mockZones = [
      { id: 'zone-1', name: 'Ring Road', description: 'Inside Ring Road', fee_paisa: 350000, is_active: true, created_at: '', updated_at: '' },
      { id: 'zone-2', name: 'Outside Valley', description: 'Outside Kathmandu Valley', fee_paisa: 0, is_active: true, created_at: '', updated_at: '' },
    ]
    mockListDeliveryZones.mockResolvedValue({ zones: mockZones } as any)
    await act(async () => {
      root?.render(<DeliveryZonesControl />)
    })
    expect(container?.textContent).toContain('Ring Road')
    expect(container?.textContent).toContain('Outside Valley')
  })

  it('rejects exponent-form fees when creating a zone', async () => {
    await act(async () => {
      root?.render(<DeliveryZonesControl />)
    })
    clickButton('Add zone')
    const inputs = document.body.querySelectorAll<HTMLInputElement>('input')
    const nameInput = inputs[0]
    const feeInput = document.body.querySelector<HTMLInputElement>('input[type="number"]')
    if (!nameInput || !feeInput) throw new Error('Create form inputs not found')
    setInputValue(nameInput, 'Test zone')
    setInputValue(feeInput, '1e3')
    clickButton('Create zone')

    expect(container?.textContent).toContain('Enter a valid non-negative fee in rupees')
    expect(mockCreateDeliveryZone).not.toHaveBeenCalled()
  })

  it('rejects exponent-form fees when updating a zone', async () => {
    mockListDeliveryZones.mockResolvedValue({
      zones: [
        { id: 'zone-1', name: 'Ring Road', description: '', fee_paisa: 350000, is_active: true, created_at: '', updated_at: '' },
      ],
    } as any)
    await act(async () => {
      root?.render(<DeliveryZonesControl />)
    })
    clickButton('Edit')
    const feeInput = document.body.querySelector<HTMLInputElement>('input[type="number"]')
    if (!feeInput) throw new Error('Update form fee input not found')
    setInputValue(feeInput, '1e3')
    clickButton('Save changes')

    expect(container?.textContent).toContain('Enter a valid non-negative fee in rupees')
    expect(mockUpdateDeliveryZone).not.toHaveBeenCalled()
  })
})
