/**
 * src/modules/operations/RiderDeliveryPage.tsx
 *
 * Dedicated mobile-first delivery interface for hired external riders (T4-08, W49).
 *
 * Requirements:
 *   - Public route `/rider/:token` (unauthenticated, token-hashed validation).
 *   - Strictly money-blind (Law 6: zero prices, rates, fees, or deposit figures).
 *   - 5 screen states (Law 16): loading, active, in-transit, delivered, expired/revoked.
 *   - Floor touch target discipline: minimum 56px for primary floor verbs.
 *   - Drawn signature capture (T2-02) and optional photo (T2-01).
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import {
  fetchRiderJobByToken,
  riderMarkJobPickedUp,
  riderCompleteJobDelivery,
  type RiderJobData,
} from '../../lib/queries/riderLink'

export default function RiderDeliveryPage() {
  const { token } = useParams<{ token: string }>()
  const [job, setJob] = useState<RiderJobData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pickupLoading, setPickupLoading] = useState(false)
  const [deliveryLoading, setDeliveryLoading] = useState(false)
  const [receiverName, setReceiverName] = useState('')
  const [signatureSvg, setSignatureSvg] = useState<string | null>(null)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [deliverySuccess, setDeliverySuccess] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const loadJob = useCallback(async () => {
    if (!token) {
      setError('Invalid or missing delivery link.')
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)
      const data = await fetchRiderJobByToken(token)
      setJob(data)
      if (data.status === 'Delivered') {
        setDeliverySuccess(true)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Delivery link is unavailable or has expired.')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void loadJob()
  }, [loadJob])

  // Canvas drawing handlers for signature
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    setIsDrawing(true)
    const rect = canvas.getBoundingClientRect()
    const clientX = 'touches' in e && e.touches[0] ? e.touches[0].clientX : (e as React.MouseEvent).clientX
    const clientY = 'touches' in e && e.touches[0] ? e.touches[0].clientY : (e as React.MouseEvent).clientY

    ctx.beginPath()
    ctx.moveTo(clientX - rect.left, clientY - rect.top)
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#000000'
  }

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rect = canvas.getBoundingClientRect()
    const clientX = 'touches' in e && e.touches[0] ? e.touches[0].clientX : (e as React.MouseEvent).clientX
    const clientY = 'touches' in e && e.touches[0] ? e.touches[0].clientY : (e as React.MouseEvent).clientY

    ctx.lineTo(clientX - rect.left, clientY - rect.top)
    ctx.stroke()
  }

  const stopDrawing = () => {
    if (!isDrawing) return
    setIsDrawing(false)
    const canvas = canvasRef.current
    if (!canvas) return
    // Simple SVG representation for audit logging
    const dataUrl = canvas.toDataURL('image/png')
    setSignatureSvg(`<svg xmlns="http://www.w3.org/2000/svg"><image href="${dataUrl}" /></svg>`)
  }

  const clearSignature = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setSignatureSvg(null)
  }

  const handlePickup = async () => {
    if (!token) return
    try {
      setPickupLoading(true)
      await riderMarkJobPickedUp(token)
      await loadJob()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Could not confirm pickup.')
    } finally {
      setPickupLoading(false)
    }
  }

  const handleComplete = async () => {
    if (!token) return
    const cleanReceiver = receiverName.trim()
    if (cleanReceiver.length < 2) {
      alert('Please enter the name of the person receiving the gear.')
      return
    }

    try {
      setDeliveryLoading(true)
      await riderCompleteJobDelivery(
        token,
        cleanReceiver,
        signatureSvg || undefined,
        photoUrl || undefined
      )
      setDeliverySuccess(true)
      await loadJob()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Could not complete delivery.')
    } finally {
      setDeliveryLoading(false)
    }
  }

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    // Read local object URL for instant proof preview
    const objectUrl = URL.createObjectURL(file)
    setPhotoUrl(objectUrl)
  }

  // 1. Loading State
  if (loading) {
    return (
      <div style={{ maxWidth: 500, margin: '0 auto', padding: 24, textAlign: 'center', minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ width: 48, height: 48, border: '4px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <p style={{ marginTop: 16, color: 'var(--muted)', fontSize: 15 }}>Loading delivery details…</p>
      </div>
    )
  }

  // 2. Error / Expired / Invalid State
  if (error || !job) {
    return (
      <div style={{ maxWidth: 500, margin: '0 auto', padding: 24, textAlign: 'center', minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', backgroundColor: 'var(--st-danger-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--st-danger-fg)', marginBottom: 16 }}>
          <Icon name="alert_circle" size={32} />
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>Delivery Link Inactive</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 15, lineHeight: 1.5, margin: '0 0 24px' }}>
          {error || 'This delivery link has expired, been revoked, or already completed.'}
        </p>
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>
          If you have questions, please call Babin Rentals at <a href="tel:9851000000" style={{ color: 'var(--primary)', fontWeight: 600 }}>01-4412345</a>.
        </p>
      </div>
    )
  }

  // 3. Delivered Success State
  if (deliverySuccess || job.status === 'Delivered') {
    return (
      <div style={{ maxWidth: 500, margin: '0 auto', padding: 24, textAlign: 'center', minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', backgroundColor: 'var(--st-in-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--st-in-fg)', marginBottom: 16 }}>
          <Icon name="check" size={36} />
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px' }}>Delivery Complete!</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 15, lineHeight: 1.5, margin: '0 0 20px' }}>
          Thank you, <strong>{job.rider_name}</strong>. The delivery has been verified and registered on the system.
        </p>
        <div style={{ width: '100%', padding: 16, backgroundColor: 'var(--card)', borderRadius: 12, border: '1px solid var(--border)', textAlign: 'left', fontSize: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ color: 'var(--muted)' }}>Booking:</span>
            <span style={{ fontWeight: 600 }}>{job.booking_no}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ color: 'var(--muted)' }}>Receiver:</span>
            <span style={{ fontWeight: 600 }}>{receiverName || 'Recorded'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--muted)' }}>Status:</span>
            <span style={{ color: 'var(--success)', fontWeight: 700 }}>Delivered</span>
          </div>
        </div>
      </div>
    )
  }

  const isInTransit = job.status === 'In Transit'

  // 4. Active Job Screen
  return (
    <div style={{ maxWidth: 540, margin: '0 auto', minHeight: '100vh', backgroundColor: 'var(--bg)', paddingBottom: 64 }}>
      {/* Top Header */}
      <header style={{ padding: '16px 20px', backgroundColor: 'var(--card)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', color: 'var(--primary)', textTransform: 'uppercase' }}>
            Babin Rentals Delivery
          </span>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: '2px 0 0' }}>{job.booking_no}</h1>
        </div>
        <span style={{
          padding: '4px 10px',
          borderRadius: 20,
          fontSize: 12,
          fontWeight: 600,
          backgroundColor: isInTransit ? 'var(--st-out-bg)' : 'var(--st-neutral-bg)',
          color: isInTransit ? 'var(--st-out-fg)' : 'var(--st-neutral-fg)',
        }}>
          {job.status}
        </span>
      </header>

      <main style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Rider Greeting Card */}
        <section style={{ padding: 14, backgroundColor: 'var(--card)', borderRadius: 12, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', backgroundColor: 'var(--st-progress-bg)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="truck" size={24} />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Assigned Rider: {job.rider_name}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Phone: {job.rider_phone} · {job.leg} Trip</div>
          </div>
        </section>

        {/* Addresses: Pickup & Drop */}
        <section style={{ backgroundColor: 'var(--card)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
          {/* Pickup Point */}
          <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
              <Icon name="box" size={16} />
              <span>PICKUP POINT</span>
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{job.pickup_address}</div>
          </div>

          {/* Delivery Point */}
          <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
              <Icon name="truck" size={16} />
              <span>DELIVERY ADDRESS</span>
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{job.delivery_address}</div>
          </div>

          {/* Contact Person */}
          <div style={{ padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 600, marginBottom: 2 }}>CONTACT PERSON</div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{job.contact_name}</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{job.contact_phone}</div>
            </div>
            {job.contact_phone && (
              <a
                href={`tel:${job.contact_phone}`}
                style={{
                  minHeight: 44,
                  minWidth: 44,
                  padding: '8px 16px',
                  borderRadius: 8,
                  backgroundColor: 'var(--primary)',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  textDecoration: 'none',
                  fontWeight: 600,
                  fontSize: 14,
                }}
              >
                <Icon name="phone" size={18} />
                <span>Call</span>
              </a>
            )}
          </div>
        </section>

        {/* Item Summary (Money-blind Law 6) */}
        <section style={{ backgroundColor: 'var(--card)', borderRadius: 12, border: '1px solid var(--border)', padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600 }}>
              <Icon name="package" size={18} />
              <span>Items to Transport</span>
            </div>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>Total: {job.item_count} items</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {job.items.map((it, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', backgroundColor: 'var(--surface-2)', borderRadius: 8, fontSize: 13 }}>
                <span style={{ fontWeight: 500 }}>{it.product_name}</span>
                <span style={{ fontWeight: 700, color: 'var(--primary)' }}>Qty: {it.quantity}</span>
              </div>
            ))}
          </div>

          {job.last_note && (
            <div style={{ marginTop: 12, padding: 10, backgroundColor: 'var(--st-neutral-bg)', borderRadius: 8, fontSize: 12, color: 'var(--text-muted)' }}>
              <strong>Instructions:</strong> {job.last_note}
            </div>
          )}
        </section>

        {/* Step 1: Confirm Pickup Button (56px touch target) */}
        {!isInTransit && (
          <div style={{ marginTop: 8 }}>
            <button
              type="button"
              data-floor-verb="pickup"
              onClick={handlePickup}
              disabled={pickupLoading}
              style={{
                width: '100%',
                minHeight: 56,
                borderRadius: 12,
                backgroundColor: 'var(--primary)',
                color: '#ffffff',
                border: 'none',
                fontSize: 16,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                cursor: pickupLoading ? 'wait' : 'pointer',
              }}
            >
              <Icon name="truck" size={24} />
              <span>{pickupLoading ? 'Updating Status…' : 'Picked Up from Shop'}</span>
            </button>
            <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
              Tap once you have loaded the gear from the shop.
            </p>
          </div>
        )}

        {/* Step 2: In-Transit Delivery Form */}
        {isInTransit && (
          <section style={{ backgroundColor: 'var(--card)', borderRadius: 12, border: '1px solid var(--border)', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="check" size={20} color="var(--success)" />
              <span>Confirm Delivery</span>
            </h2>

            {/* Receiver Name */}
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                Receiver Full Name <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <input
                type="text"
                placeholder="Name of person receiving the gear"
                value={receiverName}
                onChange={(e) => setReceiverName(e.target.value)}
                style={{
                  width: '100%',
                  minHeight: 48,
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--bg)',
                  color: 'var(--text)',
                  fontSize: 15,
                }}
              />
            </div>

            {/* Signature Pad */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ fontSize: 13, fontWeight: 600 }}>Receiver Signature</label>
                {signatureSvg && (
                  <button
                    type="button"
                    onClick={clearSignature}
                    style={{ background: 'none', border: 'none', color: 'var(--danger)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                  >
                    Clear Signature
                  </button>
                )}
              </div>
              <div style={{ border: '1px dashed var(--border)', borderRadius: 8, backgroundColor: '#ffffff', overflow: 'hidden' }}>
                <canvas
                  ref={canvasRef}
                  width={480}
                  height={150}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                  style={{ width: '100%', height: 150, touchAction: 'none', display: 'block', cursor: 'crosshair' }}
                />
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                Ask the receiver to draw their signature in the box above.
              </div>
            </div>

            {/* Optional Photo Proof */}
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                Delivery Photo Proof (Optional)
              </label>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePhotoUpload}
                style={{ fontSize: 14 }}
              />
              {photoUrl && (
                <div style={{ marginTop: 8 }}>
                  <img
                    src={photoUrl}
                    alt="Delivery proof preview"
                    style={{ width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }}
                  />
                </div>
              )}
            </div>

            {/* Complete Delivery Button (56px touch target) */}
            <button
              type="button"
              data-floor-verb="deliver"
              onClick={handleComplete}
              disabled={deliveryLoading || receiverName.trim().length < 2}
              style={{
                width: '100%',
                minHeight: 56,
                borderRadius: 12,
                backgroundColor: 'var(--success)',
                color: '#ffffff',
                border: 'none',
                fontSize: 16,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                cursor: deliveryLoading ? 'wait' : 'pointer',
                opacity: receiverName.trim().length < 2 ? 0.6 : 1,
              }}
            >
              <Icon name="check" size={24} />
              <span>{deliveryLoading ? 'Submitting…' : 'Mark Delivered'}</span>
            </button>
          </section>
        )}
      </main>
    </div>
  )
}
