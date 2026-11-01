import fs from 'fs'

const code = `// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DeliveryZonesControl } from '../DeliveryZonesControl'
import { listDeliveryZones } from '../../../../actions/deliveryZones/listDeliveryZones'
import { createDeliveryZone } from '../../../../actions/deliveryZones/createDeliveryZone'
import { updateDeliveryZone } from '../../../../actions/deliveryZones/updateDeliveryZone'
import { deactivateDeliveryZone } from '../../../../actions/deliveryZones/deactivateDeliveryZone'

// Mock dependencies
vi.mock('../../../../lib/auth', () => ({
  useAuth: () => ({ user: { role: 'Coordinator' } }),
}))

vi.mock('../../../../lib/rbac', () => ({
  canManageSettings: () => true,
}))

vi.mock('../../../../lib/money', () => ({
  formatMoney: (paisa: number) => \`Rs \${(paisa / 100).toLocaleString('en-IN')}\`,
  paisa: (n: number) => n as any,
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

vi.mock('../../../../actions/deliveryZones/deactivateDeliveryZone', () => ({
  deactivateDeliveryZone: vi.fn(),
}))

vi.mock('../../../../components/ui/Toast', () => ({
  useToast: () => ({
    showSuccessToast: vi.fn(),
  }),
}))

const mockListDeliveryZones = vi.mocked(listDeliveryZones)
const mockCreateDeliveryZone = vi.mocked(createDeliveryZone)
const mockUpdateDeliveryZone = vi.mocked(updateDeliveryZone)
const mockDeactivateDeliveryZone = vi.mocked(deactivateDeliveryZone)

describe('DeliveryZonesControl', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListDeliveryZones.mockResolvedValue({ zones: [] })
  })

  it('renders loading state initially', () => {
    mockListDeliveryZones.mockImplementation(() => new Promise(() => {}))
    render(<DeliveryZonesControl />)
    expect(screen.getByText('Loading delivery zones…')).toBeTruthy()
  })

  it('shows empty state when no zones exist', async () => {
    mockListDeliveryZones.mockResolvedValue({ zones: [] })
    render(<DeliveryZonesControl />)
    await waitFor(() => expect(screen.getByText('No delivery zones yet')).toBeTruthy())
  })

  it('displays zones in a list', async () => {
    const mockZones = [
      { id: 'zone-1', name: 'Ring Road', description: 'Inside Ring Road', fee_paisa: 350000, is_active: true, created_at: '', updated_at: '' },
      { id: 'zone-2', name: 'Outside Valley', description: 'Outside Kathmandu Valley', fee_paisa: 0, is_active: true, created_at: '', updated_at: '' },
    ]
    mockListDeliveryZones.mockResolvedValue({ zones: mockZones })
    render(<DeliveryZonesControl />)
    await waitFor(() => {
      expect(screen.getByText('Ring Road')).toBeTruthy()
      expect(screen.getByText('Outside Valley')).toBeTruthy()
    })
  })

  it('opens create modal when Add zone button is clicked', async () => {
    mockListDeliveryZones.mockResolvedValue({ zones: [] })
    render(<DeliveryZonesControl />)
    await waitFor(() => expect(screen.getByText('No delivery zones yet')).toBeTruthy())
    fireEvent.click(screen.getByText('Add zone'))
    await waitFor(() => expect(screen.getByText('Create delivery zone')).toBeTruthy())
  })

  it('creates a new zone', async () => {
    mockListDeliveryZones
      .mockResolvedValueOnce({ zones: [] })
      .mockResolvedValueOnce({ zones: [{ id: 'new-zone', name: 'New Zone', description: 'Test', fee_paisa: 350000, is_active: true, created_at: '', updated_at: '' }] })
    mockCreateDeliveryZone.mockResolvedValue({ zoneId: 'new-zone' })

    render(<DeliveryZonesControl />)
    await waitFor(() => expect(screen.getByText('No delivery zones yet')).toBeTruthy())
    fireEvent.click(screen.getByText('Add zone'))
    await waitFor(() => expect(screen.getByText('Create delivery zone')).toBeTruthy())

    fireEvent.change(screen.getByPlaceholderText('e.g., Ring Road, Boudha, Outside Valley'), { target: { value: 'New Zone' } })
    fireEvent.change(screen.getByPlaceholderText('Human-readable description of zone boundaries'), { target: { value: 'Test' } })
    fireEvent.change(screen.getByLabelText(/Fee \\(paisa\\)/), { target: { value: '350000' } })

    fireEvent.click(screen.getByText('Create zone'))
    await waitFor(() => {
      expect(mockCreateDeliveryZone).toHaveBeenCalledWith(
        { name: 'New Zone', description: 'Test', feePaisa: 350000 }
      )
    })
  })

  it('opens edit modal when Edit is clicked', async () => {
    const mockZones = [
      { id: 'zone-1', name: 'Ring Road', description: 'Inside Ring Road', fee_paisa: 350000, is_active: true, created_at: '', updated_at: '' },
    ]
    mockListDeliveryZones.mockResolvedValue({ zones: mockZones })
    render(<DeliveryZonesControl />)
    await waitFor(() => expect(screen.getByText('Ring Road')).toBeTruthy())

    fireEvent.click(screen.getByText('Edit'))
    await waitFor(() => expect(screen.getByText('Edit "Ring Road"')).toBeTruthy())
    expect(screen.getByDisplayValue('Ring Road')).toBeTruthy()
    expect(screen.getByDisplayValue('Inside Ring Road')).toBeTruthy()
  })

  it('deactivates a zone', async () => {
    const mockZones = [
      { id: 'zone-1', name: 'Ring Road', description: 'Inside Ring Road', fee_paisa: 350000, is_active: true, created_at: '', updated_at: '' },
    ]
    mockListDeliveryZones
      .mockResolvedValueOnce({ zones: mockZones })
      .mockResolvedValueOnce({ zones: [{ ...mockZones[0], is_active: false }] })
    mockDeactivateDeliveryZone.mockResolvedValue({ deactivated: true })

    render(<DeliveryZonesControl />)
    await waitFor(() => expect(screen.getByText('Ring Road')).toBeTruthy())

    fireEvent.click(screen.getByText('Deactivate'))
    await waitFor(() => expect(screen.getByText('Deactivate "Ring Road"?')).toBeTruthy())

    fireEvent.click(screen.getByText('Deactivate zone'))
    await waitFor(() => {
      expect(mockDeactivateDeliveryZone).toHaveBeenCalledWith(
        { zoneId: 'zone-1' }
      )
    })
  })

  it('shows error when zone name is empty', async () => {
    mockListDeliveryZones.mockResolvedValue({ zones: [] })
    render(<DeliveryZonesControl />)
    await waitFor(() => expect(screen.getByText('No delivery zones yet')).toBeTruthy())
    fireEvent.click(screen.getByText('Add zone'))
    await waitFor(() => expect(screen.getByText('Create delivery zone')).toBeTruthy())

    fireEvent.click(screen.getByText('Create zone'))
    await waitFor(() => expect(screen.getByText('Zone name is required')).toBeTruthy())
  })
})
`

const path = 'src/modules/settings/sections/__tests__/DeliveryZonesControl.test.tsx'
fs.writeFileSync(path + '.tmp', code)
fs.renameSync(path + '.tmp', path)
console.log('Fixed DeliveryZonesControl.test.tsx')
