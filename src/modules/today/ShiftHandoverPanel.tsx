/**
 * Shift Handover Panel — collapsible section for the Today dashboard.
 *
 * Ported from the standalone's shifthandover screen. Shows a 5-item checklist,
 * a "Complete Handover" action, and an expandable log of past handovers with KPIs.
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
import { IS_MOCK } from '../../lib/supabase'
import {
  SHIFT_CHECKLIST,
  getHandoverRecords,
  completeHandover,
  getHandoverStats,
  type HandoverRecord,
} from '../../lib/queries/shiftHandover'
import {
  listInternalNotes,
  addInternalNote,
  toggleResolveNote,
  type InternalNote,
} from '../../lib/queries/internalNotes'

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
  if (IS_MOCK) return <ShiftHandoverPreview />
  return (
    <Card><section role="status" aria-label="Staff shift handover" style={{ padding: 'var(--sp-md)' }}>
      <h2>Staff shift handover unavailable</h2>
      <p>Shared staff shift records are not available yet. Existing entries on this device have been kept.</p>
    </section></Card>
  )
}

function ShiftHandoverPreview() {
  const { showSuccessToast } = useToast()
  const viewport = useViewport()
  const isPhone = viewport === 'phone'
  const { user } = useAuth()

  const [expanded, setExpanded] = useState(false)
  const [logExpanded, setLogExpanded] = useState(false)
  const [checks, setChecks] = useState<Record<string, boolean>>({})
  const [records, setRecords] = useState<HandoverRecord[]>(getHandoverRecords)
  const [openLogId, setOpenLogId] = useState<number | null>(null)

  const [noteInput, setNoteInput] = useState('')
  const [internalNotes, setInternalNotes] = useState<InternalNote[]>(() => listInternalNotes())

  useEffect(() => {
    const handleUpdate = () => {
      setInternalNotes(listInternalNotes())
    }
    window.addEventListener('babin:notes-updated', handleUpdate)
    return () => window.removeEventListener('babin:notes-updated', handleUpdate)
  }, [])

  const shiftNotes = useMemo(() => {
    return internalNotes.filter((n) => n.category === 'Shift Handover' || n.category === 'Gear Alert')
  }, [internalNotes])

  const openShiftNotes = useMemo(() => {
    return shiftNotes.filter((n) => n.status !== 'resolved')
  }, [shiftNotes])

  const handleAddNote = useCallback(() => {
    const trimmed = noteInput.trim()
    if (!trimmed) return
    addInternalNote({
      author: user?.name || 'Shift Crew',
      authorRole: user?.role || 'Operations Staff',
      text: trimmed,
      category: 'Shift Handover',
      priority: 'high',
    })
    setNoteInput('')
    setInternalNotes(listInternalNotes())
    showSuccessToast('Shift note logged')
  }, [noteInput, user, showSuccessToast])

  const todayRecord = records.find((r) => r.status === 'Pending')
  const handoverDone = !todayRecord

  const allChecked = SHIFT_CHECKLIST.every((item) => handoverDone || checks[item.key])

  const toggleCheck = useCallback((key: string) => {
    if (handoverDone) return
    setChecks((prev) => ({ ...prev, [key]: !prev[key] }))
  }, [handoverDone])

  const handleCompleteHandover = useCallback(() => {
    if (!allChecked || handoverDone || !todayRecord) return
    const updated = completeHandover(
      todayRecord.id,
      'All pickups staged, drawer counted, no discrepancies.',
    )
    setRecords(updated)
    setChecks({})
    const minute = Math.floor(Math.random() * 10)
    showSuccessToast(`Shift handover recorded · ${todayRecord.from} → ${todayRecord.to} · 14:0${minute}`)
  }, [allChecked, handoverDone, todayRecord, showSuccessToast])

  const handleRecountCash = useCallback(() => {
    showSuccessToast('Cash count opened — count the drawer, then enter the amount')
  }, [showSuccessToast])

  const stats = useMemo(() => getHandoverStats(records), [records])

  const kpis: Kpi[] = useMemo(() => [
    { label: 'Handovers (7D)', value: String(stats.handovers7d), icon: 'checklist', accent: 'primary' },
    { label: 'On-Time Rate', value: stats.onTimeRate, icon: 'check', accent: 'success' },
    { label: 'Cash Variance Flags', value: String(stats.cashFlags), icon: 'alert_triangle', accent: 'warn' },
    { label: 'Checklist Misses', value: String(stats.checklistMisses), icon: 'alert_triangle', accent: 'warn' },
  ], [stats])

  const checkedCount = SHIFT_CHECKLIST.filter((item) => handoverDone || checks[item.key]).length

  return (
    <div style={sectionStyle}>
      {/* ── Section header ─────────────────────────────────────────── */}
      <div
        className="dashboard-shift-handover__toggle"
        style={{ ...headerBarStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}
        onClick={() => setExpanded((prev) => !prev)}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label="Shift Handover"
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded((p) => !p) } }}
      >
        <div className="dashboard-shift-handover__label" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Icon name={expanded ? 'chevron_down' : 'chevron_right'} size={16} />
          <span style={{ fontWeight: 600, fontSize: 'var(--t-body)' }}>Shift Handover</span>
          {openShiftNotes.length > 0 && (
            <span
              style={{
                fontSize: '12px',
                padding: '2px 8px',
                borderRadius: '10px',
                background: 'var(--select-bg)',
                color: 'var(--select-fg)',
                fontWeight: 600,
              }}
            >
              <span className="font-mono tabular-nums">{openShiftNotes.length}</span> open {openShiftNotes.length === 1 ? 'note' : 'notes'}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Badge
            className="dashboard-shift-handover__status"
            tone={handoverDone ? 'in' : 'warning'}
            label={handoverDone ? 'Handover complete' : 'Overlap window open · 14:00–15:00'}
          />
        </div>
      </div>

      {/* ── Expanded content ───────────────────────────────────────── */}
      {expanded && (
        <Card>
          {/* Quick Handover Note Logger */}
          <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text2)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Log Shift Handover Note
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleAddNote()
              }}
              style={{ display: 'flex', gap: 8, flexWrap: isPhone ? 'wrap' : 'nowrap' }}
            >
              <input
                type="text"
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                placeholder="Write a handover note for the next shift… (e.g. FX3 #2 battery charging, Komodo at 7 AM)"
                style={{
                  flex: 1,
                  minWidth: isPhone ? '100%' : 260,
                  minHeight: 'var(--tap, 44px)',
                  padding: '0 12px',
                  borderRadius: 'var(--r-btn, 8px)',
                  border: '1px solid var(--border)',
                  background: 'var(--card2)',
                  color: 'var(--text)',
                  fontSize: 'var(--t-meta, 13px)',
                }}
              />
              <button
                type="submit"
                disabled={!noteInput.trim()}
                className="ui-button ui-button--sm ui-button--primary press tap"
                style={{
                  minHeight: 'var(--tap, 44px)',
                  padding: '0 14px',
                  whiteSpace: 'nowrap',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Icon name="plus" size={14} /> Log Shift Note
              </button>
            </form>

            {/* List open shift notes */}
            {openShiftNotes.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
                {openShiftNotes.map((note) => (
                  <div
                    key={note.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      padding: '8px 12px',
                      borderRadius: 'var(--r-xs, 6px)',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      fontSize: 'var(--t-meta, 13px)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, overflow: 'hidden' }}>
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: note.priority === 'urgent' ? 'var(--danger-text)' : 'var(--warn)',
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ color: 'var(--text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {note.text}
                      </span>
                      <span style={{ color: 'var(--muted)', fontSize: '11px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        — {note.author} · {note.at}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="ui-button ui-button--sm ui-button--ghost press tap"
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleResolveNote(note.id, user?.name)
                        setInternalNotes(listInternalNotes())
                        showSuccessToast('Note marked resolved')
                      }}
                      title="Mark resolved"
                      style={{
                        minHeight: 32,
                        padding: '0 10px',
                        fontSize: '12px',
                        flexShrink: 0,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <Icon name="check" size={13} style={{ color: 'var(--success-text)' }} /> Resolve
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Checklist */}
          <div style={checklistStyle}>
            <div style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text2)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Handover Checklist
            </div>

            {SHIFT_CHECKLIST.map((item) => {
              const isChecked = handoverDone || !!checks[item.key]
              return (
                <div
                  key={item.key}
                  style={{
                    ...checkItemStyle,
                    background: isChecked ? 'color-mix(in srgb, var(--success) 8%, transparent)' : 'transparent',
                  }}
                  onClick={() => toggleCheck(item.key)}
                  role="checkbox"
                  aria-checked={isChecked}
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleCheck(item.key) } }}
                >
                  {/* Checkbox */}
                  <div
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 'var(--r-xs, 6px)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 13,
                      flexShrink: 0,
                      background: isChecked ? 'color-mix(in srgb, var(--success) 16%, var(--surface))' : 'var(--surface)',
                      border: isChecked ? '1.5px solid color-mix(in srgb, var(--success) 60%, transparent)' : '1.5px solid var(--border)',
                      color: 'var(--success-text)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {isChecked ? <Icon name="check" size={14} style={{ color: 'var(--success-text)' }} /> : null}
                  </div>

                  {/* Label + hint */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: 'var(--t-body)', color: 'var(--text)' }}>
                      {item.label}
                    </div>
                    <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: '2px' }}>
                      {item.hint}
                    </div>
                  </div>
                </div>
              )
            })}

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '4px', flexDirection: isPhone ? 'column' : 'row' }}>
              <Button
                variant={handoverDone ? undefined : allChecked ? 'primary' : undefined}
                disabled={handoverDone || !allChecked}
                onClick={handleCompleteHandover}
                className="tap"
                style={{
                  flex: 1,
                  minHeight: 'var(--tap, 44px)',
                  background: handoverDone
                    ? 'var(--surface)'
                    : allChecked
                      ? 'var(--success)'
                      : 'var(--surface)',
                  border: handoverDone || !allChecked ? '1px solid var(--border)' : 'none',
                  color: handoverDone
                    ? 'var(--success-text)'
                    : allChecked
                      ? 'var(--on-success)'
                      : 'var(--muted)',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                {handoverDone ? (
                  <>
                    <Icon name="check" size={16} /> Handover Complete
                  </>
                ) : (
                  <>
                    Complete Handover (<span className="font-mono tabular-nums">{checkedCount}</span> / <span className="font-mono tabular-nums">{SHIFT_CHECKLIST.length}</span>)
                  </>
                )}
              </Button>

              <Button
                onClick={handleRecountCash}
                className="tap"
                style={{ minHeight: 'var(--tap, 44px)' }}
              >
                Recount Cash
              </Button>
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
                const isOpen = openLogId === record.id
                return (
                  <div key={record.id} style={logRowStyle}>
                    <div
                      style={logRowHeaderStyle}
                      onClick={() => setOpenLogId(isOpen ? null : record.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenLogId(isOpen ? null : record.id) } }}
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
                      <span className="font-mono tabular-nums">{record.cashDisplay}</span>
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
