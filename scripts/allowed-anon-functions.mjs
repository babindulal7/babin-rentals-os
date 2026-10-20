// scripts/allowed-anon-functions.mjs — Single Source of Truth for anon-executable public functions
//
// Invariant: no mutating, definer, or business RPC in `public` may be executable by `anon`.
// anon may only execute:
//   - auth_* session/role inspection helpers used by RLS policies
//   - pure mathematical calculators (invoice_vat_amount, etc.)
//   - public workflow navigation helpers (next_booking_stage, retired_stage_to_canonical)
//
// Shared by check-pglite.mjs, check-anon-exposure.mjs, and any other security audit gates.

export const ALLOWED_ANON_FUNCTIONS = new Set([
  'auth_can_approve_damage',
  'auth_can_approve_late_fee_waiver',
  'auth_can_approve_purchase',
  'auth_can_view_money',
  'auth_client_id',
  'auth_is_finance_or_admin',
  'auth_is_manager_or_above',
  'auth_is_owner',
  'auth_is_staff',
  'auth_user_branch_id',
  'auth_user_id',
  'auth_user_role',
  'intel_field_allowed',
  'invoice_credit',
  'invoice_discount_amount',
  'invoice_outstanding',
  'invoice_vat_amount',
  'next_booking_stage',
  'retired_stage_to_canonical',
  'set_request_context',
]);
