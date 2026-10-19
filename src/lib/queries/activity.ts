import { supabase } from '../supabase'
import type { ListFilters } from './listQuery'
import type { ListQueryResult } from './useList'
import {
  ACTIVITY_MODULES,
  ACTIVITY_ROWS,
  ACTIVITY_TIMELINE,
  ACTIVITY_METRICS,
  RETENTION_NOTE,
  ACTIVITY_USERS,
  ACTIVITY_MODULES_PRESENT,
  ACTIVITY_DAYS,
  targetLabel,
  type ActivityModule,
  type ActivityStatus,
  type ActivityTarget,
  type ActivityRow,
} from '../../data/activityLog'

export {
  ACTIVITY_MODULES,
  ACTIVITY_ROWS,
  ACTIVITY_TIMELINE,
  ACTIVITY_METRICS,
  RETENTION_NOTE,
  ACTIVITY_USERS,
  ACTIVITY_MODULES_PRESENT,
  ACTIVITY_DAYS,
  targetLabel,
}

export type {
  ActivityModule,
  ActivityStatus,
  ActivityTarget,
  ActivityRow,
}

interface AuditEventRowDb {
  id: string
  created_at: string
  action: string
  module: string
  status: string
  record_id: string | null
  table_name: string | null
  ip_address: string | null
  actor_id: string | null
  actor_role: string | null
}

function mapModuleToActivityModule(m: string | null | undefined): ActivityModule {
  switch (m) {
    case 'Rentals':
    case 'Finance':
    case 'Inventory':
    case 'Clients':
    case 'Crew Assist':
    case 'Operations':
    case 'Tools':
    case 'Settings':
    case 'Authentication':
      return m
    default:
      return 'Operations'
  }
}

export async function listActivityEvents(_filters?: ListFilters): Promise<ListQueryResult<ActivityRow>> {
  // RULING 2026-10-15: a failed read throws, so Activity Log draws Error +
  // Retry. It returned zero rows, which the page drew as "No activity matches
  // this filter" — an outage presented as an empty log. Revert = restore the
  // try/catch returning { rows: [], total: 0 }.
  const [auditRes, usersRes] = await Promise.all([
    supabase
      .from('audit_events')
      .select('id, created_at, action, module, status, record_id, table_name, ip_address, actor_id, actor_role')
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('users')
      .select('id, full_name, primary_role'),
  ])

  if (auditRes.error) throw new Error(`listActivityEvents failed: ${auditRes.error.message}`)

  const dbUsers = (usersRes?.data ?? []) as Array<{ id: string; full_name: string | null; primary_role: string | null }>
  const userMap = new Map(dbUsers.map((u) => [u.id, u.full_name?.trim() || u.primary_role || '—']))

  const rows: ActivityRow[] = ((auditRes.data ?? []) as unknown as AuditEventRowDb[]).map((e, idx) => {
    const actorName = e.actor_id ? userMap.get(e.actor_id) ?? (e.actor_role || '—') : 'System'
    return {
      id: `ACT-${String(idx + 1).padStart(3, '0')}`,
      timestamp: e.created_at,
      user: actorName,
      action: e.action || 'Performed action',
      module: mapModuleToActivityModule(e.module),
      target: e.table_name ? { kind: e.table_name, code: null, ...(e.record_id ? { label: e.record_id } : {}) } : null,
      where: `${e.module || 'System'} ▸ ${e.action || 'Activity'}`,
      status: e.status === 'failure' || e.status === 'Failed' ? 'Failed' : 'Success',
      ip: e.ip_address || '—',
      location: 'Kathmandu, NP',
    }
  })

  return {
    rows,
    total: rows.length,
  }
}
