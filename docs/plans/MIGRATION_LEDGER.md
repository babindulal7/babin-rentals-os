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

**Next free number: 0249**  (0241 R-9.10, 0242 R-9.12, 0243 R-9.13 unmerged; 0245 R-9.8 on its own branch; 0244, 0246, 0247 and 0248 R-9.18 here)

> **Legacy exception:** `0188` exists as two distinct, locally verified migration files
> (`0188_smart_reservation_holds.sql` and `0188_staff_renting_gear.sql`). Both are preserved because
> later verified migrations depend on their applied order; do not rename, edit or reuse either one.

| Number | Task | Slug | Branch | Status |
|---|---|---|---|---|
| 0238 | T3-30 | consumables-pricing-restock-and-low-stock | lane-c/T3-30-consumables-unit-price-add-at-the | verified |
| 0237 | T3-28 | rental-day-start-setting | lane-c/T3-28-rental-day-start-as-a-setting | verified |
| 0225 | T0-12 / T6 glossary | owner-approved-glossary-revisions | lane-a/T0-12-main-integration | APPLIED live 7 Nov 2026 as 20261107105159 after validated backup; 17 local gates and live DB/RLS/RPC post-checks PASS; hosted/device acceptance pending |
| 0224 | T5-12 | offer-campaigns-and-recipients | lane-b/T5-12-offer-emails-to-clients | verified |
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
| 0188 | T8-09 | staff-renting-gear | main (`d6d2fae7`) | verified; legacy duplicate number |
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
| 0206 | T4-09 | delivery-route-map-pins | lane-b/T4-09-delivery-route-map-pins | verified |
| 0207 | T8-06 | crew-overtime-half-full-day | lane-a/T8-06-crew-overtime-half-or-full-day | verified |
| 0208 | T1-15 | staff-pin-four-digits | lane-a/T1-15-switch-user-with-name-plus-pin | verified |
| 0209 | T4-10 | calendar-feed-tokens | lane-b/T4-10-jobs-in-phone-calendars | verified |
| 0210 | T4-11 | problem-reports | lane-b/T4-11-report-a-problem | verified |
| 0211 | T4-03 | delivery-proof | lane-b/T4-03-delivery-proof | verified |
| 0212 | T3-03 | cancellation-fee-tiers | lane-c/T3-03-cancellation-fee-tiers | written |
| 0213 | T3-04 | non-vat-bills | lane-c/T3-04-non-vat-bills | written |
| 0214 | T3-07 | opening-balances | lane-c/T3-07-opening-balances | written |
| 0215 | T5-03 | email-sending-and-log | lane-b/T5-03-email-sending-service | written |
| 0216 | T5-04 | morning-digest-schedule-and-query | lane-b/T5-04-morning-digest | written |
| 0217 | T5-05 | notification-preferences | lane-b/T5-05-notification-preferences | written |
| 0218 | T5-07 | client-message-events | lane-b/T5-07-automatic-client-emails | written |
| 0219 | T5-08 | payment-reminders | lane-b/T5-08-payment-reminders | written |
| 0220 | T5-09 | push-subscriptions | lane-b/T5-09-phone-pop-ups | written |
| 0221 | T2-17 | guard-unit-identity-edits | lane-a/T2-17-unit-editor-permissions-preflight | verified (check:pglite 221/221) |
| 0222 | T3-smart-reservations | repair-confirm-booking-atomic-and-reservation-dedup | audit/system-design-consistency-20261105 | verified |
| 0223 | T3-12 | product-aliases | lane-c/T3-12-paste-a-whatsapp-gear-list | verified (check:pglite 220/220 + check:lifecycle 63/63) |
| 0224 | T5-12 | offer-campaigns-and-recipients | lane-b/T5-12-offer-emails-to-clients | verified |
| 0226 | T4-12 | bulk-update-products | lane-b/T4-12-bulk-edit-products | verified |
| 0227 | T5-13 | message-templates | lane-b/T5-13-edit-email-and-document-texts | verified |
| 0228 | R-9.2 | membership change keeps join date (`keep_join_date`) | lane-b/ux-polish-forgiveness-and-sync | written, not applied (N-5) |
| 0229 | T3-25 | booking-tags | lane-c/T3-25-tags-on-bookings | verified (check:pglite 226/226 + check:lifecycle 68/68 Step L68) |
| 0230 | T3-26 | project-name-and-shoot-location | lane-c/T3-26-project-name-and-shoot-location-on | verified |
| 0231 | T3-27 | pro-forma-document-type | lane-c/T3-27-pro-forma-invoice-from-the-draft | verified (check:pglite 228/228 + check:lifecycle 71/71 Step L71) |
| 0232 | T4-security | secure-temporary-hold-rpcs | repair/pr-55-hold-auth | verified (PR #133 merged) |
| 0233 | T3-security | extend-booking-and-resync-auth | repair/pr-53-invoice-extension-auth | verified (PR #135 merged) |
| 0234 | T2-18 | return-damage-photo-per-unit | lane-a/T2-18-finish-evidence-capture-what-t2-16 | verified (PR #80 merged) |
| 0235 | T4-09-security | delivery-route-branch-hardening | fix/t4-09-route-branch-hardening-0209 | verified |
| 0236 | T3-07 | opening-balances-append-only | lane-c/T3-07-opening-balances | written |
| 0237 | T2-21 | planned-equipment-downtime | lane-a/T2-21-planned-downtime-with-a-reason | verified (check:pglite 236/236 + check:lifecycle 78/78 Step L73) |
| 0238 | T3-28 | rental-day-start-setting | lane-c/T3-28-rental-day-start-as-a-setting | verified (check:pglite 235/235 + check:lifecycle 77/77) |
| 0239 | T3-30 | consumables-pricing-restock-and-low-stock | lane-c/T3-30-consumables-unit-price-add-at-the | verified (check:pglite 236/236 + check:lifecycle 76/76 Step L73) |
| 0240 | T2-22 | time-between-rentals-account-wide-or-per-product | lane-a/T2-22-time-between-rentals-account-wide-or | verified (check:pglite 236/236 + check:lifecycle 76/76 Step L74-L75) |
| 0244 | R-9.18 / R-9.20 | delivery-zone-vehicle-fee-grid | feat/r-9-18-delivery-fee-grid | written, not applied (N-5); 0241 R-9.10, 0242 R-9.12, 0243 R-9.13 are on unmerged branches |
| 0246 | O-28 / O-30 | dispatch-zone-fee-from-grid | feat/r-9-18-delivery-fee-grid | written, not applied (N-5); needs 0244 first; 0245 is R-9.8 on its own branch |
| 0247 | O-28 | retire-per-zone-fee-on-create | feat/r-9-18-delivery-fee-grid | written, not applied (N-5); column kept, fee optional on create; needs 0244 and 0246 |
| 0248 | O-28b | delivery-zone-distance-band | feat/r-9-18-delivery-fee-grid | written, not applied (N-5); own table, read by staff roles, written by Owner/Admin/Manager; check only, no price depends on it; needs 0189 |

## Expected migrations (not yet claimed)
