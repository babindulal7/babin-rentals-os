import { useState } from 'react'
import Icon from '../../../components/ui/Icon'
import { Card } from '../../../components/ui/Page'
import { getSetting, writeSettings } from '../../../lib/settingsStore'
import type { ManagerApprovalRouting } from '../../../lib/rbac'
import { useAuth } from '../../../lib/auth'
import { canManageSettings } from '../../../lib/rbac'
import type { SystemRole } from '../../../types/database'

/**
 * **Manager-Level Approvals Routing Card (R-22.1 / R-22.8, O-33)**
 * 
 * Allows the business owner to decide who authorizes Manager-level decisions:
 * - 'standard': Decided by Manager, Admin, or Owner.
 * - 'owner_only': Routes all 4 approval types strictly to the Owner (single-owner operations).
 */
export function ManagerApprovalRoutingCard() {
  const { user } = useAuth()
  const role = (user?.role as SystemRole) || 'Warehouse'
  const isAuthorized = canManageSettings(role)

  const [routing, setRouting] = useState<ManagerApprovalRouting>(() => {
    const val = getSetting('managerApprovalRouting')
    return val === 'owner_only' ? 'owner_only' : 'standard'
  })
  const [savedFeedback, setSavedFeedback] = useState<string | null>(null)

  const handleSelect = (mode: ManagerApprovalRouting) => {
    if (!isAuthorized) return
    setRouting(mode)
    writeSettings({ managerApprovalRouting: mode })
    setSavedFeedback(mode === 'owner_only' ? 'Approvals routed strictly to Owner' : 'Standard Manager threshold restored')
    setTimeout(() => setSavedFeedback(null), 3000)
  }

  return (
    <Card
      title="Manager-Level Approvals Routing"
      action={
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-xs)' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 'var(--t-th, 11px)',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: 'var(--r-full, 9999px)',
              backgroundColor: routing === 'owner_only' ? 'var(--warning-surface, rgba(234, 179, 8, 0.15))' : 'var(--surface-sunken, rgba(0, 0, 0, 0.05))',
              color: routing === 'owner_only' ? 'var(--warning, #eab308)' : 'var(--muted, #64748b)',
              border: `1px solid ${routing === 'owner_only' ? 'var(--warning-border, rgba(234, 179, 8, 0.3))' : 'var(--border, #e2e8f0)'}`,
            }}
          >
            <Icon name={routing === 'owner_only' ? 'lock' : 'check'} size={12} fill />
            {routing === 'owner_only' ? 'Owner Only' : 'Standard Ladder'}
          </span>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md, 16px)' }}>
        <p style={{ margin: 0, fontSize: 'var(--t-body, 14px)', color: 'var(--text2, #64748b)', lineHeight: 1.5 }}>
          Determines authorization authority for management-level operational decisions.
          In single-owner mode, all four approval categories route strictly to the Owner seat.
        </p>

        {/* Mode Selector */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--sp-sm, 12px)' }}>
          {/* Standard Mode */}
          <button
            type="button"
            onClick={() => handleSelect('standard')}
            disabled={!isAuthorized}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: 6,
              padding: '14px 16px',
              borderRadius: 'var(--r-md, 8px)',
              border: `2px solid ${routing === 'standard' ? 'var(--accent, #0f172a)' : 'var(--border, #e2e8f0)'}`,
              backgroundColor: routing === 'standard' ? 'var(--accent-subtle, rgba(15, 23, 42, 0.04))' : 'var(--card, #ffffff)',
              cursor: isAuthorized ? 'pointer' : 'not-allowed',
              textAlign: 'left',
              minHeight: 56,
              transition: 'all 0.15s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
              <span
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  border: `2px solid ${routing === 'standard' ? 'var(--accent, #0f172a)' : 'var(--muted, #94a3b8)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {routing === 'standard' && (
                  <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'var(--accent, #0f172a)' }} />
                )}
              </span>
              <span style={{ fontWeight: 700, fontSize: 'var(--t-meta, 13px)', color: 'var(--text, #0f172a)' }}>
                Standard Role Hierarchy
              </span>
            </div>
            <span style={{ fontSize: 'var(--t-fine, 12px)', color: 'var(--text2, #64748b)', paddingLeft: 24 }}>
              Active Manager, Admin, or Owner may approve within standard thresholds.
            </span>
          </button>

          {/* Owner Only Mode */}
          <button
            type="button"
            onClick={() => handleSelect('owner_only')}
            disabled={!isAuthorized}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: 6,
              padding: '14px 16px',
              borderRadius: 'var(--r-md, 8px)',
              border: `2px solid ${routing === 'owner_only' ? 'var(--accent, #0f172a)' : 'var(--border, #e2e8f0)'}`,
              backgroundColor: routing === 'owner_only' ? 'var(--accent-subtle, rgba(15, 23, 42, 0.04))' : 'var(--card, #ffffff)',
              cursor: isAuthorized ? 'pointer' : 'not-allowed',
              textAlign: 'left',
              minHeight: 56,
              transition: 'all 0.15s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
              <span
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  border: `2px solid ${routing === 'owner_only' ? 'var(--accent, #0f172a)' : 'var(--muted, #94a3b8)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {routing === 'owner_only' && (
                  <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'var(--accent, #0f172a)' }} />
                )}
              </span>
              <span style={{ fontWeight: 700, fontSize: 'var(--t-meta, 13px)', color: 'var(--text, #0f172a)' }}>
                Route All to Owner
              </span>
            </div>
            <span style={{ fontSize: 'var(--t-fine, 12px)', color: 'var(--text2, #64748b)', paddingLeft: 24 }}>
              Manager-level decisions route strictly to the Owner. Single-owner launch mode.
            </span>
          </button>
        </div>

        {/* 4 Covered Approval Categories (R-22.8) */}
        <div style={{ borderTop: '1px solid var(--border, #e2e8f0)', paddingTop: 12 }}>
          <span style={{ display: 'block', fontSize: 'var(--t-th, 11px)', fontWeight: 700, color: 'var(--muted, #64748b)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
            Governed Approval Categories
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--t-meta, 13px)', color: 'var(--text, #0f172a)' }}>
              <Icon name="check" size={14} fill style={{ color: 'var(--success, #16a34a)' }} />
              <span>1. Damage findings &lt; Rs 25,000</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--t-meta, 13px)', color: 'var(--text, #0f172a)' }}>
              <Icon name="check" size={14} fill style={{ color: 'var(--success, #16a34a)' }} />
              <span>2. Late-fee waivers</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--t-meta, 13px)', color: 'var(--text, #0f172a)' }}>
              <Icon name="check" size={14} fill style={{ color: 'var(--success, #16a34a)' }} />
              <span>3. Extension clashes</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--t-meta, 13px)', color: 'var(--text, #0f172a)' }}>
              <Icon name="check" size={14} fill style={{ color: 'var(--success, #16a34a)' }} />
              <span>4. Approvals inbox</span>
            </div>
          </div>
        </div>

        {/* Feedback Alert */}
        {savedFeedback && (
          <div
            style={{
              padding: '8px 12px',
              borderRadius: 'var(--r-sm, 6px)',
              backgroundColor: 'var(--success-surface, rgba(22, 163, 74, 0.1))',
              color: 'var(--success, #16a34a)',
              fontSize: 'var(--t-meta, 13px)',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Icon name="check" size={14} fill />
            <span>{savedFeedback}</span>
          </div>
        )}
      </div>
    </Card>
  )
}
