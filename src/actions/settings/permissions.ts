import { supabase, IS_MOCK } from '../../lib/supabase'
import type { SystemRole } from '../../types/database'
import {
  isCapabilityLockedForRole,
  setRolePermissionCache,
  setUserPermissionOverrideCache,
} from '../../lib/permissionsStore'

export interface SetRolePermissionInput {
  role: SystemRole
  capability: string
  allowed: boolean
  reason?: string
  clientUuid?: string
}

export interface SetUserPermissionOverrideInput {
  userId: string
  targetRole: SystemRole
  capability: string
  allowed: boolean
  reason?: string
  clientUuid?: string
}

export interface ClearUserPermissionOverrideInput {
  userId: string
  capability: string
  reason?: string
  clientUuid?: string
}

/**
 * Updates a role-level permission in Postgres (`set_role_permission`, 0233)
 * and updates the in-memory permission cache.
 */
export async function saveRolePermission(input: SetRolePermissionInput): Promise<void> {
  const lock = isCapabilityLockedForRole(input.role, input.capability)
  if (lock.locked) {
    throw new Error(lock.reason ?? 'This permission cell is locked.')
  }

  if (!IS_MOCK) {
    const { error } = await supabase.rpc('set_role_permission', {
      p_client_uuid: input.clientUuid ?? crypto.randomUUID(),
      p_role: input.role,
      p_capability: input.capability,
      p_allowed: input.allowed,
      p_reason: input.reason ?? null,
    })
    if (error) {
      throw new Error(error.message || 'Could not update role permission.')
    }
  }

  setRolePermissionCache(input.role, input.capability, input.allowed)
}

/**
 * Grants or revokes a per-staff permission override in Postgres (`set_user_permission_override`, 0233)
 * and updates the in-memory permission cache.
 */
export async function saveUserPermissionOverride(input: SetUserPermissionOverrideInput): Promise<void> {
  const lock = isCapabilityLockedForRole(input.targetRole, input.capability)
  if (lock.locked) {
    throw new Error(lock.reason ?? 'This permission is locked for this role.')
  }

  if (!IS_MOCK) {
    const { error } = await supabase.rpc('set_user_permission_override', {
      p_client_uuid: input.clientUuid ?? crypto.randomUUID(),
      p_user_id: input.userId,
      p_capability: input.capability,
      p_allowed: input.allowed,
      p_reason: input.reason ?? null,
    })
    if (error) {
      throw new Error(error.message || 'Could not update staff permission override.')
    }
  }

  setUserPermissionOverrideCache(input.userId, input.capability, input.allowed)
}

/**
 * Clears a per-staff permission override back to the role default (`clear_user_permission_override`, 0233).
 */
export async function resetUserPermissionOverride(input: ClearUserPermissionOverrideInput): Promise<void> {
  if (!IS_MOCK) {
    const { error } = await supabase.rpc('clear_user_permission_override', {
      p_client_uuid: input.clientUuid ?? crypto.randomUUID(),
      p_user_id: input.userId,
      p_capability: input.capability,
      p_reason: input.reason ?? null,
    })
    if (error) {
      throw new Error(error.message || 'Could not reset staff permission override.')
    }
  }

  setUserPermissionOverrideCache(input.userId, input.capability, null)
}
