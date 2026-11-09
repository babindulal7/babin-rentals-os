import { useEffect, useState } from 'react'
import { listBookingCrew, type BookingCrewRow } from '../../lib/queries/bookingCrew'
import { formatAdDateTime } from '../../lib/bs'
import { formatMoney, rupees } from '../../lib/money'
import { Button } from '../../components/ui/Button'
import { formatGateError } from '../../lib/gates'
import { useTranslation } from '../../lib/i18n'

export function BookingCrewList({ bookingId, includeMoney, version }: { bookingId: string; includeMoney: boolean; version: number }) {
  const { t } = useTranslation()
  const [rows, setRows] = useState<BookingCrewRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(null); setRows([])
    listBookingCrew(bookingId, includeMoney).then((result) => {
      if (!cancelled) { setRows(result); setLoading(false) }
    }).catch((err: unknown) => {
      if (!cancelled) { setError(formatGateError(err)); setLoading(false) }
    })
    return () => { cancelled = true }
  }, [bookingId, includeMoney, version, retry])

  if (loading) return <p role="status">{t('crew.list.loading', 'Loading assigned crew…')}</p>
  if (error) return (
    <div role="alert">
      <p>{error}</p>
      <Button onClick={() => setRetry((v) => v + 1)}>{t('crew.list.retry', 'Retry crew')}</Button>
    </div>
  )
  if (!rows.length) return <p>{t('crew.list.empty', 'No crew assigned to this booking yet.')}</p>

  return (
    <ul aria-label={t('crew.list.ariaLabel', 'Assigned crew')} style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 'var(--sp-md)' }}>
      {rows.map((row) => (
        <li key={row.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 'var(--sp-sm)', overflowWrap: 'anywhere' }}>
          <strong>{row.name ?? t('crew.list.nameUnavailable', 'Crew name unavailable')}</strong>
          <div>{row.role}</div>
          <div style={{ color: 'var(--text2)', fontSize: 'var(--t-meta)' }}>
            {t('crew.list.call', 'Call: {time}', { time: row.callTime ? formatAdDateTime(row.callTime) : t('crew.list.notRecorded', 'Not recorded') })}
          </div>
          <div style={{ color: 'var(--text2)', fontSize: 'var(--t-meta)' }}>
            {t('crew.list.wrap', 'Wrap: {time}', { time: row.wrapTime ? formatAdDateTime(row.wrapTime) : t('crew.list.notRecorded', 'Not recorded') })}
          </div>
          <div>
            {row.days === 1
              ? t('crew.list.daysSingle', '1 day', { count: 1 })
              : t('crew.list.daysMulti', '{count} days', { count: row.days })}
          </div>
          {includeMoney && (
            <div>
              {t('crew.list.dailyRate', 'Daily rate: {rate}', { rate: row.dailyRate === null ? t('crew.list.notAvailable', 'Not available') : formatMoney(rupees(row.dailyRate)) })}
              {' · '}
              {t('crew.list.totalPay', 'Total pay: {total}', { total: row.lineTotal === null ? t('crew.list.notAvailable', 'Not available') : formatMoney(rupees(row.lineTotal)) })}
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}
