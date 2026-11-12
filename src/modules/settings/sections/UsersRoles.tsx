import { useEffect, useState, useSyncExternalStore } from 'react'
import Icon from '../../../components/ui/Icon'
import { Card } from '../../../components/ui/Page'
import { DataTableShell } from '../../../components/ui/DataTable'
import { ErrorBanner } from '../../../components/ui/StateViews'
import { useToast } from '../../../components/ui/Toast'
import { thStyle as th } from '../../../components/ui/TableHeaderCell'
import { useAuth } from '../../../lib/auth'
import {
  canViewMoney,
  canManageSettings,
  isStaff,
} from '../../../lib/rbac'
import { PERMISSION_CATALOG } from '../../../lib/permissionCatalog'
import {
  getPermissionsVersion,
  isCapabilityLockedForRole,
  loadPermissionsFromDb,
  subscribePermissions,
} from '../../../lib/permissionsStore'
import { saveRolePermission } from '../../../actions/settings/permissions'
import type { SystemRole } from '../../../types/database'
import { BRANCHES } from '../../../lib/queries/settings'
import { ToneChip, td } from './shared'
import { StaffDirectoryCard } from './StaffDirectory'

/**
 * **Settings ▸ Users & Roles** — §11.2: *"user list, role assignment, the
 * 9-role matrix"*.
 *
 * Per Babin's 2026-11-12 ruling, Owner can edit role capabilities directly in
 * this matrix (and per-staff overrides in Staff Directory), backed by Postgres
 * (`0233_editable_staff_permissions.sql`). Owner full-access and Law 6
 * money-blindness remain protected.
 */

const ROLES: SystemRole[] = ['Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse', 'Technician', 'Accounts', 'Driver', 'Client']

export function UsersPane() {
  const { user } = useAuth()
  const { showSuccessToast } = useToast()
  useSyncExternalStore(subscribePermissions, getPermissionsVersion)

  const [matrixError, setMatrixError] = useState<string | null>(null)
  const [savingCell, setSavingCell] = useState<string | null>(null)
  const canEdit = Boolean(user && canManageSettings(user.role))

  useEffect(() => {
    void loadPermissionsFromDb()
  }, [])

  const handleToggle = async (role: SystemRole, capabilityKey: string, nextAllowed: boolean, label: string) => {
    const cellId = `${role}:${capabilityKey}`
    setSavingCell(cellId)
    setMatrixError(null)
    try {
      await saveRolePermission({ role, capability: capabilityKey, allowed: nextAllowed })
      showSuccessToast(`${role} · ${label}: ${nextAllowed ? 'Enabled' : 'Disabled'}`)
    } catch (e) {
      setMatrixError(e instanceof Error ? e.message : 'Could not update role permission.')
    } finally {
      setSavingCell(null)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>
      {/*
        First, because it is the task. The matrix below it is reference &
        configuration — an operator arrives on this tab to act on a person or
        tune role permissions.
      */}
      <StaffDirectoryCard />

      <Card
        title="Permissions Matrix"
        action={
          <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
            {canEdit ? 'Tap any unlocked cell to toggle · Owner & money-blindness locked' : 'Permissions for each role'}
          </span>
        }
      >
        {matrixError && (
          <div style={{ marginBottom: 'var(--sp-sm)' }}>
            <ErrorBanner message={matrixError} />
          </div>
        )}
        <DataTableShell ariaLabel="Permissions matrix" data-table-scroll style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
            <thead>
              <tr>
                <th style={{ ...th, position: 'sticky', left: 0, background: 'var(--card)' }}>Capability</th>
                {ROLES.map((r) => (
                  <th key={r} style={{ ...th, textAlign: 'center' }}>
                    {r}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSION_CATALOG.map((c) => (
                <tr key={c.key}>
                  <td style={{ ...td, position: 'sticky', left: 0, background: 'var(--card)' }}>
                    <span style={{ display: 'block', fontWeight: 600 }}>{c.label}</span>
                    <span style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--text2)', marginTop: 1 }}>{c.note}</span>
                  </td>
                  {ROLES.map((r) => {
                    const ok = c.test(r)
                    const lock = isCapabilityLockedForRole(r, c.key)
                    const cellId = `${r}:${c.key}`
                    const busy = savingCell === cellId

                    if (canEdit && !lock.locked) {
                      return (
                        <td key={r} style={{ ...td, textAlign: 'center' }}>
                          <button
                            type="button"
                            disabled={busy}
                            aria-label={`Toggle ${c.label} for ${r}`}
                            aria-pressed={ok}
                            onClick={() => void handleToggle(r, c.key, !ok, c.label)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 'var(--sp-xs)',
                              minHeight: 44,
                              minWidth: 68,
                              padding: '0 10px',
                              borderRadius: 'var(--r-sm)',
                              border: '1px solid var(--border)',
                              background: ok ? 'var(--success-bg, var(--bg))' : 'var(--bg)',
                              fontSize: 'var(--t-th)',
                              fontWeight: 700,
                              color: ok ? 'var(--success-text)' : 'var(--muted)',
                              cursor: busy ? 'wait' : 'pointer',
                              opacity: busy ? 0.6 : 1,
                            }}
                          >
                            <Icon name={ok ? 'check' : 'close'} size={13} fill />
                            {ok ? 'Yes' : 'No'}
                          </button>
                        </td>
                      )
                    }

                    return (
                      <td key={r} style={{ ...td, textAlign: 'center' }} title={lock.reason}>
                        {/* Law 11 — never colour alone; glyph and word together. */}
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 'var(--sp-xs)',
                            fontSize: 'var(--t-th)',
                            fontWeight: 700,
                            color: ok ? 'var(--success-text)' : 'var(--muted)',
                          }}
                        >
                          {lock.locked && canEdit && <Icon name="lock" size={11} />}
                          <Icon name={ok ? 'check' : 'close'} size={13} fill />
                          {ok ? 'Yes' : 'No'}
                        </span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </DataTableShell>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px,1fr))', gap: 'var(--sp-md)' }}>
        <Card title="Roles">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
            {ROLES.map((r) => (
              <div
                key={r}
                style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 0', borderBottom: '1px solid var(--border)' }}
              >
                <span style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)', flex: 1 }}>{r}</span>
                {canViewMoney(r) ? (
                  <ToneChip tone="primary" icon="dollar">
                    Sees money
                  </ToneChip>
                ) : (
                  <ToneChip tone="neutral" icon="eye">
                    Money-blind
                  </ToneChip>
                )}
                {!isStaff(r) && (
                  <ToneChip tone="progress" icon="external_link">
                    External
                  </ToneChip>
                )}
              </div>
            ))}
          </div>
        </Card>

        <Card title="Branch managers">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
            {BRANCHES.map((b) => (
              <div
                key={b.id}
                style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 0', borderBottom: '1px solid var(--border)' }}
              >
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
                    {b.manager}
                  </span>
                  <span style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--text2)' }}>
                    {b.name} · {b.staff} staff
                  </span>
                </span>
                <span className="identifier" style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                  {b.code}
                </span>
              </div>
            ))}
            {/*
              Narrowed twice. 24 Aug 2026: the first two clauses stopped being
              true when `Staff Directory` above started reading
              `staff_directory_v`. 8 Sep 2026 (RULING R-27): the third stopped
              being true as well — the ruling exists (Owner, mirroring this
              card's own read gate) and `0101` built the write path, so the
              directory can now assign a role and deactivate an account.

              What survives is the part that was never about a ruling:
              CREATION. A `users` row with no `auth.users` identity cannot sign
              in, and minting one needs the admin API and therefore the service
              key — a complete authorization bypass in a browser. That needs an
              Edge Function, and `0101` deliberately opens no INSERT path, so
              nothing here can half-create a person.
            */}
            <p style={{ margin: '4px 0 0', fontSize: 'var(--t-th)', color: 'var(--muted)', lineHeight: 1.5 }}>
              These are the managers named on the branch records. Assigning a role and deactivating an account are
              done in the Staff Directory above — Owner only, and every change is written to the audit trail.
              <strong> Creating</strong> a staff account is still unbuilt: a{' '}
              <span className="identifier">users</span> row with no sign-in account behind it cannot be used, and
              minting one needs a server-side key this app deliberately never holds.
            </p>
          </div>
        </Card>
      </div>
    </div>
  )
}
