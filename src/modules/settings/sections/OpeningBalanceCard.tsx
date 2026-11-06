import { useRef, useState, type FormEvent } from 'react'
import { useAuth } from '../../../lib/auth'
import { businessDayAd } from '../../../lib/bs'
import { formatMoney, parseMoney } from '../../../lib/money'
import { useNetwork } from '../../../lib/network'
import { listBankAccounts } from '../../../lib/queries/bankAccounts'
import { listExpenseBranches } from '../../../lib/queries/finance'
import { recordOpeningBalance, type RecordOpeningBalanceInput } from '../../../lib/queries/openingBalances'
import { useLoad } from '../../../lib/queries/useLoad'
import { newClientUuid } from '../../../lib/supabase'
import { Button, Card } from '../../../components/ui/Page'
import { Input } from '../../../components/ui/Input'
import { Select } from '../../../components/ui/Select'

export function OpeningBalanceCard() {
  const { user } = useAuth()
  const online = useNetwork()
  const ownerId = user?.role === 'Owner' ? user.id : null
  const options = useLoad(async () => {
    const [accounts, branches] = await Promise.all([listBankAccounts(), listExpenseBranches()])
    return [
      { value: 'org-cash', label: 'Organisation cash drawer', account: { type: 'cash', locationId: null } },
      ...branches.map(branch => ({
        value: `branch:${branch.id}`, label: `Cash drawer · ${branch.name}`,
        account: { type: 'cash', locationId: branch.id } as const,
      })),
      ...accounts.filter(account => account.channelGroup === 'Bank').map(account => ({
        value: `bank:${account.id}`, label: `${account.accountName} · ${account.bankName}`,
        account: { type: 'bank', accountId: account.id } as const,
      })),
    ] satisfies { value: string; label: string; account: RecordOpeningBalanceInput['account'] }[]
  }, { enabled: ownerId !== null, key: ownerId ?? '' })
  const [selected, setSelected] = useState('')
  const [openingDate, setOpeningDate] = useState(businessDayAd)
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const pending = useRef<{ fingerprint: string; clientUuid: string } | null>(null)
  const submitting = useRef(false)

  if (!ownerId) return null

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!ownerId || !online || submitting.current || options.loading || options.error) return
    setSaved(null)
    setError(null)
    const choice = options.data?.find(option => option.value === selected)
    const amountPaisa = /^-?\d+(\.\d{1,2})?$/.test(amount.trim()) ? parseMoney(amount) : null
    if (!choice || amountPaisa === null) {
      setError('Choose an account and enter an amount with up to two decimal places.')
      return
    }

    const fingerprint = JSON.stringify([ownerId, selected, openingDate, amountPaisa])
    if (pending.current?.fingerprint !== fingerprint) {
      pending.current = { fingerprint, clientUuid: newClientUuid() }
    }
    submitting.current = true
    setSaving(true)
    try {
      await recordOpeningBalance({
        account: choice.account, openingDate, amountPaisa,
        clientUuid: pending.current.clientUuid, createdBy: ownerId,
      })
      pending.current = null
      setSaved(`${choice.label} · ${openingDate} · ${formatMoney(amountPaisa)} recorded.`)
      setAmount('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not record the opening balance.')
    } finally {
      submitting.current = false
      setSaving(false)
    }
  }

  return (
    <Card title="Opening balances">
      <p>Record the opening amount for a cash drawer or bank account. To correct an amount, record another entry for the same date and account.</p>
      {options.loading && <p role="status">Loading payment accounts and branches…</p>}
      {options.error && (
        <div role="alert">
          <p>{options.error}</p>
          <Button onClick={options.reload}>Retry</Button>
        </div>
      )}
      {!online && <p role="status">Reconnect to record an opening balance.</p>}
      {options.data && !options.error && (
        <form onSubmit={submit} style={{ display: 'grid', gap: 'var(--sp-md)' }}>
          <Select label="Opening balance account" value={selected} placeholder="Choose an account"
            onChange={event => setSelected(event.target.value)} options={options.data} disabled={saving} />
          <Input label="Opening date (AD)" type="date" value={openingDate} required disabled={saving}
            onChange={event => setOpeningDate(event.target.value)} />
          <Input label="Opening amount (Rs)" inputMode="decimal" value={amount} required disabled={saving}
            onChange={event => setAmount(event.target.value)} />
          <div><Button type="submit" disabled={saving || !online}>{saving ? 'Recording…' : 'Record opening balance'}</Button></div>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
      {saved && <p role="status">{saved}</p>}
    </Card>
  )
}
