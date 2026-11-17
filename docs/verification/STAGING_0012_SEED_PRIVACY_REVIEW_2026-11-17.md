# Mandatory synthetic-only seed decision — 0012

**Observed:** 17 Nov 2026  
**Source main:** `2207c5f0ce5de9ed0b689836cd0224c3154a5a4b` (seed source blob `3e69f9cabf9df71f5a7ef2e371dfa6f89846d6f0`)  
**Scope:** Safety classification, not SQL execution or a production-data authorization.

## What is in `0012_seed_data.sql`

The initial seed includes nine `INSERT INTO` sections:

1. `number_sequences` — booking/client/invoice/payment/deposit/expense/inventory counters
2. `branches` — synthetic-looking Kathmandu/Pokhara location/contact/PAN fields
3. `warehouses` — branch-linked storage locations
4. `storage_zones` — racks and physical areas
5. `users` — employee IDs, names, company-domain emails and phone-looking numbers
6. `fiscal_periods` — FY dates
7. `bank_accounts` — named financial institution/wallet and **plausible account-number strings**
8. `expense_categories` — accounting category seed
9. `inventory_categories` — camera/lens/light etc. categories

These seeded details are **not verified as real or fake**; names and bank/account numbers may resemble actual people or business accounts. They are unsuitable for blind replay in a hosted environment with email, WhatsApp, payment integrations or external access.

## Approved safe default for staging design

- Do **not** replay the original `0012` into hosted staging without a reviewed replacement or explicit field anonymization decision.
- Retain stable primary-key and foreign-key relationships for structural tests while substituting **non-deliverable** identity values and non-transactable financial placeholders, after validating column constraints.
- Use reserved email domains such as `example.invalid`, disable outbound email/WhatsApp and payment handlers in staging, and do not choose a live-looking phone number as the identity for a synthetic user.
- Replace financial and bank routing values with fixtures whose format is approved for tests but cannot initiate real transfers; never use actual merchant keys or real account numbers.
- Add **two separate test clients** and nine role-specific Auth identities only after the schema is installed; verify client A/B access and warehouse/driver money blindness via PostgREST and Storage.
- Do not modify original `0012` on a production path or rewrite migration history. If staging must use a deterministic replacement for `0012`, keep it in a *staging-only*, reviewed apply manifest. Preserve original file identity and source lineage.

## What blocks the next permanent staging migration

A deterministic synthetic seed decision must specify: exactly which tables require records to unblock later SQL, what unique/FK keys remain stable, which personal/financial fields are replaced, and how outbound communications/payments are prevented. Then re-run local rebuilding/gates and have a second agent inspect it.

**No hosted `0012` seed was executed.** The staging database remains empty after the `0001`–`0011` rollback-only proof. This is a privacy/identity and data-dependency gate, not a claim that `0012` is malicious.

See [the hosted rehearsal](STAGING_HOSTED_REHEARSAL_2026-11-17.md) and [the source/live migration audit](STAGING_SOURCE_VS_LIVE_2026-11-17.md).
