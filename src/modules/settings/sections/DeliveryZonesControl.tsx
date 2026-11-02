import { useCallback, useEffect, useState } from 'react'
import Icon from '../../../components/ui/Icon'
import { Card, Button } from '../../../components/ui/Page'
import { EmptyState, LoadingSkeleton, ErrorBanner } from '../../../components/ui/StateViews'
import { useToast } from '../../../components/ui/Toast'
import { useAuth } from '../../../lib/auth'
import { canManageDeliveryZones } from '../../../lib/rbac'
import { formatMoney, parseMoney, toRupees, type Paisa } from '../../../lib/money'
import {
  listDeliveryZones,
  type DeliveryZoneRow,
} from '../../../actions/deliveryZones/listDeliveryZones'
import {
  createDeliveryZone,
} from '../../../actions/deliveryZones/createDeliveryZone'
import {
  updateDeliveryZone,
} from '../../../actions/deliveryZones/updateDeliveryZone'
import {
  deactivateDeliveryZone,
} from '../../../actions/deliveryZones/deactivateDeliveryZone'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'

/**
 * Settings ▸ System ▸ Operations ▸ Delivery Zones control (T4-07, migration 0189).
 * Manages delivery zones with per-zone fees for dispatch calculation.
 */
export function DeliveryZonesControl() {
  const { user } = useAuth()
  const { showSuccessToast } = useToast()
  const canManage = canManageDeliveryZones(user?.role ?? 'Client')
  const [zones, setZones] = useState<DeliveryZoneRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingZone, setEditingZone] = useState<DeliveryZoneRow | null>(null)
  const [deletingZone, setDeletingZone] = useState<DeliveryZoneRow | null>(null)

  // Form state
  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formFeeRupees, setFormFeeRupees] = useState('3500')
  const [formIsActive, setFormIsActive] = useState(true)
  const [formSubmitting, setFormSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const loadZones = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await listDeliveryZones({ activeOnly: false, limit: 100 })
      setZones(res.zones)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load delivery zones')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadZones()
  }, [loadZones])

  const openCreateModal = () => {
    setFormName('')
    setFormDescription('')
    setFormFeeRupees('3500')
    setFormIsActive(true)
    setEditingZone(null)
    setFormError(null)
    setShowCreateModal(true)
  }

  const openEditModal = (zone: DeliveryZoneRow) => {
    setFormName(zone.name)
    setFormDescription(zone.description || '')
    setFormFeeRupees(zone.fee_paisa == null ? '' : String(toRupees(zone.fee_paisa as Paisa)))
    setFormIsActive(zone.is_active)
    setEditingZone(zone)
    setFormError(null)
    setShowCreateModal(false)
  }

  const handleCreate = async () => {
    if (!formName.trim()) {
      setFormError('Zone name is required')
      return
    }
    const parsedFee = /[eE]/.test(formFeeRupees) ? null : parseMoney(formFeeRupees)
    if (parsedFee === null || parsedFee < 0 || !Number.isSafeInteger(parsedFee)) {
      setFormError('Enter a valid non-negative fee in rupees')
      return
    }

    try {
      setFormSubmitting(true)
      setFormError(null)
      await createDeliveryZone({
        name: formName.trim(),
        description: formDescription.trim(),
        feePaisa: parsedFee,
      })
      showSuccessToast('Zone created', `Delivery zone "${formName.trim()}" created successfully`)
      setShowCreateModal(false)
      resetForm()
      await loadZones()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create zone')
    } finally {
      setFormSubmitting(false)
    }
  }

  const handleUpdate = async () => {
    if (!editingZone) return
    if (!formName.trim()) {
      setFormError('Zone name is required')
      return
    }
    const parsedFee = /[eE]/.test(formFeeRupees) ? null : parseMoney(formFeeRupees)
    if (parsedFee === null || parsedFee < 0 || !Number.isSafeInteger(parsedFee)) {
      setFormError('Enter a valid non-negative fee in rupees')
      return
    }

    try {
      setFormSubmitting(true)
      setFormError(null)
      await updateDeliveryZone({
        zoneId: editingZone.id,
        name: formName.trim(),
        description: formDescription.trim(),
        feePaisa: parsedFee,
        isActive: formIsActive,
      })
      showSuccessToast('Zone updated', `Delivery zone "${formName.trim()}" updated successfully`)
      setEditingZone(null)
      resetForm()
      await loadZones()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to update zone')
    } finally {
      setFormSubmitting(false)
    }
  }

  const confirmDeactivate = async () => {
    if (!deletingZone) return
    try {
      await deactivateDeliveryZone({ zoneId: deletingZone.id })
      showSuccessToast('Zone deactivated', `Delivery zone "${deletingZone.name}" deactivated`)
      setDeletingZone(null)
      await loadZones()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to deactivate zone')
    }
  }

  const resetForm = () => {
    setFormName('')
    setFormDescription('')
    setFormFeeRupees('3500')
    setFormIsActive(true)
    setEditingZone(null)
    setFormError(null)
  }

  const renderZoneTable = () => {
    if (loading) {
      return <LoadingSkeleton type="table" rows={4} label="Loading delivery zones…" />
    }

    if (error) {
      return <ErrorBanner message={error} />
    }

    const activeZones = zones.filter(z => z.is_active)
    const inactiveZones = zones.filter(z => !z.is_active)
    const displayZones = [...activeZones, ...inactiveZones]

    if (displayZones.length === 0) {
      return (
        <EmptyState
          title="No delivery zones yet"
          description="Create a delivery zone to configure delivery fees."
          actionLabel="Create first zone"
          onAction={openCreateModal}
        />
      )
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {displayZones.map((zone) => (
          <div
            key={zone.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              padding: '12px 16px',
              borderRadius: 'var(--r-input)',
              border: `1px solid ${zone.is_active ? 'var(--border)' : 'var(--divider)'}`,
              background: zone.is_active ? 'var(--card)' : 'var(--card2)',
              opacity: zone.is_active ? 1 : 0.6,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 600, fontSize: 'var(--t-meta)', color: 'var(--text)' }}>
                  {zone.name}
                </span>
                {zone.is_active ? (
                  <Icon name="check" size={14} style={{ color: 'var(--success)' }} />
                ) : (
                  <Icon name="x" size={14} style={{ color: 'var(--muted)' }} />
                )}
              </div>
              {zone.description && (
                <span style={{ fontSize: 'var(--t-th)', color: 'var(--text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {zone.description}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', flexShrink: 0 }}>
              <span style={{ fontSize: 'var(--t-meta)', fontWeight: 600, fontFamily: 'var(--mono)', color: 'var(--text)' }}>
                {zone.fee_paisa == null ? 'Fee restricted' : formatMoney(zone.fee_paisa as Paisa)}
              </span>
              {canManage && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEditModal(zone)}
                    disabled={!zone.is_active}
                    style={{ minHeight: 32, fontSize: '12px' }}
                  >
                    Edit
                  </Button>
                  {zone.is_active && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeletingZone(zone)}
                      style={{ minHeight: 32, fontSize: '12px', color: 'var(--danger)' }}
                    >
                      Deactivate
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card
        title="Delivery zones and fees"
        action={
          canManage ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={openCreateModal}
              disabled={loading}
              style={{ minHeight: 36, fontSize: '13px' }}
            >
              Add zone
            </Button>
          ) : undefined
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
            Flat delivery fees per geographic zone across Kathmandu Valley and surrounding areas.
            Applied when dispatching rentals with Babin Delivery.
          </p>

          {renderZoneTable()}
        </div>
      </Card>

      {/* Create/Edit Dialog */}
      <ConfirmDialog
        isOpen={Boolean(showCreateModal || editingZone)}
        title={editingZone ? `Edit "${editingZone.name}"` : 'Create delivery zone'}
        description={
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 320 }}>
            {formError && (
              <div style={{ padding: '8px 12px', borderRadius: 'var(--r-input)', background: 'var(--danger-bg)', color: 'var(--danger-text)', fontSize: 'var(--t-th)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="alert_triangle" size={14} />
                {formError}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--t-meta)', fontWeight: 500 }}>
                Zone name <span style={{ color: 'var(--danger)' }}>*</span>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => { setFormName(e.target.value); setFormError(null); }}
                  placeholder="e.g., Ring Road, Boudha, Outside Valley"
                  style={{
                    marginTop: 4,
                    padding: '10px 12px',
                    borderRadius: 'var(--r-input)',
                    border: '1px solid var(--input-border)',
                    background: 'var(--input-bg)',
                    color: 'var(--text)',
                    fontSize: 'var(--t-meta)',
                    fontFamily: 'inherit',
                  }}
                  autoFocus
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--t-meta)', fontWeight: 500 }}>
                Description
                <input
                  type="text"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Human-readable description of zone boundaries"
                  style={{
                    marginTop: 4,
                    padding: '10px 12px',
                    borderRadius: 'var(--r-input)',
                    border: '1px solid var(--input-border)',
                    background: 'var(--input-bg)',
                    color: 'var(--text)',
                    fontSize: 'var(--t-meta)',
                    fontFamily: 'inherit',
                  }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--t-meta)', fontWeight: 500 }}>
                Fee (Rs) <span style={{ color: 'var(--danger)' }}>*</span>
                <input
                  type="number"
                  value={formFeeRupees}
                  onChange={(e) => { setFormFeeRupees(e.target.value); setFormError(null); }}
                  min={0}
                  step={0.01}
                  style={{
                    marginTop: 4,
                    padding: '10px 12px',
                    borderRadius: 'var(--r-input)',
                    border: '1px solid var(--input-border)',
                    background: 'var(--input-bg)',
                    color: 'var(--text)',
                    fontSize: 'var(--t-meta)',
                    fontFamily: 'var(--mono)',
                  }}
                />
                <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                  Default: Rs 3,500 for valley zones. "Outside Valley" = 0 (quoted per job).
                </span>
              </label>
              {editingZone && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--t-meta)' }}>
                  <input
                    type="checkbox"
                    checked={formIsActive}
                    onChange={(e) => setFormIsActive(e.target.checked)}
                    style={{ width: 18, height: 18, accentColor: 'var(--success)' }}
                  />
                  <span>Active (available for new dispatches)</span>
                </label>
              )}
            </div>
          </div>
        }
        onConfirm={editingZone ? handleUpdate : handleCreate}
        onClose={() => { setShowCreateModal(false); setEditingZone(null); resetForm(); }}
        confirmLabel={editingZone ? 'Save changes' : 'Create zone'}
        isSubmitting={formSubmitting}
      />

      {/* Deactivate Confirm Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deletingZone)}
        title={deletingZone ? `Deactivate "${deletingZone.name}"?` : 'Deactivate zone?'}
        description={
          deletingZone ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 300 }}>
              <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text)' }}>
                This zone will no longer be available for new delivery dispatches.
                Existing deliveries using this zone are not affected.
              </p>
              <p style={{ margin: 0, fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                Fee: <strong>{deletingZone.fee_paisa == null ? 'Restricted' : formatMoney(deletingZone.fee_paisa as Paisa)}</strong>
              </p>
            </div>
          ) : undefined
        }
        onConfirm={confirmDeactivate}
        onClose={() => setDeletingZone(null)}
        confirmLabel="Deactivate zone"
        variant="danger"
      />
    </div>
  )
}
