import { useRef, useState, type FormEvent } from 'react'
import { Button, Card } from '../../../components/ui/Page'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'
import { Input } from '../../../components/ui/Input'
import { useAuth } from '../../../lib/auth'
import { useNetwork } from '../../../lib/network'
import { fetchCancellationFeeTiers, recordCancellationFeeTier, updateCancellationFeeTier, type CancellationFeeTier } from '../../../lib/queries/cancellationFeeTiers'
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
  const [saved, setSaved] = useState<string | null>(null)
  const [editing, setEditing] = useState<CancellationFeeTier | null>(null)
  const [retiring, setRetiring] = useState<CancellationFeeTier | null>(null)
  const pending = useRef<{ key: string; uuid: string } | null>(null)
  const submitting = useRef(false)

  function resetForm() {
    pending.current = null
    setEditing(null)
    setNotice('')
    setFee('')
  }

  async function save(write: () => Promise<void>, message: string) {
    if (!ownerId || !online || tiers.loading || tiers.error || submitting.current) return
    setError(null)
    setSaved(null)
    submitting.current = true
    setSaving(true)
    try {
      await write()
      resetForm()
      setRetiring(null)
      setSaved(message)
      tiers.reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not record the cancellation tier.')
    } finally {
      submitting.current = false
      setSaving(false)
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!ownerId) return
    if (!/^\d+$/.test(notice.trim()) || !/^\d+(\.\d{1,2})?$/.test(fee.trim())) {
      setSaved(null)
      setError('Enter whole notice hours and a percentage with up to two decimal places.')
      return
    }
    const noticeHours = Number(notice)
    const feePercent = Number(fee)
    if (editing) {
      void save(() => updateCancellationFeeTier(editing, { noticeHours, feePercent }), 'Cancellation fee tier updated.')
      return
    }
    const key = JSON.stringify([ownerId, noticeHours, feePercent])
    if (pending.current?.key !== key) pending.current = { key, uuid: newClientUuid() }
    const clientUuid = pending.current.uuid
    void save(() => recordCancellationFeeTier({ noticeHours, feePercent, clientUuid, createdBy: ownerId }),
      'Cancellation fee tier recorded.')
  }

  const actionsDisabled = saving || tiers.loading || !!tiers.error || !online

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
            {tiers.data.map(tier => (
              <li key={tier.id}>
                {tier.noticeHours}h notice · {tier.feePercent}% fee
                {ownerId && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-sm)' }}>
                    <Button disabled={actionsDisabled} aria-label={`Edit ${tier.noticeHours}-hour tier`}
                      onClick={() => {
                        setEditing(tier)
                        setNotice(String(tier.noticeHours))
                        setFee(String(tier.feePercent))
                        setError(null)
                        setSaved(null)
                      }}>Edit</Button>
                    <Button disabled={actionsDisabled} aria-label={`Retire ${tier.noticeHours}-hour tier`}
                      onClick={() => { setError(null); setRetiring(tier) }}>Retire</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )
      )}
      {ownerId && tiers.data && !tiers.error && (
        <form onSubmit={submit} style={{ display: 'grid', gap: 'var(--sp-md)' }}>
          <Input label="Minimum notice (hours)" type="number" min={0} step={1} required value={notice}
            onChange={event => setNotice(event.target.value)} disabled={saving} />
          <Input label="Fee (%)" type="number" min={0} max={100} step={0.01} required value={fee}
            onChange={event => setFee(event.target.value)} disabled={saving} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-sm)' }}>
            <Button type="submit" disabled={actionsDisabled}>
              {saving ? 'Recording…' : editing ? 'Save tier changes' : 'Add fee tier'}
            </Button>
            {editing && <Button onClick={resetForm} disabled={saving}>Cancel edit</Button>}
            {error && <Button disabled={saving} onClick={() => { resetForm(); setError(null); tiers.reload() }}>Reload tiers</Button>}
          </div>
          {!online && <p role="status">Reconnect to record a cancellation tier.</p>}
          {error && <p role="alert">{error}</p>}
          {saved && <p role="status">{saved}</p>}
        </form>
      )}
      {ownerId && retiring && (
        <ConfirmDialog
          isOpen
          title={`Retire the ${retiring.noticeHours}-hour tier?`}
          description={error ? <p role="alert">{error}</p> : 'This tier will be removed from the active schedule and kept in the records.'}
          confirmLabel="Retire tier"
          variant="danger"
          isSubmitting={actionsDisabled}
          onClose={() => { if (!saving) setRetiring(null) }}
          onConfirm={() => { void save(() => updateCancellationFeeTier(retiring, 'retire'), 'Cancellation fee tier retired.') }}
        />
      )}
      <p>These tiers define the fee before tax. Fee invoicing and refunds still require the cancellation settlement workflow.</p>
    </Card>
  )
}
