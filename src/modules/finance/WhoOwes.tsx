import { useCallback, useEffect, useMemo, useState } from 'react'
import Icon from '../../components/ui/Icon'
import { Button, Card } from '../../components/ui/Page'
import { PageBody } from '../../components/ui/PageBody'
import { ModuleKpiStrip, StatusPill } from '../../components/ui/module-shell'
import { DataTableShell } from '../../components/ui/DataTable'
import { SearchInput } from '../../components/ui/SearchInput'
import { Modal } from '../../components/ui/Modal'
import { ErrorBanner } from '../../components/ui/StateViews'
import { useToast } from '../../components/ui/Toast'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { useTabularLayout } from '../../lib/device'
import { formatMoney } from '../../lib/money'
import { formatAd } from '../../lib/bs'
import { businessDayAd, financeRestriction } from '../../lib/queries/finance'
import {
  fetchWhoOwes,
  fetchClientStatementData,
  type WhoOwesRow,
  type WhoOwesResult,
  type ClientStatementData,
} from '../../lib/queries/whoOwes'
import { exportClientStatementPdf } from '../../lib/pdf/exportPdf'
import type { ClientStatementPdfData } from '../../lib/pdf/generatePdf'
import { pauseClientReminders, resumeClientReminders } from '../../actions/clients/reminders'

type StatusFilter = 'All' | 'Active' | 'Paused'

export interface WhoOwesProps {
  embedded?: boolean
}

function formatReminderDate(iso: string | null): string {
  if (!iso) return 'Never'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Never'
  return formatAd(d)
}

function normalizePhoneForWhatsApp(phone: string | null): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (!digits) return null
  // Nepal 10-digit mobile numbers: prepend 977 if not already prefixed
  if (digits.length === 10 && digits.startsWith('9')) return `977${digits}`
  return digits
}

export default function WhoOwes({ embedded: _embedded }: WhoOwesProps) {
  const money = useCanViewMoney()
  const tabular = useTabularLayout()
  const { showSuccessToast } = useToast()
  const todayAd = businessDayAd()

  const [data, setData] = useState<WhoOwesResult>({
    rows: [],
    totalOutstandingPaisa: 0 as WhoOwesResult['totalOutstandingPaisa'],
    pausedCount: 0,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<StatusFilter>('All')

  // Statement modal state
  const [selected, setSelected] = useState<WhoOwesRow | null>(null)
  const [statement, setStatement] = useState<ClientStatementData | null>(null)
  const [statementLoading, setStatementLoading] = useState(false)
  const [statementError, setStatementError] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)

  // Pause/Resume state
  const [pausePromptOpen, setPausePromptOpen] = useState(false)
  const [pauseReason, setPauseReason] = useState('')
  const [pauseBusy, setPauseBusy] = useState(false)
  const [pauseError, setPauseError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!money) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetchWhoOwes(money, todayAd)
      setData(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load unpaid client balances.')
    } finally {
      setLoading(false)
    }
  }, [money, todayAd])

  useEffect(() => {
    void load()
  }, [load])

  const openStatement = useCallback(
    async (row: WhoOwesRow) => {
      setSelected(row)
      setPausePromptOpen(false)
      setPauseReason('')
      setPauseError(null)
      setStatementError(null)
      setStatementLoading(true)
      try {
        const res = await fetchClientStatementData(row.clientId, money)
        setStatement(res)
      } catch (e) {
        setStatementError(e instanceof Error ? e.message : 'Could not load client statement.')
        setStatement(null)
      } finally {
        setStatementLoading(false)
      }
    },
    [money],
  )

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return data.rows.filter((r) => {
      if (filter === 'Paused' && !r.remindersPaused) return false
      if (filter === 'Active' && r.remindersPaused) return false
      if (!q) return true
      return (
        r.clientName.toLowerCase().includes(q) ||
        (r.clientPhone?.toLowerCase().includes(q) ?? false)
      )
    })
  }, [data.rows, filter, search])

  const buildPdfPayload = useCallback(
    (row: WhoOwesRow, stmt: ClientStatementData | null): ClientStatementPdfData => {
      const invoices = stmt?.invoices ?? row.invoices
      const payments = stmt?.payments ?? []
      return {
        asOfDateAd: todayAd,
        client: {
          name: row.clientName,
          phone: row.clientPhone,
          email: row.clientEmail,
          panVat: row.clientPanVat,
        },
        ...(stmt?.company ? { company: stmt.company } : {}),
        totalOutstandingPaisa: row.outstandingPaisa,
        invoices: invoices.map((inv) => ({
          invoiceNo: inv.invoiceNo,
          bookingNo: inv.bookingNo,
          issueDateAd: inv.issueDateAd,
          dueDateAd: inv.dueDateAd,
          totalPaisa: inv.totalAmount,
          paidPaisa: inv.paidAmount,
          outstandingPaisa: inv.outstandingAmount,
        })),
        payments: payments.map((p) => ({
          paymentNo: p.paymentNo,
          dateAd: p.paymentDateAd,
          method: p.bankName || p.channelGroup || p.paymentType,
          amountPaisa: p.amount,
        })),
      }
    },
    [todayAd],
  )

  const handleDownloadStatement = useCallback(async () => {
    if (!selected) return
    setSharing(true)
    setStatementError(null)
    try {
      const payload = buildPdfPayload(selected, statement)
      await exportClientStatementPdf(payload, { download: true })
      showSuccessToast('Statement PDF downloaded')
    } catch (e) {
      setStatementError(e instanceof Error ? e.message : 'Could not generate statement PDF.')
    } finally {
      setSharing(false)
    }
  }, [buildPdfPayload, selected, statement, showSuccessToast])

  const handleShareWhatsApp = useCallback(async () => {
    if (!selected) return
    setSharing(true)
    setStatementError(null)
    try {
      const payload = buildPdfPayload(selected, statement)
      const exported = await exportClientStatementPdf(payload, { download: true })

      const invoiceNums = payload.invoices.map((i) => i.invoiceNo).join(', ')
      const lines = [
        `Namaste ${selected.clientName},`,
        `Statement as of ${todayAd}:`,
        `Outstanding balance: ${formatMoney(selected.outstandingPaisa)}`,
        invoiceNums ? `Open invoices: ${invoiceNums}` : '',
        'Please find the attached statement PDF.',
      ].filter(Boolean)
      const text = lines.join('\n')

      // Try Web Share API with PDF file when supported (mobile browsers), otherwise open WhatsApp link
      const file = new File([exported.blob], exported.filename, { type: 'application/pdf' })
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: `Statement — ${selected.clientName}`,
          text,
          files: [file],
        })
        showSuccessToast('Statement shared')
      } else if (typeof window !== 'undefined') {
        const phoneDigits = normalizePhoneForWhatsApp(selected.clientPhone)
        const base = phoneDigits ? `https://wa.me/${phoneDigits}` : 'https://wa.me/'
        const url = `${base}?text=${encodeURIComponent(text)}`
        window.open(url, '_blank', 'noopener,noreferrer')
        showSuccessToast('Statement PDF ready for WhatsApp')
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return
      setStatementError(e instanceof Error ? e.message : 'Could not share statement.')
    } finally {
      setSharing(false)
    }
  }, [buildPdfPayload, selected, statement, todayAd, showSuccessToast])

  const handlePauseConfirm = useCallback(async () => {
    if (!selected) return
    setPauseBusy(true)
    setPauseError(null)
    try {
      await pauseClientReminders({ clientId: selected.clientId, reason: pauseReason })
      showSuccessToast(`Reminders paused for ${selected.clientName}`)
      setPausePromptOpen(false)
      setPauseReason('')
      setSelected((prev) =>
        prev ? { ...prev, remindersPaused: true, remindersPausedReason: pauseReason.trim() } : null,
      )
      await load()
    } catch (e) {
      setPauseError(e instanceof Error ? e.message : 'Could not pause reminders.')
    } finally {
      setPauseBusy(false)
    }
  }, [load, pauseReason, selected, showSuccessToast])

  const handleResume = useCallback(async () => {
    if (!selected) return
    setPauseBusy(true)
    setPauseError(null)
    try {
      await resumeClientReminders({ clientId: selected.clientId })
      showSuccessToast(`Reminders resumed for ${selected.clientName}`)
      setSelected((prev) =>
        prev ? { ...prev, remindersPaused: false, remindersPausedReason: null } : null,
      )
      await load()
    } catch (e) {
      setPauseError(e instanceof Error ? e.message : 'Could not resume reminders.')
    } finally {
      setPauseBusy(false)
    }
  }, [load, selected, showSuccessToast])

  const kpis = useMemo(
    () => [
      {
        id: 'total-receivable',
        label: 'Total Receivable',
        value: formatMoney(data.totalOutstandingPaisa),
        subtitle: 'Open invoice balances',
        tone: 'amber' as const,
        icon: 'alert_triangle' as const,
      },
      {
        id: 'clients-owing',
        label: 'Clients Owing',
        value: String(data.rows.length),
        subtitle: 'Oldest balance first',
        tone: 'neutral' as const,
        icon: 'users' as const,
      },
      {
        id: 'reminders-paused',
        label: 'Reminders Paused',
        value: String(data.pausedCount),
        subtitle: 'Auto-chase paused',
        tone: data.pausedCount > 0 ? ('amber' as const) : ('neutral' as const),
        icon: 'clock' as const,
      },
    ],
    [data.pausedCount, data.rows.length, data.totalOutstandingPaisa],
  )

  return (
    <PageBody
      {...financeRestriction(money)}
      loading={loading}
      error={error}
      onRetry={load}
      empty={!loading && !error && data.rows.length === 0}
      emptyTitle="Nobody owes right now"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        <ModuleKpiStrip items={kpis} />

        <Card>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 'var(--sp-sm)',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 'var(--sp-md)',
            }}
          >
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search client or phone..."
              aria-label="Search clients who owe"
            />
            <div style={{ display: 'flex', gap: 'var(--sp-xs)', flexWrap: 'wrap' }}>
              {(['All', 'Active', 'Paused'] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setFilter(status)}
                  style={{
                    minHeight: 44,
                    padding: '0 14px',
                    borderRadius: 'var(--r-pill)',
                    border: filter === status ? '1px solid var(--accent)' : '1px solid var(--border)',
                    background: filter === status ? 'var(--accent-soft)' : 'var(--bg)',
                    color: filter === status ? 'var(--accent-text)' : 'var(--text)',
                    fontWeight: filter === status ? 600 : 500,
                    fontSize: 'var(--t-small)',
                    cursor: 'pointer',
                  }}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          {filteredRows.length === 0 ? (
            <p style={{ color: 'var(--text2)', padding: 'var(--sp-md) 0' }}>
              No matching clients with unpaid balances.
            </p>
          ) : tabular ? (
            <DataTableShell ariaLabel="Clients who owe">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                    <th style={{ padding: '10px 12px', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>Client</th>
                    <th style={{ padding: '10px 12px', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>Age</th>
                    <th style={{ padding: '10px 12px', fontSize: 'var(--t-th)', color: 'var(--muted)', textAlign: 'right' }}>Amount</th>
                    <th style={{ padding: '10px 12px', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>Last Reminder</th>
                    <th style={{ padding: '10px 12px', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>Reminders</th>
                    <th style={{ padding: '10px 12px', fontSize: 'var(--t-th)', color: 'var(--muted)', textAlign: 'right' }}>Statement</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr
                      key={row.clientId}
                      onClick={() => void openStatement(row)}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        cursor: 'pointer',
                      }}
                    >
                      <td style={{ padding: '12px', minHeight: 44 }}>
                        <div style={{ fontWeight: 600, color: 'var(--text)' }}>{row.clientName}</div>
                        <div style={{ fontSize: 'var(--t-th)', color: 'var(--text2)' }}>
                          {row.invoiceCount} open invoice{row.invoiceCount === 1 ? '' : 's'}
                          {row.clientPhone ? ` · ${row.clientPhone}` : ''}
                        </div>
                      </td>
                      <td style={{ padding: '12px', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                        {row.ageDays}d
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                        {formatMoney(row.outstandingPaisa)}
                      </td>
                      <td style={{ padding: '12px', color: 'var(--text2)', fontSize: 'var(--t-small)' }}>
                        {formatReminderDate(row.lastReminderSentAt)}
                      </td>
                      <td style={{ padding: '12px' }}>
                        {row.remindersPaused ? (
                          <StatusPill tone="amber" icon="clock" label="Paused" />
                        ) : (
                          <StatusPill tone="emerald" icon="check" label="Active" />
                        )}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right' }}>
                        <Button
                          variant="ghost"
                          icon="file"
                          onClick={(e) => {
                            e.stopPropagation()
                            void openStatement(row)
                          }}
                        >
                          Statement
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTableShell>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
              {filteredRows.map((row) => (
                <button
                  key={row.clientId}
                  type="button"
                  onClick={() => void openStatement(row)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '14px',
                    minHeight: 56,
                    borderRadius: 'var(--r-md)',
                    border: '1px solid var(--border)',
                    background: 'var(--card)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 600, color: 'var(--text)' }}>{row.clientName}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text)' }}>
                      {formatMoney(row.outstandingPaisa)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 'var(--t-th)', color: 'var(--text2)', fontFamily: 'var(--font-mono)' }}>
                      Age: {row.ageDays}d · Last reminder: {formatReminderDate(row.lastReminderSentAt)}
                    </span>
                    {row.remindersPaused ? (
                      <StatusPill tone="amber" icon="clock" label="Paused" />
                    ) : (
                      <StatusPill tone="emerald" icon="check" label="Active" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Modal
        isOpen={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected ? `Statement — ${selected.clientName}` : 'Client Statement'}
        subtitle={
          selected
            ? `${selected.invoiceCount} open invoice(s) · Balance due ${formatMoney(selected.outstandingPaisa)}`
            : undefined
        }
        size="lg"
        footer={
          selected ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-sm)', justifyContent: 'space-between', width: '100%' }}>
              <div style={{ display: 'flex', gap: 'var(--sp-xs)', flexWrap: 'wrap' }}>
                {selected.remindersPaused ? (
                  <Button
                    variant="secondary"
                    icon="check"
                    disabled={pauseBusy}
                    onClick={() => void handleResume()}
                  >
                    Resume reminders
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    icon="clock"
                    disabled={pauseBusy}
                    onClick={() => setPausePromptOpen((v) => !v)}
                  >
                    Pause reminders
                  </Button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 'var(--sp-xs)', flexWrap: 'wrap' }}>
                <Button
                  variant="secondary"
                  icon="download"
                  disabled={statementLoading || sharing}
                  onClick={() => void handleDownloadStatement()}
                >
                  Download PDF
                </Button>
                <Button
                  variant="primary"
                  icon="message"
                  disabled={statementLoading || sharing}
                  onClick={() => void handleShareWhatsApp()}
                >
                  Share to WhatsApp
                </Button>
              </div>
            </div>
          ) : null
        }
      >
        {selected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
            {statementError && <ErrorBanner message={statementError} />}
            {pauseError && <ErrorBanner message={pauseError} />}

            {selected.remindersPaused && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--sp-sm)',
                  padding: '10px 12px',
                  borderRadius: 'var(--r-md)',
                  background: 'var(--warn-bg)',
                  border: '1px solid var(--border)',
                  fontSize: 'var(--t-small)',
                }}
              >
                <Icon name="clock" size={16} />
                <span>
                  Automatic payment reminders are <strong>Paused</strong>
                  {selected.remindersPausedReason ? `: ${selected.remindersPausedReason}` : '.'}
                </span>
              </div>
            )}

            {pausePromptOpen && !selected.remindersPaused && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--sp-xs)',
                  padding: '12px',
                  borderRadius: 'var(--r-md)',
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                }}
              >
                <label htmlFor="pause-reminder-reason" style={{ fontSize: 'var(--t-small)', fontWeight: 600 }}>
                  Reason for pausing reminders
                </label>
                <input
                  id="pause-reminder-reason"
                  type="text"
                  value={pauseReason}
                  onChange={(e) => setPauseReason(e.target.value)}
                  placeholder="e.g. Production house settles monthly"
                  style={{
                    minHeight: 44,
                    padding: '0 12px',
                    borderRadius: 'var(--r-md)',
                    border: '1px solid var(--border)',
                    background: 'var(--card)',
                    color: 'var(--text)',
                  }}
                />
                <div style={{ display: 'flex', gap: 'var(--sp-xs)', justifyContent: 'flex-end', marginTop: 4 }}>
                  <Button variant="ghost" onClick={() => setPausePromptOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    disabled={pauseBusy || !pauseReason.trim()}
                    onClick={() => void handlePauseConfirm()}
                  >
                    Confirm pause
                  </Button>
                </div>
              </div>
            )}

            {statementLoading ? (
              <p style={{ color: 'var(--text2)' }}>Loading statement details…</p>
            ) : (
              <>
                <div>
                  <h4 style={{ margin: '0 0 8px', fontSize: 'var(--t-small)', color: 'var(--text2)' }}>
                    OPEN INVOICES ({(statement?.invoices ?? selected.invoices).length})
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {(statement?.invoices ?? selected.invoices).map((inv) => (
                      <div
                        key={inv.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '8px 10px',
                          borderRadius: 'var(--r-sm)',
                          border: '1px solid var(--border)',
                          gap: 8,
                        }}
                      >
                        <div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{inv.invoiceNo}</div>
                          <div style={{ fontSize: 'var(--t-th)', color: 'var(--text2)' }}>
                            Booking {inv.bookingNo} · Due {inv.dueDateAd}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                          <div style={{ fontWeight: 700 }}>{formatMoney(inv.outstandingAmount)}</div>
                          <div style={{ fontSize: 'var(--t-th)', color: 'var(--text2)' }}>
                            of {formatMoney(inv.totalAmount)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 style={{ margin: '0 0 8px', fontSize: 'var(--t-small)', color: 'var(--text2)' }}>
                    PAYMENTS SO FAR ({statement?.payments.length ?? 0})
                  </h4>
                  {!statement || statement.payments.length === 0 ? (
                    <p style={{ color: 'var(--text2)', fontSize: 'var(--t-small)', margin: 0 }}>
                      No payments recorded yet.
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {statement.payments.map((p) => (
                        <div
                          key={p.id}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '8px 10px',
                            borderRadius: 'var(--r-sm)',
                            border: '1px solid var(--border)',
                          }}
                        >
                          <div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{p.paymentNo}</div>
                            <div style={{ fontSize: 'var(--t-th)', color: 'var(--text2)' }}>
                              {p.paymentDateAd} · {p.bankName || p.channelGroup || p.paymentType}
                            </div>
                          </div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                            {formatMoney(p.amount)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </Modal>
    </PageBody>
  )
}
