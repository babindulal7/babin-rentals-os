import { useCallback, useEffect, useState } from 'react'
import Icon from '../../../components/ui/Icon'
import { Card, Button } from '../../../components/ui/Page'
import { EmptyState, LoadingSkeleton, ErrorBanner } from '../../../components/ui/StateViews'
import { useToast } from '../../../components/ui/Toast'
import { useAuth } from '../../../lib/auth'
import { canManageDeliveryZones } from '../../../lib/rbac'
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
import { formatDistanceBand, parseBandInput, type DistanceBand } from '../../../lib/deliveryDistanceBand'
import { fetchDistanceBands, setDistanceBand } from '../../../lib/queries/deliveryDistanceBands'

const sameBand = (a: DistanceBand | null, b: DistanceBand | null): boolean =>
  a === null || b === null ? a === b : a.minKm === b.minKm && a.maxKm === b.maxKm

/**
 * Settings ▸ System ▸ Operations ▸ Delivery Zones control (T4-07, migration 0189).
 * Manages delivery zones with per-zone fees for dispatch calculation.
 */
export function DeliveryZonesControl() {
  const { user } = useAuth()
  const { showSuccessToast } = useToast()
  // Capability gate, not the broader `settings.manage` gate: the card's role set
  // for zones is Owner · Admin · Manager, mirroring the RLS policy (T4-07).
  const canManage = canManageDeliveryZones(user?.role ?? 'Client')
  const [zones, setZones] = useState<DeliveryZoneRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingZone, setEditingZone] = useState<DeliveryZoneRow | null>(null)
  const [deletingZone, setDeletingZone] = useState<DeliveryZoneRow | null>(null)

  // Form state. The per-zone fee is retired (O-28, 18 Nov 2026): amounts are set in Delivery fees.
  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formIsActive, setFormIsActive] = useState(true)
  const [formSubmitting, setFormSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  // O-28b: road-distance band from Boudha, a check only (no price depends on it).
  const [bands, setBands] = useState<Map<string, DistanceBand>>(new Map())
  const [bandNote, setBandNote] = useState<string | null>(null)
  const [formMinKm, setFormMinKm] = useState('')
  const [formMaxKm, setFormMaxKm] = useState('')

  // The delivery-zone actions refuse a call without the signed-in identity (no default user).
  // Primitives keep the callback identity stable across renders.
  const sessionUserId = user?.id ?? null
  const sessionRole = user?.role ?? null
  const actorContext = useCallback(() => {
    if (!sessionUserId || !sessionRole) throw new Error('Sign in to manage delivery zones')
    return { userId: sessionUserId, role: sessionRole }
  }, [sessionUserId, sessionRole])

  const loadZones = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await listDeliveryZones({ activeOnly: false, limit: 100 }, actorContext())
      setZones(res.zones)
      // A failed band read must not hide the zones; it is reported beside the list instead.
      try {
        setBands(await fetchDistanceBands())
        setBandNote(null)
      } catch (bandErr) {
        setBands(new Map())
        setBandNote(bandErr instanceof Error ? bandErr.message : 'Could not read the zone distance bands')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load delivery zones')
    } finally {
      setLoading(false)
    }
  }, [actorContext])

  useEffect(() => {
    void loadZones()
  }, [loadZones])

  const openCreateModal = () => {
    setFormName('')
    setFormDescription('')
    setFormIsActive(true)
    setFormMinKm('')
    setFormMaxKm('')
    setEditingZone(null)
    setFormError(null)
    setShowCreateModal(true)
  }

  const openEditModal = (zone: DeliveryZoneRow) => {
    setFormName(zone.name)
    setFormDescription(zone.description || '')
    setFormIsActive(zone.is_active)
    const band = bands.get(zone.id)
    setFormMinKm(band ? String(band.minKm) : '')
    setFormMaxKm(band && band.maxKm !== null ? String(band.maxKm) : '')
    setEditingZone(zone)
    setFormError(null)
    setShowCreateModal(false)
  }

  const handleCreate = async () => {
    if (!formName.trim()) {
      setFormError('Zone name is required')
      return
    }
    const parsedBand = parseBandInput(formMinKm, formMaxKm)
    if (!parsedBand.ok) {
      setFormError(parsedBand.error)
      return
    }

    try {
      setFormSubmitting(true)
      setFormError(null)
      const created = await createDeliveryZone(
        {
          name: formName.trim(),
          description: formDescription.trim(),
        },
        actorContext(),
      )
      showSuccessToast('Zone created', `Delivery zone "${formName.trim()}" created successfully`)
      setShowCreateModal(false)
      resetForm()
      let bandFailure: string | null = null
      if (parsedBand.band) {
        try {
          await setDistanceBand(created.zoneId, parsedBand.band)
        } catch (bandErr) {
          bandFailure = `Zone created, but ${bandErr instanceof Error ? bandErr.message : 'the distance band was not saved'}`
        }
      }
      await loadZones()
      if (bandFailure) setBandNote(bandFailure)
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
    const parsedBand = parseBandInput(formMinKm, formMaxKm)
    if (!parsedBand.ok) {
      setFormError(parsedBand.error)
      return
    }

    try {
      setFormSubmitting(true)
      setFormError(null)
      await updateDeliveryZone(
        {
          zoneId: editingZone.id,
          name: formName.trim(),
          description: formDescription.trim(),
          isActive: formIsActive,
        },
        actorContext(),
      )
      showSuccessToast('Zone updated', `Delivery zone "${formName.trim()}" updated successfully`)
      const zoneId = editingZone.id
      setEditingZone(null)
      resetForm()
      let bandFailure: string | null = null
      if (!sameBand(parsedBand.band, bands.get(zoneId) ?? null)) {
        try {
          await setDistanceBand(zoneId, parsedBand.band)
        } catch (bandErr) {
          bandFailure = `Zone updated, but ${bandErr instanceof Error ? bandErr.message : 'the distance band was not saved'}`
        }
      }
      await loadZones()
      if (bandFailure) setBandNote(bandFailure)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to update zone')
    } finally {
      setFormSubmitting(false)
    }
  }

  const confirmDeactivate = async () => {
    if (!deletingZone) return
    try {
      await deactivateDeliveryZone({ zoneId: deletingZone.id }, actorContext())
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
    setFormIsActive(true)
    setFormMinKm('')
    setFormMaxKm('')
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
          description={
            canManage
              ? 'Create a delivery zone to configure delivery fees.'
              : 'No delivery zones have been configured yet.'
          }
          {...(canManage
            ? { actionLabel: 'Create first zone', onAction: openCreateModal }
            : {})}
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
              <span style={{ fontSize: 'var(--t-th)', color: 'var(--text2)' }}>
                Road distance from Boudha: {formatDistanceBand(bands.get(zone.id))}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', flexShrink: 0 }}>
              <span style={{ fontSize: 'var(--t-meta)', fontWeight: 600, fontFamily: 'var(--mono)', color: 'var(--text)' }}>
                Amounts in Delivery fees
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

          {bandNote ? <ErrorBanner message={bandNote} /> : null}

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
              <div style={{ display: 'flex', gap: 12 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--t-meta)', fontWeight: 500, flex: 1 }}>
                  Road distance over (km)
                  <input
                    type="text"
                    inputMode="decimal"
                    value={formMinKm}
                    onChange={(e) => { setFormMinKm(e.target.value); setFormError(null); }}
                    placeholder="e.g., 3"
                    style={{ marginTop: 4, padding: '10px 12px', borderRadius: 'var(--r-input)', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontFamily: 'inherit' }}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--t-meta)', fontWeight: 500, flex: 1 }}>
                  Up to (km)
                  <input
                    type="text"
                    inputMode="decimal"
                    value={formMaxKm}
                    onChange={(e) => { setFormMaxKm(e.target.value); setFormError(null); }}
                    placeholder="blank = no upper limit"
                    style={{ marginTop: 4, padding: '10px 12px', borderRadius: 'var(--r-input)', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontFamily: 'inherit' }}
                  />
                </label>
              </div>
              <p style={{ margin: 0, fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                Shortest practical driving route from Boudha, not straight-line. A check for staff only: it does not change any
                price (O-28b). Use 0 as the lower distance for the nearest zone. Leave both blank for not set.
              </p>
              <p style={{ margin: 0, fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                Amounts are set per zone and vehicle class in Settings ▸ Financial ▸ Delivery fees. A zone is quoted per trip
                from that grid, not from this form (O-28, 18 Nov 2026).
              </p>
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
                Amounts for this zone are held in Delivery fees; deactivating the zone does not change them.
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
