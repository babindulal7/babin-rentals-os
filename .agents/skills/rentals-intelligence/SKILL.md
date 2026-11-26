---
name: rentals-intelligence
description: Plan and validate Babin Rentals cinema-equipment kits, planning quotes, compatibility, field safety, maintenance, monsoon protocols, and fleet decisions. Use for internal rental intelligence; it cannot confirm live availability, payments, approvals, or client-final prices.
---

# Babin Rentals Intelligence

Use this skill to turn a production brief or operational question into a traceable equipment, safety, or fleet decision for Babin Rentals. It has local policy and planning data only. Do not represent its results as live operational facts.

## Operating boundary

- **Authoritative Ledger:** The local catalog (`data/rental_catalog.json`) is the source of truth for supported planning items and their aliases.
- **Rates Status:** All current catalog rates are `PLANNING_ESTIMATE`. A calculation can support planning, but it cannot be finalized or presented as a client quote until an owner-approved current rate card is supplied.
- **Whole Rupee Standard (RULINGS-2026-11-22):** All client-facing money figures must be formatted in whole rupees (`Rs 2,100`), suppressing decimals and paisa.
- **Live Records:** Live availability, account balances, payment status, deposits received, and approvals require an external operational record. There is no live Booqable connection.
- **Data Provenance:** Read `data/data_manifest.json` when the data source or freshness of a conclusion matters. Surface its usage mode with analysis results.

## Decision rules

1. **Deterministic Calculations:** For money, policies, compatibility, or safety, use the relevant deterministic script or verified local data. Monetary calculations use integer paisa and half-up rounding.
2. **Availability Rule:** Use `AVAILABLE` only when a live operational record says so. `RETURNED`, `HOLD`, `INSPECTION`, and `MAINTENANCE` are not available.
3. **Deposits are Liabilities:** Exclude security deposits from rental total, payments, and outstanding balance (Law 5).
4. **Discount Gates (Law 10):** Discounts above 10% require a reason of at least 10 characters and a named approver; 25% is the hard cap.
5. **Canonical Catalog IDs:** Recommend only catalogued equipment. If an item is unknown or ambiguous, ask for the canonical `BRPI-*` ID instead of guessing.
6. **Hard Conflicts:** Treat hard conflicts as blockers. Do not turn them into optional suggestions (e.g. Ronin 4D + external gimbal = REJECT; CHIOPT without rods/support = REJECT).
7. **Monsoon Protocols (June–September):** Automatically check Monsoon Mode. Mandate silica/pelican transport, 24-hour dry-cabinet quarantine before returning to available, and rain reschedule policies.
8. **Manager Approvals to Owner (R-22.1 / R-22.8):** Damage under Rs 25,000, late fee waivers, and extension clashes route to Owner when designated by settings.

Use this response shape for substantial decisions: situation, evidence, constraints, options, recommendation, confidence/data status, and required action. Keep simple lookups short.

## Kit intelligence & auto-completion

Run the kit intelligence engine to validate complete packages, hard conflicts, and budget ladders:

```python
from kit_intelligence import complete_kit, recommend_kit

# Validate kit completeness and check hard blocks
result = complete_kit(["Sony FX3A Body", "Sony 24-70 GM II"])

# Recommend package for a shoot type
recommendation = recommend_kit(shoot_type="wedding", budget_level="mid", crew_size=3)
```

Read [references/shoot_playbooks_and_ladders.md](references/shoot_playbooks_and_ladders.md) for complete shoot-type production blueprints.

## Quote and booking planning

Run the validator for a planning quote:

```powershell
python scripts/validate_booking.py --items "Sony FX3A" "Tamron 70-180" --days 3 --shoot-date 2026-07-15 --outdoor --shoot-hours 8 --temp 10
```

## Training Center & Golden Evaluation Suite (TQC-01)

Evaluate all 47 synthetic golden cases and 105 real pilot cases offline through the ID-blind deterministic `scripts/intelligence_router.py`:

```powershell
python scripts/training_center_eval.py
```

Run the complete Babin Rentals OS evaluation suite (143 scenarios across 27 suites):

```powershell
python scripts/run_eval_suite.py
```

For quantities and canonical IDs, use JSON:

```json
{
  "items": [
    { "product_id": "BRPI-SONY-FX3A-BODY", "quantity": 2 },
    { "product_id": "BRPI-DJI-RS4PRO", "quantity": 1 }
  ],
  "days": 5
}
```

```powershell
python scripts/validate_booking.py --json-file booking.json
```

The validator resolves exact aliases and canonical IDs, consolidates duplicates, reports additions and blockers, and returns a `quote_status`. `PLANNING_ONLY` always blocks client finalization. Read [references/decision_framework.md](references/decision_framework.md) for complete production decisions.

## Smart Equipment Intake Workflow

When adding or updating equipment, execute the 6-step intake flow to avoid duplicate models or invented specs:

1. **Model Search & Dedupe:** Match existing `BRPI-*` catalogue models and exact aliases first.
2. **Sourced Specs:** Extract structured specs labeled `OEM_DOCUMENTED`, `BABIN_BENCH_TESTED`, or `UNREVIEWED_DRAFT`.
3. **Relationships:** Suggest children using the 8 canonical relationship types (`included_mandatory`, `included_optional`, `required_to_operate`, `compatible_accessory`, `recommended_addon`, `chargeable_extra`, `containment`, `bundle_component`).
4. **How-To & Dual Checklists:** Generate static model instructions and decouple from durable booking checklist runs.
5. **Physical Stock & Policy:** Record physical serials, select tracking mode (`Serialised`, `Quantity`, `Consumable`), and set intake condition (`Excellent`, `Good`, `Fair`, `Damaged`, `Lost`).
6. **Diff Ledger:** Generate side-by-side audit before saving.

Read [references/smart_equipment_workflow.md](references/smart_equipment_workflow.md) and [references/how_to_and_checklists.md](references/how_to_and_checklists.md).

## Route by task

- **Kit auto-completion, hard conflicts, and shoot playbooks:** use `scripts/kit_intelligence.py` and [references/shoot_playbooks_and_ladders.md](references/shoot_playbooks_and_ladders.md).
- **Monsoon mode, humidity, high-altitude, and electrical safety:** use `scripts/monsoon_intelligence.py`, `scripts/calculate_power_media.py`, and [references/monsoon_and_safety_playbook.md](references/monsoon_and_safety_playbook.md).
- **Client personas and due recovery messaging:** use `scripts/client_intelligence.py` and [references/client_communications.md](references/client_communications.md).
- **Equipment intake and relationship taxonomy:** use `scripts/smart_equipment_entry.py` and [references/smart_equipment_workflow.md](references/smart_equipment_workflow.md).
- **Discounts, advances, late fees, damage, deposits, lifecycle, and access boundaries:** use `scripts/os_engine.py` and [references/os_architecture.md](references/os_architecture.md).
- **Fleet investment, procurement, profit leakage, and scenarios:** use `scripts/recommend_asset_action.py`, `scripts/calculate_landed_and_fleet_roi.py`, `scripts/detect_profit_leakage.py`, and [references/profit_leakage_playbook.md](references/profit_leakage_playbook.md).

## Data authority

Use the source that owns the fact:

- **Babin Operational Records:** Govern current rates, stock condition, availability, account state, and approvals.
- **OEM Documentation:** Governs physical, electrical, media, and compatibility limits.
- **Verified Babin Bench Tests:** Govern observed fit and workflow behavior, without overriding OEM safety limits.
- **Authorized Dealers & Market Research:** Provide market context and planning estimates.
- **Community Reports:** Advisory only.

## Tool contract

```python
complete_kit(items)
recommend_kit(shoot_type, budget_level, crew_size, location)
is_monsoon_mode(target_date_iso)
get_monsoon_adjustments(items, is_outdoor, target_date_iso)
get_client_persona(client_name, order_count, flags)
draft_due_recovery_message(client_name, amount_due_paisa, day_stage)
step1_search_and_deduplicate(query, catalog_products)
step2_suggest_specifications(model_name, category)
step3_suggest_relationships(model_name, category)
step4_generate_guide_and_checklists(model_name)
step5_validate_stock_and_policy(units, tracking_mode, rates)
step6_generate_review_ledger(proposed_data, existing_data)
price(equipment, sub_rental, services, crew, transport, discount_percent, vat_percent, payments)
validate_discount(percent, reason, approver_name)
validate_advance(rental_total_paisa, advance_paid_paisa)
calculate_late_fee(overage_minutes, day_rate_paisa)
validate_damage_report(photos, description, charge_paisa, replacement_paisa, route_manager_to_owner)
settle_deposit(deposit_paisa, damage_paisa)
check_booking_conflict(start_date, end_date, existing_bookings)
```

Validate the skill after any change:

```powershell
python scripts/run_eval_suite.py
```
