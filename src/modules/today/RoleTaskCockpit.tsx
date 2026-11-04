// =============================================================================
// src/modules/today/RoleTaskCockpit.tsx — Role-Specific Tasks & Cockpit (T5-11)
//
// Rulings:
//   - W61: The first screen depends on the role:
//       Warehouse/Technician — today's pack, handover, return and reset queue (returns before 06:00 first, W31)
//       Coordinator — online requests, quotes waiting, today's pickups/returns, late
//       Accounts — payments due, who owes, closing
//       Manager — approvals, late/blocked, today's movements
//       Owner (W79) — approvals waiting, today's money (collected, owed, deposits held), late/blocked/damaged, business pulse
//   - W31: Returns arrive early morning, before 6 AM — highlighted and sorted first.
//   - W79: Owner's first screen: approvals waiting, today's money, late/blocked/damaged, business pulse.
//   - Law 6: Floor roles never get a money block or receive monetary figures.
//   - Law 16: Five screen states (loading, empty, error, restricted, offline).
//   - Tap budget: 1 tap to first task from the dashboard.
// =============================================================================

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon, { type IconName } from '../../components/ui/Icon'
import { useAuth } from '../../lib/auth'
import { canViewMoney } from '../../lib/rbac'
import { formatMoney } from '../../lib/money'
import {
  fetchRoleTaskMetrics,
  type RoleTaskMetrics,
} from '../../lib/queries/roleTasks'

interface TaskCardProps {
  title: string
  count: number | string
  subtitle: string
  actionLabel: string
  actionPath: string
  icon: IconName
  badge?: string | undefined
  badgeTone?: 'warning' | 'danger' | 'success' | 'info' | undefined
  isFloorVerb?: boolean | undefined
}

function TaskCard({
  title,
  count,
  subtitle,
  actionLabel,
  actionPath,
  icon,
  badge,
  badgeTone = 'warning',
  isFloorVerb = false,
}: TaskCardProps) {
  const navigate = useNavigate()

  const badgeBg =
    badgeTone === 'danger'
      ? 'var(--danger-surface, rgba(239, 68, 68, 0.12))'
      : badgeTone === 'warning'
      ? 'var(--warning-surface, rgba(245, 158, 11, 0.12))'
      : badgeTone === 'success'
      ? 'var(--success-surface, rgba(34, 197, 94, 0.12))'
      : 'var(--card2, rgba(100, 116, 139, 0.12))'

  const badgeFg =
    badgeTone === 'danger'
      ? 'var(--danger-text, #ef4444)'
      : badgeTone === 'warning'
      ? 'var(--warn-text, #f59e0b)'
      : badgeTone === 'success'
      ? 'var(--success-text, #22c55e)'
      : 'var(--text2, #94a3b8)'

  return (
    <div
      className="task-cockpit-card"
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-card, 8px)',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: '12px',
        boxShadow: 'var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.05))',
        position: 'relative',
        minHeight: '140px',
      }}
    >
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                width: 32,
                height: 32,
                borderRadius: '6px',
                background: 'var(--card2, rgba(0,0,0,0.04))',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--primary)',
              }}
            >
              <Icon name={icon} size={18} />
            </span>
            <span style={{ fontSize: 'var(--t-meta, 13px)', fontWeight: 600, color: 'var(--muted)' }}>
              {title}
            </span>
          </div>
          {badge && (
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '999px',
                background: badgeBg,
                color: badgeFg,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              {badge}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '4px' }}>
          <span
            style={{
              fontSize: typeof count === 'number' ? '28px' : '22px',
              fontWeight: 700,
              fontFamily: 'var(--font-mono, monospace)',
              color: 'var(--text)',
              lineHeight: 1,
            }}
          >
            {count}
          </span>
        </div>

        <div style={{ fontSize: 'var(--t-meta, 13px)', color: 'var(--muted)', lineHeight: 1.4 }}>
          {subtitle}
        </div>
      </div>

      <button
        type="button"
        onClick={() => navigate(actionPath)}
        style={{
          width: '100%',
          minHeight: isFloorVerb ? '56px' : '44px', // Floor verb target rule
          padding: '8px 16px',
          borderRadius: 'var(--r-btn, 6px)',
          border: '1px solid var(--border)',
          background: 'var(--card2, rgba(0,0,0,0.02))',
          color: 'var(--text)',
          fontSize: 'var(--t-body, 14px)',
          fontWeight: 600,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--primary)'
          e.currentTarget.style.color = '#fff'
          e.currentTarget.style.borderColor = 'var(--primary)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'var(--card2, rgba(0,0,0,0.02))'
          e.currentTarget.style.color = 'var(--text)'
          e.currentTarget.style.borderColor = 'var(--border)'
        }}
      >
        <span>{actionLabel}</span>
        <Icon name="arrow_right" size={16} />
      </button>
    </div>
  )
}

export function RoleTaskCockpit() {
  const { user } = useAuth()
  const role = user?.role || 'Warehouse'
  const isMoney = canViewMoney(role)

  const [metrics, setMetrics] = useState<RoleTaskMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isOffline, setIsOffline] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false)

  useEffect(() => {
    const onOnline = () => setIsOffline(false)
    const onOffline = () => setIsOffline(true)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    fetchRoleTaskMetrics(role, user?.id)
      .then((data) => {
        if (!cancelled) {
          setMetrics(data)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load task metrics')
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [role, user?.id])

  if (loading) {
    return (
      <div
        className="role-task-cockpit role-task-cockpit--loading"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            style={{
              height: 140,
              background: 'var(--card2, rgba(0,0,0,0.04))',
              borderRadius: 'var(--r-card, 8px)',
              animation: 'pulse 1.5s infinite ease-in-out',
            }}
          />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div
        style={{
          padding: '12px 16px',
          borderRadius: 'var(--r-card, 8px)',
          background: 'var(--danger-surface, rgba(239, 68, 68, 0.1))',
          color: 'var(--danger-text, #ef4444)',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Icon name="alert_circle" size={18} />
        <span>Task cockpit could not be loaded: {error}</span>
      </div>
    )
  }

  return (
    <section className="role-task-cockpit" aria-label={`Task cockpit for ${role}`} style={{ marginBottom: '24px' }}>
      {isOffline && (
        <div
          style={{
            padding: '8px 12px',
            marginBottom: '12px',
            borderRadius: '6px',
            background: 'var(--warning-surface, rgba(245, 158, 11, 0.12))',
            color: 'var(--warn-text, #f59e0b)',
            fontSize: 'var(--t-meta, 13px)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Icon name="alert_circle" size={16} />
          <span>Offline mode · floor actions queue locally via Dexie outbox</span>
        </div>
      )}

      {/* 1. Warehouse & Technician (W61, W31, Law 6) */}
      {(role === 'Warehouse' || role === 'Technician') && metrics?.warehouse && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <h2 style={{ fontSize: 'var(--t-h2, 18px)', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
              Floor Work Queues
            </h2>
            <span style={{ fontSize: 'var(--t-meta, 12px)', color: 'var(--muted)' }}>
              Role: {role} · Tap budget: 1 tap to action
            </span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
              gap: '16px',
            }}
          >
            <TaskCard
              title="Pack Queue"
              count={metrics.warehouse.packCount}
              subtitle="Bookings staged for preparation today"
              actionLabel="Pack Gear"
              actionPath="/operations?tab=pack"
              icon="box"
              isFloorVerb
            />
            <TaskCard
              title="Handover Queue"
              count={metrics.warehouse.handoverCount}
              subtitle="Packed orders waiting for client pickup"
              actionLabel="Start Handover"
              actionPath="/operations?tab=handover"
              icon="checklist"
              isFloorVerb
            />
            <TaskCard
              title="Return Queue"
              count={metrics.warehouse.returnCount}
              subtitle={
                metrics.warehouse.earlyMorningReturnCount > 0
                  ? `${metrics.warehouse.earlyMorningReturnCount} returns due before 06:00 NPT (W31)`
                  : 'Scheduled returns for intake & check'
              }
              actionLabel="Intake Return"
              actionPath="/operations?tab=return"
              icon="return_arrow"
              badge={metrics.warehouse.earlyMorningReturnCount > 0 ? `${metrics.warehouse.earlyMorningReturnCount} Early (<6 AM)` : undefined}
              badgeTone={metrics.warehouse.earlyMorningReturnCount > 0 ? 'warning' : undefined}
              isFloorVerb
            />
            <TaskCard
              title="Reset & QC Queue"
              count={metrics.warehouse.resetCount}
              subtitle="Returned gear undergoing cleaning & QC check"
              actionLabel="Reset Gear"
              actionPath="/operations?tab=reset"
              icon="tool"
              isFloorVerb
            />
          </div>
        </div>
      )}

      {/* 2. Coordinator (W61) */}
      {role === 'Coordinator' && metrics?.coordinator && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <h2 style={{ fontSize: 'var(--t-h2, 18px)', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
              Booking Desk &amp; Coordination
            </h2>
            <span style={{ fontSize: 'var(--t-meta, 12px)', color: 'var(--muted)' }}>
              1h online response promise (W66)
            </span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
              gap: '16px',
            }}
          >
            <TaskCard
              title="Online Requests"
              count={metrics.coordinator.onlineRequestsCount}
              subtitle="New web rental requests awaiting review"
              actionLabel="Review Requests"
              actionPath="/rentals"
              icon="external_link"
              badge={metrics.coordinator.onlineRequestsCount > 0 ? 'Urgent W66' : undefined}
              badgeTone="warning"
            />
            <TaskCard
              title="Quotes Waiting"
              count={metrics.coordinator.quotesWaitingCount}
              subtitle="Pending customer approval or advance"
              actionLabel="View Quotes"
              actionPath="/rentals"
              icon="file"
            />
            <TaskCard
              title="Today's Movements"
              count={`${metrics.coordinator.todayPickupsCount} / ${metrics.coordinator.todayReturnsCount}`}
              subtitle="Scheduled pickups / returns today"
              actionLabel="View Movement Board"
              actionPath="/operations"
              icon="truck"
            />
            <TaskCard
              title="Late Returns"
              count={metrics.coordinator.lateReturnsCount}
              subtitle="Rentals past scheduled return time"
              actionLabel="Manage Overdue"
              actionPath="/operations?tab=return"
              icon="alert_triangle"
              badge={metrics.coordinator.lateReturnsCount > 0 ? 'Overdue' : undefined}
              badgeTone="danger"
            />
          </div>
        </div>
      )}

      {/* 3. Accounts (W61, Law 6 safe) */}
      {role === 'Accounts' && isMoney && metrics?.accounts && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <h2 style={{ fontSize: 'var(--t-h2, 18px)', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
              Financial Settlement &amp; Invoices
            </h2>
            <span style={{ fontSize: 'var(--t-meta, 12px)', color: 'var(--muted)' }}>
              Accounts Workspace
            </span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '16px',
            }}
          >
            <TaskCard
              title="Payments Due"
              count={formatMoney(metrics.accounts.paymentsDuePaisa)}
              subtitle={`${metrics.accounts.paymentsDueCount} invoices due for collection today`}
              actionLabel="Record Payments"
              actionPath="/finance?tab=payments"
              icon="card"
            />
            <TaskCard
              title="Who Owes"
              count={formatMoney(metrics.accounts.totalOwedPaisa)}
              subtitle={`${metrics.accounts.whoOwesCount} clients with outstanding balances`}
              actionLabel="View Unpaid Invoices"
              actionPath="/finance"
              icon="clock"
              badge={metrics.accounts.whoOwesCount > 0 ? 'Pending' : undefined}
              badgeTone="warning"
            />
            <TaskCard
              title="Daily Closing"
              count={metrics.accounts.isDailyClosingSigned ? 'Signed' : 'Awaiting'}
              subtitle="End of day register balancing & sign-off (L33)"
              actionLabel="Review Closing"
              actionPath="/finance?tab=closing"
              icon="checklist"
              badge={!metrics.accounts.isDailyClosingSigned ? 'Action Needed' : 'Complete'}
              badgeTone={!metrics.accounts.isDailyClosingSigned ? 'warning' : 'success'}
            />
          </div>
        </div>
      )}

      {/* 4. Manager (W61, W57) */}
      {role === 'Manager' && metrics?.manager && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <h2 style={{ fontSize: 'var(--t-h2, 18px)', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
              Operations &amp; Approvals Control
            </h2>
            <span style={{ fontSize: 'var(--t-meta, 12px)', color: 'var(--muted)' }}>
              Approver when Babin is away (W57)
            </span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '16px',
            }}
          >
            <TaskCard
              title="Approvals Inbox"
              count={metrics.manager.approvalsWaitingCount}
              subtitle="Damage charges, fee waivers & overrides waiting (T5-10)"
              actionLabel="Open Approvals"
              actionPath="/approvals"
              icon="checklist"
              badge={metrics.manager.approvalsWaitingCount > 0 ? 'Pending Action' : undefined}
              badgeTone="warning"
            />
            <TaskCard
              title="Late &amp; Blocked"
              count={metrics.manager.lateCount + metrics.manager.blockedGearCount}
              subtitle={`${metrics.manager.lateCount} overdue rentals · ${metrics.manager.blockedGearCount} blocked units`}
              actionLabel="Inspect Blocked Items"
              actionPath="/inventory"
              icon="alert_triangle"
              badge="Blocked Fleet"
              badgeTone="danger"
            />
            <TaskCard
              title="Today's Movements"
              count={metrics.manager.todayMovementsCount}
              subtitle="Total pickups, handovers, and returns in motion"
              actionLabel="View Operations"
              actionPath="/operations"
              icon="truck"
            />
          </div>
        </div>
      )}

      {/* 5. Owner & Admin (W79, W61) */}
      {(role === 'Owner' || role === 'Admin') && isMoney && metrics?.owner && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <h2 style={{ fontSize: 'var(--t-h2, 18px)', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
              Executive Cockpit (W79)
            </h2>
            <span style={{ fontSize: 'var(--t-meta, 12px)', color: 'var(--muted)' }}>
              Owner overview · 1-tap navigation
            </span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '16px',
            }}
          >
            {/* 1. Approvals waiting */}
            <TaskCard
              title="Approvals Waiting"
              count={metrics.owner.approvalsWaitingCount}
              subtitle="Owner-only thresholds (§6.2) & pending requests"
              actionLabel="Review Approvals"
              actionPath="/approvals"
              icon="checklist"
              badge={metrics.owner.approvalsWaitingCount > 0 ? 'Needs Attention' : undefined}
              badgeTone="warning"
            />

            {/* 2. Today's money */}
            <TaskCard
              title="Today's Money"
              count={formatMoney(metrics.owner.todayMoney.collectedPaisa)}
              subtitle={`Owed: ${formatMoney(metrics.owner.todayMoney.owedPaisa)} · Deposits held: ${formatMoney(metrics.owner.todayMoney.depositsHeldPaisa)}`}
              actionLabel="Open Financials"
              actionPath="/finance"
              icon="card"
              badge="Collected"
              badgeTone="success"
            />

            {/* 3. Late / blocked / damaged */}
            <TaskCard
              title="Fleet Alerts"
              count={metrics.owner.lateCount + metrics.owner.blockedCount + metrics.owner.damagedCount}
              subtitle={`${metrics.owner.lateCount} late · ${metrics.owner.blockedCount} blocked · ${metrics.owner.damagedCount} damaged`}
              actionLabel="Manage Fleet Alerts"
              actionPath="/operations"
              icon="alert_triangle"
              badge="Fleet Exceptions"
              badgeTone="danger"
            />

            {/* 4. Business pulse */}
            <TaskCard
              title="Business Pulse"
              count={formatMoney(metrics.owner.businessPulse.revenueTodayPaisa)}
              subtitle={`Fleet utilisation: ${metrics.owner.businessPulse.fleetUtilizationPct}%`}
              actionLabel="Open Pulse Report"
              actionPath="/reports/pulse"
              icon="sparkles"
              badge={`${metrics.owner.businessPulse.fleetUtilizationPct}% Util`}
              badgeTone="info"
            />
          </div>
        </div>
      )}

      {/* 6. Driver */}
      {role === 'Driver' && metrics?.driver && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <h2 style={{ fontSize: 'var(--t-h2, 18px)', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
              Delivery Dispatch Board
            </h2>
            <span style={{ fontSize: 'var(--t-meta, 12px)', color: 'var(--muted)' }}>
              Assigned route &amp; client handovers
            </span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '16px',
            }}
          >
            <TaskCard
              title="Today's Deliveries"
              count={metrics.driver.scheduledDeliveriesCount}
              subtitle="Client locations scheduled for drop-off today"
              actionLabel="View Route"
              actionPath="/operations"
              icon="truck"
              isFloorVerb
            />
            <TaskCard
              title="Pending Pickups"
              count={metrics.driver.pendingPickupsCount}
              subtitle="Intake collections ready from clients"
              actionLabel="View Pickups"
              actionPath="/operations"
              icon="box"
              isFloorVerb
            />
          </div>
        </div>
      )}

      {/* 7. Client */}
      {role === 'Client' && metrics?.client && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <h2 style={{ fontSize: 'var(--t-h2, 18px)', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
              My Equipment &amp; Bookings
            </h2>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '16px',
            }}
          >
            <TaskCard
              title="Active Rentals"
              count={metrics.client.activeRentalsCount}
              subtitle="Equipment currently in your production custody"
              actionLabel="View Rentals"
              actionPath="/rentals"
              icon="checklist"
            />
            <TaskCard
              title="Pending Requests"
              count={metrics.client.pendingRequestsCount}
              subtitle="Online booking requests waiting for confirmation"
              actionLabel="View Status"
              actionPath="/rentals"
              icon="clock"
            />
          </div>
        </div>
      )}
    </section>
  )
}

export default RoleTaskCockpit
