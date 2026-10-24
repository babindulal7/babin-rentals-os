import { useId, useRef, useState } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Page'
import { useToast } from '../../../components/ui/Toast'
import { changeMembership, NOTE_MAX } from '../../../actions/clients/changeMembership'
import { useAuth } from '../../../lib/auth'
import { formatMoney } from '../../../lib/money'
import { useNetwork } from '../../../lib/network'
import { useMembershipPlans } from '../../../lib/queries/useClients'
import type { ClientRecord, MembershipTier } from '../../../lib/queries/clients'

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
}

/**
 * Activate a client's membership, or move them to another plan.
 *
 * RULING 2026-10-22 (Babin: "activate membership"; fee left blank). This used to
 * be a dialog whose save was blocked ("no tier-change action exists") and whose
 * tier list and descriptions were constants. Now:
 *  - the plans offered are the LIVE ones from `membership_plans_v` — 0005: "no plan
 *    value may be hardcoded in application code" — with their credit and discount
 *    read from there, `null` meaning withheld or negotiated, never zero;
 *  - Apply calls `changeMembership` (one atomic RPC, 0174). The dialog emits no
 *    event and flips no state of its own: the action emits after the server
 *    confirms, and `onSuccess` is called only then;
 *  - a failure is shown inline and nothing is claimed; a success is a toast.
 *
 * No fee is recorded. Who may open it is decided by the caller with
 * `canChangeMembership`; the action and the database check it again.
 */
export function UpgradeTierModal(props: UpgradeTierModalProps) {
  // Mounted only while open: the plans are read when someone opens this, not on every client page view,
  // and each opening starts from nothing typed, no error, and a fresh request key.
  return props.isOpen ? <UpgradeTierDialog {...props} /> : null
}

function UpgradeTierDialog({ isOpen, onClose, onSuccess, client, hasMembership }: UpgradeTierModalProps) {
  const { user } = useAuth()
  const online = useNetwork()
  const { showSuccessToast } = useToast()
  const plans = useMembershipPlans()
  const selectId = useId()
  const noteId = useId()

  const current: MembershipTier | null = hasMembership ? client.membership : null
  const [selected, setSelected] = useState<MembershipTier | ''>('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  /* One request key per distinct request (Law 8): a retry of the SAME plan and note reuses it, so a
     response lost in transit cannot become a second membership; changing either makes a new request. */
  const keyRef = useRef<{ signature: string; key: string } | null>(null)

  const options = plans.rows
  // Default to the first plan that is not the one they are on, so activating is one tap.
  const effective: MembershipTier | '' =
    selected !== '' && options.some((p) => p.level === selected)
      ? selected
      : (options.find((p) => p.level !== current)?.level ?? '')
  const chosen = options.find((p) => p.level === effective) ?? null
  const unchanged = current !== null && effective === current
  const tooLong = note.trim().length > NOTE_MAX

  const activating = !hasMembership
  const verb = activating ? 'Activate Membership' : 'Apply Tier Change'

  const canApply = Boolean(user) && chosen !== null && !unchanged && !tooLong && !saving && !plans.loading

  async function apply() {
    if (!user || !chosen || !client.dbId) return
    const signature = `${chosen.level}|${note.trim()}`
    if (keyRef.current?.signature !== signature) keyRef.current = { signature, key: crypto.randomUUID() }
    setSaving(true)
    setError(null)
    try {
      await changeMembership(
        {
          clientDbId: client.dbId,
          clientCode: client.id,
          planLevel: chosen.level,
          note: note.trim() || undefined,
          clientUuid: keyRef.current.key,
        },
        { userId: user.id, role: user.role, isOnline: online },
      )
      keyRef.current = null
      showSuccessToast(
        activating ? `${client.name} is now on the ${chosen.level} plan.` : `${client.name} moved to the ${chosen.level} plan.`,
      )
      onSuccess(chosen.level)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The membership could not be changed.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={activating ? 'Activate Membership' : 'Change Membership Plan'}
      subtitle={activating ? `${client.name} has no membership yet.` : `${client.name} is on the ${current} plan.`}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
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
                value={effective}
                onChange={(e) => {
                  setSelected(e.target.value as MembershipTier)
                  setError(null)
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
                  Credit limit{' '}
                  <span className="figure">{chosen.defaultCreditLimit === null ? '—' : formatMoney(chosen.defaultCreditLimit)}</span>
                  {' · '}
                  Discount{' '}
                  <span className="figure">{chosen.individualDiscountPct === null ? 'Negotiated' : `${chosen.individualDiscountPct}%`}</span>
                </span>
                <span style={{ fontSize: 'var(--t-caption)', color: 'var(--muted)' }}>
                  Taken from the membership plans on file. No fee is recorded by this change.
                </span>
              </div>
            )}

            {unchanged && (
              <div role="status" style={{ color: 'var(--text2)', fontSize: 'var(--t-meta)' }}>
                {client.name} is already on the {current} plan. Choose a different plan.
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label htmlFor={noteId} style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
                Note (optional)
              </label>
              <textarea
                id={noteId}
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
