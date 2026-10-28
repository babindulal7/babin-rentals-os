import { useState } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Button'
import { useToast } from '../../../components/ui/Toast'
import { retireMembershipPlan } from '../../../actions/clients/retireMembershipPlan'
import type { MembershipPlanRecord } from '../../../lib/queries/membership'

export interface RetireMembershipPlanModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirmed: () => void
  plan: MembershipPlanRecord
  retire: boolean
}

export function RetireMembershipPlanModal({
  isOpen,
  onClose,
  onConfirmed,
  plan,
  retire,
}: RetireMembershipPlanModalProps) {
  const { showSuccessToast } = useToast()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    setSubmitting(true)
    setError(null)
    try {
      await retireMembershipPlan({
        planId: plan.id,
        retire,
      })
      showSuccessToast(retire ? `Plan ${plan.level} has been retired.` : `Plan ${plan.level} reactivated.`)
      onConfirmed()
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Operation failed.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={retire ? `Retire Plan: ${plan.level}` : `Reactivate Plan: ${plan.level}`}
      subtitle={
        retire
          ? `Retiring ${plan.level} prevents any new client enrolments or plan upgrades. Existing members on this plan keep all benefits and terms until their renewal date (Law 3: nothing is deleted).`
          : `Reactivating ${plan.level} will make it available again for new client enrolments and tier upgrades.`
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
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

        <div style={{ fontSize: '14px', color: 'var(--text2)', lineHeight: 1.5 }}>
          {retire ? (
            <p>
              Are you sure you want to retire <strong>{plan.level} ({plan.label})</strong>? It will remain in the database for member history, but won't accept new sign-ups.
            </p>
          ) : (
            <p>
              Are you sure you want to restore <strong>{plan.level} ({plan.label})</strong> to Active status?
            </p>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-sm)', marginTop: 'var(--sp-md)', borderTop: '1px solid var(--border)', paddingTop: 'var(--sp-md)' }}>
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="button"
            variant={retire ? 'danger' : 'primary'}
            onClick={handleConfirm}
            disabled={submitting}
          >
            {submitting ? 'Updating...' : retire ? 'Retire Plan' : 'Reactivate Plan'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
