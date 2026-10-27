import { useEffect, useRef, useState } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Button'
import Icon from '../../../components/ui/Icon'
import { SegmentedControl } from '../../../components/ui/SegmentedControl'
import { SignaturePad, type SignaturePadRef } from '../../../components/ui/SignaturePad'
import { uploadEvidencePhoto } from '../../../lib/evidenceStorage'
import { formatAdDateTime } from '../../../lib/bs'
import { formatMoney, rupees } from '../../../lib/money'

export interface DigitalSignature {
  name: string
  role: string
  atIso: string
  dataUrl?: string | undefined
  mode: 'draw' | 'type'
  evidenceFileId?: string | null | undefined
  verifiedGovId?: boolean | undefined
  depositAcknowledged?: boolean | undefined
}

export interface SignOnGlassModalProps {
  isOpen: boolean
  onClose: () => void
  role: 'receiver' | 'warehouse' | 'returning' | 'driver'
  defaultName: string
  bookingNo: string
  bookingId?: string | undefined
  userId?: string | undefined
  clientName?: string | null | undefined
  deliveryType?: string | null | undefined
  isDepositPending?: boolean | undefined
  depositAmount?: number | null | undefined
  collectors?: Array<{ id: string; name: string; roleTitle?: string | null | undefined; phone?: string | null | undefined }> | undefined
  onSignComplete: (sig: DigitalSignature) => void
}

export function SignOnGlassModal({
  isOpen,
  onClose,
  role,
  defaultName,
  bookingNo,
  bookingId,
  userId,
  clientName,
  deliveryType,
  isDepositPending = false,
  depositAmount = null,
  collectors,
  onSignComplete,
}: SignOnGlassModalProps) {
  const [mode, setMode] = useState<'draw' | 'type'>('draw')
  const [signerName, setSignerName] = useState(defaultName || '')
  const [hasDrawn, setHasDrawn] = useState(false)
  const [agreedToTerms, setAgreedToTerms] = useState(true)
  const [verifiedGovId, setVerifiedGovId] = useState(false)
  const [depositAcknowledged, setDepositAcknowledged] = useState(!isDepositPending)
  const [canvasError, setCanvasError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  const sigPadRef = useRef<SignaturePadRef | null>(null)

  // Reset state when opened or target changes
  useEffect(() => {
    if (isOpen) {
      setSignerName(
        defaultName ||
          (role === 'receiver' || role === 'returning'
            ? clientName ?? ''
            : role === 'driver'
              ? 'Driver'
              : 'Warehouse Staff'),
      )
      setHasDrawn(false)
      setCanvasError(null)
      setAgreedToTerms(true)
      setVerifiedGovId(false)
      setDepositAcknowledged(!isDepositPending)
      setIsUploading(false)
      sigPadRef.current?.clear()
    }
  }, [isOpen, defaultName, role, clientName, isDepositPending])

  const handleClearSignature = () => {
    sigPadRef.current?.clear()
    setHasDrawn(false)
    setCanvasError(null)
  }

  const handleAcceptSignature = async () => {
    const trimmedName = signerName.trim()
    if (!trimmedName) {
      setCanvasError('Please enter the signer legal name.')
      return
    }

    if (mode === 'draw' && (!hasDrawn || sigPadRef.current?.isEmpty())) {
      setCanvasError('Please draw your signature on the glass canvas before submitting.')
      return
    }

    if (!agreedToTerms) {
      setCanvasError('You must agree to the equipment condition and legal attestation.')
      return
    }

    if (isDepositPending && !depositAcknowledged) {
      setCanvasError('Please acknowledge the security deposit hold status before dispatch.')
      return
    }

    const nowIso = new Date().toISOString()
    let dataUrl: string | undefined = undefined
    let fileToUpload: File | null = null

    if (mode === 'draw' && sigPadRef.current) {
      dataUrl = sigPadRef.current.toDataURL('image/png')
      fileToUpload = await sigPadRef.current.toFile(`signature-${role}-${Date.now()}.png`)
    } else if (mode === 'type') {
      try {
        const offCanvas = document.createElement('canvas')
        offCanvas.width = 540
        offCanvas.height = 140
        const offCtx = offCanvas.getContext('2d')
        if (offCtx) {
          offCtx.fillStyle = '#0f172a'
          offCtx.fillRect(0, 0, 540, 140)
          offCtx.fillStyle = '#38bdf8'
          offCtx.font = 'italic 38px "Brush Script MT", "Caveat", "Dancing Script", cursive'
          offCtx.fillText(trimmedName, 40, 70)

          offCtx.beginPath()
          offCtx.moveTo(35, 90)
          offCtx.bezierCurveTo(150, 98, 280, 84, 420, 92)
          offCtx.lineWidth = 2
          offCtx.strokeStyle = '#38bdf8'
          offCtx.stroke()

          offCtx.font = '10px "Outfit", sans-serif'
          offCtx.fillStyle = '#94a3b8'
          offCtx.fillText(`DIGITALLY ATTESTED · ${bookingNo} · ${formatAdDateTime(nowIso)}`, 40, 118)
          dataUrl = offCanvas.toDataURL('image/png')

          const [header, base64] = dataUrl.split(',')
          const mime = header?.match(/:(.*?);/)?.[1] || 'image/png'
          const binary = atob(base64 || '')
          const array = new Uint8Array(binary.length)
          for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i)
          fileToUpload = new File([array], `signature-${role}-${Date.now()}.png`, { type: mime })
        }
      } catch {
        // Fallback gracefully without synthetic image
      }
    }

    let evidenceFileId: string | null = null

    // Upload signature PNG to evidence bucket (T2-02) if bookingId and userId are provided
    if (fileToUpload && bookingId && userId) {
      setIsUploading(true)
      setCanvasError(null)
      try {
        const uploadResult = await uploadEvidencePhoto({
          file: fileToUpload,
          filename: `signature-${role}-${Date.now()}.png`,
          category: 'Client Documents',
          reference: {
            bookingId,
            operationStage: role === 'returning' ? 'Return' : role === 'driver' ? 'Delivery' : 'Pickup',
          },
          userId,
        })
        evidenceFileId = uploadResult.id
      } catch (err: unknown) {
        setIsUploading(false)
        const msg = err instanceof Error ? err.message : String(err)
        setCanvasError(`Could not store signature: ${msg}`)
        return
      }
      setIsUploading(false)
    }

    const mappedRole =
      role === 'receiver'
        ? 'Receiver'
        : role === 'returning'
          ? 'Returning person'
          : role === 'driver'
            ? 'Driver'
            : 'Warehouse staff'

    onSignComplete({
      name: trimmedName,
      role: mappedRole,
      atIso: nowIso,
      dataUrl,
      mode,
      evidenceFileId,
      verifiedGovId: role === 'receiver' ? verifiedGovId : undefined,
      depositAcknowledged: isDepositPending ? depositAcknowledged : undefined,
    })

    onClose()
  }

  const roleLabel =
    role === 'receiver'
      ? 'Receiver (Client / Crew Rep)'
      : role === 'returning'
        ? 'Returning Client / Courier'
        : role === 'driver'
          ? 'Driver (Delivery Handover)'
          : 'Warehouse Staff (Inspector / Dispatcher)'

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      title={`Digital Sign-on-Glass · ${roleLabel}`}
      subtitle={
        role === 'returning'
          ? `Equipment Return & Condition Sign-off for Booking ${bookingNo}`
          : `Equipment Handover Agreement for Booking ${bookingNo}${deliveryType ? ` (${deliveryType})` : ''}`
      }
      footer={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 12 }}>
          <Button variant="secondary" onClick={onClose} disabled={isUploading}>
            Cancel
          </Button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {mode === 'draw' && (
              <Button icon="refresh" variant="secondary" onClick={handleClearSignature} disabled={isUploading}>
                Clear Signature
              </Button>
            )}
            <Button
              icon="checklist"
              variant="primary"
              onClick={handleAcceptSignature}
              disabled={isUploading}
            >
              {isUploading
                ? 'Uploading Signature…'
                : role === 'returning'
                  ? 'Accept & Sign Return'
                  : 'Accept & Sign Handover'}
            </Button>
          </div>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Attestation Header Banner */}
        <div
          style={{
            padding: '12px 14px',
            borderRadius: 'var(--r-btn, 8px)',
            background: 'var(--select-bg)',
            border: '1px solid color-mix(in srgb, var(--primary, #2563eb) 25%, transparent)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
          }}
        >
          <Icon name="file" size={18} style={{ color: 'var(--primary, #38bdf8)', marginTop: 2, flexShrink: 0 }} />
          <div style={{ fontSize: 'var(--t-meta, 12px)', color: 'var(--text2)', lineHeight: 1.5 }}>
            <strong style={{ color: 'var(--text)' }}>Legal Custody & Condition Attestation:</strong>
            <p style={{ margin: '4px 0 0', color: 'var(--text)' }}>
              {role === 'receiver'
                ? `I hereby confirm receipt of the listed camera packages, flight cases, and optical gear for booking ${bookingNo} in verified operating condition with clean optical elements and intact seals. I accept legal custody and operational responsibility under Babin Rentals terms until verified return.`
                : role === 'returning'
                  ? `I hereby confirm return of the listed equipment for booking ${bookingNo}. I acknowledge the condition assessed at the counter and any recorded damage, optical discrepancies, or missing items under Babin Rentals return policies.`
                  : role === 'driver'
                    ? `I certify receipt of the packed equipment items for transport and delivery to client for booking ${bookingNo}, under verified seal and transport protocols.`
                    : `I certify that all packed equipment items and flight cases have been inspected, serial numbers verified against booking ${bookingNo}, and custody transferred or returned according to protocol.`}
            </p>
          </div>
        </div>

        {/* Deposit Hold Warning Gate if Deposit is Pending */}
        {isDepositPending && (
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 'var(--r-btn, 8px)',
              background: 'color-mix(in srgb, var(--danger, #dc2626) 8%, var(--card))',
              border: '1px solid color-mix(in srgb, var(--danger, #dc2626) 35%, transparent)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--danger-text, #ef4444)', fontWeight: 700, fontSize: 'var(--t-meta, 12px)' }}>
              <Icon name="alert_triangle" size={16} />
              <span>Security Deposit Hold Required Before Perimeter Release</span>
            </div>
            <p style={{ margin: 0, fontSize: 'var(--t-meta, 12px)', color: 'var(--text2)', lineHeight: 1.45 }}>
              A security deposit {depositAmount ? `of ${formatMoney(rupees(depositAmount))}` : ''} is required on file. Confirm that credit card pre-authorization, bank hold, or executive credit waiver is logged.
            </p>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--t-meta, 12px)', color: 'var(--text)', fontWeight: 600, cursor: 'pointer', marginTop: 4 }}>
              <input
                type="checkbox"
                checked={depositAcknowledged}
                onChange={(e) => setDepositAcknowledged(e.target.checked)}
                style={{ width: 18, height: 18, accentColor: 'var(--primary, #2563eb)' }}
              />
              <span>I confirm that the security deposit hold or authorized credit waiver is verified.</span>
            </label>
          </div>
        )}

        {/* Quick Collector Selection (W28, W34, T2-12) */}
        {role === 'receiver' && collectors && collectors.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 'var(--t-caption, 11px)', fontWeight: 600, color: 'var(--text2)' }}>
              Authorized Collector (1 Tap):
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {clientName && (
                <button
                  type="button"
                  onClick={() => setSignerName(clientName)}
                  style={{
                    minHeight: 36,
                    padding: '4px 10px',
                    borderRadius: 'var(--r-sm, 6px)',
                    border: signerName === clientName ? '1px solid var(--primary, #2563eb)' : '1px solid var(--border)',
                    background: signerName === clientName ? 'color-mix(in srgb, var(--primary, #2563eb) 15%, var(--card))' : 'var(--card2)',
                    color: 'var(--text)',
                    fontSize: 'var(--t-caption, 12px)',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {clientName} (Client)
                </button>
              )}
              {collectors.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSignerName(c.name)}
                  style={{
                    minHeight: 36,
                    padding: '4px 10px',
                    borderRadius: 'var(--r-sm, 6px)',
                    border: signerName === c.name ? '1px solid var(--primary, #2563eb)' : '1px solid var(--border)',
                    background: signerName === c.name ? 'color-mix(in srgb, var(--primary, #2563eb) 15%, var(--card))' : 'var(--card2)',
                    color: 'var(--text)',
                    fontSize: 'var(--t-caption, 12px)',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {c.name} {c.roleTitle ? `(${c.roleTitle})` : ''}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Signer Legal Identity */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <div>
            <label htmlFor="signer-name" style={{ display: 'block', fontSize: 'var(--t-meta, 12px)', fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>
              Signer Legal Full Name <span style={{ color: 'var(--danger, #ef4444)' }}>*</span>
            </label>
            <input
              id="signer-name"
              aria-label="Signer Legal Full Name"
              type="text"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder="Full name of person signing…"
              style={{
                width: '100%',
                height: 42,
                padding: '0 12px',
                borderRadius: 'var(--r-input, 6px)',
                border: '1px solid var(--border)',
                background: 'var(--input-bg, #090d16)',
                color: 'var(--text)',
                fontSize: 'var(--t-meta, 13px)',
                fontFamily: 'inherit',
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--t-meta, 12px)', fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>
              Designation / Role
            </label>
            <div
              style={{
                height: 42,
                display: 'flex',
                alignItems: 'center',
                padding: '0 12px',
                borderRadius: 'var(--r-input, 6px)',
                border: '1px solid var(--border)',
                background: 'var(--card2, #1e293b)',
                color: 'var(--text2)',
                fontSize: 'var(--t-meta, 13px)',
                fontWeight: 600,
              }}
            >
              {role === 'receiver'
                ? 'Authorized Client Receiver'
                : role === 'returning'
                  ? 'Returning Representative'
                  : role === 'driver'
                    ? 'Authorized Delivery Driver'
                    : 'Babin Rentals Dispatch Officer'}
            </div>
          </div>
        </div>

        {/* Mode Selector */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 'var(--t-meta, 12px)', fontWeight: 600, color: 'var(--text2)' }}>
              Signature Capture Mode
            </span>
            <span style={{ fontSize: 'var(--t-meta, 12px)', color: 'var(--muted)' }}>
              Touch & stylus enabled
            </span>
          </div>
          <SegmentedControl<'draw' | 'type'>
            ariaLabel="Signature capture mode"
            size="sm"
            options={[
              { id: 'draw', label: '✍️ Draw on Glass (Stylus / Touch)' },
              { id: 'type', label: '⌨️ Type Legal Signature' },
            ]}
            value={mode}
            onChange={(val) => setMode(val)}
          />
        </div>

        {/* Mode 1: Draw Canvas with SignaturePad */}
        {mode === 'draw' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <SignaturePad
              ref={sigPadRef}
              height={180}
              onDrawChange={setHasDrawn}
              ariaLabel="Sign on glass canvas"
              guideText="Sign above this line · Babin Rentals Digital Handover"
            />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 'var(--t-meta, 11px)', color: 'var(--muted)' }}>
              <span>High-resolution vector stroke capture for finger or stylus</span>
              {hasDrawn && <span style={{ color: 'var(--success-text, #22c55e)', fontWeight: 600 }}>✓ Signature Captured</span>}
            </div>
          </div>
        )}

        {/* Mode 2: Type Mode */}
        {mode === 'type' && (
          <div
            style={{
              padding: '24px 20px',
              borderRadius: 'var(--r-card, 10px)',
              border: '1.5px solid var(--border)',
              background: 'var(--input-bg, #090d16)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <div
              style={{
                fontFamily: '"Brush Script MT", "Caveat", "Dancing Script", cursive',
                fontSize: 42,
                color: 'var(--primary, #38bdf8)',
                letterSpacing: '0.02em',
                lineHeight: 1.2,
                textAlign: 'center',
                minHeight: 52,
              }}
            >
              {signerName || 'Your Signature Preview'}
            </div>
            <div style={{ width: '60%', height: 1, background: 'var(--border)' }} />
            <div style={{ fontSize: 'var(--t-meta, 11px)', color: 'var(--muted)', textAlign: 'center' }}>
              Digitally certified legal signature for {signerName || defaultName} · {formatAdDateTime(new Date().toISOString())}
            </div>
          </div>
        )}

        {/* Receiver Government ID Verification Checkbox */}
        {role === 'receiver' && (
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', fontSize: 'var(--t-meta, 12px)', color: 'var(--text)' }}>
            <input
              type="checkbox"
              checked={verifiedGovId}
              onChange={(e) => setVerifiedGovId(e.target.checked)}
              style={{ width: 18, height: 18, marginTop: 2, accentColor: 'var(--primary, #2563eb)' }}
            />
            <div>
              <strong>Verify Government Photo ID (Citizenship / National ID / Passport)</strong>
              <p style={{ margin: '2px 0 0', color: 'var(--text2)', fontSize: 11 }}>
                Checks Gate 1 (&quot;Receiver Verified&quot;) on the handover floor checklist automatically.
              </p>
            </div>
          </label>
        )}

        {/* Terms Agreement Checkbox */}
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', fontSize: 'var(--t-meta, 12px)', color: 'var(--text)' }}>
          <input
            type="checkbox"
            checked={agreedToTerms}
            onChange={(e) => setAgreedToTerms(e.target.checked)}
            style={{ width: 18, height: 18, marginTop: 2, accentColor: 'var(--primary, #2563eb)' }}
          />
          <div>
            <strong>I acknowledge and accept this digital signature as a legally binding certification.</strong>
            <p style={{ margin: '2px 0 0', color: 'var(--text2)', fontSize: 11 }}>
              Timestamp, IP telemetry, and sign-on-glass credentials are permanently associated with booking {bookingNo}.
            </p>
          </div>
        </label>

        {/* Validation Error Banner */}
        {canvasError && (
          <div
            role="alert"
            style={{
              padding: '8px 12px',
              borderRadius: 'var(--r-btn, 6px)',
              background: 'color-mix(in srgb, var(--danger, #dc2626) 12%, var(--card))',
              color: 'var(--danger-text, #ef4444)',
              fontSize: 'var(--t-meta, 12px)',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Icon name="alert_triangle" size={14} />
            <span>{canvasError}</span>
          </div>
        )}
      </div>
    </Modal>
  )
}
