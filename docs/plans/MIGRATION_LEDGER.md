# Migration ledger — claim a number before writing SQL

Three lanes write migrations in parallel. To stop two branches using the same number:

1. In your branch's **first commit**, add a row below with the next free number, your task id,
   a slug and your branch, status `claimed`.
2. Name the file `supabase/migrations/<number>_<slug>.sql`.
3. Update the status as it moves: `claimed → written → verified (check:pglite + check:lifecycle
   green in one run) → staging → live (batch N)`.
4. If a merge conflict on this file shows a collision, **the later merge renumbers** its file and
   its row (as 0175 → 0177 did on 25 Oct) and fixes every comment that cites the number.
5. Never reuse a number that exists in the repo **or** in the live ledger
   (`docs/live/schema_migrations_*.txt`). `0175` is unused on purpose — do not take it.

**Next free number: 0206**

| Number | Task | Slug | Branch | Status |
|---|---|---|---|---|
| 0178 | T2-reset | quantity-only-reset | lane-a/T2-quantity-reset | verified |
| 0179 | T2-04 | gate1-override-by-handover-staff | lane-a/T2-04-gate1-override | verified |
| 0180 | T2-05 | technician-floor-verbs | lane-a/T2-05-technician-floor | verified |
| 0181 | T2-03 | collateral-deposit-id-card | lane-a/T2-03-collateral-deposit | verified |
| 0182 | T2-12 | client-collectors-and-id-on-file | lane-a/T2-12-client-collectors-and-id-on-file | verified |
| 0183 | T2-13 | reset-self-qc-when-alone | lane-a/T2-13-self-qc-when-alone | verified |
| 0184 | T2-06 | repair-job-closes-damage | lane-a/T2-06-repair-job-closes-the-damage | verified |
| 0185 | T4-04 | team-notes | lane-b/T4-04-team-notes-repair | verified |
| 0186 | T4-05 | shift-handovers | lane-b/T4-05-shift-handover-on-the-database | verified |
| 0187 | T4-01 | delivery-dispatch-rpcs | lane-b/T4-01-delivery-dispatch-on-the-database | verified |
| 0188 | T3-smart-reservations | smart-reservation-holds | lane-c/T3-smart-reservations | verified |
| 0189 | T4-07 | delivery-zones | lane-b/T4-07-delivery-zones | verified |
| 0190 | T4-08 | one-time-rider-link | lane-b/T4-08-one-time-rider-link | verified |
| 0191 | T4-02 | delivery-reschedule-rpc | lane-b/T4-02-reschedule-a-delivery | verified |
| 0192 | T5-01 | notification-records | lane-b/T5-01-notification-records | claimed |
| 0193 | T3-14a | invoice-write-hardening | lane-c/T3-14a-invoice-write-hardening | verified |
| 0194 | T2-15 | reset-damage-opens-case | lane-a/T2-15-damage-found-during-reset | verified |
| 0195 | T8-01 | load-membership-plans | lane-a/T8-01-load-babin-s-plans | verified |
| 0196 | T8-02 | membership-plans-admin | lane-a/T8-02-plans-admin-screen | verified |
| 0197 | T8-03 | membership-plan-change-credit | lane-a/T8-03-change-plan-with-credit-for-unused | verified |
| 0198 | T8-04 | renew-client-membership | lane-a/T8-04-renew-a-lapsed-membership | verified |
| 0199 | T8-08 | tds-on-crew-payouts | lane-a/T8-08-tds-on-crew-payouts | verified |
| 0200 | T3-14b | draft-at-confirm | lane-c/T3-14b-draft-at-confirm | claimed |
| 0201 | T8-09 | collateral-masking-chars | (main, 1 Nov) | written |
| 0202 | T8-09 | staff-discount-is-money-setting | claude/file-update-d4b7b1 | verified |
| 0203 | SEC-05/W68 | restore-driver-client-view-scopes | fix/2026-11-01-driver-client-view-scope-0203 | written; staging required |
| 0204 | T4-08 | rider-link-v2-contract-fix | fix/2026-11-02-rider-link-contract-0204 | verified |
| 0205 | T3-14b | extend-booking-without-draft | claude/ecc-repo-setup-728bf3 | verified |

## Expected migrations (not yet claimed)

Listed so lanes can see what is coming. A card marked "if needed" may turn out not to need one.

| Task | What the migration does |
|---|---|
| T2-06 | Maintenance job ↔ damage finding link; clearance on completion |
| T3-03 | Cancellation tiers table (if not a settings key) |
| T3-04 | Invoice VAT treatment + backfill |
| T3-07 | Opening balances (append-only) |
| T4-02 | Delivery reschedule RPC (if needed) |
| T4-03 | Delivery proof evidence link (if needed) |
| T4-05 | `shift_handovers` + acknowledgements |
| T5-01 / T5-05 | `notifications`, event triggers, `notification_preferences` |
| T5-03 | `email_log` |
| T5-04 | Morning digest query function + cron schedule |
| T7-02 | `public_catalogue_v`, `public_availability()`, `catalogue` bucket |
| T7-03 | Portal binding + RLS ending the `portal_*` deny-all |
| T7-04 | `booking_requests` + lines |
| T7-05 | `payment_intents` + allocation function |
| T7-07 | Online refunds (if a separate table is needed) |
| T8-02 | `save_membership_plan` RPC (if needed) |
| T8-03 / T8-04 | Membership change with credit; renewal |
| T8-06 | Crew overtime fraction (if needed) |
| T8-08 | Stored TDS on payouts |
| T9-02 | `external_holds` in the availability check |
| T2-12 | `client_id_documents` (or the client document store) + `client_collectors`, masked ID columns |
| T2-13 | `qc_self_checked` flag; CHECK becomes `qc_by <> cleaned_by or qc_self_checked` |
| T3-12 | `product_aliases` (if needed) |
| T3-13 | product "similar to" link (if needed) |
| T3-14 | Draft invoice on Confirm, re-sync while Draft, issue on full payment |
| T3-18 | `change_booking(jsonb)` RPC, linked-booking column, `rental.change` |
| T3-21 | search indexes (if a query is slow) |
| T4-07 | delivery zones table (if not a settings key) |
| T4-08 | `delivery_job_links` (hashed tokens, expiry, revoke) + link RPCs |
| T5-07 / T5-08 | `client_message_events`, cron jobs, `reminders_paused` on clients |
| T5-09 | `push_subscriptions` |
| T7-02 | `show_online`, `online_bundle_only` on products (with the catalogue view) |
| T8-09 | staff-client link (if needed) |
| T1-17 | `aal2` test in `auth_can_view_money()` and the money-write checks, behind an Owner-only setting (27 Oct) |
| T1-18 | `sign_in_events` (definer-written, Owner/Admin read) |
| T2-19 | Return gate: flagged lines need a signature or a recorded refusal |
| T2-21 | planned downtime (a `Downtime` hold or its own table, guarded both ways) |
| T2-22 | reservation range widened by turnaround or per-product prep/cleaning minutes |
| T2-23 | `products.allow_overbooking`, short quantity on lines |
| T2-24 | `temporary_stock` + partner units, money-masked cost |
| T3-25 | `bookings.tags` + GIN index + set-tags function |
| T3-26 | `bookings.project_name`, `shoot_location`; `create_booking` accepts both |
| T3-27 | `Pro Forma` added to `document_type` |
| T3-28 | `bookings.rental_day_start`; Owner/Admin-only setting row |
| T3-29 | at-risk record; `gate.extend.clash` decision row |
| T3-30 | `products.unit_sale_price`; restock movements; `add_consumable_line` |
| T3-31 | `create_counter_sale(jsonb)` |
| T4-09 | address map pin; route position on delivery jobs |
| T4-10 | `calendar_feed_tokens` (hashed) + feed function |
| T4-11 | `problem_reports` + private photo bucket |
| T4-12 | `bulk_update_products` (reuses the 0173 section rules) |
| T5-12 | `offer_campaigns` + recipients + unsubscribe tokens |
| T5-13 | `message_templates` (versioned) |
| T7-12 | `product_recommendations` + scheduled refresh |
| T7-13 | `product_families`, `products.family_id`, `option_label` |
| T7-14 | Away check in the request function (inside T7-04's migration if still open) |
| T7-15 | payment links on `payment_intents` (booking, hashed token, expiry) |
| T7-17 | old store slug beside `external_refs` (if a new entity type is needed) |
