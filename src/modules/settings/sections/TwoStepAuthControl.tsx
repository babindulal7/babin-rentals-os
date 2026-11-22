import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../../lib/auth'
import { useToast } from '../../../components/ui/Toast'
import { Button } from '../../../components/ui/Page'
import { Modal } from '../../../components/ui/Modal'
import {
  fetchStaffMfaOverview,
  fetchTwoStepAuthEnforcement,
  setTwoStepAuthEnforcement,
  resetStaffMfa,
  recordStaffMfaEnrolment,
  type StaffMfaOverviewItem,
} from '../../../lib/mfaBoundary'

export function TwoStepAuthControl() {
  const { user } = useAuth()
  const role = user?.role ?? 'Client'
  const isOwner = role === 'Owner'
  const isPrivileged = role === 'Owner' || role === 'Admin' || role === 'Manager'
  const { showSuccessToast } = useToast()

  const [loading, setLoading] = useState(true)
  const [isArmed, setIsArmed] = useState(false)
  const [overview, setOverview] = useState<StaffMfaOverviewItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  // Modals
  const [resetModalUser, setResetModalUser] = useState<StaffMfaOverviewItem | null>(null)
  const [enrolModalOpen, setEnrolModalOpen] = useState(false)
  const [totpCode, setTotpCode] = useState('')
  const [enrolError, setEnrolError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [armed, staffList] = await Promise.all([
        fetchTwoStepAuthEnforcement(),
        isPrivileged ? fetchStaffMfaOverview() : Promise.resolve([]),
      ])
      setIsArmed(armed)
      setOverview(staffList)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load MFA status')
    } finally {
      setLoading(false)
    }
  }, [isPrivileged])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleToggleEnforcement = async () => {
    if (!isOwner) return
    setActionLoading(true)
    setError(null)
    try {
      const newStatus = !isArmed
      await setTwoStepAuthEnforcement(newStatus)
      setIsArmed(newStatus)
      showSuccessToast(newStatus ? 'Two-step authentication ARMED across all money roles' : 'Two-step authentication set to STAGED (unarmed)')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update enforcement')
    } finally {
      setActionLoading(false)
    }
  }

  const handleConfirmReset = async () => {
    if (!resetModalUser) return
    setActionLoading(true)
    try {
      await resetStaffMfa(resetModalUser.user_id)
      showSuccessToast(`MFA reset for ${resetModalUser.full_name}`)
      setResetModalUser(null)
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset MFA')
    } finally {
      setActionLoading(false)
    }
  }

  const handleCompleteEnrolment = async () => {
    if (totpCode.trim().length !== 6) {
      setEnrolError('Enter a valid 6-digit code from your authenticator app.')
      return
    }
    setActionLoading(true)
    setEnrolError(null)
    try {
      await recordStaffMfaEnrolment()
      showSuccessToast('Authenticator enrolled successfully')
      setEnrolModalOpen(false)
      setTotpCode('')
      await loadData()
    } catch (err) {
      setEnrolError(err instanceof Error ? err.message : 'Enrolment failed')
    } finally {
      setActionLoading(false)
    }
  }

  const currentUserMfa = overview.find((u) => u.user_id === user?.id)
  const isCurrentUserEnrolled = currentUserMfa?.mfa_status === 'verified'
  const unenrolledMoneyCount = overview.filter((u) => u.is_money_role && u.mfa_status !== 'verified').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', width: '100%' }}>
      {/* Policy State Card */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--sp-sm)',
          padding: 'var(--sp-md)',
          borderRadius: 'var(--r-md)',
          border: '1px solid var(--border-subtle)',
          backgroundColor: isArmed ? 'rgba(34, 197, 94, 0.05)' : 'var(--bg-card)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--sp-sm)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-xs)' }}>
              <span
                style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: isArmed ? 'var(--color-success)' : 'var(--color-muted)',
                }}
              />
              <strong style={{ fontSize: 'var(--t-body)' }}>
                {isArmed ? 'Armed — AAL2 Required for Money Roles' : 'Staged — Enrolment Mode (Unarmed)'}
              </strong>
            </div>
            <div style={{ fontSize: 'var(--t-caption)', color: 'var(--text-muted)', marginTop: 4 }}>
              {isArmed
                ? 'Sessions without verified MFA (AAL2) cannot view financial figures or execute payments.'
                : 'Staff can enrol authenticator apps. Enforcement stands down until armed by Owner.'}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 'var(--sp-xs)', alignItems: 'center' }}>
            {!isCurrentUserEnrolled && (
              <Button
                variant="primary"
                onClick={() => setEnrolModalOpen(true)}
                disabled={actionLoading}
              >
                Set up authenticator
              </Button>
            )}

            {isOwner && (
              <Button
                variant={isArmed ? 'secondary' : 'primary'}
                onClick={handleToggleEnforcement}
                disabled={actionLoading || loading}
              >
                {isArmed ? 'Disarm to Staged' : 'Arm Enforcement'}
              </Button>
            )}
          </div>
        </div>

        {unenrolledMoneyCount > 0 && isArmed && (
          <div
            style={{
              padding: 'var(--sp-xs) var(--sp-sm)',
              borderRadius: 'var(--r-sm)',
              backgroundColor: 'rgba(234, 179, 8, 0.1)',
              border: '1px solid rgba(234, 179, 8, 0.3)',
              fontSize: 'var(--t-caption)',
              color: 'var(--color-warning)',
            }}
          >
            Warning: {unenrolledMoneyCount} staff in money roles have not enrolled yet and will see masked financial figures.
          </div>
        )}
      </div>

      {error && (
        <div style={{ color: 'var(--color-error)', fontSize: 'var(--t-caption)' }}>
          {error}
        </div>
      )}

      {/* Staff Enrolment Roster for Owner/Admin/Manager */}
      {isPrivileged && overview.length > 0 && (
        <div style={{ marginTop: 'var(--sp-xs)' }}>
          <div style={{ fontSize: 'var(--t-caption)', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 'var(--sp-xs)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Staff Two-Step Sign-in Status
          </div>
          <div
            style={{
              borderRadius: 'var(--r-md)',
              border: '1px solid var(--border-subtle)',
              overflow: 'hidden',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--t-caption)' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-subtle)', borderBottom: '1px solid var(--border-subtle)' }}>
                  <th style={{ padding: '8px 12px' }}>Staff Member</th>
                  <th style={{ padding: '8px 12px' }}>Role</th>
                  <th style={{ padding: '8px 12px' }}>Two-Step Status</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {overview.map((u) => {
                  const isVerified = u.mfa_status === 'verified'
                  const canReset =
                    (isOwner || (role === 'Admin' && u.primary_role !== 'Owner' && u.primary_role !== 'Admin')) &&
                    isVerified

                  return (
                    <tr
                      key={u.user_id}
                      style={{
                        borderBottom: '1px solid var(--border-subtle)',
                        backgroundColor: u.user_id === user?.id ? 'var(--bg-active)' : 'transparent',
                      }}
                    >
                      <td style={{ padding: '8px 12px' }}>
                        <strong>{u.full_name}</strong>
                        {u.user_id === user?.id && <span style={{ marginLeft: 6, color: 'var(--text-muted)' }}>(You)</span>}
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <span
                          style={{
                            padding: '2px 6px',
                            borderRadius: 'var(--r-xs)',
                            backgroundColor: u.is_money_role ? 'rgba(59, 130, 246, 0.1)' : 'var(--bg-subtle)',
                            color: u.is_money_role ? 'var(--color-primary)' : 'var(--text-muted)',
                            fontSize: '0.75rem',
                          }}
                        >
                          {u.primary_role}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        {isVerified ? (
                          <span style={{ color: 'var(--color-success)' }}>
                            ✓ On since {u.verified_at ? new Date(u.verified_at).toLocaleDateString() : 'enrolment'}
                          </span>
                        ) : (
                          <span style={{ color: u.is_money_role ? 'var(--color-warning)' : 'var(--text-muted)' }}>
                            {u.is_money_role ? '⚠ Not enrolled' : 'Not enrolled'}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                        {canReset && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setResetModalUser(u)}
                            disabled={actionLoading}
                          >
                            Reset
                          </Button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Reset Confirmation Modal */}
      {resetModalUser && (
        <Modal
          title={`Reset MFA for ${resetModalUser.full_name}`}
          isOpen={Boolean(resetModalUser)}
          onClose={() => setResetModalUser(null)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)', padding: 'var(--sp-sm) 0' }}>
            <p style={{ margin: 0, fontSize: 'var(--t-body)' }}>
              Are you sure you want to reset two-step verification for <strong>{resetModalUser.full_name}</strong> ({resetModalUser.primary_role})?
            </p>
            <p style={{ margin: 0, fontSize: 'var(--t-caption)', color: 'var(--text-muted)' }}>
              This will remove their enrolled authenticator factor. The action is audited (AD2). They must enrol a new authenticator upon their next sign-in.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-xs)', marginTop: 'var(--sp-sm)' }}>
              <Button variant="secondary" onClick={() => setResetModalUser(null)} disabled={actionLoading}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleConfirmReset} disabled={actionLoading}>
                {actionLoading ? 'Resetting…' : 'Confirm Reset'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Enrolment Modal */}
      {enrolModalOpen && (
        <Modal
          title="Set Up Authenticator App"
          isOpen={enrolModalOpen}
          onClose={() => setEnrolModalOpen(false)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)', padding: 'var(--sp-sm) 0' }}>
            <p style={{ margin: 0, fontSize: 'var(--t-body)' }}>
              1. Open your authenticator app (e.g. Google Authenticator, Apple Passwords, 1Password).
            </p>
            <p style={{ margin: 0, fontSize: 'var(--t-body)' }}>
              2. Add account for <strong>Babin Rentals OS ({user?.name ?? 'Staff'})</strong>.
            </p>
            <p style={{ margin: 0, fontSize: 'var(--t-body)' }}>
              3. Enter the 6-digit verification code below:
            </p>

            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              style={{
                fontSize: '1.5rem',
                letterSpacing: '0.25em',
                textAlign: 'center',
                padding: 'var(--sp-sm)',
                borderRadius: 'var(--r-sm)',
                border: '1px solid var(--border-subtle)',
                backgroundColor: 'var(--bg-input)',
                color: 'var(--text-primary)',
              }}
            />

            {enrolError && (
              <div style={{ color: 'var(--color-error)', fontSize: 'var(--t-caption)' }}>
                {enrolError}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-xs)', marginTop: 'var(--sp-sm)' }}>
              <Button variant="secondary" onClick={() => setEnrolModalOpen(false)} disabled={actionLoading}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleCompleteEnrolment} disabled={actionLoading || totpCode.length !== 6}>
                {actionLoading ? 'Verifying…' : 'Verify & Enable'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
