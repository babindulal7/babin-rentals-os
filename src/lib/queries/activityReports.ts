import { supabase } from '../supabase'
import { completeReportRead, rowsOf } from './reportSupport'

export interface ActivityReportFilterOptions {
  from?: string | undefined
  to?: string | undefined
  userId?: string | undefined
  module?: string | undefined
}

export interface StaffActivitySummary {
  userId: string
  name: string
  role: string
  employeeCode: string
  totalActions: number
  actionsBreakdown: Record<string, number>
  lastActive: string | null
  recentAction: string | null
}

export interface ActivityReportEvent {
  id: string
  timestamp: string
  actorId: string | null
  actorName: string
  actorRole: string
  action: string
  category: string
  module: string
  severity: string
  status: 'Success' | 'Failed'
  tableName: string | null
  recordId: string | null
  ipAddress: string | null
  deviceType: string | null
  reason: string | null
}

export interface ActivityReportMetrics {
  totalEvents: number
  successfulEvents: number
  failedEvents: number
  criticalEvents: number
  activeOperators: number
  mostActiveModule: string
  mostActiveOperator: string
}

export interface ActivityCategoryDistribution {
  label: string
  count: number
  percentage: number
  color: string
}

export interface ActivityReportData {
  metrics: ActivityReportMetrics
  eventsByCategory: ActivityCategoryDistribution[]
  eventsBySeverity: ActivityCategoryDistribution[]
  staffSummaries: StaffActivitySummary[]
  recentEvents: ActivityReportEvent[]
}

const CATEGORY_COLORS: Record<string, string> = {
  Rentals: 'var(--primary)',
  Operations: '#3b82f6',
  Inventory: '#10b981',
  Finance: '#f59e0b',
  Authentication: '#8b5cf6',
  Administration: '#ec4899',
  Tools: '#6b7280',
  Settings: '#64748b',
}

const SEVERITY_COLORS: Record<string, string> = {
  Informational: 'var(--muted)',
  Low: '#10b981',
  Medium: '#f59e0b',
  High: '#ef4444',
  Critical: '#b91c1c',
}

interface DbUserRow {
  id: string
  employee_code: string | null
  full_name: string | null
  primary_role: string | null
  department: string | null
  is_active: boolean | null
}

interface DbAuditEventRow {
  id: string
  created_at: string
  action: string | null
  category: string | null
  module: string | null
  severity: string | null
  status: string | null
  actor_id: string | null
  actor_role: string | null
  table_name: string | null
  record_id: string | null
  ip_address: string | null
  device_type: string | null
  reason: string | null
}

/*
 * RULING 2026-10-16 (R-P6-STATES, Law 16): this read fell back to
 * `buildMockActivityData()` — STAFF_LIST × invented 40/30/20/10 splits and the
 * seed activity log with made-up IPs ('192.168.1.10x') — on a failure AND
 * whenever the period had no audit rows. It now throws on failure and an empty
 * period is an empty report. Unresolved names read '—', not 'Staff Member'.
 * Revert = restore `buildMockActivityData` and the `catch`.
 */
export async function getActivityReport(
  options?: ActivityReportFilterOptions,
): Promise<ActivityReportData> {
  const [usersRes, auditRes] = await Promise.all([
    completeReportRead(supabase
      .from('users')
      .select('id, employee_code, full_name, primary_role, department, is_active'), 'Staff read failed'),
    (() => {
      let q = supabase
        .from('audit_events')
        .select(
          'id, created_at, action, category, module, severity, status, actor_id, actor_role, table_name, record_id, ip_address, device_type, reason',
        )
        .order('created_at', { ascending: false })

      if (options?.from) q = q.gte('created_at', options.from)
      if (options?.to) q = q.lte('created_at', options.to)
      if (options?.userId) q = q.eq('actor_id', options.userId)
      if (options?.module) q = q.eq('module', options.module)

      return completeReportRead(q, 'Audit events read failed')
    })(),
  ])

  // Users are RLS-scoped (0120): a role that sees fewer staff gets '—' names, not a failure.
  const dbUsers = rowsOf<DbUserRow>(usersRes, 'Staff read failed')
  const dbAudits = rowsOf<DbAuditEventRow>(auditRes, 'Audit events read failed')

  // User lookup map
  const userMap = new Map<string, { name: string; role: string; code: string }>()
  for (const u of dbUsers) {
    userMap.set(u.id, {
      name: u.full_name?.trim() || '—',
      role: u.primary_role || '—',
      code: u.employee_code || '—',
    })
  }

  // Process audit rows
  const events: ActivityReportEvent[] = []
  const categoryCounts: Record<string, number> = {}
  const severityCounts: Record<string, number> = {}
  const staffActionMap = new Map<
    string,
    {
      total: number
      byCategory: Record<string, number>
      lastActive: string | null
      recentAction: string | null
    }
  >()

  let successCount = 0
  let failedCount = 0
  let criticalCount = 0

  for (const a of dbAudits) {
    const actorInfo = a.actor_id ? userMap.get(a.actor_id) : null
    // No actor at all is a system event; an actor we cannot resolve is '—'.
    const actorName = actorInfo?.name || (a.actor_id ? '—' : 'System')
    const actorRole = actorInfo?.role || a.actor_role || '—'
    const category = a.category || a.module || 'Not set'
    const severity = a.severity || 'Not set'
    const status: 'Success' | 'Failed' =
      a.status === 'failure' || a.status === 'Failed' ? 'Failed' : 'Success'

    if (status === 'Success') successCount++
    else failedCount++

    if (severity === 'Critical' || severity === 'High') criticalCount++

    categoryCounts[category] = (categoryCounts[category] ?? 0) + 1
    severityCounts[severity] = (severityCounts[severity] ?? 0) + 1

    const actorKey = a.actor_id || actorName
    const existing = staffActionMap.get(actorKey) ?? {
      total: 0,
      byCategory: {},
      lastActive: null,
      recentAction: null,
    }
    existing.total += 1
    existing.byCategory[category] = (existing.byCategory[category] ?? 0) + 1
    if (!existing.lastActive) {
      existing.lastActive = a.created_at
      existing.recentAction = a.action
    }
    staffActionMap.set(actorKey, existing)

    events.push({
      id: a.id,
      timestamp: a.created_at,
      actorId: a.actor_id,
      actorName,
      actorRole,
      action: a.action || '—',
      category,
      module: a.module || category,
      severity,
      status,
      tableName: a.table_name,
      recordId: a.record_id,
      ipAddress: a.ip_address,
      deviceType: a.device_type,
      reason: a.reason,
    })
  }

  const totalEvents = events.length
  const activeOperators = staffActionMap.size

  // Determine most active module
  let mostActiveModule = 'None'
  let maxModCount = -1
  for (const [mod, count] of Object.entries(categoryCounts)) {
    if (count > maxModCount) {
      maxModCount = count
      mostActiveModule = mod
    }
  }

  // Determine most active operator
  let mostActiveOperator = 'None'
  let maxOpCount = -1
  for (const [opKey, data] of staffActionMap.entries()) {
    if (data.total > maxOpCount) {
      maxOpCount = data.total
      const actor = userMap.get(opKey)
      mostActiveOperator = actor?.name || opKey
    }
  }

  // Build Staff Summaries
  const staffSummaries: StaffActivitySummary[] = []
  for (const u of dbUsers) {
    const stats = staffActionMap.get(u.id)
    staffSummaries.push({
      userId: u.id,
      name: u.full_name?.trim() || '—',
      role: u.primary_role || '—',
      employeeCode: u.employee_code || '—',
      totalActions: stats?.total ?? 0,
      actionsBreakdown: stats?.byCategory ?? {},
      lastActive: stats?.lastActive ?? null,
      recentAction: stats?.recentAction ?? null,
    })
  }
  // Sort descending by total actions
  staffSummaries.sort((a, b) => b.totalActions - a.totalActions)

  // Build category distributions
  const eventsByCategory: ActivityCategoryDistribution[] = Object.entries(categoryCounts).map(
    ([cat, count]) => ({
      label: cat,
      count,
      percentage: totalEvents > 0 ? Math.round((count / totalEvents) * 100) : 0,
      color: CATEGORY_COLORS[cat] || 'var(--primary)',
    }),
  )

  // Build severity distributions
  const eventsBySeverity: ActivityCategoryDistribution[] = Object.entries(severityCounts).map(
    ([sev, count]) => ({
      label: sev,
      count,
      percentage: totalEvents > 0 ? Math.round((count / totalEvents) * 100) : 0,
      color: SEVERITY_COLORS[sev] || 'var(--muted)',
    }),
  )

  return {
    metrics: {
      totalEvents,
      successfulEvents: successCount,
      failedEvents: failedCount,
      criticalEvents: criticalCount,
      activeOperators,
      mostActiveModule,
      mostActiveOperator,
    },
    eventsByCategory,
    eventsBySeverity,
    staffSummaries,
    recentEvents: events,
  }
}
