/**
 * src/modules/operations/RiderDeliveryPage.tsx
 *
 * Dedicated mobile-first delivery interface for hired external riders (T4-08, W49).
 *
 * Requirements:
 *   - Public route `/rider/:token` (unauthenticated, token-hashed validation).
 *   - Strictly money-blind (Law 6: zero prices, rates, fees, or deposit figures).
 *   - Screen states (Law 16): loading, active, in-transit, delivered, offline,
 *     expired/revoked.
 *   - Floor touch target discipline: minimum 56px for primary floor verbs.
 *   - Drawn signature capture (T2-02) and optional photo (T2-01).
 *
 * Errors are inline (`ErrorBanner`, role="alert"), never `alert()` — Law 12.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { ErrorBanner } from '../../components/ui/StateViews'
import { SignaturePad, type SignaturePadRef } from '../../components/ui/SignaturePad'
import { useNetwork } from '../../lib/network'
import { compressEvidencePhoto } from '../../lib/imageCompression'
import {
  fetchRiderJobByToken,
  riderMarkJobPickedUp,
  riderCompleteJobDelivery,
  type RiderJobData,
} from '../../lib/queries/riderLink'

/**
 * Delivery proof is stored as text in `delivery_job_events.metadata.photo_url`
 * (0190 §rider_complete_delivery). There is no Supabase Storage bucket in this
 * project, so a data URL is the only self-contained representation: a `blob:`
 * URL is scoped to this document and resolves to nothing on the office side.
 * `compressEvidencePhoto` shrinks the image and re-encodes it through a canvas,
 * which also strips camera EXIF/GPS before a client's doorway leaves the phone.
 */
const PROOF_MAX_DIMENSION = 1280
const PROOF_MAX_BYTES = 600 * 1024

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string' && reader.result.startsWith('data:')) {
        resolve(reader.result)
        return
      }
      reject(new Error('That photo could not be read. Try taking it again.'))
    }
    reader.onerror = () => reject(new Error('That photo could not be read. Try taking it again.'))
    reader.readAsDataURL(blob)
  })
}

/** The signature contract is an SVG wrapper around a PNG data URL (0190). */
function signatureSvgFrom(pad: SignaturePadRef | null): string | undefined {
  if (!pad || pad.isEmpty()) return undefined
  const dataUrl = pad.toDataURL('image/png')
  if (!dataUrl) return undefined
  return `<svg xmlns="http://www.w3.org/2000/svg"><image href="${dataUrl}" /></svg>`
}

export default function RiderDeliveryPage() {
  const { token } = useParams<{ token: string }>()
  const isOnline = useNetwork()
  const [job, setJob] = useState<RiderJobData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [pickupLoading, setPickupLoading] = useState(false)
  const [deliveryLoading, setDeliveryLoading] = useState(false)
  const [receiverName, setReceiverName] = useState('')
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [deliverySuccess, setDeliverySuccess] = useState(false)

  const signatureRef = useRef<SignaturePadRef | null>(null)

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

  const handlePickup = async () => {
    if (!token) return
    if (!isOnline) {
      setActionError('Reconnect before confirming pickup. Nothing was sent to the office.')
      return
    }
    try {
      setActionError(null)
      setPickupLoading(true)
      await riderMarkJobPickedUp(token)
      await loadJob()
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Could not confirm pickup.')
    } finally {
      setPickupLoading(false)
    }
  }

  const handleComplete = async () => {
    if (!token) return
    const cleanReceiver = receiverName.trim()
    if (cleanReceiver.length < 2) {
      setActionError('Enter the full name of the person receiving the gear.')
      return
    }
    if (!isOnline) {
      setActionError('Reconnect before marking delivered. Nothing was sent to the office.')
      return
    }

    try {
      setActionError(null)
      setDeliveryLoading(true)
      await riderCompleteJobDelivery(
        token,
        cleanReceiver,
        signatureSvgFrom(signatureRef.current),
        photoDataUrl || undefined
      )
      setDeliverySuccess(true)
      await loadJob()
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Could not complete delivery.')
    } finally {
      setDeliveryLoading(false)
    }
  }

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget
    const file = input.files?.[0]
    if (!file) return
    setActionError(null)
    setPhotoBusy(true)
    try {
      const { blob } = await compressEvidencePhoto(file, {
        maxDimension: PROOF_MAX_DIMENSION,
        maxSizeBytes: PROOF_MAX_BYTES,
      })
      setPhotoDataUrl(await blobToDataUrl(blob))
    } catch (err: unknown) {
      setPhotoDataUrl(null)
      setActionError(err instanceof Error ? err.message : 'That photo could not be read. Try taking it again.')
    } finally {
      setPhotoBusy(false)
      // Allow re-picking the same file after a failed read.
      input.value = ''
    }
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
        {/* Offline state (Law 16) — this page cannot act without the network */}
        {!isOnline && (
          <div
            role="status"
            style={{
              padding: '12px 14px',
              borderRadius: 10,
              /* Same pair as the app-wide OfflineBanner (App.tsx): work paused,
                 not broken. --st-warn-* is not a theme token. */
              backgroundColor: 'var(--st-progress-bg)',
              color: 'var(--st-progress-fg)',
              fontSize: 13,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Icon name="error" size={16} />
            <span>You are offline. Reconnect to confirm pickup or delivery — nothing is queued.</span>
          </div>
        )}

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
            {/*
              Read-only rows with no local state, from a payload that carries no
              line id (0190 aggregates product_name + qty only). Nothing reorders
              or filters, so an index key cannot mis-associate state here.
            */}
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
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {actionError && (
              <ErrorBanner title="Pickup not confirmed" message={actionError} />
            )}
            <button
              type="button"
              data-floor-verb="pickup"
              onClick={handlePickup}
              disabled={pickupLoading || !isOnline}
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
                cursor: pickupLoading ? 'wait' : isOnline ? 'pointer' : 'not-allowed',
                opacity: isOnline ? 1 : 0.6,
              }}
            >
              <Icon name="truck" size={24} />
              <span>{pickupLoading ? 'Updating Status…' : 'Picked Up from Shop'}</span>
            </button>
            <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted)', margin: 0 }}>
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
              <label
                htmlFor="rider-receiver-name"
                style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}
              >
                Receiver Full Name <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <input
                id="rider-receiver-name"
                type="text"
                autoComplete="name"
                aria-required="true"
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
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Receiver Signature</div>
              <SignaturePad
                ref={signatureRef}
                height={150}
                strokeColor="#000000"
                guideText="Ask the receiver to sign here"
                ariaLabel="Receiver signature pad. Draw the receiver's signature with a finger or stylus."
              />
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                Ask the receiver to draw their signature in the box above.
              </div>
            </div>

            {/* Optional Photo Proof */}
            <div>
              <label
                htmlFor="rider-photo-proof"
                style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}
              >
                Delivery Photo Proof (Optional)
              </label>
              <input
                id="rider-photo-proof"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePhotoUpload}
                disabled={photoBusy}
                style={{ fontSize: 14 }}
              />
              {photoBusy && (
                <div role="status" style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
                  Preparing photo…
                </div>
              )}
              {photoDataUrl && !photoBusy && (
                <div style={{ marginTop: 8 }}>
                  <img
                    src={photoDataUrl}
                    alt="Delivery proof preview"
                    style={{ width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }}
                  />
                </div>
              )}
            </div>

            {actionError && (
              <ErrorBanner title="Delivery not recorded" message={actionError} />
            )}

            {/* Complete Delivery Button (56px touch target) */}
            <button
              type="button"
              data-floor-verb="deliver"
              onClick={handleComplete}
              disabled={deliveryLoading || photoBusy || receiverName.trim().length < 2 || !isOnline}
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
                cursor: deliveryLoading ? 'wait' : isOnline ? 'pointer' : 'not-allowed',
                opacity: receiverName.trim().length < 2 || !isOnline ? 0.6 : 1,
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
