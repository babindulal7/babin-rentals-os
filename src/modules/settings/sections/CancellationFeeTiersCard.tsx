import { useRef, useState, type FormEvent } from 'react'
import { Button, Card } from '../../../components/ui/Page'
import { Input } from '../../../components/ui/Input'
import { useAuth } from '../../../lib/auth'
import { useNetwork } from '../../../lib/network'
import { fetchCancellationFeeTiers, recordCancellationFeeTier } from '../../../lib/queries/cancellationFeeTiers'
import { useLoad } from '../../../lib/queries/useLoad'
import { newClientUuid } from '../../../lib/supabase'

export function CancellationFeeTiersCard() {
  const { user } = useAuth()
  const ownerId = user?.role === 'Owner' ? user.id : null
  const online = useNetwork()
  const tiers = useLoad(fetchCancellationFeeTiers, { enabled: user != null, key: user?.id ?? '' })
  const [notice, setNotice] = useState('')
  const [fee, setFee] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const pending = useRef<{ key: string; uuid: string } | null>(null)
  const submitting = useRef(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!ownerId || !online || tiers.loading || tiers.error || submitting.current) return
    setError(null)
    setSaved(false)
    if (!/^\d+$/.test(notice.trim()) || !/^\d+(\.\d{1,2})?$/.test(fee.trim())) {
      setError('Enter whole notice hours and a percentage with up to two decimal places.')
      return
    }
    const noticeHours = Number(notice)
    const feePercent = Number(fee)
    const key = JSON.stringify([ownerId, noticeHours, feePercent])
    if (pending.current?.key !== key) pending.current = { key, uuid: newClientUuid() }

    submitting.current = true
    setSaving(true)
    try {
      await recordCancellationFeeTier({ noticeHours, feePercent, clientUuid: pending.current.uuid, createdBy: ownerId })
      pending.current = null
      setNotice('')
      setFee('')
      setSaved(true)
      tiers.reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not record the cancellation tier.')
    } finally {
      submitting.current = false
      setSaving(false)
    }
  }

  return (
    <Card title="Cancellation fee tiers">
      {tiers.loading && <p role="status">Loading cancellation fee tiers…</p>}
      {tiers.error && (
        <div role="alert">
          <p>{tiers.error}</p>
          <Button onClick={tiers.reload}>Retry</Button>
        </div>
      )}
      {tiers.data && (
        tiers.data.length === 0 ? <p>No cancellation fee tiers are configured.</p> : (
          <ul>
            {tiers.data.map(tier => <li key={tier.id}>{tier.noticeHours}h notice · {tier.feePercent}% fee</li>)}
          </ul>
        )
      )}
      {ownerId && tiers.data && !tiers.error && (
        <form onSubmit={submit} style={{ display: 'grid', gap: 'var(--sp-md)' }}>
          <Input label="Minimum notice (hours)" type="number" min={0} step={1} required value={notice}
            onChange={event => setNotice(event.target.value)} disabled={saving} />
          <Input label="Fee (%)" type="number" min={0} max={100} step={0.01} required value={fee}
            onChange={event => setFee(event.target.value)} disabled={saving} />
          <div><Button type="submit" disabled={saving || tiers.loading || !online}>{saving ? 'Recording…' : 'Add fee tier'}</Button></div>
          {!online && <p role="status">Reconnect to record a cancellation tier.</p>}
          {error && <p role="alert">{error}</p>}
          {saved && <p role="status">Cancellation fee tier recorded.</p>}
        </form>
      )}
      <p>These tiers define the fee before tax. Fee invoicing and refunds still require the cancellation settlement workflow.</p>
    </Card>
  )
}
