import { describe, it, expect, vi } from 'vitest'
import { lineAmountPaisa, type Line } from '../../modules/rentals/booking/RentalLineItemsTree'
import { equipmentLineDraft, type EquipmentResult } from '../../modules/rentals/booking/itemCatalogue'
import { calculatePricingPipeline, type PricingPipelineInput } from '../pricingPipeline'
import { addConsumableLineConfig } from '../../actions/rentals/addConsumableLine'
import { restockConsumableConfig } from '../../actions/inventory/restockConsumable'
import { createAction } from '../../actions/core'
import type { Paisa } from '../money'
import { rupees } from '../money'

describe('T3-30: Consumables Pricing & Management', () => {
  describe('1. Consumable Pricing Calculation', () => {
    it('charges exactly 2 units, not 6, for a three-day rental with two tape rolls', () => {
      const tapeRollLine: Line = {
        id: 'line-tape-1',
        name: 'Gaffer Tape Black 2in',
        serial: '—',
        committedTo: '—',
        category: 'Consumable',
        trackingMode: 'Consumable',
        isConsumable: true,
        ratePaisa: rupees(500), // Rs. 500 per unit sale price
        days: 3, // 3-day booking
        qty: 2, // 2 rolls
        discountPct: 0,
        location: 'A-1',
      }

      // Consumables must NEVER multiply by rental days: qty (2) * 1 * rate (500) = Rs. 1,000 (100,000 paisa)
      const chargedPaisa = lineAmountPaisa(tapeRollLine)
      expect(chargedPaisa).toBe(100_000 as Paisa) // Rs. 1,000, NOT Rs. 3,000 (300,000 paisa)
    })

    it('multiplies by rental days for equipment and quantity gear, but NOT for consumables', () => {
      const cameraRentalLine: Line = {
        id: 'line-cam-1',
        name: 'Sony FX3',
        serial: 'FX3-001',
        category: 'Camera',
        trackingMode: 'Serialised',
        ratePaisa: rupees(3000), // Rs. 3,000 per day
        days: 3,
        qty: 1,
        discountPct: 0,
        location: 'Shelf 1',
        committedTo: '—',
      }

      const cableRentalLine: Line = {
        id: 'line-cable-1',
        name: 'BNC Cable 10m',
        serial: '—',
        category: 'Cables',
        trackingMode: 'Quantity',
        ratePaisa: rupees(200), // Rs. 200 per day
        days: 3,
        qty: 4,
        discountPct: 0,
        location: 'Bin 4',
        committedTo: '—',
      }

      const tapeConsumableLine: Line = {
        id: 'line-tape-2',
        name: 'Gaffer Tape White 2in',
        serial: '—',
        committedTo: '—',
        category: 'Consumable',
        trackingMode: 'Consumable',
        ratePaisa: rupees(500),
        days: 3,
        qty: 4,
        discountPct: 0,
        location: 'A-1',
      }

      // Camera: 1 qty * 3 days * 3000 = Rs. 9,000
      expect(lineAmountPaisa(cameraRentalLine)).toBe(900_000 as Paisa)

      // BNC cables: 4 qty * 3 days * 200 = Rs. 2,400
      expect(lineAmountPaisa(cableRentalLine)).toBe(240_000 as Paisa)

      // Tape consumable: 4 qty * 1 * 500 = Rs. 2,000 (NOT 4 * 3 * 500 = 6,000)
      expect(lineAmountPaisa(tapeConsumableLine)).toBe(200_000 as Paisa)
    })

    it('sets days to 1 when drafting a consumable line in itemCatalogue', () => {
      const result: EquipmentResult = {
        kind: 'equipment',
        id: 'prod-gaffer-tape-uuid',
        productKey: 'prod-gaffer-tape-uuid',
        name: 'Pro Gaffer Tape 50mm',
        serial: '—',
        committedTo: '—',
        category: 'Consumable',
        trackingMode: 'Consumable',
        isConsumable: true,
        location: 'Consumables Bay',
        ratePaisa: rupees(450),
        inBundles: [],
        availability: {
          level: 'available',
          label: 'Available',
          detail: '50 in stock',
          tone: 'in',
          icon: 'check',
          shortLines: [],
          freedLines: [],
        },
        haystack: ['pro', 'gaffer', 'tape'],
      }

      const draft = equipmentLineDraft(result, 5) // user selected 5 days for rental
      expect(draft.days).toBe(1) // Consumable forced to 1 day
      expect(draft.isConsumable).toBe(true)
      expect(draft.trackingMode).toBe('Consumable')
      expect(draft.ratePaisa).toBe(rupees(450))
    })
  })

  describe('2. Pricing Pipeline Integration', () => {
    it('applies 13% VAT to consumable sales subtotal alongside equipment', () => {
      const input: PricingPipelineInput = {
        equipmentSubtotalPaisa: rupees(10000), // Rs. 10,000 equipment
        bundleSubtotalPaisa: rupees(0),
        subRentalSubtotalPaisa: rupees(0),
        consumablesSubtotalPaisa: rupees(2000), // Rs. 2,000 consumables
        servicesSubtotalPaisa: rupees(0),
        crewSubtotalPaisa: rupees(0),
        deliveryChargePaisa: rupees(0),
        fuelChargePaisa: rupees(0),
        vatEnabled: true,
        vatRatePercent: 13,
      }

      const pricing = calculatePricingPipeline(input)
      expect(pricing.consumablesSubtotalPaisa).toBe(rupees(2000))
      // Gross: 10,000 + 2,000 = 12,000
      expect(pricing.grossSubtotalPaisa).toBe(rupees(12000))
      // Taxable: 12,000
      expect(pricing.taxableSubtotalPaisa).toBe(rupees(12000))
      // 13% VAT on 12,000 = 1,560
      expect(pricing.vatPaisa).toBe(rupees(1560))
      // Total rental before deposit: 12,000 + 1,560 = 13,560
      expect(pricing.rentalTotalPaisa).toBe(rupees(13560))
    })
  })

  describe('3. Permissions & Role Gating (Law 6 & PERMISSIONS.md)', () => {
    const validUuid = '11111111-1111-1111-1111-111111111111'

    const reach = (capability: string, role: string) => {
      const execute = vi.fn().mockResolvedValue({ result: { ok: true }, events: [] })
      const action = createAction({
        name: `TEST_${capability}`,
        implemented: true,
        permissions: [capability],
        validate: () => {},
        execute,
      })
      return { run: () => action({}, { userId: 'u-1', role: role as any }), execute }
    }

    it('allows staff roles to add consumable lines and denies external Client', async () => {
      // Booking desk & floor roles
      await expect(reach('rental.add_consumable', 'Owner').run()).resolves.toEqual({ ok: true })
      await expect(reach('rental.add_consumable', 'Admin').run()).resolves.toEqual({ ok: true })
      await expect(reach('rental.add_consumable', 'Manager').run()).resolves.toEqual({ ok: true })
      await expect(reach('rental.add_consumable', 'Coordinator').run()).resolves.toEqual({ ok: true })
      await expect(reach('rental.add_consumable', 'Warehouse').run()).resolves.toEqual({ ok: true })
      await expect(reach('rental.add_consumable', 'Technician').run()).resolves.toEqual({ ok: true })

      // External client denied
      await expect(reach('rental.add_consumable', 'Client').run()).rejects.toThrow()
    })

    it('allows staff roles to restock consumables and denies external Client', async () => {
      await expect(reach('inventory.restock_consumable', 'Owner').run()).resolves.toEqual({ ok: true })
      await expect(reach('inventory.restock_consumable', 'Admin').run()).resolves.toEqual({ ok: true })
      await expect(reach('inventory.restock_consumable', 'Manager').run()).resolves.toEqual({ ok: true })
      await expect(reach('inventory.restock_consumable', 'Warehouse').run()).resolves.toEqual({ ok: true })
      await expect(reach('inventory.restock_consumable', 'Technician').run()).resolves.toEqual({ ok: true })

      await expect(reach('inventory.restock_consumable', 'Client').run()).rejects.toThrow()
    })

    it('validates addConsumableLine inputs fail-closed', () => {
      // Invalid booking UUID
      expect(() =>
        addConsumableLineConfig.validate({
          bookingId: 'invalid-id',
          productId: validUuid,
          qty: 1,
        }),
      ).toThrow('valid booking UUID')

      // Invalid product UUID
      expect(() =>
        addConsumableLineConfig.validate({
          bookingId: validUuid,
          productId: 'invalid-id',
          qty: 1,
        }),
      ).toThrow('valid consumable product UUID')

      // Non-positive quantity
      expect(() =>
        addConsumableLineConfig.validate({
          bookingId: validUuid,
          productId: validUuid,
          qty: 0,
        }),
      ).toThrow('positive whole integer')

      // Non-integer quantity
      expect(() =>
        addConsumableLineConfig.validate({
          bookingId: validUuid,
          productId: validUuid,
          qty: 1.5,
        }),
      ).toThrow('positive whole integer')
    })

    it('validates restockConsumable inputs fail-closed', () => {
      // Invalid product UUID
      expect(() =>
        restockConsumableConfig.validate({
          productId: 'invalid',
          qty: 5,
        }),
      ).toThrow('valid product UUID')

      // Non-positive quantity
      expect(() =>
        restockConsumableConfig.validate({
          productId: validUuid,
          qty: -5,
        }),
      ).toThrow('positive whole number')
    })
  })
})
