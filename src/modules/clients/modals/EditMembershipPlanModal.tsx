import { useState, useEffect } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Button'
import { useToast } from '../../../components/ui/Toast'
import { saveMembershipPlan } from '../../../actions/clients/saveMembershipPlan'
import type { MembershipPlanRecord } from '../../../lib/queries/membership'

export interface EditMembershipPlanModalProps {
  isOpen: boolean
  onClose: () => void
  onSaved: () => void
  plan?: MembershipPlanRecord | null | undefined
}

const ALL_LEVELS = ['Academy', 'Creator', 'Cinematographer', 'Production Alliance', 'Elite'] as const
const ALL_LABELS = ['Access Member', 'Partner', 'Elite Member'] as const
const ALL_PERKS = [
  'Priority Booking',
  'Dedicated Manager',
  'Company Billing',
  'Credit Terms',
  'VIP Support',
  'Custom Solutions',
] as const

export function EditMembershipPlanModal({
  isOpen,
  onClose,
  onSaved,
  plan,
}: EditMembershipPlanModalProps) {
  const { showSuccessToast } = useToast()
  const isEditing = Boolean(plan)

  const [level, setLevel] = useState<string>(plan?.level ?? 'Academy')
  const [label, setLabel] = useState<string>(plan?.label ?? 'Access Member')
  const [annualFee, setAnnualFee] = useState<string>(plan?.annualFee != null ? String(plan.annualFee) : '')
  const [individualDiscount, setIndividualDiscount] = useState<string>(plan?.individualDiscountPct != null ? String(plan.individualDiscountPct) : '')
  const [bundleDiscount, setBundleDiscount] = useState<string>(plan?.bundleDiscountPct != null ? String(plan.bundleDiscountPct) : '')
  const [monthlyLimit, setMonthlyLimit] = useState<string>(plan?.monthlyBookingLimit != null ? String(plan.monthlyBookingLimit) : '')
  const [simultaneousLimit, setSimultaneousLimit] = useState<string>(plan?.simultaneousRentalLimit != null ? String(plan.simultaneousRentalLimit) : '')
  const [authorizedUsers, setAuthorizedUsers] = useState<string>(plan?.authorizedUsers != null ? String(plan.authorizedUsers) : '')
  const [defaultCredit, setDefaultCredit] = useState<string>(plan?.defaultCreditLimit != null ? String(plan.defaultCreditLimit) : '0')
  const [termMonths, setTermMonths] = useState<string>(plan?.termMonths != null ? String(plan.termMonths) : '12')
  const [selectedPerks, setSelectedPerks] = useState<string[]>(plan?.perks ?? [])
  const [displayOrder, setDisplayOrder] = useState<string>(plan?.displayOrder != null ? String(plan.displayOrder) : '')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (plan) {
      setLevel(plan.level)
      setLabel(plan.label)
      setAnnualFee(plan.annualFee != null ? String(plan.annualFee) : '')
      setIndividualDiscount(plan.individualDiscountPct != null ? String(plan.individualDiscountPct) : '')
      setBundleDiscount(plan.bundleDiscountPct != null ? String(plan.bundleDiscountPct) : '')
      setMonthlyLimit(plan.monthlyBookingLimit != null ? String(plan.monthlyBookingLimit) : '')
      setSimultaneousLimit(plan.simultaneousRentalLimit != null ? String(plan.simultaneousRentalLimit) : '')
      setAuthorizedUsers(plan.authorizedUsers != null ? String(plan.authorizedUsers) : '')
      setDefaultCredit(plan.defaultCreditLimit != null ? String(plan.defaultCreditLimit) : '0')
      setTermMonths(plan.termMonths != null ? String(plan.termMonths) : '12')
      setSelectedPerks(plan.perks ?? [])
      setDisplayOrder(plan.displayOrder != null ? String(plan.displayOrder) : '')
    } else {
      setLevel('Academy')
      setLabel('Access Member')
      setAnnualFee('6000')
      setIndividualDiscount('10')
      setBundleDiscount('5')
      setMonthlyLimit('3')
      setSimultaneousLimit('2')
      setAuthorizedUsers('1')
      setDefaultCredit('0')
      setTermMonths('12')
      setSelectedPerks([])
      setDisplayOrder('')
    }
    setError(null)
  }, [plan, isOpen])

  function togglePerk(perk: string) {
    setSelectedPerks((prev) =>
      prev.includes(perk) ? prev.filter((p) => p !== perk) : [...prev, perk],
    )
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const indDisc = individualDiscount.trim() === '' ? null : Number(individualDiscount)
    const bunDisc = bundleDiscount.trim() === '' ? null : Number(bundleDiscount)

    if (indDisc != null && (isNaN(indDisc) || indDisc < 0 || indDisc > 25)) {
      setError('Individual discount must be between 0% and 25% (hard cap).')
      return
    }
    if (bunDisc != null && (isNaN(bunDisc) || bunDisc < 0 || bunDisc > 25)) {
      setError('Bundle discount must be between 0% and 25% (hard cap).')
    }

    const tMonths = Number(termMonths)
    if (!Number.isSafeInteger(tMonths) || tMonths <= 0) {
      setError('Term months must be a positive integer.')
      return
    }

    setSaving(true)
    try {
      await saveMembershipPlan({
        planId: plan?.id,
        level,
        label,
        annualFee: annualFee.trim() === '' ? null : Number(annualFee),
        individualDiscountPct: indDisc,
        bundleDiscountPct: bunDisc,
        monthlyBookingLimit: monthlyLimit.trim() === '' ? null : Number(monthlyLimit),
        simultaneousRentalLimit: simultaneousLimit.trim() === '' ? null : Number(simultaneousLimit),
        authorizedUsers: authorizedUsers.trim() === '' ? null : Number(authorizedUsers),
        defaultCreditLimit: defaultCredit.trim() === '' ? 0 : Number(defaultCredit),
        termMonths: tMonths,
        perks: selectedPerks,
        displayOrder: displayOrder.trim() === '' ? undefined : Number(displayOrder),
      })

      showSuccessToast(isEditing ? `Plan ${level} updated.` : `Plan ${level} created.`)
      onSaved()
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save membership plan.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? `Edit Plan: ${plan?.level}` : 'Create Membership Plan'}
      subtitle="Configure membership tier pricing, limits, credit, and perks. Discounts cannot exceed 25%."
    >
      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        {error && (
          <div
            role="alert"
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--r-md, 6px)',
              background: 'var(--danger-surface, #ffebee)',
              color: 'var(--danger, #c62828)',
              fontSize: '14px',
              fontWeight: 500,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--sp-sm)' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontWeight: 600, fontSize: '13px' }}>
            Level
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              disabled={isEditing}
              style={{
                minHeight: 44,
                padding: '0 10px',
                borderRadius: 'var(--r-md, 6px)',
                border: '1px solid var(--border)',
                background: isEditing ? 'var(--bg-subtle, #f5f5f5)' : 'var(--bg-surface, #ffffff)',
                color: 'var(--text1)',
                fontFamily: 'inherit',
              }}
            >
              {ALL_LEVELS.map((lvl) => (
                <option key={lvl} value={lvl}>{lvl}</option>
              ))}
            </select>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontWeight: 600, fontSize: '13px' }}>
            Label
            <select
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              style={{
                minHeight: 44,
                padding: '0 10px',
                borderRadius: 'var(--r-md, 6px)',
                border: '1px solid var(--border)',
                background: 'var(--bg-surface, #ffffff)',
                color: 'var(--text1)',
                fontFamily: 'inherit',
              }}
            >
              {ALL_LABELS.map((lbl) => (
                <option key={lbl} value={lbl}>{lbl}</option>
              ))}
            </select>
          </label>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--sp-sm)' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontWeight: 600, fontSize: '13px' }}>
            Annual Fee (Rs)
            <input
              type="number"
              placeholder="e.g. 6000 (blank for Custom)"
              value={annualFee}
              onChange={(e) => setAnnualFee(e.target.value)}
              min="0"
              style={{
                minHeight: 44,
                padding: '0 10px',
                borderRadius: 'var(--r-md, 6px)',
                border: '1px solid var(--border)',
                background: 'var(--bg-surface, #ffffff)',
                color: 'var(--text1)',
                fontFamily: 'var(--font-mono, monospace)',
              }}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontWeight: 600, fontSize: '13px' }}>
            Individual Discount (%)
            <input
              type="number"
              placeholder="0 - 25%"
              value={individualDiscount}
              onChange={(e) => setIndividualDiscount(e.target.value)}
              min="0"
              max="25"
              step="0.5"
              style={{
                minHeight: 44,
                padding: '0 10px',
                borderRadius: 'var(--r-md, 6px)',
                border: '1px solid var(--border)',
                background: 'var(--bg-surface, #ffffff)',
                color: 'var(--text1)',
                fontFamily: 'var(--font-mono, monospace)',
              }}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontWeight: 600, fontSize: '13px' }}>
            Bundle Discount (%)
            <input
              type="number"
              placeholder="0 - 25%"
              value={bundleDiscount}
              onChange={(e) => setBundleDiscount(e.target.value)}
              min="0"
              max="25"
              step="0.5"
              style={{
                minHeight: 44,
                padding: '0 10px',
                borderRadius: 'var(--r-md, 6px)',
                border: '1px solid var(--border)',
                background: 'var(--bg-surface, #ffffff)',
                color: 'var(--text1)',
                fontFamily: 'var(--font-mono, monospace)',
              }}
            />
          </label>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--sp-sm)' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontWeight: 600, fontSize: '13px' }}>
            Monthly Booking Limit
            <input
              type="number"
              placeholder="Blank for unlimited"
              value={monthlyLimit}
              onChange={(e) => setMonthlyLimit(e.target.value)}
              min="1"
              style={{
                minHeight: 44,
                padding: '0 10px',
                borderRadius: 'var(--r-md, 6px)',
                border: '1px solid var(--border)',
                background: 'var(--bg-surface, #ffffff)',
                color: 'var(--text1)',
                fontFamily: 'var(--font-mono, monospace)',
              }}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontWeight: 600, fontSize: '13px' }}>
            Simultaneous Rental Limit
            <input
              type="number"
              placeholder="Blank for unlimited"
              value={simultaneousLimit}
              onChange={(e) => setSimultaneousLimit(e.target.value)}
              min="1"
              style={{
                minHeight: 44,
                padding: '0 10px',
                borderRadius: 'var(--r-md, 6px)',
                border: '1px solid var(--border)',
                background: 'var(--bg-surface, #ffffff)',
                color: 'var(--text1)',
                fontFamily: 'var(--font-mono, monospace)',
              }}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontWeight: 600, fontSize: '13px' }}>
            Default Credit Limit (Rs)
            <input
              type="number"
              placeholder="e.g. 100000"
              value={defaultCredit}
              onChange={(e) => setDefaultCredit(e.target.value)}
              min="0"
              style={{
                minHeight: 44,
                padding: '0 10px',
                borderRadius: 'var(--r-md, 6px)',
                border: '1px solid var(--border)',
                background: 'var(--bg-surface, #ffffff)',
                color: 'var(--text1)',
                fontFamily: 'var(--font-mono, monospace)',
              }}
            />
          </label>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--sp-sm)' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontWeight: 600, fontSize: '13px' }}>
            Term (Months)
            <input
              type="number"
              placeholder="12"
              value={termMonths}
              onChange={(e) => setTermMonths(e.target.value)}
              min="1"
              required
              style={{
                minHeight: 44,
                padding: '0 10px',
                borderRadius: 'var(--r-md, 6px)',
                border: '1px solid var(--border)',
                background: 'var(--bg-surface, #ffffff)',
                color: 'var(--text1)',
                fontFamily: 'var(--font-mono, monospace)',
              }}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontWeight: 600, fontSize: '13px' }}>
            Display Order
            <input
              type="number"
              placeholder="1, 2, 3..."
              value={displayOrder}
              onChange={(e) => setDisplayOrder(e.target.value)}
              min="1"
              style={{
                minHeight: 44,
                padding: '0 10px',
                borderRadius: 'var(--r-md, 6px)',
                border: '1px solid var(--border)',
                background: 'var(--bg-surface, #ffffff)',
                color: 'var(--text1)',
                fontFamily: 'var(--font-mono, monospace)',
              }}
            />
          </label>
        </div>

        <div>
          <span style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: 8 }}>Included Perks</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
            {ALL_PERKS.map((perk) => {
              const checked = selectedPerks.includes(perk)
              return (
                <label
                  key={perk}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 12px',
                    borderRadius: 'var(--r-md, 6px)',
                    border: `1px solid ${checked ? 'var(--nav-active-accent, #0070f3)' : 'var(--border)'}`,
                    background: checked ? 'var(--accent-subtle, #e6f7ff)' : 'transparent',
                    fontSize: '13px',
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => togglePerk(perk)}
                    style={{ width: 16, height: 16 }}
                  />
                  <span>{perk}</span>
                </label>
              )
            })}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-sm)', marginTop: 'var(--sp-md)', borderTop: '1px solid var(--border)', paddingTop: 'var(--sp-md)' }}>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Plan'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
