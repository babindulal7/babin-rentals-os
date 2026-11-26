import type { ApprovalType } from '../../lib/queries/approvals'

/**
 * The staff-facing name of each approval type. The stored type is a database
 * value with underscores (`late_fee_waiver`), so the raw value is never shown.
 */
export const APPROVAL_TYPE_LABELS: Record<ApprovalType, string> = {
  damage_charge: 'Damage Charge',
  late_fee_waiver: 'Late Fee Waiver',
  commercial_override: 'Commercial Override',
  purchase_request: 'Purchase Request',
  refund: 'Refund',
  write_off: 'Write Off',
}

/** A type this map does not know yet still reads as words, never as an identifier. */
export function approvalTypeLabel(type: ApprovalType): string {
  return APPROVAL_TYPE_LABELS[type] ?? type.replace(/_/g, ' ')
}
