import { useState, useId } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Button'
import { returnTemporaryStock } from '../../../actions/inventory/returnTemporaryStock'
import { useToast } from '../../../components/ui/Toast'
import type { PartnerStockRecord } from '../../../lib/queries/partnerStock'

export interface ReturnPartnerStockModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
  onReturned?: () => void
  temporaryStockId?: string
  partnerName?: string
  productName?: string
  units?: Array<{ id: string; serialNumber?: string; assetCode?: string; status: string }>
  temporaryStock?: PartnerStockRecord | null
}

export function ReturnPartnerStockModal({
  isOpen,
  onClose,
  onSuccess,
  onReturned,
  temporaryStockId: propId,
  partnerName: propPartnerName,
  productName: propProductName,
  units: propUnits,
  temporaryStock,
}: ReturnPartnerStockModalProps) {
  const temporaryStockId = temporaryStock?.id ?? propId ?? ''
  const partnerName = temporaryStock?.partnerName ?? propPartnerName ?? 'Partner'
  const productName = temporaryStock?.productName ?? propProductName ?? 'Equipment'
  const units = temporaryStock?.units ?? propUnits ?? []
  const { showSuccessToast } = useToast()
  const scanInputId = useId()
  const notesInputId = useId()

  const [scannedUnits, setScannedUnits] = useState<Set<string>>(new Set())
  const [scanInput, setScanInput] = useState<string>('')
  const [notes, setNotes] = useState<string>('')
  const [submitting, setSubmitting] = useState<boolean>(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleScan = (e: React.FormEvent) => {
    e.preventDefault()
    const code = scanInput.trim().toUpperCase()
    if (!code) return

    const matched = units.find(
      (u) =>
        (u.serialNumber && u.serialNumber.toUpperCase() === code) ||
        (u.assetCode && u.assetCode.toUpperCase() === code),
    )
    if (matched) {
      setScannedUnits((prev) => new Set([...prev, matched.id]))
      setScanInput('')
      setErrorMessage(null)
    } else {
      setErrorMessage(`Asset code ${code} does not match any unit in this partner agreement.`)
    }
  }

  const toggleUnit = (unitId: string) => {
    setScannedUnits((prev) => {
      const next = new Set(prev)
      if (next.has(unitId)) next.delete(unitId)
      else next.add(unitId)
      return next
    })
  }

  const allScanned = units.length === 0 || units.every((u) => scannedUnits.has(u.id))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    if (!allScanned) {
      setErrorMessage(`Please verify/scan all ${units.length} partner units before completing return.`)
      return
    }

    setSubmitting(true)
    try {
      await returnTemporaryStock({
        temporaryStockId,
        notes: notes ? `Scanned ${units.length} units: ${notes}` : `Scanned and returned ${units.length} units to ${partnerName}.`,
      })

      showSuccessToast('Partner gear returned successfully (B36)')
      onReturned?.()
      onSuccess?.()
      onClose()
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to complete partner gear return.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Return to Partner"
      subtitle={`Scan and return ${productName} units back to ${partnerName} (B36, Law 3).`}
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        {errorMessage && (
          <div
            role="alert"
            style={{
              padding: '10px 14px',
              borderRadius: '8px',
              background: 'var(--bad-subtle, #fee2e2)',
              color: 'var(--bad, #dc2626)',
              fontSize: '13px',
            }}
          >
            {errorMessage}
          </div>
        )}

        {/* Scan input */}
        <div>
          <label htmlFor={scanInputId} style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
            Scan Unit Barcode / QR (or click unit below)
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              id={scanInputId}
              type="text"
              value={scanInput}
              onChange={(e) => setScanInput(e.target.value)}
              placeholder="Scan asset tag e.g. P-LENS-01…"
              style={{
                flex: 1,
                minHeight: '44px',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text)',
                fontFamily: 'monospace',
              }}
            />
            <Button type="button" variant="secondary" onClick={handleScan} style={{ minHeight: '44px' }}>
              Check
            </Button>
          </div>
        </div>

        {/* Units checklist */}
        <div>
          <span style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
            Units to Return ({scannedUnits.size}/{units.length})
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto' }}>
            {units.map((u) => {
              const isChecked = scannedUnits.has(u.id)
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => toggleUnit(u.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--border)',
                    background: isChecked ? 'var(--good-subtle, #dcfce7)' : 'var(--card)',
                    cursor: 'pointer',
                    minHeight: '44px',
                    textAlign: 'left',
                    color: 'inherit',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        fontSize: '10px',
                        fontWeight: 800,
                        background: '#000',
                        color: '#fff',
                        padding: '2px 5px',
                        borderRadius: '3px',
                      }}
                    >
                      PARTNER ⭐
                    </span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{u.serialNumber ?? u.assetCode}</span>
                  </div>
                  <span style={{ fontSize: '12px', color: isChecked ? 'var(--good, #16a34a)' : 'var(--text2)' }}>
                    {isChecked ? '✓ Scanned' : 'Pending scan'}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Notes */}
        <div>
          <label htmlFor={notesInputId} style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
            Return Notes (condition, handover slip)
          </label>
          <input
            id={notesInputId}
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Returned in original flightcase with all caps"
            style={{
              width: '100%',
              minHeight: '44px',
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text)',
            }}
          />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
          <Button variant="secondary" onClick={onClose} disabled={submitting} style={{ minHeight: '44px' }}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={submitting || !allScanned}
            style={{ minHeight: '56px', fontWeight: 700 }}
          >
            {submitting ? 'Returning…' : 'Complete Return to Partner (Law 3)'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
