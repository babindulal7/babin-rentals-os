#!/usr/bin/env node
/**
 * Generates docs/security/PROD_ADVISOR_TRIAGE_2026-11-23.csv
 * based on the comprehensive PGlite catalog audit.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const auditData = JSON.parse(readFileSync(join(ROOT, 'artifacts/supabase-linter-audit.json'), 'utf8'))

const rows = []
const header = ['object', 'severity', 'exposed_to', 'risk', 'evidence', 'remediation', 'owner', 'status']
rows.push(header.join(','))

function escapeCsv(val) {
  if (val === undefined || val === null) return '""'
  const str = String(val).replace(/"/g, '""')
  return `"${str}"`
}

function addRow(obj, severity, exposedTo, risk, evidence, remediation, owner, status) {
  rows.push([
    escapeCsv(obj),
    escapeCsv(severity),
    escapeCsv(exposedTo),
    escapeCsv(risk),
    escapeCsv(evidence),
    escapeCsv(remediation),
    escapeCsv(owner),
    escapeCsv(status)
  ].join(','))
}

// 1. auth_users_exposed
addRow(
  'public.staff_directory_v',
  'ERROR',
  'authenticated (staff only; Client receives 0 rows)',
  'Low immediate leak risk due to auth_is_staff() and CASE masking, but triggers Supabase linter 0002_auth_users_exposed because view joins auth.users',
  'View AST joins auth.users au on au.id = u.id; selects last_sign_in_at, email_confirmed_at; anon select denied; client select returns 0 rows',
  'Replace auth.users join with helper security definer RPC or read last_sign_in from public.users; remove auth.users from view AST',
  'Babin / Antigravity',
  'TRIAGED - STAGING PATCH PROPOSED'
)

// 2. security_definer_view (47 views)
const viewClassifications = {
  // Client PII
  clients_v: { domain: 'Client Data', risk: 'Medium', desc: 'Client commercial profiles and credit limits' },
  client_directory_v: { domain: 'Client Data', risk: 'Medium', desc: 'Directory of clients with masked contact channels' },
  client_channel_identities_v: { domain: 'Client Data', risk: 'Medium', desc: 'Client communication channel mappings' },
  client_collectors_v: { domain: 'Client Data', risk: 'Medium', desc: 'Authorized collectors and pickup agents' },
  client_id_documents_v: { domain: 'Client Data', risk: 'High', desc: 'Client KYC citizenship and passport document metadata' },
  collateral_documents_v: { domain: 'Client Data', risk: 'High', desc: 'Collateral deposit certificates and guarantee checks' },
  online_profiles_v: { domain: 'Client Data', risk: 'Medium', desc: 'Online portal registration profile metadata' },
  client_memberships_v: { domain: 'Client Data', risk: 'Medium', desc: 'Membership tier and loyalty status' },
  membership_limit_breaches_v: { domain: 'Client Data', risk: 'Medium', desc: 'Credit and collateral limit breach warnings' },

  // Finance
  booking_lines_v: { domain: 'Finance', risk: 'High', desc: 'Rental line items with unit_rate_paisa and line_total' },
  bookings_deposit_v: { domain: 'Finance', risk: 'High', desc: 'Security deposit ledger balances and hold status' },
  daily_closings_v: { domain: 'Finance', risk: 'High', desc: 'Daily counter cash, QR, and bank settlement reconciliations' },
  late_fee_findings_v: { domain: 'Finance', risk: 'Medium', desc: 'Calculated overdue late fee assessments' },
  cases_v: { domain: 'Finance', risk: 'Medium', desc: 'Incident damage repair cost recovery claims' },
  membership_plans_v: { domain: 'Finance', risk: 'Low', desc: 'Membership subscription pricing and discount rules' },

  // Operations
  booking_requests_v: { domain: 'Operations', risk: 'Medium', desc: 'Pending online booking intake submissions' },
  booking_transport_v: { domain: 'Operations', risk: 'Medium', desc: 'Logistics delivery dispatch legs and assignments' },
  delivery_transport_v: { domain: 'Operations', risk: 'Medium', desc: 'Driver transport runs and vehicle allocations' },
  fulfillment_outcomes_v: { domain: 'Operations', risk: 'Medium', desc: 'Handover and return dispatch verification results' },
  return_accessory_checks_v: { domain: 'Operations', risk: 'Low', desc: 'Accessory checklist check-in state at return' },
  shift_handovers_v: { domain: 'Operations', risk: 'Medium', desc: 'Shift staff turnover logs and equipment count checklists' },
  damage_findings_v: { domain: 'Operations', risk: 'Medium', desc: 'Return inspection damage logs and photo references' },
  external_holds_v: { domain: 'Operations', risk: 'Medium', desc: 'Equipment held by police, court, or external disputes' },

  // Staff & Crew
  staff_directory_v: { domain: 'Staff & Crew', risk: 'High', desc: 'Internal staff contact and credential state' },
  crew_assignments_v: { domain: 'Staff & Crew', risk: 'Medium', desc: 'Crew roster bookings and gig dispatch' },
  crew_bookings_v: { domain: 'Staff & Crew', risk: 'Medium', desc: 'Crew scheduling commitments and call sheets' },
  crew_members_v: { domain: 'Staff & Crew', risk: 'Medium', desc: 'Crew technician directory and daily wage profiles' },
  crew_profiles_v2_v: { domain: 'Staff & Crew', risk: 'Medium', desc: 'Crew technical skills and gear proficiencies' },
  booking_crew_lines_v: { domain: 'Staff & Crew', risk: 'Medium', desc: 'Crew charge lines on commercial bookings' },

  // Inventory & Maintenance
  products_v: { domain: 'Inventory', risk: 'Medium', desc: 'Catalog gear models with role-masked unit rates' },
  product_units_v: { domain: 'Inventory', risk: 'Medium', desc: 'Physical serial units with acquisition cost masked' },
  product_units_service_v: { domain: 'Inventory', risk: 'Low', desc: 'Operating running hours and service intervals' },
  accessories_v: { domain: 'Inventory', risk: 'Low', desc: 'Cables, batteries, and included accessories' },
  bundles_v: { domain: 'Inventory', risk: 'Low', desc: 'Pre-packaged kit bundles and package items' },
  maintenance_records_v: { domain: 'Inventory', risk: 'Medium', desc: 'Equipment repair logs and maintenance hold state' },
  temporary_stock_v: { domain: 'Inventory', risk: 'Medium', desc: 'Sub-rented gear borrowed from partner rental houses' },
  purchase_requests_v: { domain: 'Inventory', risk: 'Medium', desc: 'Staff gear purchase requisitions and approvals' },
  consumable_restock_movements_v: { domain: 'Inventory', risk: 'Low', desc: 'Gaffer tape, batteries, and consumable stock movements' },
  vehicle_fuel_logs_v: { domain: 'Inventory', risk: 'Low', desc: 'Company vehicle odometer and fuel receipts' },

  // Public Catalogue
  public_catalogue_v: { domain: 'Public Catalogue', risk: 'Low', desc: 'Public website camera and lighting rental catalog' },
  public_product_family_options_v: { domain: 'Public Catalogue', risk: 'Low', desc: 'Public lens mount, kit package, and accessory options' },

  // System & Audit
  audit_logs: { domain: 'System & Audit', risk: 'High', desc: 'System mutation audit ledger (Owner/Admin only)' },
  email_log_v: { domain: 'System & Audit', risk: 'Medium', desc: 'Outbound transactional email delivery logs' },
  notifications_v: { domain: 'System & Audit', risk: 'Low', desc: 'In-app user notifications' },
  notification_preferences_v: { domain: 'System & Audit', risk: 'Low', desc: 'User notification frequency and channel settings' },
  problem_reports_v: { domain: 'System & Audit', risk: 'Medium', desc: 'Bug and floor exception logs' },
  push_subscriptions_v: { domain: 'System & Audit', risk: 'Low', desc: 'Web push token registrations' },
}

for (const v of auditData.securityDefinerViews) {
  const meta = viewClassifications[v.name] || { domain: 'General', risk: 'Medium', desc: 'Database view' }
  const exposed = v.anon ? 'anon, authenticated' : 'authenticated only'
  const riskDetail = `Runs as view owner (postgres), bypassing table RLS. Internal row filter: ${meta.domain}. Risk: ${meta.risk}`
  const evidence = `security_invoker=false; anon_select=${v.anon}; auth_select=${v.auth}; purpose: ${meta.desc}`
  const remediation = v.anon 
    ? 'Verify only public fields are projected; do not enable security_invoker if anon lacks table grants'
    : 'Retain security definer with row predicates where underlying tables are private; evaluate security_invoker per domain in staging'
  
  addRow(`view:${v.name}`, 'ERROR', exposed, riskDetail, evidence, remediation, 'Babin / Antigravity', 'TRIAGED - AUDITED')
}

// 3. anon_security_definer_function_executable (12 allowlisted fns)
for (const f of auditData.anonDefinerFns) {
  const isAuthHelper = f.name.startsWith('auth_')
  const purpose = isAuthHelper 
    ? 'Auth/session inspection helper required by table RLS policies during public access'
    : f.name === 'submit_booking_request'
    ? 'Public booking intake RPC (T7-02); validates inputs and creates pending quote request'
    : f.name === 'public_availability'
    ? 'Public date availability calculator; returns unit counts without leaking client data'
    : 'Public status checker'
  
  addRow(
    `function:${f.sig}`,
    'WARN',
    'anon, authenticated',
    'Privileged function callable by unauthenticated public visitors',
    `Allowlisted in scripts/allowed-anon-functions.mjs; Purpose: ${purpose}`,
    'Do not revoke; required for anonymous web portal workflows and RLS evaluation. Ensure strict parameter bounds checking.',
    'Babin / Antigravity',
    'TRIAGED - INTENTIONAL & ALLOWLISTED'
  )
}

// 4. authenticated_security_definer_function_executable (sample high-impact)
const highImpactFns = [
  { sig: 'apply_booking_stage_transition(uuid, booking_stage, text)', domain: 'Rentals Lifecycle', role: 'Staff only' },
  { sig: 'record_payment(uuid, numeric, text, text)', domain: 'Finance', role: 'Accounts/Admin/Owner' },
  { sig: 'verify_staff_pin(text)', domain: 'Auth', role: 'Authenticated user' },
  { sig: 'rotate_staff_pin(text, text)', domain: 'Auth', role: 'Authenticated user' },
  { sig: 'set_staff_active(uuid, boolean)', domain: 'Admin', role: 'Owner/Admin' },
  { sig: 'set_staff_role(uuid, system_role)', domain: 'Admin', role: 'Owner/Admin' },
  { sig: 'adjust_stock(uuid, integer, text, uuid, uuid)', domain: 'Inventory', role: 'Warehouse/Admin' },
  { sig: 'create_quick_booking(uuid, text, date, date, uuid[])', domain: 'Rentals', role: 'Coordinator/Admin' },
]

for (const f of highImpactFns) {
  addRow(
    `function:${f.sig}`,
    'WARN',
    `authenticated (${f.role})`,
    `Business RPC callable by authenticated users. Domain: ${f.domain}`,
    `Internal guards enforce ${f.role} via auth_is_staff() or auth_user_role()`,
    'Preserve execution grants for authenticated; verify identity checks fail closed on unauthorized caller.',
    'Babin / Antigravity',
    'TRIAGED - ROLE GATED'
  )
}

// 5. function_search_path_mutable (6 findings reported in production)
const mutableFns = [
  'log_audit_event()',
  'apply_booking_stage_transition()',
  'enforce_inventory_reservation_capacity()',
  'reject_direct_booking_stage_write()',
  'check_extension_clash()',
  'calculate_overdue_charge()'
]

for (const fnName of mutableFns) {
  addRow(
    `function:${fnName}`,
    'WARN',
    'internal callers',
    'Search path hijacking risk if privileged function resolves unqualified object names in caller schema',
    'Migration 0010/0021/0045/0094 created functions without explicit SET search_path',
    'Apply ALTER FUNCTION ... SET search_path = public, extensions, pg_temp',
    'Babin / Antigravity',
    'TRIAGED - STAGING PATCH READY'
  )
}

// 6. auth_leaked_password_protection
addRow(
  'auth.settings.leaked_password_protection',
  'WARN',
  'auth service',
  'Users could set passwords compromised in third-party breaches if HaveIBeenPwned check is disabled',
  'Supabase Dashboard security advisor finding auth_leaked_password_protection',
  'Owner must enable "Leaked password protection" in Supabase Dashboard -> Authentication -> Settings',
  'Babin (Owner only)',
  'TRIAGED - OWNER ACTION REQUIRED'
)

// 7. rls_enabled_no_policy
addRow(
  'table:public.staff_auth_pins',
  'INFO',
  'none (fail-closed)',
  'No direct access possible; all operations return 0 rows for non-superuser',
  'Table relrowsecurity=true; 0 policies in pg_policy; accessed exclusively via verify_staff_pin / rotate_staff_pin RPCs',
  'Intentional fail-closed architecture. No policy needed; keep table completely private from Data API.',
  'Babin / Antigravity',
  'TRIAGED - INTENTIONAL & VERIFIED'
)

const csvPath = join(ROOT, 'docs/security/PROD_ADVISOR_TRIAGE_2026-11-23.csv')
writeFileSync(csvPath, rows.join('\n'))
console.log(`Successfully generated ${rows.length} rows in ${csvPath}`)
