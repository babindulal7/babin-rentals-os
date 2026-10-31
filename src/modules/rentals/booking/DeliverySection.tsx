import { useEffect, useState } from 'react'
import Icon from '../../../components/ui/Icon'
import { Input, Select } from '../../../components/ui'
import { Field, Section, MoneyRow, inputStyle } from './BookingFormWidgets'
import { formatMoney, rupees, type Paisa } from '../../../lib/money'
import { listDeliveryZones, type DeliveryZoneRow } from '../../../actions/deliveryZones/listDeliveryZones'
import { getDeliveryZoneFee } from '../../../actions/deliveryZones/getDeliveryZoneFee'

const sub = {
  margin: '0 0 8px',
  fontSize: 'var(--t-th)',
  fontWeight: 700,
  color: 'var(--text2)',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
} as const

const moneyBlock = {
  background: 'var(--card2)',
  borderRadius: 'var(--r-card)',
  padding: 'var(--sp-md)',
  minWidth: 0,
} as const

export interface DeliverySectionProps {
  open: boolean
  onToggle: () => void
  isPhone: boolean
  clientPickup: boolean
  deliveryType: 'Client Pickup' | 'Babin Delivery'
  setDeliveryType: (val: 'Client Pickup' | 'Babin Delivery') => void
  deliveryZone: string
  setDeliveryZone: (val: string) => void
  vehicle: string
  setVehicle: (val: string) => void
  numberPlate: string
  setNumberPlate: (val: string) => void
  driverContact: string
  setDriverContact: (val: string) => void
  pickupLocation: string
  setPickupLocation: (val: string) => void
  returnLocation: string
  setReturnLocation: (val: string) => void
  specialInstructions: string
  setSpecialInstructions: (val: string) => void
  returnPickupType: 'Client Return' | 'Babin Pickup'
  setReturnPickupType: (val: 'Client Return' | 'Babin Pickup') => void
  returnPickupAddress: string
  setReturnPickupAddress: (val: string) => void
  returnPickupTime: string
  setReturnPickupTime: (val: string) => void
  returnPickupChargePaisa: number
  setReturnPickupChargePaisa: (val: number) => void
  deliveryChargePaisa: Paisa
  setDeliveryChargePaisa: (val: Paisa) => void
  fuelChargePaisa: Paisa
  setFuelChargePaisa: (val: Paisa) => void
  transportPaisa: Paisa
  canBookingMoney: boolean
  title?: string | undefined
}

export function DeliverySection({
  open,
  onToggle,
  isPhone,
  clientPickup,
  deliveryType,
  setDeliveryType,
  deliveryZone,
  setDeliveryZone,
  vehicle,
  setVehicle,
  numberPlate,
  setNumberPlate,
  driverContact,
  setDriverContact,
  pickupLocation,
  setPickupLocation,
  returnLocation,
  setReturnLocation,
  specialInstructions,
  setSpecialInstructions,
  returnPickupType,
  setReturnPickupType,
  returnPickupAddress,
  setReturnPickupAddress,
  returnPickupTime,
  setReturnPickupTime,
  returnPickupChargePaisa,
  setReturnPickupChargePaisa,
  deliveryChargePaisa,
  setDeliveryChargePaisa,
  fuelChargePaisa,
  setFuelChargePaisa,
  transportPaisa,
  canBookingMoney,
  title = 'Delivery & Transport',
}: DeliverySectionProps) {
  const [zones, setZones] = useState<DeliveryZoneRow[]>([])
  const [zonesLoading, setZonesLoading] = useState(true)
  const [zoneError, setZoneError] = useState<string | null>(null)

  // Load active delivery zones on mount
  useEffect(() => {
    let mounted = true
    setZonesLoading(true)
    listDeliveryZones({ activeOnly: true, limit: 100 })
      .then((result) => {
        if (mounted) {
          setZones(result.zones ?? [])
          setZoneError(null)
        }
      })
      .catch((err) => {
        if (mounted) {
          setZoneError(err instanceof Error ? err.message : 'Failed to load delivery zones')
          setZones([])
        }
      })
      .finally(() => {
        if (mounted) setZonesLoading(false)
      })
    return () => { mounted = false }
  }, [])

  // Auto-fill delivery charge when zone changes
  useEffect(() => {
    if (!deliveryZone || clientPickup) return
    let mounted = true
    getDeliveryZoneFee({ zoneName: deliveryZone })
      .then((result) => {
        if (mounted && canBookingMoney) {
          setDeliveryChargePaisa(result.feePaisa as unknown as Paisa)
        }
      })
      .catch(() => {
        // Silently fail - user can manually enter fee
      })
    // A fee that arrives after the zone changed again must not overwrite the newer one.
    return () => { mounted = false }
  }, [deliveryZone, clientPickup, canBookingMoney, setDeliveryChargePaisa])

  return (
    <Section
      id="section-4"
      title={title}
      open={open}
      onToggle={onToggle}
      summary={clientPickup ? 'Client Pickup · Rs 0' : `Babin Delivery · ${deliveryZone || 'Select zone'} · ${canBookingMoney ? formatMoney(transportPaisa) : 'charged'}`}
    >
      <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(2, minmax(0,1fr))', gap: 'var(--sp-md)' }}>
        {/* Left Column: Delivery Type & Dispatch Details */}
        <div style={{ minWidth: 0 }}>
          <Field label="Delivery Type">
            <Select
              value={deliveryType}
              onChange={(e) => {
                const val = e.target.value as typeof deliveryType
                setDeliveryType(val)
                if (val === 'Client Pickup') {
                  setDeliveryZone('')
                }
              }}
              style={inputStyle}
            >
              <option>Client Pickup</option>
              <option>Babin Delivery</option>
            </Select>
          </Field>

          {clientPickup ? (
            <div
              style={{
                marginTop: 12,
                padding: '12px 14px',
                borderRadius: 'var(--r-btn)',
                background: 'var(--card2)',
                border: '1px solid var(--border)',
                display: 'flex',
                gap: 10,
                alignItems: 'flex-start',
                fontSize: 'var(--t-meta)',
                color: 'var(--text2)',
                lineHeight: 1.45,
              }}
            >
              <span style={{ color: 'var(--muted)', display: 'inline-flex', marginTop: 1, flexShrink: 0 }}>
                <Icon name="info" size={15} />
              </span>
              <div>
                <strong style={{ color: 'var(--text)', display: 'block', marginBottom: 2 }}>Client Warehouse Pickup</strong>
                Equipment will be collected and returned at the warehouse by the client. No vehicle or driver is required.
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 9, marginTop: 12 }}>
              {/* Zone Selection */}
              <Field label="Delivery Zone">
                {zonesLoading ? (
                  <div style={{ ...inputStyle, opacity: 0.6 }}>Loading zones…</div>
                ) : zoneError ? (
                  <div style={{ ...inputStyle, color: 'var(--danger-text)', background: 'var(--danger-bg)' }}>
                    {zoneError}
                  </div>
                ) : zones.length === 0 ? (
                  <div style={{ ...inputStyle, color: 'var(--muted)' }}>
                    No active zones — configure in Settings ▸ System ▸ Operations
                  </div>
                ) : (
                  <Select
                    value={deliveryZone}
                    onChange={(e) => setDeliveryZone(e.target.value)}
                    style={inputStyle}
                    disabled={!canBookingMoney}
                  >
                    <option value="">Select zone</option>
                    {zones.map((zone) => (
                      <option key={zone.id} value={zone.name}>
                        {zone.name} — {formatMoney(zone.fee_paisa as unknown as Paisa)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <Field label="Vehicle">
                <Input
                  value={vehicle}
                  onChange={(e) => setVehicle(e.target.value)}
                  placeholder="Make and model, or the van's name"
                  style={inputStyle}
                />
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr', gap: 9 }}>
                <Field label="Number Plate">
                  <Input
                    value={numberPlate}
                    onChange={(e) => setNumberPlate(e.target.value)}
                    placeholder="e.g. BA 2 CHA 1234"
                    style={inputStyle}
                  />
                </Field>
                <Field label="Driver Contact">
                  <Input
                    value={driverContact}
                    onChange={(e) => setDriverContact(e.target.value)}
                    placeholder="Name and phone"
                    style={inputStyle}
                  />
                </Field>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr', gap: 9 }}>
                <Field label="Delivery location">
                  <Input
                    value={pickupLocation}
                    onChange={(e) => setPickupLocation(e.target.value)}
                    placeholder="Address or venue for delivery"
                    style={inputStyle}
                  />
                </Field>
                <Field label="Collection location">
                  <Input
                    value={returnLocation}
                    onChange={(e) => setReturnLocation(e.target.value)}
                    placeholder="Address or venue for collection"
                    style={inputStyle}
                  />
                </Field>
              </div>
              <Field label="Driver instructions">
                <textarea
                  value={specialInstructions}
                  onChange={(e) => setSpecialInstructions(e.target.value)}
                  placeholder="Access, contact, parking, timing, or loading instructions"
                  rows={3}
                  style={{ ...inputStyle, minHeight: 76, padding: '9px 11px', resize: 'vertical', lineHeight: 1.45 }}
                />
              </Field>

              {/* Return Pickup Logistics */}
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                <Field label="Return Pickup Option">
                  <Select
                    value={returnPickupType}
                    onChange={(e) => setReturnPickupType(e.target.value as typeof returnPickupType)}
                    style={inputStyle}
                  >
                    <option value="Client Return">Client Returns to Warehouse</option>
                    <option value="Babin Pickup">Babin Rentals Pickup from Location</option>
                  </Select>
                </Field>
                {returnPickupType === 'Babin Pickup' && (
                  <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr', gap: 9, marginTop: 9 }}>
                    <Field label="Pickup Address">
                      <Input
                        value={returnPickupAddress}
                        onChange={(e) => setReturnPickupAddress(e.target.value)}
                        placeholder="Address or venue for pickup"
                        style={inputStyle}
                      />
                    </Field>
                    <Field label="Return Pickup Time">
                      <Input
                        type="time"
                        value={returnPickupTime}
                        onChange={(e) => setReturnPickupTime(e.target.value)}
                        style={inputStyle}
                      />
                    </Field>
                    <Field label="Return Pickup Fee (Rs)">
                      <Input
                        type="number"
                        min={0}
                        value={returnPickupChargePaisa / 100}
                        onChange={(e) => setReturnPickupChargePaisa(rupees(Math.max(0, Number(e.target.value) || 0)))}
                        placeholder="Fee"
                        style={inputStyle}
                      />
                    </Field>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Transport Charges & Total */}
        <div style={{ ...moneyBlock, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <h3 style={sub}>Transport Charges</h3>
            {canBookingMoney ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginTop: 6 }}>
                <Field label="Delivery Charge">
                  <Input
                    type="number"
                    min={0}
                    disabled={clientPickup || !deliveryZone}
                    value={clientPickup || !deliveryZone ? 0 : deliveryChargePaisa / 100}
                    onChange={(e) => setDeliveryChargePaisa(rupees(Math.max(0, Number(e.target.value) || 0)))}
                    style={{ ...inputStyle, opacity: clientPickup || !deliveryZone ? 0.55 : 1, cursor: clientPickup || !deliveryZone ? 'not-allowed' : 'text' }}
                    placeholder={!deliveryZone ? 'Select zone first' : undefined}
                  />
                  {!deliveryZone && !clientPickup && (
                    <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', marginTop: 4 }}>
                      Select a zone to auto-fill the fee
                    </span>
                  )}
                </Field>
                <Field label="Fuel Charge">
                  <Input
                    type="number"
                    min={0}
                    disabled={clientPickup}
                    value={clientPickup ? 0 : fuelChargePaisa / 100}
                    onChange={(e) => setFuelChargePaisa(rupees(Math.max(0, Number(e.target.value) || 0)))}
                    style={{ ...inputStyle, opacity: clientPickup ? 0.55 : 1, cursor: clientPickup ? 'not-allowed' : 'text' }}
                  />
                </Field>
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                Transport rates are hidden for your role.
              </p>
            )}

            {clientPickup && (
              <p style={{ margin: '10px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.45 }}>
                Client Pickup forces delivery and fuel charges to Rs 0.
              </p>
            )}
          </div>

          {canBookingMoney && (
            <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
              <MoneyRow label="Transport Total" value={formatMoney(transportPaisa)} strong />
            </div>
          )}
        </div>
      </div>
    </Section>
  )
}
