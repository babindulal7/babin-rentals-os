import { useState, useId } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Button'
import { recordTemporaryStock, type PartnerCostKind } from '../../../actions/inventory/recordTemporaryStock'
import { rupees } from '../../../lib/money'
import { useToast } from '../../../components/ui/Toast'
import { SUBRENTAL_PARTNERS } from '../../../lib/availability'

export interface TemporaryStockModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
  onSaved?: () => void
  productId?: string
  productName?: string
  isSerialized?: boolean
  suppliers?: Array<{ id: string; name: string }>
}

export function TemporaryStockModal({
  isOpen,
  onClose,
  onSuccess,
  onSaved,
  productId = 'prod-partner-gear',
  productName = 'Equipment',
  isSerialized = true,
  suppliers = [],
}: TemporaryStockModalProps) {
  const { showSuccessToast } = useToast()
  const supplierSelectId = useId()
  const partnerNameInputId = useId()
  const qtyInputId = useId()
  const assetCodesInputId = useId()
  const fromDateInputId = useId()
  const untilDateInputId = useId()
  const costKindSelectId = useId()
  const rateInputId = useId()
  const notesInputId = useId()

  const [supplierId, setSupplierId] = useState<string>(suppliers[0]?.id ?? '')
  const [customPartnerName, setCustomPartnerName] = useState<string>(SUBRENTAL_PARTNERS[0] ?? 'GearHouse KTM')
  const [quantity, setQuantity] = useState<number>(2)
  const [assetCodesText, setAssetCodesText] = useState<string>('P-LENS-01, P-LENS-02')

  // Default: from tomorrow 06:00 NPT (00:15 UTC) for 5 days
  const getDefaultDates = () => {
    const start = new Date()
    start.setDate(start.getDate() + 1)
    const end = new Date(start)
    end.setDate(end.getDate() + 5)
    return {
      from: start.toISOString().slice(0, 10),
      until: end.toISOString().slice(0, 10),
    }
  }

  const [dates] = useState(getDefaultDates)
  const [availableFromDate, setAvailableFromDate] = useState(dates.from)
  const [availableUntilDate, setAvailableUntilDate] = useState(dates.until)
  const [costKind, setCostKind] = useState<PartnerCostKind>('daily')
  const [costRupees, setCostRupees] = useState<number>(5000)
  const [notes, setNotes] = useState<string>('')
  const [submitting, setSubmitting] = useState<boolean>(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    if (quantity <= 0) {
      setErrorMessage('Quantity must be greater than zero.')
      return
    }

    if (new Date(availableUntilDate).getTime() <= new Date(availableFromDate).getTime()) {
      setErrorMessage('End date must be strictly after start date.')
      return
    }

    const assetCodes = isSerialized
      ? assetCodesText.split(',').map((c) => c.trim()).filter(Boolean)
      : []

    if (isSerialized && assetCodes.length > 0 && assetCodes.length !== quantity) {
      setErrorMessage(`Please provide exactly ${quantity} asset codes (currently ${assetCodes.length}).`)
      return
    }

    setSubmitting(true)
    try {
      const fromAd = `${availableFromDate}T00:15:00.000Z`
      const untilAd = `${availableUntilDate}T00:15:00.000Z`

      // If supplierId is empty, fallback to mock supplier UUID or first supplier
      const effectiveSupplierId = supplierId || (suppliers[0]?.id ?? '00000000-0000-0000-0000-000000000001')

      await recordTemporaryStock({
        supplierId: effectiveSupplierId,
        productId,
        trackingMode: isSerialized ? 'Serialised' : 'Quantity',
        quantity,
        availableFrom: fromAd,
        availableUntil: untilAd,
        costKind,
        costPaisa: rupees(costRupees),
        notes: notes ? `${notes} (Partner: ${customPartnerName})` : `Partner: ${customPartnerName}`,
        assetCodes,
      })

      showSuccessToast('Temporary partner stock recorded successfully')
      onSaved?.()
      onSuccess?.()
      onClose()
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to record temporary stock.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add Temporary Stock from Partner"
      subtitle={`Add borrowed or sub-rented gear for ${productName} for a limited period (B13).`}
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        {errorMessage && (
          <div
            role="alert"
            style={{
              padding: '10px 14px',
              borderRadius: '8px',
              background: 'var(--danger-surface, rgba(239, 68, 68, 0.1))',
              border: '1px solid var(--danger-border, var(--danger))',
              color: 'var(--danger-text)',
              fontSize: '13px',
            }}
          >
            {errorMessage}
          </div>
        )}

        {/* Partner / Supplier Selection */}
        <div>
          <label htmlFor={supplierSelectId} style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
            Rental Partner (Supplier)
          </label>
          {suppliers.length > 0 ? (
            <select
              id={supplierSelectId}
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              style={{
                width: '100%',
                minHeight: '44px',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text)',
              }}
            >
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          ) : (
            <select
              id={partnerNameInputId}
              value={customPartnerName}
              onChange={(e) => setCustomPartnerName(e.target.value)}
              style={{
                width: '100%',
                minHeight: '44px',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text)',
              }}
            >
              {SUBRENTAL_PARTNERS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Quantity & Serial Tags */}
        <div style={{ display: 'grid', gridTemplateColumns: isSerialized ? '1fr 2fr' : '1fr', gap: '12px' }}>
          <div>
            <label htmlFor={qtyInputId} style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
              Quantity
            </label>
            <input
              id={qtyInputId}
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
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

          {isSerialized && (
            <div>
              <label htmlFor={assetCodesInputId} style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                Asset tags or serial numbers (comma-separated)
              </label>
              <input
                id={assetCodesInputId}
                type="text"
                value={assetCodesText}
                onChange={(e) => setAssetCodesText(e.target.value)}
                placeholder="P-LENS-01, P-LENS-02"
                style={{
                  width: '100%',
                  minHeight: '44px',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  color: 'var(--text)',
                  fontFamily: 'monospace',
                }}
              />
            </div>
          )}
        </div>

        {/* Bounded Availability Window */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label htmlFor={fromDateInputId} style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
              Available From
            </label>
            <input
              id={fromDateInputId}
              type="date"
              value={availableFromDate}
              onChange={(e) => setAvailableFromDate(e.target.value)}
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
          <div>
            <label htmlFor={untilDateInputId} style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
              Available Until (End Date)
            </label>
            <input
              id={untilDateInputId}
              type="date"
              value={availableUntilDate}
              onChange={(e) => setAvailableUntilDate(e.target.value)}
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
        </div>

        {/* Partner Charges (B47, Law 6) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label htmlFor={costKindSelectId} style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
              Partner Charge Kind (B47)
            </label>
            <select
              id={costKindSelectId}
              value={costKind}
              onChange={(e) => setCostKind(e.target.value as PartnerCostKind)}
              style={{
                width: '100%',
                minHeight: '44px',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text)',
              }}
            >
              <option value="daily">Per Day Rate</option>
              <option value="fixed">Fixed Lump Sum</option>
            </select>
          </div>
          <div>
            <label htmlFor={rateInputId} style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
              Supplier Rate (Rs)
            </label>
            <input
              id={rateInputId}
              type="number"
              min="0"
              value={costRupees}
              onChange={(e) => setCostRupees(Math.max(0, parseInt(e.target.value, 10) || 0))}
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
        </div>

        {/* Notes */}
        <div>
          <label htmlFor={notesInputId} style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
            Notes / Agreement Reference
          </label>
          <input
            id={notesInputId}
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Agreement ref #KTM-8941, includes hard case and sunhood"
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
          <Button type="submit" variant="primary" disabled={submitting} style={{ minHeight: '44px' }}>
            {submitting ? 'Recording…' : 'Record Partner Stock'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
