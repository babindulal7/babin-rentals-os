/**
 * RBAC Engine — Law 6 & Law 11
 *
 * Implements capability checks for the business 9 (Manager reopened 9 Aug
 * 2026 by Hover Intel System v2.1 — see the SystemRole doc comment):
 *   - Owner
 *   - Admin        (was also "the Ops Manager" until 9 Aug; now its own seat)
 *   - Manager      (grants mirror Admin everywhere unless a spec says otherwise)
 *   - Coordinator  (bookings, clients, takes the advance)
 *   - Warehouse    (STRICT ZERO-MONEY VISIBILITY)
 *   - Technician   (AC/prep — shares return triage; money-blind)
 *   - Accounts
 *   - Driver       (trips and delivery legs; money-blind)
 *   - Client       (EXTERNAL — portal only, never a staff surface)
 *
 * Every rule below mirrors a function in migration 0014/0018, so a capability
 * can never be granted in the UI and denied by RLS, or the reverse.
 *
 * Rule: Forbidden items are ABSENT from UI / Data, not merely disabled.
 */

import type { SystemRole } from '../types/database'

export type Role = SystemRole
export type { SystemRole }

export interface UserSession {
  id: string
  fullName: string
  email: string
  role: SystemRole
  branchId: string
  warehouseId: string | null
}

/** Law 6: Warehouse sees zero financial numbers anywhere in the application */
export function canViewMoney(role: SystemRole): boolean {
  return !MONEY_BLIND.has(role)
}

/**
 * Law 6, widened from Warehouse to the whole floor. A technician holding a
 * tablet in front of a client and a driver at the door are in the same position
 * the rule was written for. Mirrors `auth_can_view_money()` in 0014.
 */
const MONEY_BLIND: ReadonlySet<SystemRole> = new Set<SystemRole>([
  'Warehouse',
  'Technician',
  'Driver',
  'Client',
])

/** Client is external. Guard every staff surface with this. */
export function isStaff(role: SystemRole): boolean {
  return role !== 'Client'
}

/**
 * Role task group classification for role-specific home screens (W61, W79).
 */
export function getRoleTaskDesk(role: SystemRole): 'floor' | 'desk' | 'finance' | 'management' | 'executive' | 'driver' | 'client' {
  switch (role) {
    case 'Warehouse':
    case 'Technician':
      return 'floor'
    case 'Coordinator':
      return 'desk'
    case 'Accounts':
      return 'finance'
    case 'Manager':
      return 'management'
    case 'Owner':
      return 'executive'
    case 'Admin':
      return 'management'
    case 'Driver':
      return 'driver'
    case 'Client':
      return 'client'
  }
}

/**
 * W61: Primary home route for each role.
 * - Warehouse, Technician, Coordinator, Accounts, Manager, Owner, Admin: /today (tailored cockpit)
 * - Driver: /operations
 * - Client: /clients
 */
export function getRoleHomeRoute(role?: SystemRole): string {
  if (!role) return '/login'
  if (role === 'Client') return '/clients'
  if (role === 'Driver') return '/operations'
  return '/today'
}

/**
 * The booking desk and the floor: every role the database lets write a booking,
 * its lines, its client, or a stage transition.
 *
 * Read off the live project on 15 Aug 2026, where four separate policies carry
 * this identical array — `bookings_insert`, `booking_lines_all`,
 * `clients_insert` and `booking_stage_transitions_insert`. It is named once here
 * for the same reason `MONEY_BLIND` is: a set repeated at four call sites drifts
 * at one of them.
 *
 * Note who is NOT in it — **Technician**, who `canPerformOperations` does admit.
 * The two sets are genuinely different jobs: a technician may pack and reset the
 * gear on a booking they cannot create or commit.
 */
const BOOKING_DESK: ReadonlySet<SystemRole> = new Set<SystemRole>([
  'Owner',
  'Admin',
  'Manager',
  'Coordinator',
  'Warehouse',
])

/**
 * The floor. `BOOKING_DESK` minus Coordinator, plus Technician per Ruling D3 (26 Oct 2026).
 *
 * Mirrors the live write policy shared by `operation_sessions`, `session_line_movements`,
 * `packing_lines`, `handover_lines`, `return_lines`, `signatures`, `cleaning_queue_entries`,
 * `maintenance_records` and `evidence_files` (updated in migration 0180):
 * Owner, Admin, Manager, Warehouse, Technician. Coordinator is absent — taking a
 * booking is desk work, moving the gear is not.
 */
const FLOOR: ReadonlySet<SystemRole> = new Set<SystemRole>(['Owner', 'Admin', 'Manager', 'Warehouse', 'Technician'])

/**
 * Back office. Mirrors `client_merges_all` and `suppliers_all` (live, 16 Aug
 * 2026): Owner, Admin, Manager. Narrower than the desk because these acts are
 * irreversible or contractual.
 */
const BACK_OFFICE: ReadonlySet<SystemRole> = new Set<SystemRole>(['Owner', 'Admin', 'Manager'])

/**
 * Check if role can confirm a rental — the Quote → Booked commitment.
 *
 * **Ruled 15 Aug 2026 by mirroring the database**, closing PLAN.md §4.20. This
 * was the last of four capabilities that `actions/core.ts:checkCapability` did
 * not resolve, which the dispatcher read as a denial for *every* role, Owner
 * included: Confirm Rental was permission-denied rather than unbuilt, with a
 * real body behind it.
 *
 * The role set is not invented here. `confirmRental` writes exactly one row, to
 * `booking_stage_transitions`, and that table's INSERT policy (live, 15 Aug)
 * already states who may:
 *
 *     with check (
 *       auth_user_role() = any (array['Owner','Admin','Manager','Coordinator','Warehouse'])
 *       and actor_id = nullif(current_setting('app.current_user_id', true), '')::uuid
 *     )
 *
 * `confirmRental.ts`'s own header argued this exact set and refused to borrow
 * `operations.perform` for it, because that one admits Technician and excludes
 * Coordinator — the booking desk, the seat whose job this is.
 *
 * ⚠ The policy's second clause — the actor must BE the session — is not mirrored
 * here and deliberately so. This function answers "may this role", a question
 * about rank; identity is enforced at the row by RLS, where it cannot be talked
 * past. `lib/bookingTransition` passes `ctx.userId` as `actor_id`.
 *
 * No offline degradation: a stage move is not a money action, and
 * `confirmRental.execute` already refuses offline outright with its own reason
 * (a queued transition is checked against the stage at drain time, which may be
 * hours later). Adding a second, quieter offline rule here would duplicate that.
 */
export function canConfirmRental(role: SystemRole): boolean {
  return BOOKING_DESK.has(role)
}

/**
 * Check if role can create a client.
 *
 * **Ruled 15 Aug 2026 by mirroring the database**, closing PLAN.md §4.20.
 * `createClient` inserts into `clients`, whose live INSERT policy is
 * `clients_insert`: Owner, Admin, Manager, Coordinator, Warehouse. Coordinator
 * is in it because taking a walk-in's details is the booking desk's work.
 */
export function canCreateClient(role: SystemRole): boolean {
  return BOOKING_DESK.has(role)
}

/**
 * Check if role can block a client.
 *
 * **Ruled 15 Aug 2026 by mirroring the database**, closing PLAN.md §4.20.
 * Narrower than `canCreateClient` — Owner, Admin, Manager — and the database
 * draws that line itself. `client_flags_insert` (live) splits on the flag:
 *
 *     ((flag_type =  'Blocked' and auth_user_role() = any (array['Owner','Admin','Manager']))
 *   or (flag_type <> 'Blocked' and auth_user_role() = any (array['Owner','Admin','Manager','Coordinator','Warehouse'])))
 *
 * So Coordinator and Warehouse may raise any other flag on a client and may not
 * raise this one. `blockClient` writes `flag_type = 'Blocked'`, so it takes the
 * narrow branch. A capability named for the general act of flagging would be
 * wrong here; this one is named for the block specifically.
 */
export function canBlockClient(role: SystemRole): boolean {
  return role === 'Owner' || role === 'Admin' || role === 'Manager'
}

/**
 * Check if role can put a client on a membership plan, or move them to another.
 *
 * RULING 2026-10-22, by mirroring the database like the two rules above.
 * `changeMembership` writes `client_memberships`, whose policy
 * `client_memberships_all` (0037) admits Owner, Admin, Manager and Coordinator,
 * and PERMISSIONS C5 says the same ("create and edit clients incl.
 * membership"). Warehouse and Accounts are NOT in it (A5: "no membership
 * edits"), which is why this is not `client.update`: that capability is
 * `canWriteBookingDesk`, whose set admits Warehouse (the walk-in desk).
 * `change_client_membership` (0174) repeats this list because SECURITY DEFINER
 * bypasses RLS — the two must change together, and never widen.
 */
export function canChangeMembership(role: SystemRole): boolean {
  return role === 'Owner' || role === 'Admin' || role === 'Manager' || role === 'Coordinator'
}

/**
 * Check if role can manage membership plans (create, edit, retire, reactivate).
 * Owner, Admin, Manager only. Coordinator is read-only (T8-02, Law 3).
 *
 * Mirrors `save_membership_plan` and `retire_membership_plan` RPCs (0196).
 */
export function canManageMembershipPlans(role: SystemRole): boolean {
  return role === 'Owner' || role === 'Admin' || role === 'Manager'
}

/**
 * Check if role can create a bundle.
 *
 * **Ruled 15 Aug 2026 by mirroring the database**, closing the fourth gap —
 * `inventory.create` — which PLAN.md §4.20 did not name and no document had
 * logged before 15 Aug.
 *
 * `createBundle` writes two tables and their policies disagree:
 *
 *   - `bundles_manage`    — Owner, Admin, Manager
 *   - `bundle_items_all`  — Owner, Admin, Manager, **Warehouse**
 *
 * The intersection is what the action can actually complete, so it is what this
 * returns. Warehouse may add items to a bundle that exists and may not create
 * one; granting `inventory.create` to Warehouse would pass this check and then
 * fail at the first insert, which is the failure shape Law 6's UI rule exists to
 * prevent — forbidden is absent, not attempted and refused.
 */
export function canCreateBundle(role: SystemRole): boolean {
  return role === 'Owner' || role === 'Admin' || role === 'Manager'
}

/**
 * Check if role can **edit** a bundle that already exists.
 *
 * Same role set as `canCreateBundle`, and named separately anyway — because it
 * is a different act on the same two tables, and the file's convention is to
 * name a capability for the act rather than for the role set that happens to
 * answer it today (see `canBlockClient`, which is narrower than "flagging" for
 * exactly this reason). If `bundles_manage` is ever narrowed for edits without
 * being narrowed for creates, this is the line that changes.
 *
 * The derivation is unchanged, re-read from the live project 8 Sep 2026:
 *
 *   - `bundles_manage`    — Owner, Admin, Manager        (0035:61-65, `for all`)
 *   - `bundle_items_all`  — Owner, Admin, Manager, **Warehouse** (0033:84-88)
 *
 * `updateBundle` writes both, so the intersection is what it can complete.
 * Warehouse may change the items of a bundle and may not rename or re-rate one;
 * granting it here would pass the dispatcher and fail at the `bundles` UPDATE,
 * which is the shape "forbidden is absent, not attempted and refused" exists to
 * prevent.
 */
// RULING 2026-09-08 (R-34): `inventory.update` is named for the act, not the role set;
// revert = point `case 'inventory.update'` at `canCreateBundle` and delete this function.
export function canUpdateBundle(role: SystemRole): boolean {
  return role === 'Owner' || role === 'Admin' || role === 'Manager'
}

/**
 * Check if role can set a product model's **preventive-service plan** — the
 * three intervals and the grace window R-28 puts on `products`.
 *
 * Owner · Admin · Manager, from `PERMISSIONS.md` §4.3
 * (`inventory.edit_service_plan`), which is itself the `products_update` policy
 * read off the project. Deliberately NOT the wider set that may *record a meter
 * reading* (`inventory.record_meter`: M+ · Warehouse · Technician): reading a
 * meter at Return is floor work, and deciding how often a model is serviced is
 * a fleet policy that costs money and takes gear off the shelf.
 *
 * A separate predicate from `canUpdateBundle` although the three roles are the
 * same today: they are the same by coincidence of two different policies, and
 * one function serving both would silently move this the day either moves.
 */
// RULING 2026-09-08 (R-28): the service plan lives on the model, and Owner/Admin/Manager set it;
// revert = point `case 'inventory.edit_service_plan'` at `canUpdateBundle` and delete this.
export function canEditServicePlan(role: SystemRole): boolean {
  return role === 'Owner' || role === 'Admin' || role === 'Manager'
}

/** RULING 2026-09-29: product-wide bulk stock corrections require Manager+. */
export function canAdjustStock(role: SystemRole): boolean {
  return role === 'Owner' || role === 'Admin' || role === 'Manager'
}

/* ────────────────────────────────────────────────────────────────────────────
 * The remaining capability rules — ruled 16 Aug 2026, same method as the four
 * above. Derivation table: `CAPABILITY_MAPPING_2026-08-16.md` §4.
 *
 * One predicate per **role set**, not per capability. Twenty-one near-identical
 * functions would hide the fact that four rules do all the work, and each of the
 * four is a table's policy rather than a product opinion.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Booking-desk writes: `bookings`, `booking_lines`, `clients`,
 * `inventory_reservations`, `document_registry`.
 *
 * Mirrors `bookings_insert` / `booking_lines_all` / `clients_update` (live,
 * 16 Aug 2026) — the same array `BOOKING_DESK` was named for.
 *
 * Covers `rental.create`, `rental.draft`, `rental.cancel`, `rental.extend`,
 * `client.update`, `inventory.reserve`, `document.create` and
 * `subrental.create`. The last has no table of its own: a sub-rental is a
 * `booking_lines` row with `line_type = 'Sub-rental'`, carrying `supplier_id`,
 * `supplier_cost` and `markup_amount`, so it mirrors `booking_lines_all`.
 * Creating a **supplier** is a different act on `suppliers`, which is
 * `canWriteBackOffice` — a sub-rental flow that creates suppliers inline needs
 * both.
 */
export function canWriteBookingDesk(role: SystemRole): boolean {
  return BOOKING_DESK.has(role)
}

/**
 * Floor writes: `operation_sessions`, `stock_audits`, `stock_transfers`,
 * `maintenance_records`, `evidence_files`. Mirrors `operation_sessions_all`.
 *
 * Covers `rental.pickup`, `rental.return`, `inventory.pack`, `inventory.ready`,
 * `inventory.audit`, `inventory.transfer`, `maintenance.create`,
 * and `evidence.review`.
 */
export function canWriteFloor(role: SystemRole): boolean {
  return FLOOR.has(role)
}

/**
 * Closing / completing a maintenance job (Ruling D4, 26 Oct 2026, T2-06).
 * Admits Technician or Manager+ (Owner, Admin, Manager, Technician).
 * Warehouse can create maintenance jobs (W8) but cannot clear them.
 */
export function canCompleteMaintenance(role: SystemRole): boolean {
  return role === 'Owner' || role === 'Admin' || role === 'Manager' || role === 'Technician'
}

/**
 * Irreversible client-record acts. Mirrors `client_merges_all`.
 *
 * Deliberately narrower than `canWriteBookingDesk`: both touch clients, but
 * `client_merges_all` is Owner/Admin/Manager while `clients_update` is the desk
 * five. Merging cannot be undone in the way editing can, and the database
 * already draws that line — this only repeats it.
 */
export function canMergeClients(role: SystemRole): boolean {
  return BACK_OFFICE.has(role)
}

/**
 * Shared-triage surfaces: `cases`, `crew_assignments`, `purchase_requests`
 * (raising, editing, submitting, cancelling, and post-approval legwork).
 * Mirrors `auth_is_staff()` — every staff role, Client excluded.
 *
 * `purchase.approve` no longer lives here. It did until 23 Aug 2026, when
 * migration 0064 (`purchase_requests_approval_rank`, RESTRICTIVE) went live on
 * the project and the verb moved to `canApprovePurchase` below, per the
 * mirror rule this file works by. 0064 deliberately left everything else on
 * `purchase_requests_all` = `auth_is_staff()`, which is what this predicate
 * continues to mirror for the non-deciding verbs. History: PLAN.md §4.29.
 */
export function canWriteSharedTriage(role: SystemRole): boolean {
  return isStaff(role)
}

/**
 * Deciding a purchase request — landing it on Approved or Rejected.
 *
 * Mirrors `purchase_requests_approval_rank` (0069, applied 25 Aug 2026): a
 * RESTRICTIVE UPDATE policy gating any update whose RESULTING row is Approved
 * or Rejected on `auth_can_approve_purchase()` — Owner and Manager only.
 *
 * Rejected is gated alongside Approved because refusing spend is deciding
 * spend, and the enum allows Rejected from Approved — an ungated Reject would
 * let a lower tier revoke an owner's decision.
 *
 * ## Why narrower than the money-visibility tier
 *
 * 0064 (23 Aug 2026) moved this verb off `auth_is_staff()` onto
 * `auth_is_finance_or_admin()` — Owner, Admin, Manager, Coordinator, Accounts
 * — closing the real incoherence of a Driver authorising spend it is forbidden
 * by Law 6 from even reading. 0069 narrows it again: seeing a cost and being
 * allowed to commit the business to it are different powers. Admin,
 * Coordinator and Accounts keep every non-deciding verb — raising, editing,
 * submitting, cancelling, and the Ordered/Received procurement legwork after a
 * decision — through `purchase_requests_all`, which 0069 does not touch.
 */
export function canApprovePurchase(role: SystemRole): boolean {
  return role === 'Owner' || role === 'Manager'
}

/**
 * Check if user can approve a given discount percentage.
 *
 * ⚠ **`percent < 0` is refused, and this used to grant it to everyone.** The
 * guard read `if (percent <= 0) return true`, which sits *above* every role
 * check — so `canApproveDiscount('Client', -5)` returned **true**, as did the
 * offline-adjacent path for any role. Fixed 16 Aug 2026 (`R3-1`, PLAN.md §4.35).
 *
 * Zero still needs no approval — there is nothing to approve. A NEGATIVE percent
 * is not a small discount, it is a **price increase**, and nothing in this
 * product may raise a price through the discount path. This is not a new rule:
 * `lib/discount.ts:validateDiscount` already rejects it and so does the database
 * (`booking_discounts_hard_cap`, `0002_bookings.sql`). This function and
 * `money.ts:discountGate` were the two that disagreed.
 */
export function canApproveDiscount(_role: SystemRole, percent: number, _isOnline: boolean = true): boolean {
  /* The gate is GONE — D3 (30 Aug), Babin's final word 31 Aug: "don't put any
     gate on discount." No approval exists, so nothing is ever blocked on an
     approver, a role tier, the old 25% cap, or being offline. The function
     survives (absent-not-disabled applies to UI, not to engine exports with
     six call sites) and now answers the only questions left — arithmetic
     validity, keeping the R3-1 hole closed: */
  if (percent < 0) return false // a negative discount is a price rise, not approvable-because-not-a-discount
  if (percent > 100) return false // a >100% discount is a negative price
  return true
}

/** Check if role can void an invoice */
export function canVoidInvoice(role: SystemRole, isOnline: boolean = true): boolean {
  if (!isOnline) return false // Money action blocked offline
  // RULING 2026-11-01 (R-3): Owner · Admin · Manager · Accounts — Babin: "1 yes". This is R-05 /
  // PERMISSIONS `invoice.void` and exactly the database gate `auth_is_finance_or_admin()`. Coordinator
  // is excluded (PERMISSIONS C6: cannot void). Commit 68485549 had added Coordinator; that is undone.
  // Revert = `role === 'Owner' || role === 'Accounts'` (and the three test files named in R-3).
  return role === 'Owner' || role === 'Admin' || role === 'Manager' || role === 'Accounts'
}

/**
 * Create, issue or close against an invoice — **R-05, R-08 and SPEC-P0-1 §3.1.**
 *
 * Owner · Admin · Manager · Accounts.
 *
 * ⚠ This one is **ruled, not mirrored**, and that is a deliberate departure
 * from §4.20's usual method. `RULINGS-2026-09-04.md` is binding and outranks
 * PLAN.md (R-00), and R-05 names this set outright. The live policy on 4 Sep
 * said something different:
 *
 *   R-05 / SPEC-P0-1 §3.1   Owner, Admin, Manager, Accounts     (ruled)
 *   invoices_insert         Owner, Admin, Manager, Coordinator  (live, 4 Sep)
 *   invoices_update         Owner, Admin, Manager, Coordinator  (live, 4 Sep)
 *
 * Accounts — the role the ruling names — was absent from the database, and
 * Coordinator, which the ruling does not name, was present. §4.20 is explicit
 * about the order when the two disagree: **change the POLICY first, then the
 * predicate.** `0086_invoice_write_rights_and_draft_without_number.sql` is that
 * change, and this function is written to match it. The migration is drafted and
 * NOT applied, so until it lands an Accounts user is offered a control Postgres
 * still refuses — which is why the two must ship together.
 *
 * ⚠ **Not `canVoidInvoice`**, which `Finance.tsx:492` was borrowing to gate the
 * Issue control. No 4 Sep ruling restates who may void, so per R-00 (silence is
 * not supersession) `canVoidInvoice` keeps its older Owner/Accounts position and
 * is left alone here. Its disagreement with the policy set is the remaining half
 * of AUTHSEC-01 and needs a ruling, not a refactor.
 *
 * Offline: refused, like every other money action in this file. An invoice
 * number comes from `next_document_number('invoice')` at issue (R-15), which is
 * a server round trip by definition — there is nothing to queue.
 */
export function canIssueInvoice(role: SystemRole, isOnline: boolean = true): boolean {
  if (!isOnline) return false // Money action blocked offline
  return role === 'Owner' || role === 'Admin' || role === 'Manager' || role === 'Accounts'
}

/**
 * Confirm a Close — **R-08**, which names the same set as R-05:
 * Owner · Admin · Manager · Accounts.
 *
 * Ruled rather than mirrored, and the distinction matters here. `closeRental`
 * writes a `booking_stage_transitions` row, whose live INSERT policy is the desk
 * five (Owner, Admin, Manager, Coordinator, **Warehouse**) — so the §4.20 mirror
 * would hand Close to Warehouse. R-08 does not, and R-07 explains why: the close
 * gate is a hard block on money (outstanding 0, deposit resolved), so closing is
 * a finance act that happens to be recorded as a stage move.
 *
 * The gates themselves are not enforced here. `lib/workflow.closeGates` refuses
 * a booking with anything outstanding whoever asks, and this only decides who
 * may confirm once they pass.
 *
 * ⚠ The policy is wider than this predicate, which is the safe direction (the UI
 * grants less than the database, never more) but still a divergence: Warehouse
 * can insert a Closed transition by direct PostgREST call. That is compounded by
 * P1-11 — `bookings.stage` and `closed_at` are directly writable because 0021's
 * column revoke never took. Narrowing the policy to R-08 belongs with that fix.
 */
export function canCloseRental(role: SystemRole, isOnline: boolean = true): boolean {
  if (!isOnline) return false // Reads live money to evaluate the gates
  return role === 'Owner' || role === 'Admin' || role === 'Manager' || role === 'Accounts'
}

// RULING 2026-10-16: corrections before handover and terminal archive are M+, online.
export function canManageRentalLifecycle(role: SystemRole, isOnline = true): boolean {
  return isOnline && (role === 'Owner' || role === 'Admin' || role === 'Manager')
}

export type OperationName = 'pack' | 'handover' | 'return' | 'reset'

/**
 * **Per-operation grants (Booqable adoption spec P0-B, 17 Oct 2026).**
 *
 * Booqable ships a single coarse `canPerformOperations`-shaped permission: one
 * grant covers *every* operational action, so its model cannot express "may
 * pack and reset but not hand over". Babin's four global operations
 * (Packing, Handover, Return & Inspection, Cleaning & Reset) are the natural
 * authorisation boundary, so each is its own grant, checked server-side per
 * request — not a page-level check.
 *
 * These four are the **frontend half** of that boundary: a UI control for an
 * operation the caller's role may not perform is absent, not disabled (Law 6's
 * absent-not-disabled rule). They are deliberately finer than
 * `canPerformOperations`, which stays as the coarse "may touch operations at
 * all" gate; a role that passes `canPerformOperations` may still fail one of
 * these, and a role that fails `canPerformOperations` fails all four.
 *
 * Role matrix (ruled 17 Oct 2026 by mirroring the existing floor / technician
 * split already in this file):
 *   - **Pack** (preparation, `canWriteFloor` + Technician) — gear prep is floor
 *     work and technicians do it.
 *   - **Handover** (client-facing handoff) — floor only. Giving gear to a
 *     client is not prep work, so Technician is excluded even though
 *     `canPerformOperations` admits them.
 *   - **Return** (receiving + triage) — floor + Technician. Technicians share
 *     return triage per the `canPerformOperations` comment.
 *   - **Reset** (QC / cleaning) — floor + Technician. Reset absorbs Cleaning,
 *     which is floor work technicians perform.
 *
 * ⚠ **Location scoping is now expressed — in the database (0171, RULING
 * 2026-10-23).** The session carries `branchId`/`warehouseId` (see
 * `UserSession`), and migration 0171's `operations_grants` table +
 * `auth_may_perform_operation()` narrow the four grants per branch, enforced
 * fail-closed inside `apply_booking_stage_transition()` and asked early by
 * `runFloorVerb` step 1b (`assert_operation_branch_grant`) — Reset's only
 * branch gate. These functions still answer "may this role"; "may this role
 * at this site" is the DB's, and an empty grants table keeps this file's
 * matrix exactly as it was (narrowing-only).
 *
 * Offline: all four are pure role checks and do not depend on connectivity,
 * matching `canPerformOperations` (the floor works offline). Money gates are
 * separate and stay online.
 */
/** Check if role can manage operations sessions (pack, handover, return, reset) */
export function canPerformOperations(role: SystemRole): boolean {
  return role === 'Owner' || role === 'Admin' || role === 'Manager' || role === 'Warehouse' || role === 'Technician'
}

export function canPack(role: SystemRole): boolean {
  return canPerformOperations(role) // prep is floor + technician work (D3)
}

export function canHandover(role: SystemRole): boolean {
  return canPerformOperations(role) // client-facing handoff admits Technician (D3, 26 Oct 2026)
}

/**
 * Gate 1 override (receiver unverified) permission check (D2, T2-04, PERMISSIONS §6.1).
 * Any staff member allowed to hand over may override gate 1 with an audited reason of >= 10 characters.
 */
export function canOverrideReceiverVerification(role: SystemRole): boolean {
  return canHandover(role)
}

export function canReturn(role: SystemRole): boolean {
  return canPerformOperations(role) // receiving + triage is floor + technician work
}

/**
 * RULING 2026-10-26 (D1, Task T2-03, migration 0181):
 * Collateral documents (ID cards held in lieu of cash deposit) may be received
 * or returned by any staff member capable of handover or desk operations
 * (Owner, Admin, Manager, Coordinator, Warehouse, Technician).
 */
export function canManageCollateral(role: SystemRole): boolean {
  return canPerformOperations(role) || canWriteBookingDesk(role)
}

/**
 * Record or update client identity documents and authorized collectors (T2-12, W28, W34, W50).
 * Handover staff, warehouse, technicians and booking desk staff can capture client ID / collectors on the spot.
 */
export function canManageClientCollectors(role: SystemRole): boolean {
  return canPerformOperations(role) || canWriteBookingDesk(role)
}

/**
 * ID number and document photo unmasked view (T2-03, T2-12).
 * Strictly Owner, Admin, Manager. Warehouse, Technician, Driver see masked ID numbers.
 */
export function canViewUnmaskedId(role: SystemRole): boolean {
  return role === 'Owner' || role === 'Admin' || role === 'Manager'
}

export function canReset(role: SystemRole): boolean {
  return canPerformOperations(role) // QC / cleaning is floor + technician work
}

/**
 * T4-03: Attach proof of delivery (evidence photo + recipient signature).
 * Allowed for Manager/Coordinator/Warehouse/Driver at the branch, plus Owner/Admin.
 * Technician is NOT permitted — proof attachment is a custodial completion action.
 */
export function canAttachDeliveryProof(role: SystemRole): boolean {
  return role === 'Owner' || role === 'Admin' || role === 'Manager' || role === 'Coordinator' || role === 'Warehouse' || role === 'Driver'
}

export function canPerformOp(role: SystemRole, op: OperationName): boolean {
  switch (op) {
    case 'pack':
      return canPack(role)
    case 'handover':
      return canHandover(role)
    case 'return':
      return canReturn(role)
    case 'reset':
      return canReset(role)
  }
}

/** Check if role can record payments or security deposits */
export function canRecordPayment(role: SystemRole, isOnline: boolean = true): boolean {
  if (!isOnline) return false // Money action blocked offline
  return role === 'Owner' || role === 'Coordinator' || role === 'Accounts'
}

/**
 * Check if role can release or apply security deposits.
 * docs/PERMISSIONS.md §4.6: `deposit.release` is M+ · Accounts (never automated, Tier 3).
 * Owner · Admin · Manager · Accounts.
 */
export function canReleaseDeposit(role: SystemRole, isOnline: boolean = true): boolean {
  if (!isOnline) return false // Money action blocked offline
  return role === 'Owner' || role === 'Admin' || role === 'Manager' || role === 'Accounts'
}

/**
 * Payment corrections move money out and must match the `payment_reversals`
 * RLS policy and PERMISSIONS F-a: Owner, Admin, or Manager only.
 */
export function canReversePayment(role: SystemRole, isOnline: boolean = true): boolean {
  if (!isOnline) return false
  return role === 'Owner' || role === 'Admin' || role === 'Manager'
}

/**
 * Approve a daily closing — **§4.20's method, mirrored not invented.**
 *
 * The RLS policy on the table this writes is `daily_closings_finance_insert`
 * (0078, applied 1 Sep 2026), whose predicate is `auth_is_finance_or_admin()`:
 *
 *     select auth_user_role() in ('Owner','Admin','Manager','Coordinator','Accounts')
 *
 * — read from `pg_get_functiondef` on the live project the day 0078 landed, not
 * from a migration file. This function is that list and nothing else, so a
 * refusal here and a refusal from Postgres cannot disagree.
 *
 * ⚠ **PLAN.md §4.40(a) is OPEN and this is the wider of the two readings.** The
 * schema also carries `auth_can_approve_late_fee_waiver()` = Owner/Manager, and
 * a closing is arguably that class of act. When Babin rules, change the POLICY
 * first and this function second — in that order, so the database is never the
 * looser of the two.
 *
 * Offline is refused, like every other money write (`canRecordPayment`,
 * `canVoidInvoice`, `canOverrideCreditLimit`): a signed record the database has
 * not confirmed is the one thing a closing must never be.
 */
// RULING 2026-10-18: closing.approve is Owner/Admin/Manager/Accounts — the set 0117's auth_is_finance_or_admin() admits.
export function canApproveDailyClosing(role: SystemRole, isOnline: boolean = true): boolean {
  if (!isOnline) return false
  return role === 'Owner' || role === 'Admin' || role === 'Manager' || role === 'Accounts'
}

/** Check if role can override client credit limits */
export function canOverrideCreditLimit(role: SystemRole, isOnline: boolean = true): boolean {
  if (!isOnline) return false // Approval action blocked offline
  return role === 'Owner' || role === 'Admin' || role === 'Manager'
}

/**
 * Check if role can sign off a damage charge at the level the engine requires.
 *
 * **Ruled 12 Aug 2026: Owner and Manager only.** Previously this rule did not
 * exist here at all — `DamageTab.tsx` computed it inline as
 * `approver === 'Owner' ? role === 'Owner' : role === 'Owner' || role === 'Admin' || role === 'Manager'`,
 * which put a business rule in a page (against Law 1) and quietly granted damage
 * sign-off to **Admin**, a role the ruling excludes.
 *
 * The database does not settle this: RLS on `damage_findings` is a single
 * `auth_is_staff()` policy, and its only relevant CHECK
 * (`damage_findings_approved_needs_approver`) requires an approver be *named*,
 * not that they hold any particular rank. So this is the app's rule to state,
 * and an RLS predicate mirroring it is the natural follow-up.
 *
 * `requiredApprover` comes from `lib/damage`'s `approverFor(chargePaisa)` — the
 * Rs 25,000 banding lives there and is NOT duplicated here. This function
 * answers only "may this role act at that level", which keeps the threshold in
 * one place and the role rule in the other. That split is deliberate: importing
 * the threshold into `rbac` would let a later change to one silently re-rule the
 * other, which is exactly the trap `canOverrideCreditLimit` sets if it is
 * borrowed for this.
 */
export function canApproveDamage(role: SystemRole, requiredApprover: 'Manager' | 'Owner'): boolean {
  if (requiredApprover === 'Owner') return role === 'Owner'
  return role === 'Owner' || role === 'Manager'
}

/**
 * Check if role can approve a late-fee waiver.
 *
 * **Not a new ruling** — `lib/lateFee.ts:26` already states it: "Any staff member
 * may raise a waiver; a Manager or Owner must approve it." This function is that
 * sentence made enforceable. There is deliberately **no threshold**, matching
 * `WAIVER_NEEDS_APPROVER = true`: unlike a discount, every waiver needs an
 * approver regardless of size, because waiving is giving money away and the
 * direction — not the amount — is what makes it an approval.
 *
 * Distinct from `canApproveDiscount`, which is percentage-banded, and from
 * `canApproveDamage`, which bands at Rs 25,000. Three money approvals, three
 * different shapes, each stated where it is ruled.
 *
 * ⚠ This governs the SESSION performing the approval. `LateFeePanel` separately
 * collects `approverName` as free-typed text, and `validateWaiver` checks only
 * that it is non-empty — so a typed name is not an authenticated approver.
 * TODO(decision): whether the typed approver field should be replaced by the
 * session's own identity, or kept as a second countersignature alongside it.
 */
export function canApproveLateFeeWaiver(role: SystemRole): boolean {
  return role === 'Owner' || role === 'Manager'
}

/** Check if role can manage users and system configuration */
export function canManageSettings(role: SystemRole): boolean {
  return role === 'Owner'
}

/**
 * Publish a saved view to the whole team (0159 `save_view`). Anyone on staff may keep a private one.
 * RULING 2026-10-07 (D-3 proposal, ⭐): Manager and above. The database enforces the same list.
 */
export function canPublishTeamViews(role: SystemRole): boolean {
  return role === 'Owner' || role === 'Admin' || role === 'Manager'
}

/**
 * Client phone, email and tax-id in an exported file (Booqable adoption spec G5 — their finance export
 * shipped seven PII columns to anyone). RULING 2026-10-07: Owner · Admin · Manager. Everyone else may still
 * export the directory, without those three columns. Stricter-wins (B-1); a new gate, no existing one moved.
 */
export function canExportClientPii(role: SystemRole): boolean {
  return role === 'Owner' || role === 'Admin' || role === 'Manager'
}

/**
 * Create a team note — every staff role (not Client).
 * Mirrors the RLS policy on `team_notes` INSERT (migration 0185, `auth_is_staff()`).
 * RULING 2026-11-01 (O-19): Babin — "all staff yes". Was Coordinator and above; widened to match the
 * database, which already allowed every staff member. Revert = restore the four-role comparison.
 */
export function canCreateTeamNote(role: SystemRole): boolean {
  return isStaff(role)
}

/**
 * Read/list team notes — all staff roles (not Client).
 * Mirrors the RLS policy on `team_notes` SELECT (migration 0185).
 */
export function canReadTeamNotes(role: SystemRole): boolean {
  return isStaff(role)
}

/**
 * Acknowledge a team note — all staff roles (not Client).
 * Mirrors the RLS policy on `team_notes` UPDATE for acknowledge (migration 0185).
 */
export function canAcknowledgeTeamNote(role: SystemRole): boolean {
  return isStaff(role)
}

/**
 * Create a delivery zone — Owner, Admin, Manager (T4-07 build note 3, B-1).
 * Mirrors `delivery_zones_insert_manager_plus` (migration 0189, amended 3 Nov 2026).
 * Coordinator was narrowed out: the card's role set is Owner · Admin · Manager.
 */
export function canCreateDeliveryZone(role: SystemRole): boolean {
  return role === 'Owner' || role === 'Admin' || role === 'Manager'
}

/**
 * Read/list delivery zones — all staff roles (not Client).
 * Mirrors the RLS policy on `delivery_zones` SELECT (migration 0189).
 */
export function canReadDeliveryZones(role: SystemRole): boolean {
  return isStaff(role)
}

/**
 * Update/deactivate a delivery zone — Owner, Admin, Manager (T4-07 build notes 2–3).
 * Mirrors `delivery_zones_update_manager_plus` (migration 0189, amended 3 Nov 2026):
 * INSERT and UPDATE only — there is no DELETE policy, "Deactivate" is terminal (Law 3).
 */
export function canManageDeliveryZones(role: SystemRole): boolean {
  return role === 'Owner' || role === 'Admin' || role === 'Manager'
}

/**
 * Pin/unpin a team note — all staff roles (not Client).
 * Mirrors pin_team_note RPC (migration 0185).
 */
export function canPinTeamNote(role: SystemRole): boolean {
  return isStaff(role)
}

/**
 * Archive a team note — all staff roles (not Client).
 * Mirrors archive_team_note RPC (migration 0185).
 */
export function canArchiveTeamNote(role: SystemRole): boolean {
  return isStaff(role)
}

/**
 * Resolve/reopen a team note — all staff roles (not Client).
 * Mirrors resolve_team_note RPC (migration 0185).
 */
export function canResolveTeamNote(role: SystemRole): boolean {
  return isStaff(role)
}

/**
 * Create a shift handover — all staff roles (not Client).
 * Mirrors create_shift_handover RPC and shift_handovers INSERT policy (migration 0186).
 */
export function canCreateShiftHandover(role: SystemRole): boolean {
  return isStaff(role)
}

/**
 * Read/list shift handovers — all staff roles (not Client).
 * Mirrors shift_handovers_v SELECT policy (migration 0186).
 */
export function canReadShiftHandovers(role: SystemRole): boolean {
  return isStaff(role)
}

/**
 * Acknowledge a shift handover — all staff roles (not Client).
 * Mirrors acknowledge_shift_handover RPC (migration 0186).
 */
export function canAcknowledgeShiftHandover(role: SystemRole): boolean {
  return isStaff(role)
}

/**
 * Archive a shift handover — all staff roles (not Client).
 * Mirrors archive_shift_handover RPC (migration 0186).
 */
export function canArchiveShiftHandover(role: SystemRole): boolean {
  return isStaff(role)
}

/**
 * Delivery job creation — Owner, Admin, Manager, Coordinator (migration 0165/0187).
 * Mirrors the authorization in `delivery_create_job`.
 */
export function canCreateDeliveryJob(role: SystemRole | null | undefined): boolean {
  if (!role) return false
  return role === 'Owner' || role === 'Admin' || role === 'Manager' || role === 'Coordinator'
}

/**
 * Driver assignment to delivery job — Owner, Admin, Manager, Coordinator (migration 0165/0187).
 * Mirrors the authorization in `delivery_assign_driver`.
 */
export function canAssignDeliveryDriver(role: SystemRole | null | undefined): boolean {
  if (!role) return false
  return role === 'Owner' || role === 'Admin' || role === 'Manager' || role === 'Coordinator'
}

/**
 * Delivery job status transition — Owner, Admin, Manager, Coordinator, Warehouse, Driver (migration 0165/0187).
 * Specific transition rules and assignment checks are enforced inside `delivery_transition_job`.
 */
export function canTransitionDeliveryJob(
  role: SystemRole | null | undefined,
  _fromStatus?: string,
  toStatus?: string
): boolean {
  if (!role) return false
  if (role === 'Client') return false

  if (toStatus === 'Ready') {
    return role === 'Owner' || role === 'Admin' || role === 'Manager' || role === 'Coordinator' || role === 'Warehouse'
  }
  if (toStatus === 'In Transit') {
    return role === 'Owner' || role === 'Admin' || role === 'Manager' || role === 'Coordinator' || role === 'Warehouse' || role === 'Driver'
  }
  if (toStatus === 'Delivered') {
    return role === 'Owner' || role === 'Admin' || role === 'Manager' || role === 'Driver'
  }
  if (toStatus === 'Failed') {
    return role === 'Owner' || role === 'Admin' || role === 'Manager' || role === 'Coordinator' || role === 'Driver'
  }

  return (
    role === 'Owner' ||
    role === 'Admin' ||
    role === 'Manager' ||
    role === 'Coordinator' ||
    role === 'Warehouse' ||
    role === 'Driver'
  )
}

/**
 * Reschedule delivery job — Owner, Admin, Manager, Coordinator (migration 0191, T4-02, Ruling D8).
 * Mirrors the authorization in `delivery_reschedule_job`.
 */
export function canRescheduleDeliveryJob(role: SystemRole | null | undefined): boolean {
  if (!role) return false
  return role === 'Owner' || role === 'Admin' || role === 'Manager' || role === 'Coordinator'
}

/**
 * Set delivery route position (T4-09) — Owner, Admin, Manager, Coordinator, Warehouse.
 * Mirrors `set_delivery_route_position` authorization.
 */
export function canSetDeliveryRoutePosition(role: SystemRole | null | undefined): boolean {
  if (!role) return false
  return role === 'Owner' || role === 'Admin' || role === 'Manager' || role === 'Coordinator' || role === 'Warehouse'
}

/**
 * Set client map pin (T4-09) — Owner, Admin, Manager, Coordinator, Warehouse.
 * Mirrors `set_client_map_pin` authorization.
 */
export function canSetClientMapPin(role: SystemRole | null | undefined): boolean {
  if (!role) return false
  return role === 'Owner' || role === 'Admin' || role === 'Manager' || role === 'Coordinator' || role === 'Warehouse'
}

/**
 * View day route and generate map links (T4-09) — any staff role.
 * Mirrors `get_day_route` / `generate_google_maps_links` authorization.
 */
export function canViewDayRoute(role: SystemRole | null | undefined): boolean {
  if (!role) return false
  return ['Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse', 'Technician', 'Driver', 'Accounts'].includes(role)
}

/**
 * Create own calendar feed token (T4-10) — any staff role.
 * Mirrors `create_calendar_feed_token` authorization.
 */
export function canCreateCalendarFeedToken(role: SystemRole | null | undefined): boolean {
  if (!role) return false
  return ['Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse', 'Technician', 'Driver', 'Accounts'].includes(role)
}

/**
 * Revoke calendar feed token (T4-10) — self or Owner/Admin.
 * Mirrors `revoke_calendar_feed_token` authorization.
 */
export function canRevokeCalendarFeedToken(role: SystemRole | null | undefined, targetUserId?: string, currentUserId?: string): boolean {
  if (!role) return false
  // Self-revoke: any staff
  if (targetUserId === currentUserId) {
    return ['Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse', 'Technician', 'Driver', 'Accounts'].includes(role)
  }
  // Revoke others: Owner/Admin only
  return role === 'Owner' || role === 'Admin'
}

/**
 * View calendar feed token status (T4-10) — self or Owner/Admin.
 */
export function canViewCalendarFeedTokenStatus(role: SystemRole | null | undefined, targetUserId?: string, currentUserId?: string): boolean {
  if (!role) return false
  if (targetUserId === currentUserId) {
    return ['Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse', 'Technician', 'Driver', 'Accounts'].includes(role)
  }
  return role === 'Owner' || role === 'Admin'
}

/**
 * Create a problem report (T4-11) — any staff role.
 * Mirrors the RLS policy on `problem_reports` INSERT — all staff can submit.
 */
export function canCreateProblemReport(role: SystemRole | null | undefined): boolean {
  if (!role) return false
  return role !== 'Client'
}

/**
 * Read problem reports (T4-11) — staff see own, Owner/Admin see all.
 * Mirrors the RLS policy on `problem_reports` SELECT.
 */
export function canReadProblemReports(role: SystemRole | null | undefined): boolean {
  if (!role) return false
  return role !== 'Client'
}

/**
 * Manage problem report status (T4-11) — Owner/Admin only.
 * Mirrors the RPC authorization for `update_problem_report_status`.
 */
export function canManageProblemReports(role: SystemRole | null | undefined): boolean {
  if (!role) return false
  return role === 'Owner' || role === 'Admin'
}

/**
 * Offer campaigns to clients (T5-12, B43, B50, migration 0224).
 * Owner · Admin · Manager only. Floor roles, Coordinator, and Client are denied.
 */
export function canManageOfferCampaigns(role: SystemRole | null | undefined): boolean {
  if (!role) return false
  return role === 'Owner' || role === 'Admin' || role === 'Manager'
}

/**
 * Role Home & Default Task Surface (W61, W79).
 * Every role opens on its own tasks; this path is where the role lands or defaults.
 */
export function getRoleHomePath(role: SystemRole): string {
  switch (role) {
    case 'Warehouse':
    case 'Technician':
    case 'Coordinator':
    case 'Accounts':
    case 'Manager':
    case 'Owner':
    case 'Admin':
    case 'Driver':
      return '/today'
    case 'Client':
      return '/rentals'
    default:
      return '/today'
  }
}


