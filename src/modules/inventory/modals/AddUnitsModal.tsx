import { useState, useRef } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Button'
import { addEquipmentUnits, type UnitIntakeRow } from '../../../actions/inventory/manageStock'
import { sanitizeBatchSerials, sanitizeSerial } from '../../../lib/formForgiveness'
import { useAuth } from '../../../lib/auth'
import { useToast } from '../../../components/ui/Toast'
import { newClientUuid } from '../../../lib/supabase'
import { useNetwork } from '../../../lib/network'

export interface AddUnitsModalProps {
  isOpen: boolean
  productId: string
  productName: string
  assetCode?: string | undefined
  warehouses: Array<{ id: string; name: string }>
  onClose: () => void
  onUnitsAdded: () => void
}

export function AddUnitsModal({
  isOpen,
  productId,
  productName,
  assetCode,
  warehouses,
  onClose,
  onUnitsAdded,
}: AddUnitsModalProps) {
  const { user } = useAuth()
  const { showSuccessToast } = useToast()
  const online = useNetwork()
  const submitting = useRef(false)
  const [mode, setMode] = useState<'single' | 'batch'>('single')
  const [warehouseId, setWarehouseId] = useState<string>(warehouses[0]?.id ?? '')
  const [rack, setRack] = useState('')
  const [shelf, setShelf] = useState('')
  const [bin, setBin] = useState('')
  const [condition, setCondition] = useState<string>('Good')
  const [purchaseDate, setPurchaseDate] = useState('')

  // Single unit serial
  const [singleSerial, setSingleSerial] = useState('')

  // Batch paste serials (one per line)
  const [batchSerialsText, setBatchSerialsText] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submissionKeyRef = useRef<{ fingerprint: string; key: string } | null>(null)

  const parsedSerials = sanitizeBatchSerials(batchSerialsText)

  const countToAdd = mode === 'single' ? 1 : parsedSerials.length

  const handleSubmit = async () => {
    if (submitting.current) return
    if (!user) {
      setError('Please sign in to add units.')
      return
    }
    if (!warehouseId) {
      setError('Please select a warehouse for intake.')
      return
    }
    if (mode === 'batch' && parsedSerials.length === 0) {
      setError('Please enter at least one serial number (one per line).')
      return
    }
    if (!online) {
      setError('Connect to add units to equipment.')
      return
    }

    submitting.current = true
    setSaving(true)
    setError(null)

    try {
      const units: UnitIntakeRow[] =
        mode === 'single'
          ? [
              {
                serial_no: sanitizeSerial(singleSerial) || undefined,
                warehouse_id: warehouseId,
                rack: rack.trim() || undefined,
                shelf: shelf.trim() || undefined,
                bin: bin.trim() || undefined,
                condition,
                purchase_date: purchaseDate || undefined,
              },
            ]
          : parsedSerials.map((serial) => ({
              serial_no: serial,
              warehouse_id: warehouseId,
              rack: rack.trim() || undefined,
              shelf: shelf.trim() || undefined,
              bin: bin.trim() || undefined,
              condition,
              purchase_date: purchaseDate || undefined,
            }))

      const fingerprint = JSON.stringify({ productId, units })
      if (!submissionKeyRef.current || submissionKeyRef.current.fingerprint !== fingerprint) {
        submissionKeyRef.current = { fingerprint, key: newClientUuid() }
      }

      const result = await addEquipmentUnits(
        { productId, units, clientUuid: submissionKeyRef.current.key },
        { userId: user.id, role: user.role, isOnline: online }
      )

      showSuccessToast(
        'Units added to fleet',
        `Successfully added ${result.added_count} ${result.added_count === 1 ? 'unit' : 'units'} to ${productName}. Total: ${result.total_quantity}.`
      )
      submissionKeyRef.current = null
      onUnitsAdded()
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      submitting.current = false
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => { if (!submitting.current) onClose() }}
      title={`Add Units — ${productName}`}
      subtitle={`Intake serialized units under asset code ${assetCode ?? 'EQ'}.`}
      size="md"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, width: '100%' }}>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={saving || (mode === 'batch' && parsedSerials.length === 0)}
          >
            {saving ? 'Adding units…' : `Confirm Add ${countToAdd} ${countToAdd === 1 ? 'Unit' : 'Units'}`}
          </Button>
        </div>
      }
    >
      <div style={{ display: 'grid', gap: 'var(--sp-md, 16px)' }}>
        {error && (
          <div
            role="alert"
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--r-btn, 8px)',
              background: 'color-mix(in srgb, var(--danger, #ef4444) 15%, var(--card))',
              border: '1px solid var(--danger)',
              color: 'var(--danger-text, #ef4444)',
              fontSize: 'var(--t-meta, 13px)',
            }}
          >
            {error}
          </div>
        )}

        {/* Mode Selector */}
        <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
          <button
            type="button"
            onClick={() => setMode('single')}
            style={{
              minHeight: 44,
              padding: '0 14px',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-btn, 8px)',
              background: mode === 'single' ? 'var(--btn-primary-bg)' : 'var(--card2)',
              color: mode === 'single' ? 'var(--btn-primary-fg)' : 'var(--text)',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Single Unit Intake
          </button>
          <button
            type="button"
            onClick={() => setMode('batch')}
            style={{
              minHeight: 44,
              padding: '0 14px',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-btn, 8px)',
              background: mode === 'batch' ? 'var(--btn-primary-bg)' : 'var(--card2)',
              color: mode === 'batch' ? 'var(--btn-primary-fg)' : 'var(--text)',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Batch Paste Serials
          </button>
        </div>

        {/* Warehouse Selection */}
        <label style={{ display: 'grid', gap: 6, fontWeight: 600, fontSize: 'var(--t-meta, 13px)' }}>
          Warehouse Location *
          <select
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
            disabled={saving}
            style={{
              minHeight: 44,
              padding: '0 12px',
              borderRadius: 'var(--r-input, 8px)',
              border: '1px solid var(--border)',
              background: 'var(--card2)',
              color: 'var(--text)',
            }}
          >
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>

        {/* Shelf Coordinates */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          <label style={{ display: 'grid', gap: 6, fontWeight: 600, fontSize: 'var(--t-th, 12px)' }}>
            Rack
            <input
              type="text"
              value={rack}
              onChange={(e) => setRack(e.target.value)}
              placeholder="e.g. A"
              style={{
                minHeight: 44,
                padding: '0 10px',
                borderRadius: 'var(--r-input, 8px)',
                border: '1px solid var(--border)',
                background: 'var(--card2)',
                color: 'var(--text)',
              }}
            />
          </label>
          <label style={{ display: 'grid', gap: 6, fontWeight: 600, fontSize: 'var(--t-th, 12px)' }}>
            Shelf
            <input
              type="text"
              value={shelf}
              onChange={(e) => setShelf(e.target.value)}
              placeholder="e.g. 2"
              style={{
                minHeight: 44,
                padding: '0 10px',
                borderRadius: 'var(--r-input, 8px)',
                border: '1px solid var(--border)',
                background: 'var(--card2)',
                color: 'var(--text)',
              }}
            />
          </label>
          <label style={{ display: 'grid', gap: 6, fontWeight: 600, fontSize: 'var(--t-th, 12px)' }}>
            Bin
            <input
              type="text"
              value={bin}
              onChange={(e) => setBin(e.target.value)}
              placeholder="e.g. 04"
              style={{
                minHeight: 44,
                padding: '0 10px',
                borderRadius: 'var(--r-input, 8px)',
                border: '1px solid var(--border)',
                background: 'var(--card2)',
                color: 'var(--text)',
              }}
            />
          </label>
        </div>

        {/* Condition & Purchase Date */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label style={{ display: 'grid', gap: 6, fontWeight: 600, fontSize: 'var(--t-th, 12px)' }}>
            Condition
            <select
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              style={{
                minHeight: 44,
                padding: '0 10px',
                borderRadius: 'var(--r-input, 8px)',
                border: '1px solid var(--border)',
                background: 'var(--card2)',
                color: 'var(--text)',
              }}
            >
              <option value="Excellent">Excellent</option>
              <option value="Good">Good</option>
              <option value="Fair">Fair</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6, fontWeight: 600, fontSize: 'var(--t-th, 12px)' }}>
            Purchase Date
            <input
              type="date"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
              style={{
                minHeight: 44,
                padding: '0 10px',
                borderRadius: 'var(--r-input, 8px)',
                border: '1px solid var(--border)',
                background: 'var(--card2)',
                color: 'var(--text)',
              }}
            />
          </label>
        </div>

        {/* Serial Inputs */}
        {mode === 'single' ? (
          <label style={{ display: 'grid', gap: 6, fontWeight: 600, fontSize: 'var(--t-meta, 13px)' }}>
            Manufacturer Serial Number (Optional)
            <input
              type="text"
              value={singleSerial}
              onChange={(e) => setSingleSerial(e.target.value)}
              onBlur={() => {
                const cleaned = sanitizeSerial(singleSerial)
                if (cleaned !== singleSerial) setSingleSerial(cleaned)
              }}
              placeholder="e.g. 7041289"
              style={{
                minHeight: 44,
                padding: '0 12px',
                borderRadius: 'var(--r-input, 8px)',
                border: '1px solid var(--border)',
                background: 'var(--card2)',
                color: 'var(--text)',
              }}
            />
          </label>
        ) : (
          <label style={{ display: 'grid', gap: 6, fontWeight: 600, fontSize: 'var(--t-meta, 13px)' }}>
            Paste Serial Numbers (One per line) *
            <textarea
              rows={5}
              value={batchSerialsText}
              onChange={(e) => setBatchSerialsText(e.target.value)}
              placeholder={'SN7041289\nSN7041290\nSN7041291'}
              style={{
                minHeight: 110,
                padding: '10px 12px',
                borderRadius: 'var(--r-input, 8px)',
                border: '1px solid var(--border)',
                background: 'var(--card2)',
                color: 'var(--text)',
                fontFamily: 'monospace',
                resize: 'vertical',
              }}
            />
            <span style={{ fontSize: 'var(--t-th, 12px)', color: 'var(--muted)' }}>
              Detected {parsedSerials.length} {parsedSerials.length === 1 ? 'serial' : 'serials'} to intake.
            </span>
          </label>
        )}
      </div>
    </Modal>
  )
}
