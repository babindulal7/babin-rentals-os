import { describe, it, expect } from 'vitest'
import { transportInstructions, readTransportForm } from '../bookingTransportForm'
import { rupees } from '../money'

describe('bookingTransportForm', () => {
  it('formats and round-trips Babin Pickup instructions with fee', () => {
    const formatted = transportInstructions({
      specialInstructions: 'Call on arrival',
      returnPickupType: 'Babin Pickup',
      returnPickupAddress: 'Patan Durbar Square',
      returnPickupTime: '17:30',
      returnPickupChargePaisa: rupees(1500),
    })

    expect(formatted).toBe('Call on arrival | Return Pickup: Babin Pickup from "Patan Durbar Square" at 17:30 (Return Pickup Fee: Rs 1500)')

    const parsed = readTransportForm(formatted!, 1500, true)
    expect(parsed.specialInstructions).toBe('Call on arrival')
    expect(parsed.returnPickupType).toBe('Babin Pickup')
    expect(parsed.returnPickupAddress).toBe('Patan Durbar Square')
    expect(parsed.returnPickupTime).toBe('17:30')
    expect(parsed.returnPickupChargePaisa).toBe(rupees(1500))
    expect(parsed.deliveryChargePaisa).toBe(rupees(0))
  })

  it('returns null when no special instructions and Client Return', () => {
    expect(
      transportInstructions({
        specialInstructions: '   ',
        returnPickupType: 'Client Return',
      }),
    ).toBeNull()
  })
})
