import { useState } from 'react'
import { Card } from '../../components/ui/Page'
import { formatMoney, rupees, lateFee } from '../../lib/money'
import { useTranslation } from '../../lib/i18n'

export default function LateFeeCalculator() {
  const { t } = useTranslation()
  const [dayRate, setDayRate] = useState('')
  const [minutes, setMinutes] = useState('0')
  const rate = Number(dayRate)
  const overage = Number(minutes)
  const valid = dayRate.trim() !== '' && Number.isFinite(rate) && rate >= 0 && Number.isFinite(overage) && overage >= 0
  const result = valid ? lateFee({ scheduledReturnAt: new Date(0), actualReturnAt: new Date(overage * 60_000), dayRatePaisa: rupees(rate) }) : null
  return <div style={{ display: 'grid', gap: 'var(--sp-md)' }}>
    <p style={{ color: 'var(--text2)' }}>{t('tools.lateFee.ruleDescription')}</p>
    <Card title={t('tools.lateFee.estimateTitle')}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        <label style={{ display: 'grid', gap: 6 }}>{t('tools.lateFee.dailyRateLabel')}<input aria-label={t('tools.lateFee.dailyRateLabel')} type="number" min="0" value={dayRate} onChange={e => setDayRate(e.target.value)} style={{ minHeight: 44 }} /></label>
        <label style={{ display: 'grid', gap: 6 }}>{t('tools.lateFee.minutesLabel')}<input aria-label={t('tools.lateFee.minutesLabel')} type="number" min="0" value={minutes} onChange={e => setMinutes(e.target.value)} style={{ minHeight: 44 }} /></label>
      </div>
      <p role="status" style={{ marginBottom: 0 }}>{result ? <>{result.band} · <span className="figure" style={{ color: result.feePaisa > 0 ? 'var(--warn-text)' : 'var(--muted)' }}>{formatMoney(result.feePaisa)}</span></> : t('tools.lateFee.enterDailyRatePrompt')}</p>
    </Card>
  </div>
}
