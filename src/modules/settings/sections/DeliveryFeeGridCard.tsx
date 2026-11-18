import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { Card } from '../../../components/ui/Page'
import {
  DELIVERY_VEHICLE_CLASSES,
  deliveryFeeLabel,
  parseFeeInput,
  resolveDeliveryFee,
  type DeliveryVehicleClass,
} from '../../../lib/deliveryFeeGrid'

/*
 * RULING 2026-11-09 (R-9.18, R-9.20); O-29 answered 18 Nov 2026 (Owner and Manager type
 * amounts). Settings ▸ Financial ▸ "Delivery fees". A blank cell is "not set"; a quoted
 * zone takes no amounts. The database enforces every rule (migration 0244).
 */

type ZoneRow = { id: string; name: string }
type FeeRow = { zone_id: string; vehicle_class: string; fee_paisa: number | string | null }
type QuotedRow = { zone_id: string; quoted: boolean }

const cellKey = (zoneId: string, vehicle: string): string => `${zoneId}|${vehicle}`

export function DeliveryFeeGridCard() {
  const [zones, setZones] = useState<ZoneRow[]>([])
  const [fees, setFees] = useState<Record<string, number | null>>({})
  const [quoted, setQuoted] = useState<Record<string, boolean>>({})
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loadError, setLoadError] = useState<string | null>(null)
  const [savingZone, setSavingZone] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoadError(null)
    let zoneRes, feeRes, quotedRes
    try {
      ;[zoneRes, feeRes, quotedRes] = await Promise.all([
        supabase.from('delivery_zones').select('id, name').eq('is_active', true).order('name'),
        supabase.from('delivery_zone_vehicle_fees').select('zone_id, vehicle_class, fee_paisa'),
        supabase.from('delivery_zone_quoted').select('zone_id, quoted'),
      ])
    } catch (err) {
      // A client that is not ready, or a network failure, must be shown, not left as an unhandled rejection.
      setLoadError(err instanceof Error ? err.message : 'Unknown read error')
      return
    }
    if (zoneRes.error || feeRes.error || quotedRes.error) {
      setLoadError((zoneRes.error ?? feeRes.error ?? quotedRes.error)?.message ?? 'Unknown read error')
      return
    }
    setZones((zoneRes.data ?? []) as unknown as ZoneRow[])
    const feeMap: Record<string, number | null> = {}
    for (const row of (feeRes.data ?? []) as unknown as FeeRow[]) {
      feeMap[cellKey(row.zone_id, row.vehicle_class)] = row.fee_paisa === null ? null : Number(row.fee_paisa)
    }
    setFees(feeMap)
    const quotedMap: Record<string, boolean> = {}
    for (const row of (quotedRes.data ?? []) as unknown as QuotedRow[]) quotedMap[row.zone_id] = row.quoted
    setQuoted(quotedMap)
    setDrafts({})
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function saveZone(zoneId: string): Promise<void> {
    setSavingZone(zoneId)
    setErrors({})
    for (const vehicle of DELIVERY_VEHICLE_CLASSES) {
      const key = cellKey(zoneId, vehicle)
      const draft = drafts[key] ?? (fees[key] === null || fees[key] === undefined ? '' : String(fees[key] / 100))
      const parsed = parseFeeInput(draft)
      if (!parsed.ok) {
        setErrors((prev) => ({ ...prev, [key]: parsed.error }))
        setSavingZone(null)
        return
      }
      const { error } = await supabase.rpc('set_delivery_zone_vehicle_fee', {
        p_zone_id: zoneId,
        p_vehicle_class: vehicle as DeliveryVehicleClass,
        p_fee_paisa: parsed.feePaisa,
      })
      if (error) {
        setErrors((prev) => ({ ...prev, [key]: `Not saved: ${error.message}` }))
        setSavingZone(null)
        return
      }
    }
    setSavingZone(null)
    await load()
  }

  return (
    <Card title="Delivery fees">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        <p style={{ color: 'var(--muted)', fontSize: 'var(--t-meta)', lineHeight: 1.5, margin: 0 }}>
          One amount for each zone and vehicle. A blank cell is not set, so no fee is charged for it. A quoted zone is
          priced per trip and takes no amounts (R-9.18, R-9.20).
        </p>
        {loadError ? (
          <div role="alert">Could not read delivery fees: {loadError}</div>
        ) : (
          zones.map((zone) => {
            const isQuoted = quoted[zone.id] === true
            return (
              <fieldset key={zone.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: 12 }}>
                <legend style={{ fontWeight: 600, color: 'var(--text)' }}>{zone.name}</legend>
                {isQuoted ? (
                  <p style={{ color: 'var(--text2)', margin: 0 }}>{deliveryFeeLabel({ status: 'quoted-per-trip' })}</p>
                ) : (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {DELIVERY_VEHICLE_CLASSES.map((vehicle) => {
                      const key = cellKey(zone.id, vehicle)
                      const stored = fees[key] ?? null
                      const shown = drafts[key] ?? (stored === null ? '' : String(stored / 100))
                      const state = resolveDeliveryFee({ quotedPerTrip: false, feePaisa: stored })
                      return (
                        <label key={key} style={{ display: 'grid', gap: 4 }}>
                          <span>{vehicle}</span>
                          <input
                            inputMode="decimal"
                            value={shown}
                            placeholder="Not set"
                            onChange={(e) => setDrafts((prev) => ({ ...prev, [key]: e.target.value }))}
                            style={{ minHeight: 44 }}
                          />
                          <span style={{ color: 'var(--text2)', fontSize: 'var(--t-caption)' }}>{deliveryFeeLabel(state)}</span>
                          {errors[key] ? (
                            <span role="alert" style={{ color: 'var(--st-danger-fg)', fontSize: 'var(--t-caption)' }}>
                              {errors[key]}
                            </span>
                          ) : null}
                        </label>
                      )
                    })}
                    <button type="button" onClick={() => void saveZone(zone.id)} disabled={savingZone === zone.id} style={{ minHeight: 44, justifySelf: 'start' }}>
                      {savingZone === zone.id ? 'Saving…' : `Save ${zone.name}`}
                    </button>
                  </div>
                )}
              </fieldset>
            )
          })
        )}
      </div>
    </Card>
  )
}
