import { useState, useEffect } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Button'
import { enrollClientMembership } from '../../../actions/clients/enrollMembership'
import { useAuth } from '../../../lib/auth'
import { useToast } from '../../../components/ui/Toast'
import { supabase } from '../../../lib/supabase'
import { MEMBERSHIP_TIERS, type ClientRecord, type MembershipTier } from '../../../lib/queries/clients'

export interface UpgradeTierModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (newTier: MembershipTier) => void
  client: ClientRecord
}

interface PlanRow {
  id: string
  level: string
  label: string
  individual_discount_pct: number
  annual_fee: number | null
}

const TIER_DESCRIPTIONS: Record<MembershipTier, string> = {
  Academy: 'Entry tier for students and emerging indie film crew.',
  Creator: 'Designed for independent creators, vloggers, and commercial videographers.',
  Cinematographer: 'For professional DoPs, active cinematographers, and frequent renters.',
  'Production Alliance': 'For registered production houses, agencies, and long-form projects.',
  Elite: 'Top-tier enterprise partners and marquee feature film productions.',
}

export function UpgradeTierModal({
  isOpen,
  onClose,
  onSuccess,
  client,
}: UpgradeTierModalProps) {
  const { user } = useAuth()
  const { showSuccessToast } = useToast()
  const [plans, setPlans] = useState<PlanRow[]>([])
  const [selectedTier, setSelectedTier] = useState<MembershipTier>(client.membership || 'Academy')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    async function fetchPlans() {
      try {
        const { data, error } = await supabase
          .from('membership_plans_v')
          .select('id, level, label, individual_discount_pct, annual_fee')
          .order('level', { ascending: true })
        if (error) throw error
        if (active && data) {
          setPlans(data as unknown as PlanRow[])
        }
      } catch {
        // Fallback
      }
    }
    if (isOpen) void fetchPlans()
    return () => {
      active = false
    }
  }, [isOpen])

  const matchedPlan = plans.find((p) => p.level === selectedTier || p.label === selectedTier)

  const handleSubmit = async () => {
    if (!user) {
      setError('Please sign in to update tier.')
      return
    }
    if (!matchedPlan) {
      setError(`Membership plan configuration not found for tier ${selectedTier}.`)
      return
    }

    setSaving(true)
    setError(null)

    try {
      await enrollClientMembership(
        {
          clientId: client.dbId || client.id,
          planId: matchedPlan.id,
          notes: notes.trim() || undefined,
        },
        { userId: user.id, role: user.role }
      )

      showSuccessToast(
        'Membership Tier Updated',
        `${client.name} has been updated to ${selectedTier}. Prior tier superseded in history.`
      )
      onSuccess(selectedTier)
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Change Membership Tier"
      subtitle={`Update the membership tier for ${client.name}.`}
      size="md"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, width: '100%' }}>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={saving || !matchedPlan || selectedTier === client.membership}
          >
            {saving ? 'Updating Tier…' : 'Apply Tier Change'}
          </Button>
        </div>
      }
    >
      <form onSubmit={(e) => { e.preventDefault(); void handleSubmit() }} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        {error && (
          <div
            role="alert"
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--r-btn)',
              background: 'color-mix(in srgb, var(--danger, #ef4444) 15%, var(--card))',
              border: '1px solid var(--danger)',
              color: 'var(--danger-text, #ef4444)',
              fontSize: 'var(--t-meta)',
              lineHeight: 1.45,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
            Select Membership Tier <span style={{ color: 'var(--danger)' }}>*</span>
          </label>
          <select
            value={selectedTier}
            onChange={(e) => setSelectedTier(e.target.value as MembershipTier)}
            disabled={saving}
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
            {MEMBERSHIP_TIERS.map((tier) => (
              <option key={tier} value={tier}>
                {tier} {tier === client.membership ? '(Current)' : ''}
              </option>
            ))}
          </select>
        </div>

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
          <span style={{ fontWeight: 700, color: 'var(--text)' }}>{selectedTier} plan</span>
          <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.45 }}>
            {TIER_DESCRIPTIONS[selectedTier]}
          </p>
          <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text)', marginTop: 4 }}>
            Rental Discount: <strong>{matchedPlan ? `${matchedPlan.individual_discount_pct}%` : 'Read from database'}</strong>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
            Change Reason / Reference Notes (Optional)
          </label>
          <textarea
            rows={2}
            placeholder="Reason for upgrading or changing client tier…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={saving}
            style={{
              padding: '8px 12px',
              borderRadius: 'var(--r-btn)',
              border: '1px solid var(--border)',
              background: 'var(--card)',
              color: 'var(--text)',
              fontSize: 'var(--t-meta)',
              resize: 'vertical',
            }}
          />
        </div>
      </form>
    </Modal>
  )
}
