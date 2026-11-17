import { useEffect, useId, useRef, useState } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Page'
import { useToast } from '../../../components/ui/Toast'
import { changeMembership, NOTE_MAX } from '../../../actions/clients/changeMembership'
import { renewMembership } from '../../../actions/clients/renewMembership'
import { useAuth } from '../../../lib/auth'
import { formatMoney, grouped, parseMoney, rupees, toRupees, type Paisa } from '../../../lib/money'
import { useNetwork } from '../../../lib/network'
import { useMembershipPlans } from '../../../lib/queries/useClients'
import type { ClientRecord, MembershipTier } from '../../../lib/queries/clients'
import { calculateMembershipCredit } from '../../../lib/membershipCredit'
import { businessDayAd } from '../../../lib/bs'
import { supabase } from '../../../lib/supabase'

export interface UpgradeTierModalProps {
  isOpen: boolean
  onClose: () => void
  /** Called once, AFTER the server confirmed the change, with the plan the client is now on. */
  onSuccess: (newTier: MembershipTier) => void
  client: ClientRecord
  /**
   * The truth about whether this client has a live membership
   * (`ClientProfile.membershipKnown`). `client.membership` cannot say: a client
   * with none carries a placeholder tier (`UNJOINED_MEMBERSHIP_PLACEHOLDER`).
   */
  hasMembership: boolean
  /** Whether to open pre-configured for renewal (Ruling D23). */
  initialMode?: 'change' | 'renew' | undefined
}

/**
 * Activate a client's membership, or move them to another plan, or renew.
 *
 * RULING 2026-10-22 (Babin: "activate membership"; fee left blank).
 * RULING D23 (OPEN_DECISIONS §20): Renewing on a lapsed (or ending) membership
 * charges the plan fee (credit = 0), starts a new term from the renewal date,
 * and keeps history.
 */
export function UpgradeTierModal(props: UpgradeTierModalProps) {
  // Mounted only while open: the plans are read when someone opens this, not on every client page view,
  // and each opening starts from nothing typed, no error, and a fresh request key.
  return props.isOpen ? <UpgradeTierDialog {...props} /> : null
}

function UpgradeTierDialog({ isOpen, onClose, onSuccess, client, hasMembership, initialMode }: UpgradeTierModalProps) {
  const { user } = useAuth()
  const online = useNetwork()
  const { showSuccessToast } = useToast()
  const plans = useMembershipPlans()
  const selectId = useId()
  const noteId = useId()

  const current: MembershipTier | null = hasMembership ? client.membership : null
  const isDirectRenew = initialMode === 'renew'
  const [selected, setSelected] = useState<MembershipTier | ''>(isDirectRenew && current ? current : '')
  const [isRenewing, setIsRenewing] = useState<boolean>(isDirectRenew)
  const [note, setNote] = useState('')
  /** The negotiated fee, in rupees-as-typed. Only a custom-fee plan needs it. */
  const [feeInput, setFeeInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  /* R-9.2: staff choose each time. Default is restart the term from the change date. */
  const [keepJoinDate, setKeepJoinDate] = useState(false)
  const submitting = useRef(false)

  const [activeMembership, setActiveMembership] = useState<{
    id: string
    planId: string
    joinDate: string
    feePaid: number | null
  } | null>(null)
  /* The read settles EXACTLY once: with the live row, or without it. A read that
     fails or cannot run leaves the dialog on the pinned tier's basis — the
     database still enforces the true row, so the dialog must not sit waiting. */
  const [membershipReadSettled, setMembershipReadSettled] = useState(false)

  useEffect(() => {
    let active = true
    async function loadActive() {
      if (!hasMembership || !client.dbId) {
        if (active) setMembershipReadSettled(true)
        return
      }
      try {
        const { data, error } = await supabase
          .from('client_memberships_v')
          .select('id, plan_id, join_date, fee_paid')
          .eq('client_id', client.dbId)
          .is('superseded_at', null)
          .maybeSingle()
        if (!active) return
        if (error) return
        if (data) {
          setActiveMembership({
            id: data.id,
            planId: data.plan_id,
            joinDate: data.join_date,
            // DB money is integer paisa; the dialog prices in rupees.
            feePaid: data.fee_paid != null ? toRupees(Number(data.fee_paid) as Paisa) : null,
          })
        }
      } catch {
        // Fall back to the pinned tier's plan below.
      } finally {
        if (active) setMembershipReadSettled(true)
      }
    }
    void loadActive()
    return () => {
      active = false
    }
  }, [hasMembership, client.dbId])

  /* One request key per distinct request (Law 8): a retry of the SAME plan and note reuses it, so a
     response lost in transit cannot become a second membership; changing either makes a new request. */
  const keyRef = useRef<{ signature: string; key: string } | null>(null)

  const options = plans.rows
  // Default to the first plan that is not the one they are on, so activating is one tap.
  const effective: MembershipTier | '' =
    selected !== '' && options.some((p) => p.level === selected)
      ? selected
      : isDirectRenew && current && options.some((p) => p.level === current)
        ? current
        : (options.find((p) => p.level !== current)?.level ?? '')
  const chosen = options.find((p) => p.level === effective) ?? null
  const unchanged = current !== null && effective === current
  const isRenewal = hasMembership && unchanged && (isRenewing || isDirectRenew)
  const tooLong = note.trim().length > NOTE_MAX

  const activating = !hasMembership
  const verb = activating
    ? 'Activate Membership'
    : isRenewal
      ? 'Renew Membership'
      : 'Apply Tier Change'

  /* The old plan is the LIVE row's plan when the row is on file; only when the
     row is absent does the pinned tier stand in. Falling back to the pinned
     tier while the row exists would price the credit against a plan that is
     not the one the client paid, and would call an unrecorded fee "known". */
  const oldPlan = hasMembership
    ? activeMembership
      ? (options.find((p) => p.id === activeMembership.planId) ?? null)
      : (options.find((p) => p.level === current) ?? null)
    : null
  const oldFeeRupees = activeMembership?.feePaid ?? (oldPlan?.annualFee != null ? toRupees(oldPlan.annualFee) : 0)
  const oldJoinDate = activeMembership?.joinDate ?? businessDayAd()
  const oldTermMonths = oldPlan?.termMonths ?? 12

  /* The old-fee basis is priced from what the membership row recorded, else the
     old plan's listing. With NEITHER the credit for unused days cannot be
     computed — it must never be shown, and never guessed as zero (Law 16).
     When the custom-fee plan is chosen (listed fee withheld — Elite), the
     negotiated fee is requested here; an absent fee has NO price, so the
     database refuses one, and this dialog refuses to send it. On a RENEWAL of
     a custom-fee plan the fee recorded on the live row is already a price. */
  const membershipReadPending = hasMembership && !membershipReadSettled
  const oldFeeBasisKnown = !hasMembership || oldPlan?.annualFee != null || activeMembership?.feePaid != null
  const customFeeChosen = chosen !== null && chosen.annualFee == null
  const parsedFee = feeInput.trim() !== '' ? parseMoney(feeInput.trim()) : null
  const feeInvalid = feeInput.trim() !== '' && (parsedFee === null || !Number.isSafeInteger(parsedFee) || parsedFee < 0)
  const negotiatedFeePaisa: Paisa | null = !feeInvalid && parsedFee !== null ? parsedFee : null
  const newFeePaisa: Paisa | null = chosen === null
    ? null
    : customFeeChosen
      ? negotiatedFeePaisa
      : (chosen.annualFee ?? null)
  /* What a renewal charges: the listing, a freshly negotiated fee, else the
     fee already recorded on the live row (a custom-fee renewal). */
  const renewalFeePaisa: Paisa | null = chosen === null
    ? null
    : chosen.annualFee != null
      ? chosen.annualFee
      : negotiatedFeePaisa ?? (activeMembership?.feePaid != null ? rupees(activeMembership.feePaid) : null)

  const creditWorking =
    hasMembership && chosen && !unchanged && oldFeeBasisKnown && !membershipReadPending && newFeePaisa !== null
      ? calculateMembershipCredit({
          oldFeePaisa: rupees(oldFeeRupees),
          oldJoinDate,
          oldTermMonths,
          effectiveDate: businessDayAd(),
          newFeePaisa,
        })
      : null

  /* A change is never submitted before its working can be shown: while the live
     membership row is still being read, and when it settles without a priceable
     fee basis, the dialog waits instead of sending a change it cannot price. A
     custom-fee renewal is priceable from the fee already recorded on the row. */
  const canApply =
    Boolean(user) && chosen !== null && (!unchanged || isRenewal) && !tooLong && !saving && !plans.loading
    && (!customFeeChosen || negotiatedFeePaisa !== null || (isRenewal && renewalFeePaisa !== null))
    && (activating || (!membershipReadPending && oldFeeBasisKnown))

  async function apply() {
    if (submitting.current || !canApply || !user || !chosen) return
    if (!client.dbId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(client.dbId)) {
      setError('Reload this client before changing membership. The saved client identity is unavailable.')
      return
    }
    if (!online) {
      setError('Connect to update client membership.')
      return
    }
    const signature = JSON.stringify([client.dbId, chosen.level, isRenewal, note.trim(), negotiatedFeePaisa, keepJoinDate])
    if (keyRef.current?.signature !== signature) keyRef.current = { signature, key: crypto.randomUUID() }
    submitting.current = true
    setSaving(true)
    setError(null)
    try {
      if (isRenewal) {
        await renewMembership(
          {
            clientDbId: client.dbId,
            clientCode: client.id,
            planLevel: chosen.level,
            ...(chosen.id ? { planId: chosen.id } : {}),
            // A renegotiated renewal carries the new fee; on a custom-fee plan
            // with nothing typed the database carries the recorded fee forward.
            ...(negotiatedFeePaisa !== null ? { feePaid: negotiatedFeePaisa } : {}),
            note: note.trim() || undefined,
            clientUuid: keyRef.current.key,
          },
          { userId: user.id, role: user.role, isOnline: online },
        )
        keyRef.current = null
        showSuccessToast(`${client.name}'s ${chosen.level} membership has been renewed for a new term.`)
        onSuccess(chosen.level)
        onClose()
      } else {
        const res = await changeMembership(
          {
            clientDbId: client.dbId,
            clientCode: client.id,
            planLevel: chosen.level,
            ...(chosen.id ? { planId: chosen.id } : {}),
            // A custom-fee plan is priced per client: the negotiated fee is the
            // payload's fee_paid, and everything else stays out of the payload.
            ...(negotiatedFeePaisa !== null ? { feePaid: negotiatedFeePaisa } : {}),
            note: note.trim() || undefined,
            // R-9.2: only a plan change to an existing membership can keep the join date.
            ...(keepJoinDate && hasMembership && !activating ? { keepJoinDate: true } : {}),
            clientUuid: keyRef.current.key,
          },
          { userId: user.id, role: user.role, isOnline: online },
        )
        keyRef.current = null
        const creditNote = res?.credit && res.credit > 0 ? ` (Rs ${grouped(res.credit)} credited)` : ''
        const accountNote = res?.account_credit && res.account_credit > 0 ? ` Rs ${grouped(res.account_credit)} added to account credit.` : ''
        showSuccessToast(
          activating
            ? `${client.name} is now on the ${chosen.level} plan.`
            : `${client.name} moved to the ${chosen.level} plan.${creditNote}${accountNote}`,
        )
        onSuccess(chosen.level)
        onClose()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The membership could not be changed.')
    } finally {
      submitting.current = false
      setSaving(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => { if (!submitting.current) onClose() }}
      title={activating ? 'Activate Membership' : isRenewal ? 'Renew Membership' : 'Change Membership Plan'}
      subtitle={
        activating
          ? `${client.name} has no membership yet.`
          : isRenewal
            ? `${client.name} is renewing their ${current} plan.`
            : `${client.name} is on the ${current} plan.`
      }
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void apply()} disabled={!canApply} loading={saving}>
            {verb}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (canApply) void apply()
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}
      >
        {plans.loading && <p style={{ margin: 0, color: 'var(--text2)' }}>Loading membership plans…</p>}

        {!plans.loading && plans.error && (
          <div role="alert" style={{ color: 'var(--danger-text)', fontSize: 'var(--t-meta)' }}>
            Could not load the membership plans. {plans.error}{' '}
            <Button variant="secondary" onClick={plans.refetch}>
              Retry
            </Button>
          </div>
        )}

        {!plans.loading && !plans.error && options.length === 0 && (
          <div role="status" style={{ color: 'var(--text2)', fontSize: 'var(--t-meta)', lineHeight: 1.45 }}>
            No membership plan is on file, so there is nothing to assign yet.
          </div>
        )}

        {options.length > 0 && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label htmlFor={selectId} style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
                Membership plan <span aria-hidden="true" style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <select
                id={selectId}
                disabled={saving}
                value={effective}
                onChange={(e) => {
                  setSelected(e.target.value as MembershipTier)
                  setError(null)
                  if (e.target.value !== current) {
                    setIsRenewing(false)
                  }
                }}
                style={{
                  minHeight: 44,
                  padding: '0 12px',
                  borderRadius: 'var(--r-btn)',
                  border: '1px solid var(--border)',
                  background: 'var(--card)',
                  color: 'var(--text)',
                  fontSize: 'var(--t-body)',
                  fontWeight: 600,
                }}
              >
                {options.map((p) => (
                  <option key={p.level} value={p.level}>
                    {p.level}
                    {p.level === current ? ' (current)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {chosen && (
              <div
                style={{
                  padding: 14,
                  borderRadius: 'var(--r-card, 8px)',
                  background: 'var(--card2)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <span style={{ fontWeight: 700, color: 'var(--text)' }}>
                  {chosen.level} · {chosen.label}
                </span>
                <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                  {chosen.annualFee != null && (
                    <>
                      Annual fee <span className="figure">{formatMoney(chosen.annualFee)}</span>
                      {' · '}
                    </>
                  )}
                  Credit limit{' '}
                  <span className="figure">{chosen.defaultCreditLimit === null ? '—' : formatMoney(chosen.defaultCreditLimit)}</span>
                  {' · '}
                  Discount{' '}
                  <span className="figure">{chosen.individualDiscountPct === null ? 'Negotiated' : `${chosen.individualDiscountPct}%`}</span>
                </span>
                <span style={{ fontSize: 'var(--t-caption)', color: 'var(--muted)' }}>
                  Taken from the membership plans on file.{' '}
                  {customFeeChosen
                    ? negotiatedFeePaisa !== null
                      ? 'The negotiated fee is recorded with this change.'
                      : isRenewal
                        ? renewalFeePaisa !== null
                          ? 'The fee already on record is charged; record a new fee to renegotiate.'
                          : 'The fee is negotiated per client — record it below to price this renewal.'
                        : 'The fee is negotiated per client — record it below to price this change.'
                    : 'No fee is recorded by this change.'}
                </span>
              </div>
            )}

            {chosen && customFeeChosen && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label htmlFor={`fee-${selectId}`} style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
                  Negotiated fee (NPR) {!isRenewal && <span aria-hidden="true" style={{ color: 'var(--danger)' }}>*</span>}
                </label>
                <input
                  id={`fee-${selectId}`}
                  aria-label="Negotiated fee"
                  type="text"
                  inputMode="decimal"
                  placeholder="e.g. 25,000 — the fee Babin agreed for this client"
                  value={feeInput}
                  aria-invalid={feeInvalid}
                  disabled={saving}
                  onChange={(e) => {
                    setFeeInput(e.target.value)
                    setError(null)
                  }}
                  style={{
                    minHeight: 44,
                    padding: '8px 12px',
                    borderRadius: 'var(--r-btn)',
                    border: `1px solid ${feeInvalid ? 'var(--danger)' : 'var(--border)'}`,
                    background: 'var(--card)',
                    color: 'var(--text)',
                    fontSize: 'var(--t-meta)',
                  }}
                />
                {feeInvalid && (
                  <span role="alert" style={{ color: 'var(--danger-text)', fontSize: 'var(--t-meta)' }}>
                    Enter a valid non-negative negotiated fee.
                  </span>
                )}
              </div>
            )}

            {chosen && !unchanged && membershipReadPending && (
              <div role="status" style={{ color: 'var(--text2)', fontSize: 'var(--t-meta)' }}>
                Reading the current membership…
              </div>
            )}

            {chosen && !unchanged && !membershipReadPending && !oldFeeBasisKnown && (
              <div role="status" style={{ color: 'var(--text)', fontSize: 'var(--t-meta)', lineHeight: 1.45 }}>
                The fee on the current membership was never recorded, so the unused days cannot be priced and the change cannot
                be sent. Record the fee on the membership first — the database refuses this change until it can be priced.
              </div>
            )}

            {creditWorking && (
              <div
                style={{
                  padding: 14,
                  borderRadius: 'var(--r-card, 8px)',
                  background: 'var(--card2)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: 'var(--t-meta)' }}>
                  Credit for unused days (Ruling D22)
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', rowGap: 6, columnGap: 12, fontSize: 'var(--t-meta)' }}>
                  <span style={{ color: 'var(--text2)' }}>Current plan fee:</span>
                  <span className="figure" style={{ fontWeight: 600, color: 'var(--text)' }}>
                    {formatMoney(creditWorking.oldFeePaisa)}
                  </span>

                  <span style={{ color: 'var(--text2)' }}>Unused term remaining:</span>
                  <span className="figure" style={{ fontWeight: 600, color: 'var(--text)' }}>
                    {creditWorking.daysLeft} of {creditWorking.daysInOldTerm} days
                  </span>

                  <span style={{ color: 'var(--text2)' }}>Credit for unused days:</span>
                  <span className="figure" style={{ fontWeight: 600, color: 'var(--success, #16a34a)' }}>
                    − {formatMoney(creditWorking.creditPaisa)}
                  </span>

                  <span style={{ color: 'var(--text2)' }}>New plan annual fee:</span>
                  <span className="figure" style={{ fontWeight: 600, color: 'var(--text)' }}>
                    {formatMoney(creditWorking.newFeePaisa)}
                  </span>

                  <div style={{ gridColumn: '1 / -1', height: 1, background: 'var(--border)', margin: '4px 0' }} />

                  <span style={{ fontWeight: 700, color: 'var(--text)' }}>New fee due now:</span>
                  <span className="figure" style={{ fontWeight: 700, fontSize: 'var(--t-body)', color: 'var(--text)' }}>
                    {formatMoney(creditWorking.newFeeDuePaisa)}
                  </span>

                  {creditWorking.accountCreditPaisa > 0 && (
                    <>
                      <span style={{ color: 'var(--primary, #0284c7)', fontWeight: 600 }}>Excess to account credit:</span>
                      <span className="figure" style={{ fontWeight: 700, color: 'var(--primary, #0284c7)' }}>
                        + {formatMoney(creditWorking.accountCreditPaisa)}
                      </span>
                    </>
                  )}
                </div>
                <span style={{ fontSize: 'var(--t-caption)', color: 'var(--muted)', marginTop: 2 }}>
                  {creditWorking.accountCreditPaisa > 0
                    ? 'Credit exceeds the new fee. The excess is credited to the client’s account balance (non-cash).'
                    : keepJoinDate
                      ? 'The original join date is kept, so the renewal date stays on the same anniversary. Unused days of the old plan are credited toward the new fee.'
                      : 'A new term starts from today. Unused days of the old plan are credited toward the new fee.'}
                </span>
              </div>
            )}

            {hasMembership && chosen && !unchanged && (
              <fieldset
                disabled={saving}
                style={{ border: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}
              >
                <legend style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
                  Renewal date after this change
                </legend>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 'var(--t-meta)', color: 'var(--text)' }}>
                  <input
                    type="radio"
                    name="membership-term-start"
                    checked={!keepJoinDate}
                    onChange={() => setKeepJoinDate(false)}
                  />
                  Restart the term from today (default)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 'var(--t-meta)', color: 'var(--text)' }}>
                  <input
                    type="radio"
                    name="membership-term-start"
                    checked={keepJoinDate}
                    onChange={() => setKeepJoinDate(true)}
                  />
                  Keep the original join date
                </label>
              </fieldset>
            )}

            {unchanged && (
              <div
                style={{
                  padding: 14,
                  borderRadius: 'var(--r-card, 8px)',
                  background: 'var(--card2)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div role="status" style={{ color: 'var(--text2)', fontSize: 'var(--t-meta)' }}>
                  {client.name} is already on the {current} plan.{!isRenewal ? ' Choose a different plan or renew below.' : ''}
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
                  <input
                    type="checkbox"
                    checked={isRenewal}
                    onChange={(e) => {
                      setIsRenewing(e.target.checked)
                      setError(null)
                    }}
                    disabled={saving}
                  />
                  Renew for a new term (Ruling D23)
                </label>
                {isRenewal && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', rowGap: 6, columnGap: 12, fontSize: 'var(--t-meta)', marginTop: 4 }}>
                    <span style={{ color: 'var(--text2)' }}>Renewal plan fee:</span>
                    <span className="figure" style={{ fontWeight: 600, color: 'var(--text)' }}>
                      {renewalFeePaisa !== null ? formatMoney(renewalFeePaisa) : '—'}
                    </span>
                    <span style={{ color: 'var(--text2)' }}>Credit for renewal:</span>
                    <span className="figure" style={{ fontWeight: 600, color: 'var(--muted)' }}>
                      Rs 0
                    </span>
                    <div style={{ gridColumn: '1 / -1', height: 1, background: 'var(--border)', margin: '4px 0' }} />
                    <span style={{ fontWeight: 700, color: 'var(--text)' }}>New fee due now:</span>
                    <span className="figure" style={{ fontWeight: 700, fontSize: 'var(--t-body)', color: 'var(--text)' }}>
                      {renewalFeePaisa !== null ? formatMoney(renewalFeePaisa) : '—'}
                    </span>
                    <span style={{ gridColumn: '1 / -1', fontSize: 'var(--t-caption)', color: 'var(--muted)', marginTop: 2 }}>
                      Charges the full plan fee, starts a new term from today, and keeps the previous term in history.
                    </span>
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label htmlFor={noteId} style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
                Note (optional)
              </label>
              <textarea
                id={noteId}
                disabled={saving}
                rows={2}
                placeholder="Why the plan is changing, or a reference — kept with the audit record."
                value={note}
                onChange={(e) => {
                  setNote(e.target.value)
                  setError(null)
                }}
                aria-invalid={tooLong}
                style={{
                  padding: '8px 12px',
                  borderRadius: 'var(--r-btn)',
                  border: `1px solid ${tooLong ? 'var(--danger)' : 'var(--border)'}`,
                  background: 'var(--card)',
                  color: 'var(--text)',
                  fontSize: 'var(--t-meta)',
                  resize: 'vertical',
                }}
              />
              {tooLong && (
                <span role="alert" style={{ color: 'var(--danger-text)', fontSize: 'var(--t-meta)' }}>
                  A note can be at most {NOTE_MAX} characters ({note.trim().length} now).
                </span>
              )}
            </div>
          </>
        )}

        {error && (
          <div role="alert" style={{ color: 'var(--danger-text)', fontSize: 'var(--t-meta)', lineHeight: 1.45 }}>
            {error}
          </div>
        )}
      </form>
    </Modal>
  )
}
