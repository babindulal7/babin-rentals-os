import { useState, useEffect, useCallback } from 'react'
import { Card } from '../../../components/ui/Card'
import { Button } from '../../../components/ui/Button'
import { listProductDowntimes, type DowntimeRow } from '../../../lib/queries/downtime'
import { endDowntime } from '../../../actions/inventory/endDowntime'
import { PlanDowntimeModal } from '../modals/PlanDowntimeModal'
import { useAuth } from '../../../lib/auth'
import { canWriteFloor } from '../../../lib/rbac'
import { useToast } from '../../../components/ui/Toast'

export interface PlannedDowntimeCardProps {
  productId: string
  productName: string
  isSerialized: boolean
  units?: Array<{ id: string; assetTag: string }>
}

export function PlannedDowntimeCard({
  productId,
  productName,
  isSerialized,
  units = [],
}: PlannedDowntimeCardProps) {
  const { user } = useAuth()
  const { showSuccessToast } = useToast()
  const [downtimes, setDowntimes] = useState<DowntimeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [endingId, setEndingId] = useState<string | null>(null)

  const canPlan = user && (canWriteFloor(user.role) || user.role === 'Coordinator')

  const fetchDowntimes = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const rows = await listProductDowntimes(productId)
      setDowntimes(rows)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not load planned downtime.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [productId])

  useEffect(() => {
    void fetchDowntimes()
  }, [fetchDowntimes])

  const handleEndNow = async (downtimeId: string) => {
    if (!user) return
    setEndingId(downtimeId)
    setError(null)
    try {
      const res = await endDowntime(
        { reservationId: downtimeId },
        { userId: user.id, role: user.role },
      )
      if (res.success) {
        showSuccessToast('Downtime ended immediately (dates freed).')
        await fetchDowntimes()
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to end downtime.'
      setError(msg)
    } finally {
      setEndingId(null)
    }
  }

  const activeOrUpcoming = downtimes.filter((d) => d.releasedAt === null)

  return (
    <Card
      title="Planned Downtime & Blocks"
      action={
        canPlan ? (
          <Button variant="primary" onClick={() => setIsModalOpen(true)}>
            + Plan Downtime
          </Button>
        ) : undefined
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md, 16px)' }}>
        <p style={{ margin: 0, fontSize: 'var(--t-meta, 13px)', color: 'var(--muted, #6b7280)' }}>
          Block units for scheduled maintenance, calibration, partner loans or studio shoots.
          During downtime, units cannot be booked or reserved on the floor or online.
        </p>

        {error && (
          <div
            role="alert"
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--r-card, 6px)',
              background: 'var(--st-danger-bg, #fef2f2)',
              color: 'var(--danger-text, #991b1b)',
              fontSize: 'var(--t-meta, 13px)',
              fontWeight: 600,
            }}
          >
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ padding: 16, textAlign: 'center', color: 'var(--muted, #6b7280)' }}>
            Loading downtime schedules...
          </div>
        ) : activeOrUpcoming.length === 0 ? (
          <div
            style={{
              padding: 18,
              textAlign: 'center',
              borderRadius: 'var(--r-card, 8px)',
              background: 'var(--card2, #f9fafb)',
              border: '1px dashed var(--border, #e5e7eb)',
              color: 'var(--muted, #6b7280)',
              fontSize: 'var(--t-meta, 13px)',
            }}
          >
            No active or planned equipment downtime. All units follow standard availability.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {activeOrUpcoming.map((item) => {
              const startFormatted = item.startAt ? new Date(item.startAt).toLocaleString() : '—'
              const endFormatted = item.endAt ? new Date(item.endAt).toLocaleString() : '—'

              return (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    padding: '12px 14px',
                    borderRadius: 'var(--r-card, 8px)',
                    background: item.isActive ? 'var(--st-neutral-bg, #f1f5f9)' : 'var(--card2, #f9fafb)',
                    border: '1px solid var(--border, #e5e7eb)',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 4,
                          fontSize: 12,
                          fontWeight: 700,
                          background: item.isActive ? '#e2e8f0' : '#fef3c7',
                          color: item.isActive ? '#334155' : '#92400e',
                        }}
                      >
                        {item.isActive ? 'Active Now' : 'Scheduled'}
                      </span>
                      <strong style={{ fontSize: 'var(--t-body, 14px)' }}>
                        {item.assetTag ? `Unit ${item.assetTag}` : `${item.qty} unit(s)`}
                      </strong>
                      <span style={{ fontSize: 'var(--t-meta, 13px)', color: 'var(--text2, #4b5563)' }}>
                        Reason: <strong>{item.reason}</strong>
                      </span>
                    </div>

                    <div style={{ fontSize: 'var(--t-caption, 12px)', color: 'var(--muted, #6b7280)' }}>
                      Period: {startFormatted} → {endFormatted}
                      {item.notes && <span> · Note: "{item.notes}"</span>}
                    </div>
                  </div>

                  {canPlan && (
                    <Button
                      variant="ghost"
                      disabled={endingId === item.id}
                      onClick={() => handleEndNow(item.id)}
                      style={{
                        minHeight: 44,
                        color: 'var(--danger, #dc2626)',
                        fontWeight: 600,
                      }}
                    >
                      {endingId === item.id ? 'Ending...' : 'End now'}
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {isModalOpen && (
          <PlanDowntimeModal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            onSuccess={fetchDowntimes}
            productId={productId}
            productName={productName}
            isSerialized={isSerialized}
            units={units}
          />
        )}
      </div>
    </Card>
  )
}
