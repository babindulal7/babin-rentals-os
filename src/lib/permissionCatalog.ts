import type { SystemRole } from '../types/database'
import {
  isStaff,
  canViewMoney,
  canRecordPayment,
  canVoidInvoice,
  canOverrideCreditLimit,
  canPerformOperations,
  canManageSettings,
  canConfirmRental,
  canCreateClient,
  canBlockClient,
  canAdjustStock,
  canApproveDailyClosing,
} from './rbac'
import { resolveEffectiveCapability } from './permissionsStore'

export interface PermissionCapabilityDef {
  key: string
  label: string
  note: string
  test: (role: SystemRole, userId?: string | null) => boolean
}

function withUserOverride(
  key: string,
  baseTest: (role: SystemRole) => boolean,
): (role: SystemRole, userId?: string | null) => boolean {
  return (role, userId) => resolveEffectiveCapability(role, key, baseTest(role), userId)
}

/**
 * Shared capability catalog rendered in Settings -> Users & Roles (Permissions Matrix)
 * and Settings -> Staff Directory (Per-Staff Permissions modal).
 */
export const PERMISSION_CATALOG: readonly PermissionCapabilityDef[] = [
  { key: 'staff.surface', label: 'Staff surface', note: 'Client is external — portal only.', test: withUserOverride('staff.surface', (r) => isStaff(r)) },
  { key: 'money.view', label: 'See money', note: 'Warehouse, Technician, Driver and Client see none, anywhere.', test: withUserOverride('money.view', (r) => canViewMoney(r)) },
  { key: 'payment.create', label: 'Record payment', note: 'Advances and security deposits.', test: withUserOverride('payment.create', (r) => canRecordPayment(r)) },
  { key: 'invoice.void', label: 'Void invoice', note: 'Corrections are reversal rows, never edits.', test: withUserOverride('invoice.void', (r) => canVoidInvoice(r)) },
  { key: 'credit.override', label: 'Override credit limit', note: 'Book past a client’s ceiling.', test: withUserOverride('credit.override', (r) => canOverrideCreditLimit(r)) },
  { key: 'closing.approve', label: 'Approve daily closing', note: 'Sign off end-of-day cash & bank close.', test: withUserOverride('closing.approve', (r) => canApproveDailyClosing(r)) },
  { key: 'booking.confirm', label: 'Confirm rental', note: 'Reserve stock and confirm bookings.', test: withUserOverride('booking.confirm', (r) => canConfirmRental(r)) },
  { key: 'client.create', label: 'Create client', note: 'Add new client accounts.', test: withUserOverride('client.create', (r) => canCreateClient(r)) },
  { key: 'client.block', label: 'Block client', note: 'Flag or unblock a client account.', test: withUserOverride('client.block', (r) => canBlockClient(r)) },
  { key: 'operations.perform', label: 'Run operations', note: 'Pack, handover, return, reset.', test: withUserOverride('operations.perform', (r) => canPerformOperations(r)) },
  { key: 'inventory.adjust', label: 'Adjust stock', note: 'Stock count adjustments & write-offs.', test: withUserOverride('inventory.adjust', (r) => canAdjustStock(r)) },
  { key: 'settings.manage', label: 'Manage settings', note: 'This screen, and everything under it.', test: withUserOverride('settings.manage', (r) => canManageSettings(r)) },
]
