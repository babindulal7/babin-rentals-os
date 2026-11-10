import { DomainEvents } from '../events/eventBus';
import type { SystemRole } from '../types/database';

/**
 * # The Action Dispatcher
 *
 * ## What was wrong with the previous version
 *
 * Every one of the 36 files under `src/actions/` was a stub: it `console.log`ed
 * `[DB TX] ...` and returned `{ success: true }`. The dispatcher then emitted
 * the domain events and logged `[AUDIT] ... completed`, and the calling screen
 * showed a success toast with a freshly minted `PAY-1234`.
 *
 * So the app told an operator that a payment had been recorded, gave them a
 * reference number for it, and wrote nothing anywhere. **A UI that reports
 * success for work it did not do is worse than one that is visibly unbuilt** --
 * the operator's picture of what the system knows silently stops matching
 * reality, and there is no error anywhere to find later.
 *
 * The permission block was the same shape of untruth:
 *
 * ```ts
 * // 1. Permission check
 * // In a real app, you would check ctx.role against config.permissions.
 * ```
 *
 * -- so `permissions: ['payment.create']` on every action was decoration, and
 * the default context was `{ userId: 'system', role: 'admin' }`: a role string
 * that is not even a member of the business-8 enum, silently granted to any
 * caller that passed no context.
 *
 * ## What this version does instead
 *
 * 1. **Fails closed on `implemented`.** It defaults to `false`, so an action is
 *    a stub until someone states otherwise in that action's own file. A stub
 *    throws `ActionNotImplementedError` *before* validate, execute, events or
 *    audit -- nothing downstream can mistake it for a completed write. No
 *    per-file edit was needed to make the stubs honest; the default did it.
 * 2. **Requires a real context.** No default identity. An implemented action
 *    called without `ctx` throws rather than acting as somebody.
 * 3. **Checks permissions through `lib/rbac`,** which already holds the real
 *    rules, rather than a matrix invented here. A permission with no known
 *    check is refused, not waved through -- the fail-closed direction.
 *
 * ## The capability matrix — closed 16 Aug 2026, except three
 *
 * `checkCapability` resolves **32 of the 35** strings it knows about: the seven
 * app-level rules (money, operations, payment ×2, invoice-void,
 * credit-override, settings), the four ruled on 15 Aug, and the 24 ruled on
 * 16 Aug. **Every capability declared anywhere under `src/actions/` now
 * resolves, except the three named below.**
 *
 * This was done *ahead of* the bodies rather than behind them. The 15 Aug four
 * were ruled after their actions shipped, and the gap denied them to every role
 * including Owner for three days — a permission error where the truth was a
 * missing switch case. Twenty-four more sat in exactly that state, each one
 * springing the moment someone wrote its body.
 *
 * The rule for answering them is the one that worked on 15 Aug and is now
 * ruled in PLAN.md §4.20: find the RLS policy on the table the action writes
 * and mirror it. A capability can then never be granted here and denied at the
 * row, or the reverse.
 *
 * ## Capability rulings
 *
 * `inspection.create`, `inspection.pass`, `inspection.fail` ruled 2026-09-12
 * (PLAN.md §4.29(a), migration 0122): 'Inspection' added to operation_kind and
 * operation_sessions check constraint, mirroring operation_sessions_all (canWriteFloor).
 */

export type ActionContext = {
  userId: string;
  role: SystemRole;
  /** Law 6 / rbac's offline degradation: several approvals are refused offline. */
  isOnline?: boolean;
  /** Target user ID for actions on behalf of another user (e.g., revoke another's token). */
  targetUserId?: string;
};

export type ActionConfig<Input, Output> = {
  name: string;
  permissions: string[];
  /**
   * `false` (the default) means the body does not persist anything yet. The
   * dispatcher refuses to run it. Set `true` **only** when `execute` actually
   * writes through `lib/dataAccess` and the write has been driven, not read.
   */
  implemented?: boolean;
  validate: (input: Input) => void | Promise<void>;
  execute: (input: Input, ctx: ActionContext) => Promise<{ result: Output; events: Array<{ type: string; payload: unknown }> }>;
};

/** Thrown when a screen calls an action whose body does not persist anything yet. */
export class ActionNotImplementedError extends Error {
  readonly action: string;
  constructor(action: string) {
    super(
      `"${action}" is not connected to the database yet, so nothing was saved. ` +
        `This is a build gap, not a permissions problem - report it rather than retrying.`,
    );
    this.name = 'ActionNotImplementedError';
    this.action = action;
  }
}

/** Thrown when the session's role may not perform the action. */
export class ActionPermissionError extends Error {
  readonly action: string;
  readonly capability: string;
  constructor(action: string, capability: string, role: string) {
    super(`Your role (${role}) cannot perform "${action}" - it requires ${capability}.`);
    this.name = 'ActionPermissionError';
    this.action = action;
    this.capability = capability;
  }
}

/**
 * Thrown when an action is blocked specifically because the device is offline
 * (e.g. money operations, voiding invoices, closing approvals — Law 6 / PLAN.md §4.27).
 */
export class ActionOfflineError extends Error {
  readonly action: string;
  readonly capability: string;
  constructor(action: string, capability: string) {
    super(`"${action}" cannot be performed while offline — requires ${capability} with an active server connection.`);
    this.name = 'ActionOfflineError';
    this.action = action;
    this.capability = capability;
  }
}

/**
 * Maps a capability string to the rule that already exists in `lib/rbac`.
 * Returns `undefined` for a capability with no defined rule, which the
 * dispatcher treats as a denial -- see the TODO(decision) in the header.
 */
async function checkCapability(capability: string, ctx: ActionContext): Promise<boolean | undefined> {
  const rbac = await import('../lib/rbac');
  const online = ctx.isOnline ?? (typeof navigator !== 'undefined' ? navigator.onLine : true);

  switch (capability) {
    case 'payment.create':
      return rbac.canRecordPayment(ctx.role, online);
    case 'payment.reverse':
      return rbac.canReversePayment(ctx.role, online);
    case 'invoice.void':
      return rbac.canVoidInvoice(ctx.role, online);
    case 'credit.override':
      return rbac.canOverrideCreditLimit(ctx.role, online);
    case 'settings.manage':
      return rbac.canManageSettings(ctx.role);
    case 'glossary.manage':
      return rbac.canManageGlossary(ctx.role, online);
    case 'operations.perform':
      return rbac.canPerformOperations(ctx.role);
    case 'operations.pack':
      return rbac.canPack(ctx.role);
    case 'operations.handover':
      return rbac.canHandover(ctx.role);
    case 'operations.return':
      return rbac.canReturn(ctx.role);
    case 'operations.reset':
      return rbac.canReset(ctx.role);
    case 'money.view':
      return rbac.canViewMoney(ctx.role);
    /*
     * ── Ruled 15 Aug 2026, closing PLAN.md §4.20 ────────────────────────────
     *
     * These four were declared by actions carrying REAL bodies and handled by
     * nothing here, so each fell through to `undefined` and was denied for every
     * role, Owner included. Fail-closed was the correct default and it held for
     * three days; it was never the correct answer.
     *
     * The answer was not invented. Each capability is now the role set of the
     * RLS policy on the table its action actually writes, read off the live
     * project on 15 Aug — so a capability still cannot be granted here and
     * denied at the row, which is what this file's rules exist to prevent. The
     * derivation for each sits in `lib/rbac`, next to the rule.
     *
     * ⚠ `inventory.create` was the fourth, and no document had it: §4.20 named
     * only the other three. It surfaced by checking every `permissions:` string
     * against this switch rather than by reading the register.
     */
    case 'rental.confirm':
      return rbac.canConfirmRental(ctx.role);
    case 'client.create':
      return rbac.canCreateClient(ctx.role);
    case 'client.manage_id':
      return rbac.canManageClientCollectors(ctx.role);
    case 'client.block':
      return rbac.canBlockClient(ctx.role);
    // RULING 2026-10-22: new capability, mirrors `client_memberships_all` (0037) — Owner, Admin, Manager, Coordinator.
    case 'client.change_membership':
      return rbac.canChangeMembership(ctx.role);
    // RULING (T3-25, B16, B55): booking tags write capability — Owner, Admin, Manager, Coordinator.
    case 'rental.tag':
      return rbac.canSetBookingTags(ctx.role);
    case 'inventory.create':
      return rbac.canCreateBundle(ctx.role);
    /*
     * `inventory.update` — added 8 Sep 2026 with `updateBundle`, by the same
     * method: the role set is the intersection of the RLS policies on the two
     * tables the action writes (`bundles_manage` ∩ `bundle_items_all`), re-read
     * from the live project rather than copied from the line above. It lands on
     * the same three roles as `inventory.create`; the derivation sits in
     * `lib/rbac.canUpdateBundle`, next to the policies it mirrors.
     */
    // RULING 2026-09-08 (R-34): new capability, Owner/Admin/Manager, mirrored from live RLS.
    case 'inventory.update':
      return rbac.canUpdateBundle(ctx.role);
    /*
     * `inventory.edit_service_plan` — R-28, 8 Sep 2026. Owner · Admin · Manager,
     * as `PERMISSIONS.md` §4.3 states it. Ruled with the action rather than
     * after it: an unmapped capability resolves to `undefined`, which this
     * function's caller reads as a denial for EVERY role including Owner, and
     * that gap is what made `rental.confirm` unreachable for three days.
     */
    // RULING 2026-09-08 (R-28): the preventive-service plan is set by Owner/Admin/Manager.
    case 'inventory.edit_service_plan':
      return rbac.canEditServicePlan(ctx.role);
    case 'inventory.stock_adjust':
      return online && rbac.canAdjustStock(ctx.role);
    /*
     * ── Ruled 16 Aug 2026 — the remaining 24, same method as the four above ──
     *
     * Role sets read from `pg_policies` on the live project, per capability,
     * from the table that capability's action writes. Derivation table:
     * `CAPABILITY_MAPPING_2026-08-16.md` §4; the rules themselves sit in
     * `lib/rbac` next to the policy each one cites.
     *
     * Done BEFORE any of these actions gets a body, deliberately. The four
     * above were ruled *after* their bodies shipped, and the gap denied them to
     * every role including Owner for three days. Twenty-four more of the same
     * trap were sitting unsprung.
     */
    case 'rental.create':
    case 'rental.draft':
    case 'rental.cancel':
    case 'rental.extend':
    // `rental.update_project` (0144) mirrors `bookings_update` (0018) — the
    // desk five. The action writes two non-money text columns only (the 0102
    // trigger guards numeric money columns), and the screens offer the control
    // to Coordinator+ while floor roles view the type (UI grants less — the
    // safe direction, same as `rental.close` below).
    case 'rental.update_project':
    case 'client.update':
    case 'inventory.reserve':
    case 'document.create':
    case 'subrental.create':
    // `note.create` (31 Aug) mirrors `booking_notes_all` (0024:73-76) — the
    // same five-role set, per the §4.20 method. Reading notes is broader
    // (`booking_notes_select` = all staff); this gates only the write.
    case 'note.create':
    // `unit.release` (31 Aug, §4.39a) mirrors `booking_line_units_all` (0024)
    // — the identical five-role set, confirmed against pg_policies the same
    // day. The release is an UPDATE on that table; no narrower policy exists.
    case 'unit.release':
    // `inventory.edit_product_aliases` (T3-12, 0223) mirrors the
    // `product_aliases_select/insert/update` policies, whose role list IS this
    // five (Owner · Admin · Manager · Coordinator · Warehouse): the people who
    // build bookings are the people who correct what the paste-list matcher
    // suggested. Storing a spelling is narrower than the booking write they
    // already hold, so this set is the ceiling and not an extension of it
    // (N-3). The `remember_product_alias` RPC re-checks the same five in
    // Postgres, so the rule survives a caller that skips `checkCapability`.
    case 'inventory.edit_product_aliases':
      return rbac.canWriteBookingDesk(ctx.role);

    /* `closing.approve` (1 Sep, §5.4) mirrors `daily_closings_finance_insert`
       (0078) — `auth_is_finance_or_admin()`, read off the live project the day
       it applied. It is its OWN rule rather than one of the sets below because
       no existing helper carries that exact five: `canRecordPayment` is
       Owner/Coordinator/Accounts and `canPerformOperations` is a floor set.
       §4.40(a) records that a narrower Owner/Manager reading is open. */
    case 'closing.approve':
      return rbac.canApproveDailyClosing(ctx.role, online);

    /*
     * `deposit.release` (docs/PERMISSIONS.md §4.6) — Owner · Admin · Manager · Accounts.
     * Settling or releasing a security deposit (Law 5 liability held on client's behalf).
     */
    case 'deposit.release':
      return rbac.canReleaseDeposit(ctx.role, online);

    /*
     * ── Ruled 4 Sep 2026 by `RULINGS-2026-09-04.md`, which is BINDING ────────
     *
     * These two are the exception to the mirror method above, and the exception
     * is itself a rule: R-00 puts the rulings file above PLAN.md, so where it
     * names a role set outright that set wins over the live policy. §4.20 then
     * says which way to reconcile them — **change the POLICY first, then the
     * predicate** — and that is what
     * `0086_invoice_write_rights_and_draft_without_number.sql` does.
     *
     * `invoice.create` — R-05 and SPEC-P0-1 §3.1: Owner, Admin, Manager,
     * Accounts. Live said Owner/Admin/Manager/**Coordinator** on 4 Sep, so the
     * migration realigns `invoices_insert`/`invoices_update` and gives
     * `invoice_lines` the write policy it never had. Until 0086 applies, this
     * capability grants what Postgres still refuses — which is exactly why the
     * migration and this line ship together.
     */
    case 'invoice.create':
      return rbac.canIssueInvoice(ctx.role, online);

    /*
     * `rental.close` — R-08, the same four as R-05. Deliberately NOT the §4.20
     * mirror: `closeRental` writes a `booking_stage_transitions` row whose
     * policy is the desk five including Warehouse, and R-08 does not admit
     * Warehouse. R-07 explains why — the close gate is a hard block on money
     * (outstanding 0, deposit resolved), so closing is a finance act that
     * happens to be recorded as a stage move.
     *
     * This grants LESS than the database allows, which is the safe direction.
     * The reverse divergence is real and filed: Warehouse can still insert a
     * Closed transition by direct PostgREST call, compounded by P1-11.
     */
    case 'rental.close':
      return rbac.canCloseRental(ctx.role, online);
    case 'rental.revert':
    case 'rental.archive':
      return rbac.canManageRentalLifecycle(ctx.role, online);
    // RULING 2026-10-26 (D1, Task T2-03, migration 0181):
    // ID card document as collateral deposit (receive / return).
    case 'collateral.receive':
    case 'collateral.return':
      return rbac.canManageCollateral(ctx.role);

    case 'rental.pickup':
    case 'rental.return':
    case 'inventory.pack':
    case 'inventory.ready':
    case 'inventory.audit':
    case 'inventory.transfer':
    case 'maintenance.create':
    case 'evidence.review':
    // RULING 2026-09-12 (PLAN.md §4.29(a), migration 0122): 'Inspection' added
    // to operation_kind and operation_sessions; mirrors operation_sessions_all.
    case 'inspection.create':
    case 'inspection.pass':
    case 'inspection.fail':
      return rbac.canWriteFloor(ctx.role);

    // Ruling D4 (26 Oct 2026, T2-06): closing a repair job is Technician or Manager+
    case 'maintenance.complete':
      return rbac.canCompleteMaintenance(ctx.role);

    case 'client.merge':
      return rbac.canMergeClients(ctx.role);

    // RULING 2026-09-08 (R-25): `case.resolve` sets a damage disposition AND a
    // cost, so it is a money write and may not resolve to `isStaff()` — that
    // admitted Warehouse, Technician and Driver, the three money-blind roles
    // (P4, N-1). PERMISSIONS.md §4.3 as corrected: Owner · Manager under
    // Rs 25,000, Owner at or above. `canApproveDamage` already encodes exactly
    // that and was called from nowhere; this is its first caller.
    //
    // `'Manager'` is passed as the band because `checkCapability` receives only
    // the role — the charge is not in scope here. So this gate is the WIDEST
    // legal set, and the Rs 25,000 banding is enforced where the amount is
    // known: `lib/damage`'s `approverFor(chargePaisa)` on the way in, and
    // `auth_can_approve_damage(charge)` in the database. UI ⊆ DB (P3) holds
    // either way — this can only ever be narrower than the policy, never wider.
    //
    // Revert: `return rbac.canWriteSharedTriage(ctx.role);`
    case 'case.create':
      return rbac.isStaff(ctx.role);

    case 'case.resolve':
      return rbac.canApproveDamage(ctx.role, 'Manager');

    // Team notes (T4-04, migration 0185)
    case 'team_note.create':
      return rbac.canCreateTeamNote(ctx.role);
    case 'team_note.read':
      return rbac.canReadTeamNotes(ctx.role);
    case 'team_note.acknowledge':
      return rbac.canAcknowledgeTeamNote(ctx.role);
    case 'team_note.pin':
      return rbac.canPinTeamNote(ctx.role);
    case 'team_note.archive':
      return rbac.canArchiveTeamNote(ctx.role);
    case 'team_note.resolve':
      return rbac.canResolveTeamNote(ctx.role);

    // Shift handovers (T4-05, migration 0186)
    case 'shift_handover.create':
      return rbac.canCreateShiftHandover(ctx.role);
    case 'shift_handover.read':
      return rbac.canReadShiftHandovers(ctx.role);
    case 'shift_handover.acknowledge':
      return rbac.canAcknowledgeShiftHandover(ctx.role);
    case 'shift_handover.archive':
      return rbac.canArchiveShiftHandover(ctx.role);

    // Delivery dispatch (T4-01, T4-02, migrations 0165/0187/0191)
    case 'delivery.create':
      return rbac.canCreateDeliveryJob(ctx.role);
    case 'delivery.assign':
      return rbac.canAssignDeliveryDriver(ctx.role);
    case 'delivery.transition':
      return rbac.canTransitionDeliveryJob(ctx.role);
    case 'delivery.reschedule':
      return rbac.canRescheduleDeliveryJob(ctx.role);
    case 'delivery.view':
      return rbac.canViewDayRoute(ctx.role);
    case 'delivery.setRoutePosition':
      return rbac.canSetDeliveryRoutePosition(ctx.role);
    case 'delivery.setClientMapPin':
      return rbac.canSetClientMapPin(ctx.role);

    // Calendar feed tokens (T4-10, migration 0209)
    case 'calendar_feed.create':
      return rbac.canCreateCalendarFeedToken(ctx.role);
    case 'calendar_feed.revoke':
      return rbac.canRevokeCalendarFeedToken(ctx.role, ctx.targetUserId, ctx.userId);
    case 'calendar_feed.view':
      return rbac.canViewCalendarFeedTokenStatus(ctx.role, ctx.targetUserId, ctx.userId);

    // Delivery zones (T4-07, migration 0189)
    case 'delivery_zone.create':
      return rbac.canCreateDeliveryZone(ctx.role);
    case 'delivery_zone.read':
      return rbac.canReadDeliveryZones(ctx.role);
    case 'delivery_zone.manage':
      return rbac.canManageDeliveryZones(ctx.role);

    // Delivery proof (T4-03, migration 0211)
    case 'delivery.proof':
      return rbac.canAttachDeliveryProof(ctx.role);

    // Problem reports (T4-11, migration 0210)
    case 'problem_report.create':
      return rbac.canCreateProblemReport(ctx.role);
    case 'problem_report.read':
      return rbac.canReadProblemReports(ctx.role);
    case 'problem_report.manage':
      return rbac.canManageProblemReports(ctx.role);

    // Offer campaigns (T5-12, migration 0224)
    case 'offer_campaign.create':
    case 'offer_campaign.manage':
    case 'offer_campaign.send':
      return rbac.canManageOfferCampaigns(ctx.role);

    // Message templates (T5-13, B20, migration 0227)
    case 'settings.manage_templates':
    case 'comms.templates':
      return rbac.canManageMessageTemplates(ctx.role);

    // ⚠ FILED, not fixed: `crew.assign` is still `isStaff()`, but PERMISSIONS.md
    // §4.7 says `C+` and the §3 grid marks Crew Assist ✕ for Warehouse,
    // Technician and Driver. Left alone deliberately — there is no C+ role set
    // in this file, and every set here mirrors a live RLS policy by convention.
    // Inventing one without reading `crew_assignments`' policy would break that
    // convention. `bookCrew` is `implemented: false`, so nothing can reach it
    // today. See RULINGS-2026-09-08 R-25.
    case 'crew.assign':
      return rbac.canWriteSharedTriage(ctx.role);

    // Split off shared triage 23 Aug 2026 when 0064's restrictive policy went
    // live — the finance/admin five decide purchases; the mirror rule moved
    // this the same day the database did.
    case 'purchase.approve':
      return rbac.canApprovePurchase(ctx.role);
    default:
      return undefined;
  }
}

export function createAction<Input, Output>(config: ActionConfig<Input, Output>) {
  return async (input: Input, ctx?: ActionContext): Promise<Output> => {
    // 1. Fail closed on an unbuilt body -- before anything observable happens.
    if (config.implemented !== true) {
      throw new ActionNotImplementedError(config.name);
    }

    // 2. A real identity, or none at all. Never a default one.
    if (!ctx || !ctx.userId || !ctx.role) {
      throw new Error(
        `"${config.name}" was called without a session context. Pass the signed-in user's ` +
          `id and role - the dispatcher no longer substitutes a default identity.`,
      );
    }

    // 3. Permissions, through the rules that already exist.
    const effectiveOnline = ctx.isOnline ?? (typeof navigator !== 'undefined' ? navigator.onLine : true);
    for (const capability of config.permissions) {
      const allowed = await checkCapability(capability, { ...ctx, isOnline: effectiveOnline });
      if (allowed !== true) {
        if (!effectiveOnline) {
          const allowedOnline = await checkCapability(capability, { ...ctx, isOnline: true });
          if (allowedOnline === true) {
            throw new ActionOfflineError(config.name, capability);
          }
        }
        throw new ActionPermissionError(config.name, capability, ctx.role);
      }
    }

    // 4. Validation.
    await config.validate(input);

    // 5. Execute, then emit. Events follow the write; they never precede it.
    const { result, events } = await config.execute(input, ctx);
    for (const event of events) {
      await DomainEvents.emit(event.type, event.payload);
    }

    return result;
  };
}
