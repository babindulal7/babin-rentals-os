import type { SystemRole } from '../types/database'

const MONEY_BLIND_ROLES: ReadonlySet<SystemRole> = new Set<SystemRole>([
  'Warehouse',
  'Technician',
  'Driver',
  'Client',
])

const roleOverrides = new Map<SystemRole, Map<string, boolean>>()
const userOverrides = new Map<string, Map<string, boolean>>()
let activeUserId: string | null = null
let activeUserRole: SystemRole | null = null
const listeners = new Set<() => void>()
let version = 0

function notify(): void {
  version += 1
  for (const fn of listeners) fn()
}

export function subscribePermissions(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getPermissionsVersion(): number {
  return version
}

export function setActivePermissionSession(userId: string | null, role: SystemRole | null): void {
  if (activeUserId === userId && activeUserRole === role) return
  activeUserId = userId
  activeUserRole = role
}

export function isCapabilityLockedForRole(
  role: SystemRole,
  capability: string,
): { locked: boolean; reason?: string } {
  if (role === 'Owner') {
    return { locked: true, reason: 'Owner always retains full access.' }
  }
  if (capability === 'staff.surface' && role === 'Client') {
    return { locked: true, reason: 'Client is an external portal role.' }
  }
  if (capability === 'money.view' && MONEY_BLIND_ROLES.has(role)) {
    return { locked: true, reason: 'Protected policy: money-blind roles cannot view money.' }
  }
  return { locked: false }
}

/**
 * Resolves the effective permission for a role (and optional specific userId),
 * checking safety locks -> user override -> role override -> code default.
 */
export function resolveEffectiveCapability(
  role: SystemRole,
  capability: string,
  defaultAllowed: boolean,
  userId?: string | null,
): boolean {
  if (role === 'Owner') return true
  if (capability === 'staff.surface' && role === 'Client') return false
  if (capability === 'money.view' && MONEY_BLIND_ROLES.has(role)) return false

  const targetUserId = userId ?? (activeUserRole === role ? activeUserId : null)
  if (targetUserId) {
    const uMap = userOverrides.get(targetUserId)
    if (uMap?.has(capability)) {
      return uMap.get(capability)!
    }
  }

  const rMap = roleOverrides.get(role)
  if (rMap?.has(capability)) {
    return rMap.get(capability)!
  }

  return defaultAllowed
}

export function getRolePermissionOverride(role: SystemRole, capability: string): boolean | undefined {
  return roleOverrides.get(role)?.get(capability)
}

export function getUserPermissionOverride(userId: string, capability: string): boolean | undefined {
  return userOverrides.get(userId)?.get(capability)
}

export function setRolePermissionCache(role: SystemRole, capability: string, allowed: boolean): void {
  let map = roleOverrides.get(role)
  if (!map) {
    map = new Map()
    roleOverrides.set(role, map)
  }
  map.set(capability, allowed)
  notify()
}

export function setUserPermissionOverrideCache(
  userId: string,
  capability: string,
  allowed: boolean | null,
): void {
  if (allowed === null) {
    userOverrides.get(userId)?.delete(capability)
  } else {
    let map = userOverrides.get(userId)
    if (!map) {
      map = new Map()
      userOverrides.set(userId, map)
    }
    map.set(capability, allowed)
  }
  notify()
}

export function resetPermissionCachesForTest(): void {
  roleOverrides.clear()
  userOverrides.clear()
  activeUserId = null
  activeUserRole = null
  notify()
}

/**
 * Loads persisted role_permissions and user_permission_overrides from Postgres.
 * Safe no-op in mock mode or if tables are empty.
 */
export async function loadPermissionsFromDb(targetUserIds?: readonly string[]): Promise<void> {
  try {
    const { supabase, IS_MOCK } = await import('./supabase')
    if (IS_MOCK) return

    const { data: roleRows } = await supabase
      .from('role_permissions')
      .select('role, capability, allowed')

    if (Array.isArray(roleRows)) {
      roleOverrides.clear()
      for (const row of roleRows as Array<{ role: SystemRole; capability: string; allowed: boolean }>) {
        let map = roleOverrides.get(row.role)
        if (!map) {
          map = new Map()
          roleOverrides.set(row.role, map)
        }
        map.set(row.capability, Boolean(row.allowed))
      }
    }

    const userQuery = supabase
      .from('user_permission_overrides')
      .select('user_id, capability, allowed')

    const { data: userRows } = targetUserIds?.length
      ? await userQuery.in('user_id', [...targetUserIds])
      : await userQuery

    if (Array.isArray(userRows)) {
      if (!targetUserIds?.length) userOverrides.clear()
      for (const row of userRows as Array<{ user_id: string; capability: string; allowed: boolean }>) {
        let map = userOverrides.get(row.user_id)
        if (!map) {
          map = new Map()
          userOverrides.set(row.user_id, map)
        }
        map.set(row.capability, Boolean(row.allowed))
      }
    }

    notify()
  } catch {
    // Keep existing defaults if DB read fails during offline/boot
  }
}
