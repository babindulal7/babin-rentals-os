/**
 * Shift Handover Panel — collapsible section for the Today dashboard.
 *
 * Implements T4-05 (Ruling S6, Ruling W32, Law 3, Law 6).
 * Backed by Supabase table `shift_handovers` and view `shift_handovers_v`.
 * Shows a 5-item checklist, "Complete Handover" action, "Acknowledge" for incoming shift,
 * and an expandable log of past handovers with KPIs.
 */
import { useState, useMemo, useCallback, useEffect } from 'react'
import { Card, KpiStrip } from '../../components/ui/Page'
import type { Kpi } from '../../components/ui/Page'
import { Button } from '../../components/ui/Button'
import Icon from '../../components/ui/Icon'
import { Badge } from '../../components/ui/Badge'
import { useToast } from '../../components/ui/Toast'
import { useViewport } from '../../lib/device'
import { useAuth } from '../../lib/auth'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { IS_MOCK } from '../../lib/supabase'
import {
  SHIFT_CHECKLIST,
  getCurrentShift,
  fetchShiftHandovers,
  submitShiftHandover,
  acknowledgeShiftHandover,
  type ShiftHandoverEntity,
  type HandoverRecord,
} from '../../lib/queries/shiftHandover'

// ── Styles ───────────────────────────────────────────────────────────

const sectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--sp-md)',
  marginTop: 'var(--sp-lg)',
}

const headerBarStyle: React.CSSProperties = {
  cursor: 'pointer',
  padding: '12px 16px',
  borderRadius: 'var(--radius)',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
}

const checklistStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  padding: '16px',
}

const checkItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  cursor: 'pointer',
  padding: '10px 12px',
  borderRadius: '10px',
  border: '1px solid var(--border)',
  transition: 'background 0.15s',
  minHeight: 'var(--tap, 44px)',
}

const logRowStyle: React.CSSProperties = {
  padding: '12px 16px',
  borderBottom: '1px solid var(--border)',
  cursor: 'pointer',
}

const logRowHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
}

const logRowMetaStyle: React.CSSProperties = {
  display: 'flex',
  gap: '16px',
  flexWrap: 'wrap',
  fontSize: 'var(--t-meta)',
  color: 'var(--text2)',
}

const noteBoxStyle: React.CSSProperties = {
  marginTop: '8px',
  padding: '10px 12px',
  borderRadius: '8px',
  background: 'var(--surface)',
  fontSize: 'var(--t-meta)',
  color: 'var(--text2)',
  lineHeight: 1.5,
}

// ── Component ────────────────────────────────────────────────────────

export default function ShiftHandoverPanel() {
  const { showSuccessToast } = useToast()
  const viewport = useViewport()
  const isPhone = viewport === 'phone'
  const { user } = useAuth()
  const canSeeMoney = useCanViewMoney()

  const currentShift = useMemo(() => getCurrentShift(), [])

  const [expanded, setExpanded] = useState(false)
  const [logExpanded, setLogExpanded] = useState(false)
  const [checks, setChecks] = useState<Record<string, boolean>>({})
  const [entities, setEntities] = useState<ShiftHandoverEntity[]>([])
  const [openLogId, setOpenLogId] = useState<string | null>(null)
  const [acknowledging, setAcknowledging] = useState(false)
  const [submittingHandover, setSubmittingHandover] = useState(false)
  const [dbUnavailable, setDbUnavailable] = useState(false)

  const loadHandovers = useCallback(async () => {
    try {
      const data = await fetchShiftHandovers()
      setEntities(data)
      setDbUnavailable(false)
    } catch (err) {
      if (!IS_MOCK) {
        setDbUnavailable(true)
      }
      console.error('Failed to load shift handovers:', err)
    }
  }, [])

  useEffect(() => {
    void loadHandovers()
  }, [loadHandovers])

  useEffect(() => {
    const handleUpdate = () => {
      void loadHandovers()
    }
    window.addEventListener('babin:handovers-updated', handleUpdate)
    return () => {
      window.removeEventListener('babin:handovers-updated', handleUpdate)
    }
  }, [loadHandovers])

  const records: HandoverRecord[] = useMemo(() => {
    return entities.map((item, idx) => {
      const isComplete = item.status === 'acknowledged'
      const completedCount = Array.isArray(item.checklist)
        ? item.checklist.filter((c) => c.done).length
        : 5
      const totalChecks = Array.isArray(item.checklist) && item.checklist.length > 0
        ? item.checklist.length
        : 5

      return {
        id: idx,
        dbId: item.id,
        date: item.shift_date,
        dateISO: item.shift_date,
        shiftCode: item.shift_code,
        from: `${item.from_user_name} (Shift ${item.shift_code})`,
        to: item.to_user_name || 'Next Shift',
        cashAmount: item.cash_counted_paisa ? Math.round(item.cash_counted_paisa / 100) : 0,
        cashStatus: item.cash_status,
        cashDisplay: item.cash_counted_paisa != null
          ? `Rs ${(item.cash_counted_paisa / 100).toLocaleString('en-IN')} · ${item.cash_status}`
          : '',
        checksCompleted: `${completedCount} / ${totalChecks}`,
        status: isComplete ? 'Complete' : 'Pending',
        notes: item.notes || (item.acknowledgement_note ? `[Ack] ${item.acknowledgement_note}` : ''),
      }
    })
  }, [entities])

  const pendingIncoming = useMemo(() => {
    return entities.filter((e) => e.status === 'pending')
  }, [entities])

  const allChecked = useMemo(
    () => SHIFT_CHECKLIST.every((item) => checks[item.key]),
    [checks],
  )
  const checkedCount = useMemo(
    () => SHIFT_CHECKLIST.filter((item) => checks[item.key]).length,
    [checks],
  )

  const handleToggleCheck = (key: string) => {
    setChecks((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const handleCompleteHandover = async () => {
    if (!allChecked || submittingHandover) return
    setSubmittingHandover(true)
    try {
      await submitShiftHandover({
        shiftCode: currentShift.code,
        fromUserName: user?.name || 'Staff Member',
        fromUserRole: user?.role || 'Operations',
        notes: 'Handover completed from Today panel checklist.',
        checklist: SHIFT_CHECKLIST.map((c) => ({
          key: c.key,
          label: c.label,
          done: checks[c.key] ?? false,
        })),
      })
      showSuccessToast('Shift Handover Recorded', `Handover for Shift ${currentShift.code} logged to the database.`)
      setChecks({})
      await loadHandovers()
    } catch (err) {
      console.error('Handover completion error:', err)
    } finally {
      setSubmittingHandover(false)
    }
  }

  const handleAcknowledge = async (handoverId: string) => {
    if (acknowledging) return
    setAcknowledging(true)
    try {
      await acknowledgeShiftHandover(handoverId, 'Acknowledged during shift overlap', user?.name)
      showSuccessToast('Shift Handover Acknowledged', 'Logged handover acceptance.')
      await loadHandovers()
    } catch (err) {
      console.error('Acknowledgement error:', err)
    } finally {
      setAcknowledging(false)
    }
  }

  const handleRecountCash = () => {
    showSuccessToast('Cash Count Triggered', 'Please open the cash drawer and count physical currency.')
  }

  const kpis: Kpi[] = useMemo(() => {
    const total = records.length
    const onTime = records.filter((r) => r.checksCompleted === '5 / 5').length
    const cashFlags = records.filter((r) => r.cashStatus === 'short' || r.cashStatus === 'over').length
    const misses = total - onTime

    const baseKpis: Kpi[] = [
      {
        label: 'Handovers (7d)',
        value: total.toString(),
        icon: 'checklist',
        accent: 'primary',
      },
      {
        label: 'Checklist 5/5',
        value: total > 0 ? `${Math.round((onTime / total) * 100)}%` : '—',
        icon: 'check',
        accent: total > 0 && onTime === total ? 'success' : 'neutral',
      },
    ]

    // Law 6: Cash variance flags only visible for money-seeing roles
    if (canSeeMoney) {
      baseKpis.push({
        label: 'Cash Variance Flags',
        value: cashFlags.toString(),
        icon: 'alert_circle',
        accent: cashFlags > 0 ? 'warn' : 'neutral',
      })
    }

    baseKpis.push({
      label: 'Checklist Misses',
      value: misses.toString(),
      icon: 'alert_circle',
      accent: misses > 0 ? 'danger' : 'neutral',
    })

    return baseKpis
  }, [records, canSeeMoney])

  // Honest unavailable state when database is down/unconfigured in live mode
  if (dbUnavailable) {
    return (
      <Card>
        <section role="status" aria-label="Staff shift handover" style={{ padding: 'var(--sp-md)' }}>
          <h2>Staff shift handover unavailable</h2>
          <p>Shared staff shift records are currently unavailable. Existing entries on this device have been kept.</p>
        </section>
      </Card>
    )
  }

  return (
    <div style={sectionStyle}>
      {/* ── Pending Handovers from Previous Shift (Unacknowledged) ── */}
      {pendingIncoming.length > 0 && (
        <Card>
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="alert_circle" size={18} color="var(--warn)" />
                <h3 style={{ margin: 0, fontSize: 'var(--t-body)', fontWeight: 600, color: 'var(--text)' }}>
                  Pending Shift Handover ({pendingIncoming.length})
                </h3>
              </div>
              <Badge tone="warning" label="Awaiting Acceptance" />
            </div>

            {pendingIncoming.map((pending) => (
              <div
                key={pending.id}
                style={{
                  padding: '12px 14px',
                  borderRadius: 'var(--r-md)',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  flexDirection: isPhone ? 'column' : 'row',
                  justifyContent: 'space-between',
                  alignItems: isPhone ? 'flex-start' : 'center',
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 'var(--t-base)' }}>
                    Incoming Handover from {pending.from_user_name} (Shift {pending.shift_code})
                  </div>
                  <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text-muted)', marginTop: 2 }}>
                    Date: {pending.shift_date} · Status: {pending.cash_status}
                    {canSeeMoney && pending.cash_counted_paisa != null && (
                      <> · Cash: Rs {(pending.cash_counted_paisa / 100).toLocaleString('en-IN')}</>
                    )}
                  </div>
                  {pending.notes && (
                    <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text)', marginTop: 6, fontStyle: 'italic' }}>
                      "{pending.notes}"
                    </div>
                  )}
                </div>

                <Button
                  variant="primary"
                  onClick={() => void handleAcknowledge(pending.id)}
                  disabled={acknowledging}
                  style={{ minHeight: 44, whiteSpace: 'nowrap', alignSelf: isPhone ? 'stretch' : 'auto' }}
                >
                  <Icon name="check" size={16} /> Acknowledge Handover
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── Collapsible header ───────────────────────────────────────── */}
      <div
        className="dashboard-shift-handover__toggle"
        data-testid="shift-handover-toggle"
        style={{ ...headerBarStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
        onClick={() => setExpanded((p) => !p)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded((p) => !p) } }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Icon name={expanded ? 'chevron_down' : 'chevron_right'} size={16} />
          <span style={{ fontWeight: 600, fontSize: 'var(--t-body)' }}>
            Active: Shift {currentShift.code} ({currentShift.name})
          </span>
          <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text-muted)' }}>
            {currentShift.hours} NPT
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Badge
            tone={allChecked ? 'in' : 'warning'}
            label={`${checkedCount} / ${SHIFT_CHECKLIST.length} Checks`}
          />
        </div>
      </div>

      {/* ── Checklist card ─────────────────────────────────────────── */}
      {expanded && (
        <Card>
          <div style={checklistStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <span style={{ fontWeight: 600, fontSize: 'var(--t-base)' }}>Shift Handover Checklist</span>
              <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text-muted)' }}>
                Overlap window: {currentShift.overlapWindow} NPT
              </span>
            </div>

            {SHIFT_CHECKLIST.map((item) => {
              const isChecked = !!checks[item.key]
              return (
                <div
                  key={item.key}
                  style={{
                    ...checkItemStyle,
                    background: isChecked ? 'var(--surface-2)' : 'var(--surface)',
                  }}
                  onClick={() => handleToggleCheck(item.key)}
                  role="checkbox"
                  aria-checked={isChecked}
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleToggleCheck(item.key) } }}
                >
                  <div
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: '4px',
                      border: isChecked ? 'none' : '2px solid var(--border)',
                      background: isChecked ? 'var(--primary)' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {isChecked && <Icon name="check" size={14} color="#ffffff" />}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 500, fontSize: 'var(--t-base)' }}>{item.label}</span>
                    <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{item.hint}</span>
                  </div>
                </div>
              )
            })}

            {/* Actions */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <Button
                variant={allChecked ? 'primary' : undefined}
                disabled={!allChecked || submittingHandover}
                onClick={() => void handleCompleteHandover()}
                className="tap"
                style={{
                  flex: 1,
                  minHeight: 'var(--tap, 44px)',
                  background: allChecked
                    ? 'var(--success)'
                    : 'var(--surface)',
                  border: !allChecked ? '1px solid var(--border)' : 'none',
                  color: allChecked
                    ? 'var(--on-success)'
                    : 'var(--muted)',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                {submittingHandover ? (
                  'Saving Handover…'
                ) : (
                  <>
                    Record Handover (<span className="font-mono tabular-nums">{checkedCount}</span> / <span className="font-mono tabular-nums">{SHIFT_CHECKLIST.length}</span>)
                  </>
                )}
              </Button>

              {/* Law 6: Recount Cash is only visible when user can view money */}
              {canSeeMoney && (
                <Button
                  onClick={handleRecountCash}
                  className="tap"
                  style={{ minHeight: 'var(--tap, 44px)' }}
                >
                  Recount Cash
                </Button>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* ── Handover log ───────────────────────────────────────────── */}
      {expanded && (
        <Card>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              cursor: 'pointer',
              borderBottom: logExpanded ? '1px solid var(--border)' : 'none',
            }}
            onClick={() => setLogExpanded((p) => !p)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setLogExpanded((p) => !p) } }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Icon name={logExpanded ? 'chevron_down' : 'chevron_right'} size={14} />
              <span style={{ fontWeight: 600, fontSize: 'var(--t-body)' }}>
                Handover Log · <span className="font-mono tabular-nums">{records.length}</span> records
              </span>
            </div>
          </div>

          {logExpanded && (
            <>
              {/* KPI strip */}
              <div style={{ padding: '12px 16px 0' }}>
                <KpiStrip items={kpis} columns={isPhone ? 2 : 4} />
              </div>

              {/* Log rows */}
              {records.map((record) => {
                const isOpen = openLogId === record.dbId
                return (
                  <div key={record.dbId || record.id} style={logRowStyle}>
                    <div
                      style={logRowHeaderStyle}
                      onClick={() => setOpenLogId(isOpen ? null : (record.dbId || String(record.id)))}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenLogId(isOpen ? null : (record.dbId || String(record.id))) } }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                        <Icon name={isOpen ? 'chevron_down' : 'chevron_right'} size={12} />
                        <span style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{record.date}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Badge
                          tone={record.status === 'Complete' ? 'in' : 'warning'}
                          label={record.status}
                        />
                      </div>
                    </div>

                    <div style={{ ...logRowMetaStyle, marginTop: '6px' }}>
                      <span>{record.from} → {record.to}</span>
                      {/* Law 6: Omit cash display if not permitted */}
                      {canSeeMoney && Boolean(record.cashDisplay) && (
                        <span className="font-mono tabular-nums">{record.cashDisplay}</span>
                      )}
                      <span>Checks: <span className="font-mono tabular-nums">{record.checksCompleted}</span></span>
                    </div>

                    {isOpen && (
                      <div style={noteBoxStyle}>
                        {record.notes}
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          )}
        </Card>
      )}
    </div>
  )
}
