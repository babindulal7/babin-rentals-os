// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { BookingEquipmentSection } from '../BookingEquipmentSection'
import { lineAmountPaisa, type Line } from '../RentalLineItemsTree'
import { calculatePricingPipeline } from '../../../../lib/pricingPipeline'
import { calculateDraftTotal } from '../../../../lib/rentalDraftPricing'
import { rupees } from '../../../../lib/money'
import type { BookingWindow, EquipmentAvailabilitySource, EquipmentConflictSummary } from '../itemCatalogue'
import type { SystemRole } from '../../../../types/database'

const mockBookingWindow: BookingWindow = {
  pickupAd: new Date('2026-11-20T06:00:00.000Z'),
  returnAd: new Date('2026-11-25T06:00:00.000Z'),
}

const mockAvailabilitySource: EquipmentAvailabilitySource = {
  state: 'ready',
  byProduct: new Map(),
}

const mockConflictSummary: EquipmentConflictSummary = {
  state: 'ready',
  text: 'All items available',
  conflicts: [],
  verdictByLineId: new Map(),
  checked: 1,
  unchecked: 0,
}

const mockPricing = calculatePricingPipeline({
  equipmentSubtotalPaisa: rupees(20000),
  bundleSubtotalPaisa: rupees(0),
  subRentalSubtotalPaisa: rupees(0),
  servicesSubtotalPaisa: rupees(1500),
  crewSubtotalPaisa: rupees(0),
  deliveryChargePaisa: rupees(0),
  fuelChargePaisa: rupees(0),
  discounts: { manualDiscountPercent: 0, isStudentBundle: false },
  vatEnabled: true,
  vatRatePercent: 13,
})

function setInputValue(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

function gateContext(role: SystemRole) {
  return {
    role,
    userId: 'usr-1',
    isSuperAdmin: role === 'Owner',
    isSharedDevice: false,
  }
}

describe('T3-10: After-hours handover service line', () => {
  it('allows desk staff (money role) to add after-hours handover in at most two taps', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    let currentLines: Line[] = []
    const setLines = vi.fn((updater) => {
      currentLines = typeof updater === 'function' ? updater(currentLines) : updater
    })

    try {
      await act(async () => {
        root.render(
          <MemoryRouter>
            <BookingEquipmentSection
              open={true}
              onToggle={vi.fn()}
              title="Equipment, Bundles & Services"
              lines={currentLines}
              setLines={setLines}
              totalUnits={0}
              bundleCount={0}
              days={5}
              liveEquipment={[]}
              availabilitySource={mockAvailabilitySource}
              liveBundleResults={[]}
              liveCrew={[]}
              existingCrewIds={[]}
              bookingWindow={mockBookingWindow}
              poolError={null}
              conflictSummary={mockConflictSummary}
              deliveryType="Client Pickup"
              deliveryChargePaisa={rupees(0)}
              onSelectTransport={vi.fn()}
              onAddCrew={vi.fn()}
              canBookingMoney={true}
              gateContext={gateContext('Owner')}
              user={{ id: 'usr-1', name: 'Owner', role: 'Owner', isSharedDevice: false }}
              navigate={vi.fn()}
              pricing={mockPricing}
            />
          </MemoryRouter>,
        )
      })

      // Tap 1: Find and click "Add after-hours" button
      const addAfterHoursBtn = Array.from(host.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Add after-hours'),
      )
      expect(addAfterHoursBtn).toBeDefined()

      await act(async () => {
        addAfterHoursBtn!.click()
      })

      // Form opens with input field for amount
      const amountInput = host.querySelector<HTMLInputElement>(
        'input[aria-label="After-hours handover fee in Rupees"]',
      )
      expect(amountInput).toBeDefined()
      expect(amountInput).not.toBeNull()

      // Staff enters amount
      await act(async () => {
        setInputValue(amountInput!, '1500')
      })

      // Tap 2: Click "Add after-hours charge" button
      const submitBtn = Array.from(host.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Add after-hours charge'),
      )
      expect(submitBtn).toBeDefined()

      await act(async () => {
        submitBtn!.click()
      })

      // Line is added with exact flat properties
      expect(setLines).toHaveBeenCalled()
      expect(currentLines.length).toBe(1)
      const afterHoursLine = currentLines[0]!
      expect(afterHoursLine.name).toBe('After-hours handover')
      expect(afterHoursLine.lineType).toBe('Service')
      expect(afterHoursLine.serviceBasis).toBe('Flat')
      expect(afterHoursLine.days).toBe(1)
      expect(afterHoursLine.daysOverridden).toBe(true)
      expect(afterHoursLine.qty).toBe(1)
      expect(afterHoursLine.ratePaisa).toBe(rupees(1500))

      // Line amount paisa calculation must be flat (1 * 1500 = 1500), NOT multiplied by 5 days
      expect(lineAmountPaisa(afterHoursLine)).toBe(rupees(1500))
    } finally {
      act(() => root.unmount())
      host.remove()
    }
  })

  it('handles zero amount truthfully (Rs 0)', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    let currentLines: Line[] = []
    const setLines = vi.fn((updater) => {
      currentLines = typeof updater === 'function' ? updater(currentLines) : updater
    })

    try {
      await act(async () => {
        root.render(
          <MemoryRouter>
            <BookingEquipmentSection
              open={true}
              onToggle={vi.fn()}
              title="Equipment, Bundles & Services"
              lines={currentLines}
              setLines={setLines}
              totalUnits={0}
              bundleCount={0}
              days={3}
              liveEquipment={[]}
              availabilitySource={mockAvailabilitySource}
              liveBundleResults={[]}
              liveCrew={[]}
              existingCrewIds={[]}
              bookingWindow={mockBookingWindow}
              poolError={null}
              conflictSummary={mockConflictSummary}
              deliveryType="Client Pickup"
              deliveryChargePaisa={rupees(0)}
              onSelectTransport={vi.fn()}
              onAddCrew={vi.fn()}
              canBookingMoney={true}
              gateContext={gateContext('Coordinator')}
              user={{ id: 'usr-2', name: 'Desk', role: 'Coordinator', isSharedDevice: false }}
              navigate={vi.fn()}
              pricing={mockPricing}
            />
          </MemoryRouter>,
        )
      })

      const addBtn = Array.from(host.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Add after-hours'),
      )!
      await act(async () => {
        addBtn.click()
      })

      const amountInput = host.querySelector<HTMLInputElement>(
        'input[aria-label="After-hours handover fee in Rupees"]',
      )!
      await act(async () => {
        setInputValue(amountInput, '0')
      })

      const submitBtn = Array.from(host.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Add after-hours charge'),
      )!
      await act(async () => {
        submitBtn.click()
      })

      expect(currentLines.length).toBe(1)
      expect(currentLines[0]!.ratePaisa).toBe(rupees(0))
      expect(lineAmountPaisa(currentLines[0]!)).toBe(rupees(0))
    } finally {
      act(() => root.unmount())
      host.remove()
    }
  })

  it('rejects invalid or negative amounts with truthful error and does not add line', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    let currentLines: Line[] = []
    const setLines = vi.fn((updater) => {
      currentLines = typeof updater === 'function' ? updater(currentLines) : updater
    })

    try {
      await act(async () => {
        root.render(
          <MemoryRouter>
            <BookingEquipmentSection
              open={true}
              onToggle={vi.fn()}
              title="Equipment, Bundles & Services"
              lines={currentLines}
              setLines={setLines}
              totalUnits={0}
              bundleCount={0}
              days={3}
              liveEquipment={[]}
              availabilitySource={mockAvailabilitySource}
              liveBundleResults={[]}
              liveCrew={[]}
              existingCrewIds={[]}
              bookingWindow={mockBookingWindow}
              poolError={null}
              conflictSummary={mockConflictSummary}
              deliveryType="Client Pickup"
              deliveryChargePaisa={rupees(0)}
              onSelectTransport={vi.fn()}
              onAddCrew={vi.fn()}
              canBookingMoney={true}
              gateContext={gateContext('Coordinator')}
              user={{ id: 'usr-2', name: 'Desk', role: 'Coordinator', isSharedDevice: false }}
              navigate={vi.fn()}
              pricing={mockPricing}
            />
          </MemoryRouter>,
        )
      })

      const addBtn = Array.from(host.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Add after-hours'),
      )!
      await act(async () => {
        addBtn.click()
      })

      const amountInput = host.querySelector<HTMLInputElement>(
        'input[aria-label="After-hours handover fee in Rupees"]',
      )!
      const submitBtn = Array.from(host.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Add after-hours charge'),
      )!

      // Negative amount
      await act(async () => {
        setInputValue(amountInput, '-500')
        submitBtn.click()
      })
      expect(host.textContent).toContain('Enter a valid amount of Rs 0 or more.')
      expect(currentLines.length).toBe(0)

      // Empty amount
      await act(async () => {
        setInputValue(amountInput, '')
        submitBtn.click()
      })
      expect(host.textContent).toContain('Enter an amount of Rs 0 or more.')
      expect(currentLines.length).toBe(0)
    } finally {
      act(() => root.unmount())
      host.remove()
    }
  })

  it('prevents duplicate lines when after-hours is already on the booking', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const existingLines: Line[] = [
      {
        id: 'line-after-hours',
        name: 'After-hours handover',
        lineType: 'Service',
        serial: '—',
        category: 'Service',
        ratePaisa: rupees(1000),
        days: 1,
        qty: 1,
        discountPct: 0,
        serviceBasis: 'Flat',
        location: 'Not inventory-tracked',
        committedTo: '—',
      },
    ]

    try {
      await act(async () => {
        root.render(
          <MemoryRouter>
            <BookingEquipmentSection
              open={true}
              onToggle={vi.fn()}
              title="Equipment, Bundles & Services"
              lines={existingLines}
              setLines={vi.fn()}
              totalUnits={0}
              bundleCount={0}
              days={3}
              liveEquipment={[]}
              availabilitySource={mockAvailabilitySource}
              liveBundleResults={[]}
              liveCrew={[]}
              existingCrewIds={[]}
              bookingWindow={mockBookingWindow}
              poolError={null}
              conflictSummary={mockConflictSummary}
              deliveryType="Client Pickup"
              deliveryChargePaisa={rupees(0)}
              onSelectTransport={vi.fn()}
              onAddCrew={vi.fn()}
              canBookingMoney={true}
              gateContext={gateContext('Owner')}
              user={{ id: 'usr-1', name: 'Owner', role: 'Owner', isSharedDevice: false }}
              navigate={vi.fn()}
              pricing={mockPricing}
            />
          </MemoryRouter>,
        )
      })

      const afterHoursBtn = Array.from(host.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('After-hours added'),
      )
      expect(afterHoursBtn).toBeDefined()
      expect(afterHoursBtn!.disabled).toBe(true)
    } finally {
      act(() => root.unmount())
      host.remove()
    }
  })

  it('completely hides after-hours addition and money fields from money-blind roles (Warehouse)', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const existingLines: Line[] = [
      {
        id: 'line-after-hours',
        name: 'After-hours handover',
        lineType: 'Service',
        serial: '—',
        category: 'Service',
        ratePaisa: rupees(1000),
        days: 1,
        qty: 1,
        discountPct: 0,
        serviceBasis: 'Flat',
        location: 'Not inventory-tracked',
        committedTo: '—',
      },
    ]

    try {
      await act(async () => {
        root.render(
          <MemoryRouter>
            <BookingEquipmentSection
              open={true}
              onToggle={vi.fn()}
              title="Equipment, Bundles & Services"
              lines={existingLines}
              setLines={vi.fn()}
              totalUnits={0}
              bundleCount={0}
              days={3}
              liveEquipment={[]}
              availabilitySource={mockAvailabilitySource}
              liveBundleResults={[]}
              liveCrew={[]}
              existingCrewIds={[]}
              bookingWindow={mockBookingWindow}
              poolError={null}
              conflictSummary={mockConflictSummary}
              deliveryType="Client Pickup"
              deliveryChargePaisa={rupees(0)}
              onSelectTransport={vi.fn()}
              onAddCrew={vi.fn()}
              canBookingMoney={false}
              gateContext={gateContext('Warehouse')}
              user={{ id: 'usr-w', name: 'Warehouse Staff', role: 'Warehouse', isSharedDevice: true }}
              navigate={vi.fn()}
              pricing={mockPricing}
            />
          </MemoryRouter>,
        )
      })

      // Extras section and buttons must not exist
      expect(host.textContent).not.toContain('Services & other charges')
      expect(host.textContent).not.toContain('Add after-hours')
      expect(host.textContent).not.toContain('After-hours added')

      // In line tree, money columns (Rate / day, Discount, Amount) are omitted
      expect(host.querySelector('th[data-label="Rate / day"]')).toBeNull()
      expect(host.querySelector('th[data-label="Amount"]')).toBeNull()
      expect(host.textContent).not.toContain('Rs 1,000')
    } finally {
      act(() => root.unmount())
      host.remove()
    }
  })

  it('calculates draft total with flat after-hours service line without multiplying by rental days', () => {
    const draftTotal = calculateDraftTotal({
      version: 1,
      selectedClientId: 'c-1',
      clientDbId: 'c-1',
      project: '',
      kind: '',
      kindOther: '',
      govId: '',
      pickupLocation: '',
      returnLocation: '',
      specialInstructions: '',
      advancePaisa: 0,
      pickup: '2026-11-20',
      pickupTime: '06:00',
      returnDate: '2026-11-25',
      returnTime: '06:00',
      lines: [
        {
          id: 'line-eq-1',
          name: 'Sony FX3',
          serial: 'FX3-001',
          category: 'Camera',
          location: 'Main Warehouse',
          committedTo: '—',
          lineType: 'Equipment',
          qty: 1,
          days: 5,
          ratePaisa: Number(rupees(5000)),
          discountPct: 0,
        },
        {
          id: 'line-service-1',
          name: 'After-hours handover',
          serial: '—',
          category: 'Service',
          location: 'Not inventory-tracked',
          committedTo: '—',
          lineType: 'Service',
          serviceBasis: 'Flat',
          qty: 1,
          days: 1,
          ratePaisa: Number(rupees(2000)),
          discountPct: 0,
        },
      ],
      crew: [],
      deliveryType: 'Client Pickup',
      deliveryChargePaisa: 0,
      fuelChargePaisa: 0,
      vehicle: '',
      numberPlate: '',
      driverContact: '',
      discountPct: 0,
      vatOn: false,
      vatRatePercent: 13,
    })

    // Equipment: 1 * 5 days * 5,000 = Rs 25,000
    // After-hours handover: 1 * 1 * 2,000 = Rs 2,000 (flat, NOT 2,000 * 5)
    // Total without VAT = Rs 27,000
    expect(draftTotal).toBe(rupees(27000))
  })
})
