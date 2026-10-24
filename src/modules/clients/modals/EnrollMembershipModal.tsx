import { useState, useEffect } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Button'
import { enrollClientMembership } from '../../../actions/clients/enrollMembership'
import { useAuth } from '../../../lib/auth'
import { useToast } from '../../../components/ui/Toast'
import { useCanViewMoney } from '../../../lib/moneyVisibility'
import { supabase } from '../../../lib/supabase'
import Icon from '../../../components/ui/Icon'

export interface MembershipPlanRecord {
  id: string
  level: string
  label: string
  annual_fee: number | null
  individual_discount_pct: number
  default_credit_limit: number | null
  monthly_booking_limit: number | null
  simultaneous_rental_limit: number | null
  perks?: string[] | null
}

export interface EnrollMembershipModalProps {
  isOpen: boolean
  onClose: () => void
  onEnrolled: () => void
  initialClientId?: string | undefined
  initialClientName?: string | undefined
}

export function EnrollMembershipModal({
  isOpen,
  onClose,
  onEnrolled,
  initialClientId,
  initialClientName,
}: EnrollMembershipModalProps) {
  const { user } = useAuth()
  const { showSuccessToast } = useToast()
  const canViewMoney = useCanViewMoney()

  const [clients, setClients] = useState<Array<{ id: string; name: string; phone: string }>>([])
  const [selectedClientId, setSelectedClientId] = useState<string>(initialClientId ?? '')

  const [plans, setPlans] = useState<MembershipPlanRecord[]>([])
  const [selectedPlanId, setSelectedPlanId] = useState<string>('')
  const [joinDate, setJoinDate] = useState<string>(new Date().toISOString().slice(0, 10))
  const [feePaidInput, setFeePaidInput] = useState<string>('')
  const [notes, setNotes] = useState<string>('')

  const [existingMembership, setExistingMembership] = useState<{ id: string; planLabel: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load active membership plans from view
  useEffect(() => {
    let active = true
    async function fetchPlans() {
      try {
        const { data, error } = await supabase
          .from('membership_plans_v')
          .select('*')
          .order('level', { ascending: true })
        if (error) throw error
        if (active && data) {
          const list = data as unknown as MembershipPlanRecord[]
          setPlans(list)
          if (!selectedPlanId && list[0]) {
            setSelectedPlanId(list[0].id)
            if (list[0].annual_fee != null) {
              setFeePaidInput(String(list[0].annual_fee))
            }
          }
        }
      } catch (err: unknown) {
        if (active) setError('Could not load membership plans.')
      }
    }
    if (isOpen) void fetchPlans()
    return () => {
      active = false
    }
  }, [isOpen, selectedPlanId])

  // Load clients if not preselected
  useEffect(() => {
    let active = true
    async function fetchClients() {
      if (initialClientId) return
      try {
        const { data, error } = await supabase
          .from('clients_v')
          .select('id, name, phone')
          .order('name', { ascending: true })
          .limit(100)
        if (error) throw error
        if (active && data) {
          setClients(data as unknown as Array<{ id: string; name: string; phone: string }>)
          if (!selectedClientId && data[0]) {
            setSelectedClientId(data[0].id)
          }
        }
      } catch {
        // Fallback gracefully
      }
    }
    if (isOpen) void fetchClients()
    return () => {
      active = false
    }
  }, [isOpen, initialClientId, selectedClientId])

  // Check for existing active membership for client
  useEffect(() => {
    let active = true
    async function checkExisting() {
      const targetId = initialClientId ?? selectedClientId
      if (!targetId) {
        setExistingMembership(null)
        return
      }
      try {
        const { data, error } = await supabase
          .from('client_memberships_v')
          .select('id, plan_id')
          .eq('client_id', targetId)
          .is('superseded_at', null)
          .maybeSingle()
        if (error) return
        if (active && data) {
          const matchedPlan = plans.find((p) => p.id === data.plan_id)
          setExistingMembership({
            id: data.id,
            planLabel: matchedPlan?.label ?? 'Active Tier',
          })
        } else if (active) {
          setExistingMembership(null)
        }
      } catch {
        if (active) setExistingMembership(null)
      }
    }
    if (isOpen) void checkExisting()
    return () => {
      active = false
    }
  }, [isOpen, initialClientId, selectedClientId, plans])

  const selectedPlan = plans.find((p) => p.id === selectedPlanId)

  const handlePlanChange = (planId: string) => {
    setSelectedPlanId(planId)
    const p = plans.find((x) => x.id === planId)
    if (p && p.annual_fee != null && canViewMoney) {
      setFeePaidInput(String(p.annual_fee))
    }
  }

  const handleSubmit = async () => {
    const targetClientId = initialClientId ?? selectedClientId
    if (!user) {
      setError('Please sign in to enroll membership.')
      return
    }
    if (!targetClientId) {
      setError('Please select a client.')
      return
    }
    if (!selectedPlanId) {
      setError('Please select a membership plan.')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const feeNum = feePaidInput ? Number(feePaidInput) : null
      const result = await enrollClientMembership(
        {
          clientId: targetClientId,
          planId: selectedPlanId,
          joinDate,
          feePaid: canViewMoney ? feeNum : null,
          notes: notes.trim() || undefined,
        },
        { userId: user.id, role: user.role }
      )

      showSuccessToast(
        'Membership enrolled',
        `Client enrolled in ${result.plan_label} tier. Plan benefits are active.`
      )
      onEnrolled()
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  const targetName = initialClientName ?? clients.find((c) => c.id === selectedClientId)?.name ?? 'Client'

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Enroll Membership"
      subtitle={`Assign membership plan and tier benefits for ${targetName}.`}
      size="md"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, width: '100%' }}>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={saving || !selectedPlanId}>
            {saving ? 'Enrolling…' : 'Confirm Enrollment'}
          </Button>
        </div>
      }
    >
      <div style={{ display: 'grid', gap: 'var(--sp-md, 16px)' }}>
        {error && (
          <div
            role="alert"
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--r-btn, 8px)',
              background: 'color-mix(in srgb, var(--danger, #ef4444) 15%, var(--card))',
              border: '1px solid var(--danger)',
              color: 'var(--danger-text, #ef4444)',
              fontSize: 'var(--t-meta, 13px)',
            }}
          >
            {error}
          </div>
        )}

        {existingMembership && (
          <div
            role="status"
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--r-btn, 8px)',
              background: 'color-mix(in srgb, var(--warn, #f59e0b) 15%, var(--card))',
              border: '1px solid var(--warn, #f59e0b)',
              color: 'var(--warn-text, #b45309)',
              fontSize: 'var(--t-meta, 13px)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Icon name="alert_circle" size={16} style={{ flexShrink: 0 }} />
            <span>
              This client currently holds <strong>{existingMembership.planLabel}</strong>. Enrolling will supersede
              the previous membership and record this tier change in history.
            </span>
          </div>
        )}

        {/* Client selector if not preselected */}
        {!initialClientId && (
          <label style={{ display: 'grid', gap: 6, fontWeight: 600, fontSize: 'var(--t-meta, 13px)' }}>
            Client *
            <select
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              disabled={saving}
              style={{
                minHeight: 44,
                padding: '0 12px',
                borderRadius: 'var(--r-input, 8px)',
                border: '1px solid var(--border)',
                background: 'var(--card2)',
                color: 'var(--text)',
              }}
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.phone})
                </option>
              ))}
            </select>
          </label>
        )}

        {/* Plan selector */}
        <label style={{ display: 'grid', gap: 6, fontWeight: 600, fontSize: 'var(--t-meta, 13px)' }}>
          Membership Plan *
          <select
            value={selectedPlanId}
            onChange={(e) => handlePlanChange(e.target.value)}
            disabled={saving}
            style={{
              minHeight: 44,
              padding: '0 12px',
              borderRadius: 'var(--r-input, 8px)',
              border: '1px solid var(--border)',
              background: 'var(--card2)',
              color: 'var(--text)',
            }}
          >
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} ({p.level}) — {p.individual_discount_pct}% discount
              </option>
            ))}
          </select>
        </label>

        {/* Plan Benefits Summary Card */}
        {selectedPlan && (
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 'var(--r-card, 8px)',
              background: 'var(--card2)',
              border: '1px solid var(--border)',
              fontSize: 'var(--t-meta, 13px)',
              display: 'grid',
              gap: 6,
            }}
          >
            <div style={{ fontWeight: 700, color: 'var(--text)' }}>Plan Entitlements: {selectedPlan.label}</div>
            <div style={{ color: 'var(--text2)' }}>
              Rental Discount: <strong>{selectedPlan.individual_discount_pct}%</strong>
            </div>
            {canViewMoney && selectedPlan.annual_fee != null && (
              <div style={{ color: 'var(--text2)' }}>
                Annual Fee: <strong>Rs. {selectedPlan.annual_fee.toLocaleString()}</strong>
              </div>
            )}
            {selectedPlan.monthly_booking_limit && (
              <div style={{ color: 'var(--text2)' }}>
                Monthly Booking Cap: <strong>{selectedPlan.monthly_booking_limit} bookings</strong>
              </div>
            )}
          </div>
        )}

        {/* Join Date */}
        <label style={{ display: 'grid', gap: 6, fontWeight: 600, fontSize: 'var(--t-meta, 13px)' }}>
          Join / Anniversary Date *
          <input
            type="date"
            value={joinDate}
            onChange={(e) => setJoinDate(e.target.value)}
            disabled={saving}
            style={{
              minHeight: 44,
              padding: '0 12px',
              borderRadius: 'var(--r-input, 8px)',
              border: '1px solid var(--border)',
              background: 'var(--card2)',
              color: 'var(--text)',
            }}
          />
        </label>

        {/* Fee paid (money-gated) */}
        {canViewMoney && (
          <label style={{ display: 'grid', gap: 6, fontWeight: 600, fontSize: 'var(--t-meta, 13px)' }}>
            Fee Paid (NPR)
            <input
              type="number"
              value={feePaidInput}
              onChange={(e) => setFeePaidInput(e.target.value)}
              placeholder="e.g. 5000"
              disabled={saving}
              style={{
                minHeight: 44,
                padding: '0 12px',
                borderRadius: 'var(--r-input, 8px)',
                border: '1px solid var(--border)',
                background: 'var(--card2)',
                color: 'var(--text)',
              }}
            />
          </label>
        )}

        {/* Notes */}
        <label style={{ display: 'grid', gap: 6, fontWeight: 600, fontSize: 'var(--t-meta, 13px)' }}>
          Enrollment Notes
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Special approval, referral, or tier assignment justification"
            disabled={saving}
            style={{
              minHeight: 70,
              padding: '10px 12px',
              borderRadius: 'var(--r-input, 8px)',
              border: '1px solid var(--border)',
              background: 'var(--card2)',
              color: 'var(--text)',
              resize: 'vertical',
            }}
          />
        </label>
      </div>
    </Modal>
  )
}
