import { useState, useEffect, useMemo } from 'react'
import { Modal, Button } from '../../components/ui'
import { ErrorBanner } from '../../components/ui/StateViews'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import {
  getCurrentShift,
  submitShiftHandover,
  SHIFT_CHECKLIST,
} from '../../lib/queries/shiftHandover'
import { fetchStaffDirectory, type StaffDirectoryRow } from '../../lib/queries/staff'

const FALLBACK_STAFF: Array<{ id: string; name: string; role: string }> = [
  { id: 'u-raju', name: 'Raju Thapa', role: 'Warehouse' },
  { id: 'u-bikash', name: 'Bikash Shrestha', role: 'Technician' },
  { id: 'u-sita', name: 'Sita Sharma', role: 'Coordinator' },
  { id: 'u-hari', name: 'Hari KC', role: 'Warehouse' },
]

export default function HandoverSheet({
  isOpen,
  onClose,
}: {
  isOpen: boolean
  onClose: () => void
  /** @deprecated drop once Header stops passing it */
  userName?: string | undefined
  /** @deprecated see userName */
  userRole?: string | undefined
}) {
  const [note, setNote] = useState('')
  const [toUserId, setToUserId] = useState<string>('')
  const [cashCounted, setCashCounted] = useState<string>('')
  const [checklist, setChecklist] = useState<Record<string, boolean>>({
    gear: true,
    cash: true,
    keys: true,
    issues: false,
    tomorrow: false,
  })
  const [staffList, setStaffList] = useState<Array<{ id: string; name: string; role: string }>>([])
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const canSeeMoney = useCanViewMoney()
  const currentShift = useMemo(() => getCurrentShift(), [])

  useEffect(() => {
    if (!isOpen) return
    let active = true

    void fetchStaffDirectory()
      .then((res) => {
        if (!active) return
        if (res.kind === 'ok') {
          const rows = res.rows
            .filter((r: StaffDirectoryRow) => r.isActive && r.id !== user?.id)
            .map((r: StaffDirectoryRow) => ({ id: r.id, name: r.fullName, role: r.primaryRole }))
          setStaffList(rows.length > 0 ? rows : FALLBACK_STAFF)
        } else {
          setStaffList(FALLBACK_STAFF.filter((s) => s.id !== user?.id))
        }
      })
      .catch(() => {
        if (active) setStaffList(FALLBACK_STAFF.filter((s) => s.id !== user?.id))
      })

    return () => {
      active = false
    }
  }, [isOpen, user?.id])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const handleHandoverAndLogout = async () => {
    if (!user) return
    setSubmitting(true)
    setErrorMessage(null)

    try {
      const selectedColleague = staffList.find((s) => s.id === toUserId)
      const cashAmount = canSeeMoney && cashCounted.trim() ? parseFloat(cashCounted) : 0
      const cashPaisa = Math.round(cashAmount * 100)

      await submitShiftHandover({
        shiftCode: currentShift.code,
        fromUserName: user.name,
        fromUserRole: user.role,
        toUserId: toUserId || null,
        toUserName: selectedColleague?.name || null,
        cashCountedPaisa: canSeeMoney && cashPaisa > 0 ? cashPaisa : null,
        cashStatus: 'matched',
        cashVariancePaisa: 0,
        notes: note.trim(),
        checklist: SHIFT_CHECKLIST.map((item) => ({
          key: item.key,
          label: item.label,
          done: checklist[item.key] ?? false,
        })),
      })

      logout()
      navigate('/login')
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not save shift handover')
      setSubmitting(false)
    }
  }

  // No session, no sheet. Law 12 — the refusal is inline and persistent.
  if (!user) {
    return (
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Ending your shift"
        footer={
          <>
            <Button variant="secondary" onClick={onClose} style={{ minHeight: 44 }}>
              Close
            </Button>
            <Button variant="primary" onClick={handleLogout} style={{ minHeight: 44 }}>
              Log out
            </Button>
          </>
        }
      >
        <ErrorBanner
          title="No signed-in session — this sheet cannot be filled in"
          message="A handover states who ended the shift and who received it. Sign in again to end a shift on the record, or log out directly."
        />
      </Modal>
    )
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Ending your shift — ${user.name} (${user.role})`}
      footer={
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', width: '100%' }}>
          <Button variant="secondary" onClick={handleLogout} disabled={submitting} style={{ minHeight: 44 }}>
            Skip & Log out
          </Button>
          <Button
            variant="primary"
            onClick={() => void handleHandoverAndLogout()}
            disabled={submitting}
            style={{ minHeight: 44 }}
          >
            {submitting ? 'Recording Handover…' : 'Hand over & Log out'}
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {errorMessage && (
          <ErrorBanner
            title="Failed to record handover"
            message={errorMessage}
          />
        )}

        {/* Current shift indicator (Ruling W32) */}
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 'var(--r-md)',
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, fontSize: 'var(--t-base)', color: 'var(--text)' }}>
              Ending: Shift {currentShift.code} ({currentShift.name})
            </span>
            <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text-muted)' }}>
              {currentShift.hours} NPT
            </span>
          </div>
          <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text-muted)' }}>
            Next handover window: {currentShift.overlapWindow} NPT → Next: Shift {currentShift.nextShiftCode}
          </p>
        </div>

        {/* Shift checklist */}
        <div>
          <h4 style={{ margin: '0 0 8px', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
            Handover Checklist
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {SHIFT_CHECKLIST.map((item) => (
              <label
                key={item.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 10px',
                  borderRadius: 'var(--r-sm)',
                  border: '1px solid var(--border)',
                  background: checklist[item.key] ? 'var(--surface-2)' : 'var(--surface)',
                  cursor: 'pointer',
                  minHeight: 40,
                }}
              >
                <input
                  type="checkbox"
                  checked={checklist[item.key] ?? false}
                  onChange={(e) =>
                    setChecklist((prev) => ({ ...prev, [item.key]: e.target.checked }))
                  }
                  style={{ width: 18, height: 18, accentColor: 'var(--primary)' }}
                />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)' }}>
                    {item.label}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {item.hint}
                  </span>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Optional cash count (Till check) — Law 6: omit for money-blind roles */}
        {canSeeMoney && (
          <div>
            <h4 style={{ margin: '0 0 6px', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
              Cash Till Count <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span>
            </h4>
            <input
              type="number"
              min="0"
              step="10"
              value={cashCounted}
              onChange={(e) => setCashCounted(e.target.value)}
              placeholder="e.g. 18400 (Rs)"
              style={{
                width: '100%',
                minHeight: 44,
                padding: '8px 12px',
                borderRadius: 'var(--r-btn)',
                border: '1px solid var(--input-border)',
                background: 'var(--input-bg)',
                color: 'var(--text)',
                fontSize: 'var(--t-base)',
              }}
            />
          </div>
        )}

        {/* Handover recipient picker */}
        <div>
          <h4 style={{ margin: '0 0 6px', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
            Handing over to <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(next shift colleague)</span>
          </h4>
          <select
            value={toUserId}
            onChange={(e) => setToUserId(e.target.value)}
            style={{
              width: '100%',
              minHeight: 44,
              padding: '0 12px',
              borderRadius: 'var(--r-btn)',
              border: '1px solid var(--input-border)',
              background: 'var(--input-bg)',
              color: 'var(--text)',
              fontSize: 'var(--t-base)',
            }}
          >
            <option value="">General Handover (Unassigned colleague)</option>
            {staffList.map((colleague) => (
              <option key={colleague.id} value={colleague.id}>
                {colleague.name} ({colleague.role})
              </option>
            ))}
          </select>
        </div>

        {/* Handover notes */}
        <div>
          <h4 style={{ margin: '0 0 4px', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
            Notes for next shift
          </h4>
          <textarea
            value={note}
            aria-label="Notes for the next shift"
            onChange={(e) => setNote(e.target.value)}
            placeholder="Key gear alerts, staging locations, client remarks..."
            style={{
              width: '100%',
              minHeight: 80,
              padding: '10px 12px',
              borderRadius: 'var(--r-btn)',
              border: '1px solid var(--input-border)',
              background: 'var(--input-bg)',
              color: 'var(--text)',
              fontFamily: 'inherit',
              fontSize: 'var(--t-base)',
              resize: 'vertical',
            }}
          />
        </div>
      </div>
    </Modal>
  )
}
