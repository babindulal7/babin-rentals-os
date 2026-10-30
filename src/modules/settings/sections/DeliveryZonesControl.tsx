import { useCallback, useEffect, useState } from 'react'
import Icon from '../../../components/ui/Icon'
import { Card, Button } from '../../../components/ui/Page'
import { EmptyState, LoadingSkeleton, ErrorBanner } from '../../../components/ui/StateViews'
import { useToast } from '../../../components/ui/Toast'
import { useAuth } from '../../../lib/auth'
import { canManageSettings } from '../../../lib/rbac'
import { formatMoney } from '../../../lib/money'
import {
  listDeliveryZones,
  type ListDeliveryZonesInput,
  type DeliveryZoneRow,
} from '../../../actions/deliveryZones/listDeliveryZones'
import {
  createDeliveryZone,
  type CreateDeliveryZoneInput,
} from '../../../actions/deliveryZones/createDeliveryZone'
import {
  updateDeliveryZone,
  type UpdateDeliveryZoneInput,
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
  const { showSuccessToast, showErrorToast } = useToast()
  const canManage = canManageSettings(user?.role ?? 'Client')
  const [zones, setZones] = useState<DeliveryZoneRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingZone, setEditingZone] = useState<DeliveryZoneRow | null>(null)
  const [deletingZone, setDeletingZone] = useState<DeliveryZoneRow | null>(null)

  // Form state
  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formFeePaisa, setFormFeePaisa] = useState(350000)
  const [formIsActive, setFormIsActive] = useState(true)
  const [formSubmitting, setFormSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const loadZones = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await listDeliveryZones({ activeOnly: false })
      setZones(result.zones ?? [])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load delivery zones'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadZones()
  }, [loadZones])

  const handleCreate = async () => {
    if (!formName.trim()) {
      setFormError('Zone name cannot be empty')
      return
    }
    if (formFeePaisa < 0) {
      setFormError('Zone fee cannot be negative')
      return
    }
    if (!Number.isInteger(formFeePaisa)) {
      setFormError('Zone fee must be an integer (paisa)')
      return
    }

    setFormSubmitting(true)
    setFormError(null)
    try {
      const result = await createDeliveryZone({
        name: formName.trim(),
        description: formDescription.trim(),
        feePaisa: formFeePaisa,
      })
      showSuccessToast('Zone created', `"${formName.trim()}" has been added.`)
      setShowCreateModal(false)
      resetForm()
      await loadZones()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create zone'
      setFormError(message)
    } finally {
      setFormSubmitting(false)
    }
  }

  const handleUpdate = async () => {
    if (!editingZone) return
    if (!formName.trim()) {
      setFormError('Zone name cannot be empty')
      return
    }
    if (formFeePaisa < 0) {
      setFormError('Zone fee cannot be negative')
      return
    }
    if (!Number.isInteger(formFeePaisa)) {
      setFormError('Zone fee must be an integer (paisa)')
      return
    }

    setFormSubmitting(true)
    setFormError(null)
    try {
      const result = await updateDeliveryZone({
        zoneId: editingZone.id,
        name: formName.trim(),
        description: formDescription.trim(),
        feePaisa: formFeePaisa,
        isActive: formIsActive,
      })
      showSuccessToast('Zone updated', `"${formName.trim()}" has been updated.`)
      setEditingZone(null)
      resetForm()
      await loadZones()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update zone'
      setFormError(message)
    } finally {
      setFormSubmitting(false)
    }
  }

  const handleDeactivate = async (zone: DeliveryZoneRow) => {
    setDeletingZone(zone)
  }

  const confirmDeactivate = async () => {
    if (!deletingZone) return
    try {
      await deactivateDeliveryZone({ zoneId: deletingZone.id })
      showSuccessToast('Zone deactivated', `"${deletingZone.name}" has been deactivated.`)
      setDeletingZone(null)
      await loadZones()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to deactivate zone'
      showErrorToast('Deactivation failed', message)
      setDeletingZone(null)
    }
  }

  const openCreateModal = () => {
    resetForm()
    setShowCreateModal(true)
  }

  const openEditModal = (zone: DeliveryZoneRow) => {
    setFormName(zone.name)
    setFormDescription(zone.description ?? '')
    setFormFeePaisa(zone.fee_paisa)
    setFormIsActive(zone.is_active)
    setEditingZone(zone)
  }

  const resetForm = () => {
    setFormName('')
    setFormDescription('')
    setFormFeePaisa(350000)
    setFormIsActive(true)
    setEditingZone(null)
    setFormError(null)
  }

  const renderZoneTable = () => {
    if (loading) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1, 2, 3].map((i) => (
            <LoadingSkeleton key={i} style={{ height: 48, borderRadius: 'var(--r-input)' }} />
          ))}
        </div>
      )
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
          icon="box"
          title="No delivery zones yet"
          action={{
            label: 'Create first zone',
            onClick: openCreateModal,
          }}
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
                  <Icon name="check_circle" size={14} style={{ color: 'var(--success)' }} />
                ) : (
                  <Icon name="cancel" size={14} style={{ color: 'var(--muted)' }} />
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
                {formatMoney(zone.fee_paisa)}
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
                    <Icon name="edit" size={13} />
                    Edit
                  </Button>
                  {zone.is_active && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeactivate(zone)}
                      style={{ minHeight: 32, fontSize: '12px', color: 'var(--danger-text)', borderColor: 'var(--danger)' }}
                    >
                      <Icon name="archive" size={13} />
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 'var(--t-lg)', fontWeight: 600, color: 'var(--text)' }}>
            Delivery zones
          </h3>
          <p style={{ margin: 4, 0, 0, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
            Manage zones and fees for delivery dispatch. Pickup at the shop is always Rs 0.
          </p>
        </div>
        {canManage && (
          <Button
            variant="primary"
            onClick={openCreateModal}
            style={{ minHeight: 'var(--tap)', display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            <Icon name="plus" size={16} />
            Add zone
          </Button>
        )}
      </div>

      <Card title={null}>
        {renderZoneTable()}
      </Card>

      {/* Create/Edit Modal */}
      {(showCreateModal || editingZone) && (
        <ConfirmDialog
          open
          title={editingZone ? `Edit "${editingZone.name}"` : 'Create delivery zone'}
          message={
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
                  Fee (paisa) <span style={{ color: 'var(--danger)' }}>*</span>
                  <input
                    type="number"
                    value={formFeePaisa}
                    onChange={(e) => { setFormFeePaisa(Number(e.target.value) || 0); setFormError(null); }}
                    min={0}
                    step={1}
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
                    ⭐ Default: Rs 3,500 (350000 paisa) for valley zones. "Outside Valley" = 0 (quoted per job).
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
          onCancel={() => { setShowCreateModal(false); setEditingZone(null); resetForm(); }}
          confirmText={editingZone ? 'Save changes' : 'Create zone'}
          confirmDisabled={formSubmitting}
          confirmLoading={formSubmitting}
        />
      )}

      {/* Deactivate Confirm Dialog */}
      {deletingZone && (
        <ConfirmDialog
          open
          title={`Deactivate "${deletingZone.name}"?`}
          message={
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 300 }}>
              <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text)' }}>
                This zone will no longer be available for new delivery dispatches.
                Existing deliveries using this zone are not affected.
              </p>
              <p style={{ margin: 0, fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                Fee: <strong>{formatMoney(deletingZone.fee_paisa)}</strong>
              </p>
            </div>
          }
          onConfirm={confirmDeactivate}
          onCancel={() => setDeletingZone(null)}
          confirmText='Deactivate zone'
          confirmVariant="destructive"
        />
      )}
    </div>
  )
}