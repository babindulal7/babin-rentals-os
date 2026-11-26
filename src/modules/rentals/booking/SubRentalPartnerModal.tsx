import React, { useState, useEffect } from 'react'
import Icon from '../../../components/ui/Icon'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Button'
import { rupees, type Paisa } from '../../../lib/money'
import type { EquipmentResult } from './itemCatalogue'

export interface SubRentalPartnerModalProps {
  isOpen: boolean
  onClose: () => void
  unit: EquipmentResult | null
  days: number
  showPrices?: boolean
  onConfirm: (unit: EquipmentResult, partner: string, ratePaisa?: Paisa, supplierCost?: number) => void
}

export function SubRentalPartnerModal({
  isOpen,
  onClose,
  unit,
  days,
  showPrices = false,
  onConfirm,
}: SubRentalPartnerModalProps) {
  const [partner, setPartner] = useState<string>('')
  const [rateRupees, setRateRupees] = useState<string>('')
  const [costRupees, setCostRupees] = useState<string>('')

  useEffect(() => {
    if (isOpen && unit) {
      setPartner('')
      const defaultRate = unit.ratePaisa ? Math.round(unit.ratePaisa / 100) : 0
      setRateRupees(defaultRate > 0 ? String(defaultRate) : '')
      setCostRupees('')
    }
  }, [isOpen, unit])

  if (!unit) return null

  const effectivePartner = partner.trim()
  const isValid = Boolean(effectivePartner)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValid) return
    const customRate = showPrices && rateRupees ? (rupees(Number(rateRupees) || 0) as Paisa) : undefined
    const supplierCost = showPrices && costRupees ? Number(costRupees) || 0 : undefined
    onConfirm(unit, effectivePartner, customRate, supplierCost)
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      title={`Sub-Rent ${unit.name}`}
      subtitle={`Cross-hire for ${days} day${days === 1 ? '' : 's'} · Bypasses internal inventory conflict`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!isValid} onClick={handleSubmit}>
            Add Sub-Rental Line
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md, 12px)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label
            htmlFor="subrent-partner-select"
            style={{ fontSize: 'var(--t-meta, 12px)', fontWeight: 600, color: 'var(--text, #111)' }}
          >
            Partner / External Supplier
          </label>
          <input
            id="subrent-partner-select"
            type="text"
            required
            value={partner}
            onChange={(e) => setPartner(e.target.value)}
            autoComplete="off"
            style={{ width: '100%', minHeight: 44, padding: '0 10px', borderRadius: 'var(--r-input, 6px)', border: '1px solid var(--border, #d1d5db)', background: 'var(--card, #fff)', color: 'var(--text, #111)', fontSize: 'var(--t-meta, 13px)' }}
          />
        </div>

        {/* Money gating (Law 6) — visible to money roles only */}
        {showPrices && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label
                htmlFor="subrent-client-rate"
                style={{ fontSize: 'var(--t-meta, 12px)', fontWeight: 600, color: 'var(--text, #111)' }}
              >
                Client Rate / Day (Rs.)
              </label>
              <input
                id="subrent-client-rate"
                type="number"
                min="0"
                step="1"
                value={rateRupees}
                onChange={(e) => setRateRupees(e.target.value)}
                placeholder="Client rate"
                style={{
                  width: '100%',
                  minHeight: 40,
                  padding: '0 10px',
                  borderRadius: 'var(--r-input, 6px)',
                  border: '1px solid var(--border, #d1d5db)',
                  background: 'var(--card, #fff)',
                  color: 'var(--text, #111)',
                  fontSize: 'var(--t-meta, 13px)',
                }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label
                htmlFor="subrent-supplier-cost"
                style={{ fontSize: 'var(--t-meta, 12px)', fontWeight: 600, color: 'var(--text, #111)' }}
              >
                Supplier Cost / Day (Rs.)
              </label>
              <input
                id="subrent-supplier-cost"
                type="number"
                min="0"
                step="1"
                value={costRupees}
                onChange={(e) => setCostRupees(e.target.value)}
                placeholder="Supplier cost"
                style={{
                  width: '100%',
                  minHeight: 40,
                  padding: '0 10px',
                  borderRadius: 'var(--r-input, 6px)',
                  border: '1px solid var(--border, #d1d5db)',
                  background: 'var(--card, #fff)',
                  color: 'var(--text, #111)',
                  fontSize: 'var(--t-meta, 13px)',
                }}
              />
            </div>
          </div>
        )}

        <div
          style={{
            padding: '8px 10px',
            borderRadius: 'var(--r-badge, 6px)',
            background: 'var(--hover-row, #f3f4f6)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 7,
          }}
        >
          <Icon name="info" size={14} style={{ color: 'var(--muted, #6b7280)', flexShrink: 0, marginTop: 2 }} />
          <span style={{ fontSize: '11px', color: 'var(--text2, #4b5563)', lineHeight: 1.4 }}>
            Sub-renting records the external vendor ({effectivePartner || '…'}) directly on the booking line.
            The in-house unit remains blocked.
          </span>
        </div>
      </form>
    </Modal>
  )
}
