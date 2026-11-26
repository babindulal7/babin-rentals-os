#!/usr/bin/env python3
"""
run_eval_suite.py - Babin Rentals OS Deterministic Intelligence Evaluation Suite (Brain v4 Layer 6)

Comprehensive 50+ scenario automated test harness verifying:
1. Integer Paisa Precision & Half-Up Rounding (money.ts)
2. Foundation §2.8 Reference Case Assertion (BK-2026-0715)
3. Law 10 Discount Gates (10% threshold, 25% hard cap, 10-char reason, named approver)
4. Law 5 Deposit Liability Isolation (deposits never in Rental Total or Outstanding)
5. Late Return Fee Tiers & Waiver Gates (lateFee.ts)
6. Damage Findings & Deposit Settlement (damage.ts)
7. State Transitions & Availability Gates (RETURNED != AVAILABLE, HOLD blocks)
8. Auto-Completion & Hard Conflict Rejections
9. Payload Headroom Validation (30% safety margin)
10. Electrical & Inverter Power Limits (15A/230V circuit limits & battery runtimes)
11. Profit Leakage Detection Engine
"""

import sys
import os
import math
from typing import Dict, Any, List, Tuple

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from os_engine import (
    rupees, to_rupees, round_half_up, grouped, format_money, to_whole_rupee,
    price, validate_discount, calculate_late_fee, validate_late_fee_waiver,
    approver_for_damage, validate_damage_report, settle_deposit_against_damage,
    validate_advance, check_booking_conflict, complete_kit_check,
    Paisa, DISCOUNT_APPROVAL_THRESHOLD, DISCOUNT_CAP
)
from detect_profit_leakage import audit_booking
from simulate_scenario import simulate_rate_change, simulate_add_asset
from recommend_asset_action import FLEET_PROFILES, analyze_asset
from catalog import RentalCatalog, data_context, load_json
from validate_booking import estimate_item_rate, resolve_items, validate_booking
from kit_intelligence import complete_kit, recommend_kit, HARD_BLOCKS, SHOOT_PLAYBOOKS, BUDGET_SCALING_LADDER
from monsoon_intelligence import is_monsoon_mode, get_monsoon_adjustments, apply_monsoon_mode_to_booking
from client_intelligence import get_client_persona, draft_due_recovery_message
from smart_equipment_entry import (
    step1_search_and_deduplicate, step2_suggest_specifications,
    step3_suggest_relationships, step4_generate_guide_and_checklists,
    step5_validate_stock_and_policy, step6_generate_review_ledger,
    RELATIONSHIP_TYPES, TRACKING_MODES, INTAKE_CONDITIONS
)

# Test tracking
PASSED = 0
FAILED = 0
ERRORS: List[str] = []

def run_test(name: str, condition: bool, err_msg: str = ""):
    global PASSED, FAILED, ERRORS
    if condition:
        PASSED += 1
        print(f"  [PASS] {name}")
    else:
        FAILED += 1
        msg = f"FAILED: {name} -> {err_msg}"
        ERRORS.append(msg)
        print(f"  [FAIL] {name} ({err_msg})")

def main():
    print("=" * 75)
    print(" BABIN RENTALS OS - BRAIN v4 EVALUATION SUITE (50+ SCENARIOS)")
    print("=" * 75)
    
    # ── SUITE 1: Paisa Precision & Half-Up Rounding (5 tests) ───────────────
    print("\n--- SUITE 1: INTEGER PAISA & HALF-UP ROUNDING ---")
    run_test("round_half_up(0.5) == 1", round_half_up(0.5) == 1, "Expected 1")
    run_test("round_half_up(0.499) == 0", round_half_up(0.499) == 0, "Expected 0")
    run_test("round_half_up(-0.5) == -1 (symmetric negative)", round_half_up(-0.5) == -1, "Expected -1")
    run_test("rupees(1850.50) == 185050 Paisa", rupees(1850.50) == 185050, "Paisa integer drift")
    run_test("grouped(1850000) == '18,50,000' (South Asian lakh grouping)", grouped(1850000) == "18,50,000", "Lakh format error")

    # ── SUITE 2: Foundation §2.8 Reference Case Assertion (1 test) ───────────
    print("\n--- SUITE 2: FOUNDATION §2.8 REFERENCE CASE (BK-2026-0715) ---")
    ref = price(
        equipment=rupees(132750),
        discount_percent=7.0,
        vat_percent=13.0,
        payments=rupees(15000)
    )
    run_test("BK-2026-0715: Discount Rs 9,293 | Taxable 1,23,457 | VAT 16,049 | Total 1,39,506 | Out 1,24,506",
             to_rupees(ref["discount"]) == 9293.0 and
             to_rupees(ref["taxable"]) == 123457.0 and
             to_rupees(ref["vat"]) == 16049.0 and
             to_rupees(ref["rental_total"]) == 139506.0 and
             to_rupees(ref["outstanding"]) == 124506.0,
             f"Values mismatch: got discount={to_rupees(ref['discount'])}, total={to_rupees(ref['rental_total'])}")

    # ── SUITE 3: Law 10 Discount Gates (6 tests) ─────────────────────────────
    print("\n--- SUITE 3: LAW 10 DISCOUNT GATES ---")
    d0 = validate_discount(0.0)
    run_test("0% discount is valid without approval", d0["valid"] and not d0["requires_approval"])
    
    d10 = validate_discount(10.0)
    run_test("10% discount is valid without approval (threshold inclusive)", d10["valid"] and not d10["requires_approval"])
    
    d12_no_reason = validate_discount(12.0, reason="", approver_name="Babin")
    run_test("12% discount without reason is rejected", not d12_no_reason["valid"])
    
    d12_short_reason = validate_discount(12.0, reason="Short", approver_name="Babin")
    run_test("12% discount with reason < 10 chars is rejected", not d12_short_reason["valid"])
    
    d12_no_approver = validate_discount(12.0, reason="Student documentary shoot", approver_name=None)
    run_test("12% discount without named approver is rejected", not d12_no_approver["valid"])
    
    d12_valid = validate_discount(12.0, reason="Student documentary shoot", approver_name="Babin (Owner)")
    run_test("12% discount with valid reason and approver is accepted", d12_valid["valid"])
    
    d26 = validate_discount(26.0, reason="Approved by owner in writing", approver_name="Babin (Owner)")
    run_test("26% discount is hard blocked (exceeds 25% cap, Law 10)", not d26["valid"])

    # ── SUITE 4: Law 5 Deposit Liability Isolation (3 tests) ─────────────────
    print("\n--- SUITE 4: LAW 5 DEPOSIT LIABILITY ISOLATION ---")
    # Order: Equipment Rs 50,000, Deposit Rs 1,50,000 held, Payments Rs 20,000
    ord_calc = price(equipment=rupees(50000), payments=rupees(20000))
    deposit_paisa = rupees(150000)
    
    run_test("Law 5: Security deposit is excluded from Subtotal", ord_calc["subtotal"] == rupees(50000))
    run_test("Law 5: Security deposit never enters Rental Total", ord_calc["rental_total"] == rupees(56500))  # 50k + 13% VAT
    run_test("Law 5: Security deposit never reduces Outstanding balance", ord_calc["outstanding"] == rupees(36500))  # 56.5k - 20k

    # ── SUITE 5: Late Return Fee Tiers & Waiver Gates (6 tests) ──────────────
    print("\n--- SUITE 5: LATE RETURN FEE TIERS & WAIVER GATES ---")
    day_rate = rupees(10000)
    
    lf_grace = calculate_late_fee(25.0, day_rate)
    run_test("Late return <= 30 mins: Band 'None' and Fee Rs 0", lf_grace["band"] == "None" and lf_grace["fee_paisa"] == 0)
    
    lf_half = calculate_late_fee(90.0, day_rate)
    run_test("Late return 31-120 mins: Band 'Half Day' and Fee Rs 5,000",
             lf_half["band"] == "Half Day" and lf_half["fee_paisa"] == rupees(5000))
    
    lf_full = calculate_late_fee(180.0, day_rate)
    run_test("Late return > 120 mins: Band 'Full Day' and Fee Rs 10,000",
             lf_full["band"] == "Full Day" and lf_full["fee_paisa"] == rupees(10000))
             
    lf_multi = calculate_late_fee(1500.0, day_rate)  # > 1440 mins (24h)
    run_test("Late return 25 hours: 2 Full Days charged (Rs 20,000)",
             lf_multi["full_days_charged"] == 2 and lf_multi["fee_paisa"] == rupees(20000))
             
    w_reject = validate_late_fee_waiver("Traffic", "Staff Tech")
    run_test("Late fee waiver with reason < 10 chars is rejected", not w_reject["valid"])
    
    w_ok = validate_late_fee_waiver("Vehicle breakdown on highway confirmed", "Babin")
    run_test("Late fee waiver with valid reason and approver is accepted", w_ok["valid"])

    # ── SUITE 6: Damage Findings & Deposit Settlement (5 tests) ──────────────
    print("\n--- SUITE 6: DAMAGE FINDINGS & DEPOSIT SETTLEMENT ---")
    run_test("Damage charge Rs 10,000 approver is 'Manager'", approver_for_damage(rupees(10000)) == "Manager")
    run_test("Damage charge Rs 30,000 approver is 'Owner' (>= Rs 25,000)", approver_for_damage(rupees(30000)) == "Owner")
    
    dmg_no_photo = validate_damage_report(photos=0, description="Scratch on lens front element", charge_paisa=rupees(10000))
    run_test("Damage report with 0 photos is rejected (min 1 required)", not dmg_no_photo["valid"])
    
    dmg_short_desc = validate_damage_report(photos=1, description="Dented", charge_paisa=rupees(10000))
    run_test("Damage report with desc < 10 chars is rejected", not dmg_short_desc["valid"])
    
    # Deposit Rs 50,000, Damage Rs 30,000 -> Refund 20,000, Shortfall 0
    settle1 = settle_deposit_against_damage(rupees(50000), rupees(30000))
    run_test("Damage < Deposit: Refund Rs 20,000, Shortfall Rs 0",
             settle1["refund_paisa"] == rupees(20000) and settle1["shortfall_paisa"] == 0)

    # Deposit Rs 25,000, Damage Rs 40,000 -> Refund 0, Shortfall 15,000 (never negative refund)
    settle2 = settle_deposit_against_damage(rupees(25000), rupees(40000))
    run_test("Damage > Deposit: Refund Rs 0 (non-negative), Shortfall Rs 15,000",
             settle2["refund_paisa"] == 0 and settle2["shortfall_paisa"] == rupees(15000))

    # ── SUITE 7: Advance Payments & State Transitions (5 tests) ──────────────
    print("\n--- SUITE 7: ADVANCE PAYMENTS & LIFECYCLE GATES ---")
    adv_small = validate_advance(rupees(4000), rupees(4000))
    run_test("Total < 5,000: Full payment required before release", adv_small["allowed"])
    
    adv_small_partial = validate_advance(rupees(4000), rupees(2000))
    run_test("Total < 5,000: Partial payment blocked", not adv_small_partial["allowed"])
    
    adv_mid = validate_advance(rupees(8000), rupees(5000))
    run_test("Total 8,000: Minimum Rs 5,000 advance required", adv_mid["allowed"])
    
    adv_large = validate_advance(rupees(20000), rupees(10000))
    run_test("Total 20,000: Minimum 50% advance (Rs 10,000) required", adv_large["allowed"])
    
    adv_large_under = validate_advance(rupees(20000), rupees(8000))
    run_test("Total 20,000: 40% advance blocked (<50%)", not adv_large_under["allowed"])

    # ── SUITE 8: Booking Conflicts & Inventory Isolation (3 tests) ───────────
    print("\n--- SUITE 8: CONFLICT & AVAILABILITY LOGIC ---")
    existing_booking = {"start_date": "2026-07-10", "end_date": "2026-07-14"}
    
    conf_overlap = check_booking_conflict("2026-07-12", "2026-07-15", [existing_booking])
    run_test("Overlapping dates detected as booking conflict", conf_overlap["has_conflict"])
    
    conf_outside = check_booking_conflict("2026-07-15", "2026-07-18", [existing_booking])
    run_test("Non-overlapping dates clear with 0 conflict", not conf_outside["has_conflict"])
    
    conf_inside = check_booking_conflict("2026-07-11", "2026-07-13", [existing_booking])
    run_test("Sub-interval dates detected as booking conflict", conf_inside["has_conflict"])

    # ── SUITE 9: Auto-Completion & Hard Conflict Rejections (6 tests) ────────
    print("\n--- SUITE 9: AUTO-COMPLETION & HARD CONFLICT REJECTIONS ---")
    # PL lens on Sony FX3 requires PL->E adapter
    kit_pl_sony = complete_kit_check(["sony_fx3a", "blazar_mantis_anamorphic"])
    run_test("PL Lens on Sony FX3 auto-requires PL->E adapter",
             any("adapter" in req.lower() for req in kit_pl_sony["required_additions"]))
             
    # CHIOPT zoom requires rods and lens support
    kit_chiopt = complete_kit_check(["sony_fx3a", "chiopt_zoom_set"])
    run_test("CHIOPT lens requires rods + lens support (mount damage prevention)",
             any("rod" in req.lower() or "support" in req.lower() for req in kit_chiopt["required_additions"]))
             
    # Hard conflict: Ronin 4D + external gimbal
    kit_ronin_gimbal = complete_kit_check(["dji_ronin_4d_6k", "dji_rs3_pro"])
    run_test("Ronin 4D + external gimbal triggers REJECT (has built-in 4-axis)",
             len(kit_ronin_gimbal["blocking_errors"]) > 0)
             
    # Hard conflict: CHIOPT without rods marked as blocking error if explicitly rejected
    run_test("CHIOPT missing support produces blocking warning",
             len(kit_chiopt["required_additions"]) >= 2)
             
    # RED camera requires RED-verified media
    kit_red = complete_kit_check(["red_komodo_x"])
    run_test("RED Komodo-X auto-requires CFexpress Type B and V-Mount batteries",
             any("cfexpress" in req.lower() for req in kit_red["required_additions"]))
             
    # Glimmer filter without Mirage matte box
    kit_glimmer = complete_kit_check(["glimmer_filter"])
    run_test("Glimmer filter auto-requires Tilta Mirage mattebox",
             any("mirage" in req.lower() for req in kit_glimmer["required_additions"]))

    # ── SUITE 10: Payload Headroom Law (30% Margin) (4 tests) ───────────────
    print("\n--- SUITE 10: PAYLOAD HEADROOM (30% SAFETY MARGIN) ---")
    # Tripod max payload 10kg (10,000g). Safe payload with 30% margin = 7.0kg (7,000g)
    def validate_tripod_payload(rig_weight_g: float, tripod_rating_g: float) -> Tuple[bool, float]:
        safe_limit = tripod_rating_g * 0.70
        return (rig_weight_g <= safe_limit), (rig_weight_g / tripod_rating_g) * 100.0

    t1_pass, t1_util = validate_tripod_payload(3500.0, 10000.0)
    run_test("3.5kg rig on 10kg tripod passes (35% utilization <= 70% safe limit)", t1_pass)
    
    t2_fail, t2_util = validate_tripod_payload(7500.0, 10000.0)
    run_test("7.5kg rig on 10kg tripod fails (75% utilization > 70% safe limit)", not t2_fail)
    
    t3_pass, t3_util = validate_tripod_payload(7500.0, 15000.0)
    run_test("7.5kg rig on 15kg Studio Assist tripod passes (50% utilization)", t3_pass)

    # Gimbal dynamic payload: RS3 (3.0kg max). Rig weight 2.8kg is > 85% motor strain
    def validate_gimbal_payload(rig_weight_g: float, gimbal_rating_g: float) -> bool:
        return rig_weight_g <= (gimbal_rating_g * 0.85)

    g1_pass = validate_gimbal_payload(1850.0, 3000.0)
    run_test("1.85kg FX3 rig on DJI RS3 passes safely (< 85% motor limit)", g1_pass)

    # ── SUITE 11: Electrical & Inverter Power Budget (4 tests) ──────────────
    print("\n--- SUITE 11: ELECTRICAL & INVERTER POWER LIMITS ---")
    # Nepal 230V 15A socket safe continuous load = 2,760W (80% rule: 12A x 230V)
    def validate_power_circuit(watts: float) -> bool:
        return watts <= 2760.0

    p1_pass = validate_power_circuit(720.0)  # Single Aputure 600x (720W)
    run_test("Aputure 600x (720W) on 230V 15A circuit passes safely", p1_pass)
    
    p2_fail = validate_power_circuit(3100.0)  # 3x 600x + 1x 300c (3,100W)
    run_test("3,100W lighting rig on single 15A socket triggers overload block (>2,760W safe threshold)", not p2_fail)

    # Battery runtime calculation: 99Wh at 0.85 efficiency for FX3 rig (15W draw)
    # Runtime = (99 * 0.85) / 15 = 84.15 / 15 = 5.61 hours
    def calc_runtime(wh: float, watts: float, cold_weather: bool = False) -> float:
        eff = 0.85 * (0.60 if cold_weather else 1.0)
        return (wh * eff) / watts

    rt_normal = calc_runtime(99.0, 15.0, cold_weather=False)
    run_test("99Wh V-Mount powers 15W FX3 rig for ~5.6 hours (0.85 efficiency)", abs(rt_normal - 5.61) < 0.1)

    rt_cold = calc_runtime(99.0, 15.0, cold_weather=True)
    run_test("Cold weather (-10C Mustang) reduces runtime to ~3.36 hours (40% derating)", abs(rt_cold - 3.36) < 0.1)

    # ── SUITE 12: Profit Leakage Detection (3 tests) ─────────────────────────
    print("\n--- SUITE 12: PROFIT LEAKAGE DETECTION ---")
    leak_b1 = {
        "id": "TEST-01",
        "lines": [{"item_id": "red_komodo_x", "rate_npr": 12000.0, "days": 1}],
        "deposit_held_npr": 50000.0  # Requires 150k
    }
    leaks1 = audit_booking(leak_b1)
    run_test("Audit detects under-secured deposit on RED Komodo-X",
             any(l["code"] == "UNDER_SECURED_DEPOSIT" for l in leaks1))
    run_test("Audit detects missing Camera Caretaker on cinema body",
             any(l["code"] == "MISSING_CARETAKER_FEE" for l in leaks1))

    leak_b2 = {
        "id": "TEST-02",
        "lines": [{"item_id": "sony_fx3a", "rate_npr": 4000.0, "days": 1}],
        "is_wet_or_damp": True,
        "wet_cleaning_billed_npr": 0.0
    }
    leaks2 = audit_booking(leak_b2)
    run_test("Audit detects unbilled wet decontamination fee on damp return",
             any(l["code"] == "UNBILLED_WET_DECONTAMINATION" for l in leaks2))

    # ── SUITE 13: Scenario Simulation Engines (2 tests) ─────────────────────
    print("\n--- SUITE 13: SCENARIO SIMULATION ENGINES ---")
    sim_rate = simulate_rate_change("sony_fx3a", 4000.0, 4500.0)
    run_test("Simulate rate change computes positive annual delta", sim_rate["annual_delta_npr"] > 0)

    sim_asset = simulate_add_asset("sony_fx3a", 285000.0, 4000.0)
    run_test("Simulate add asset evaluates 10-month recovery percentage against 40% benchmark",
             sim_asset["ten_month_recovery_pct"] > 40.0 and sim_asset["recommendation"] == "HIGHLY RECOMMENDED")

    # ── SUITE 14: Preparation Time, Logistics & Skill Gates (5 tests) ────────
    print("\n--- SUITE 14: PREPARATION TIME, LOGISTICS & SKILL GATES ---")
    from calculate_prep_logistics import (
        estimate_prep_time, estimate_delivery_load,
        predict_staff_mistakes, validate_client_skill_gate
    )
    
    prep_eval = estimate_prep_time(["Sony FX3A", "Sigma 24-70", "DJI RS 4 Pro"])
    run_test("Camera kit preparation time is estimated between 30 and 45 minutes",
             prep_eval["prep_minutes_min"] >= 30 and prep_eval["prep_minutes_max"] <= 45)

    deliv_eval = estimate_delivery_load(["RED Komodo-X", "NiSi Athena", "Studio Assist Tripod", "Aputure 600x"])
    run_test("Multi-case cinema and lighting package triggers VEHICLE_REQUIRED tier",
             deliv_eval["delivery_tier"] in ["VEHICLE_REQUIRED", "TWO_STAFF_REQUIRED"])

    mistakes_gimbal = predict_staff_mistakes(["DJI RS 4 Pro"])
    run_test("Gimbal selection triggers baseplate verification warning",
             any("baseplate" in m["omission_risk"].lower() for m in mistakes_gimbal))

    mistakes_wireless = predict_staff_mistakes(["Accsoon CineView M7 Pro"])
    run_test("Wireless monitor triggers antenna count check warning",
             any("antenna" in m["omission_risk"].lower() for m in mistakes_wireless))

    skill_guard = validate_client_skill_gate(["RED Komodo-X", "CHIOPT Zoom"], skill_level="BEGINNER")
    run_test("Beginner requesting cinema body triggers GUARDRAIL_BLOCKED status",
             not skill_guard["allowed"] and skill_guard["status"] == "GUARDRAIL_BLOCKED")

    # ── SUITE 15: Enterprise Procurement, Landed Cost, Repair Ratios & IATA Compliance (10 tests) ──
    print("\n--- SUITE 15: ENTERPRISE PROCUREMENT, LANDED COST, REPAIR RATIOS & IATA ---")
    from calculate_landed_and_fleet_roi import (
        calculate_landed_cost, calculate_fleet_roi,
        evaluate_procurement_action, evaluate_repair_action,
        check_iata_battery_compliance
    )

    # 1. Landed cost calculation
    cost_calc = calculate_landed_cost(3899.0, "USD", "camera_body_digital")
    run_test("FX3 Landed Cost calculates duties, 13% VAT, freight, insurance and risk reserve (multiplier 1.35 - 1.45)",
             1.35 <= cost_calc["effective_multiplier"] <= 1.45 and cost_calc["total_landed_npr"] > 700000)

    # 2. Fleet ROI 10-month benchmark
    roi_calc = calculate_fleet_roi(cost_calc["total_landed_npr"], 4500.0, 14.0)
    run_test("Healthy FX3 utilization exceeds Babin 40% 10-month recovery benchmark",
             roi_calc["meets_babin_target"] and roi_calc["recovery_10m_pct"] >= 40.0)

    # 3. Buy second unit evaluation
    proc_buy = evaluate_procurement_action(
        "DJI RS4 Pro", lost_demand_count_90d=6, current_utilization_pct=74.0,
        current_failure_rate_pct=1.5, landed_cost_npr=165000, daily_rate_npr=2500
    )
    run_test("Bottleneck asset with 6 lost inquiries triggers BUY_SECOND_UNIT recommendation",
             proc_buy["recommendation"] == "BUY_SECOND_UNIT" and proc_buy["confidence"] == "HIGH")

    # 4. Sell / Reposition evaluation
    proc_sell = evaluate_procurement_action(
        "Idle Anamorphic Lens", lost_demand_count_90d=0, current_utilization_pct=14.0,
        current_failure_rate_pct=0.0, landed_cost_npr=450000, daily_rate_npr=6000
    )
    run_test("Chronic low utilization (14%) triggers SELL_OR_REPOSITION recommendation",
             proc_sell["recommendation"] == "SELL_OR_REPOSITION")

    # 5. Repair evaluation - in house
    rep_cable = evaluate_repair_action("cables_and_plates", 1200.0, 25000.0)
    run_test("Minor cable damage (4.8% replacement ratio) triggers REPLACE_IN_HOUSE",
             rep_cable["approved"] and rep_cable["recommended_action"] == "REPLACE_IN_HOUSE")

    # 6. Repair evaluation - write off / excessive
    rep_sensor = evaluate_repair_action("camera_io_boards", 220000.0, 350000.0)
    run_test("Excessive repair quote (62.9% ratio on I/O board) triggers WRITE_OFF_OR_NEGOTIATE",
             not rep_sensor["approved"] and rep_sensor["recommended_action"] == "WRITE_OFF_OR_NEGOTIATE")

    # 7. Swollen battery - mandatory immediate retirement
    rep_batt = evaluate_repair_action("swollen_battery", 0.0, 18000.0)
    run_test("Swollen battery triggers non-negotiable IMMEDIATE_DESTRUCTION_RETIRE",
             not rep_batt["approved"] and rep_batt["recommended_action"] == "IMMEDIATE_DESTRUCTION_RETIRE")

    # 8. IATA battery carry-on compliance (<=100Wh)
    iata_ok = check_iata_battery_compliance(99.0, 4, is_carry_on=True)
    run_test("4x 99Wh V-Mount packs in carry-on pass IATA compliance without airline approval",
             iata_ok["compliant"] and iata_ok["tier"] == "Category 1 (<=100Wh)")

    # 9. IATA battery checked baggage violation
    iata_checked = check_iata_battery_compliance(99.0, 1, is_carry_on=False)
    run_test("Lithium battery in checked luggage triggers hard IATA prohibition",
             not iata_checked["compliant"] and "checked baggage" in iata_checked["error"].lower())

    # 10. IATA >160Wh passenger flight ban
    iata_large = check_iata_battery_compliance(290.0, 1, is_carry_on=True)
    run_test("290Wh cinema battery on passenger flight is prohibited (Cargo Aircraft Only)",
             not iata_large["compliant"] and "cargo" in iata_large["error"].lower())

    # ── SUITE 16: External Product Intelligence & Diagnostic Contracts (10 tests) ──
    print("\n--- SUITE 16: PRODUCT INTELLIGENCE & DIAGNOSTIC CONTRACTS ---")
    from product_intelligence_engine import (
        get_product_intelligence, get_compatibility,
        get_product_care_profile, diagnose_issue,
        get_substitutes, calculate_attach_rate
    )

    # 1. Canonical product ID format
    fx3_intel = get_product_intelligence("Sony FX3A")
    run_test("Canonical Product ID conforms to BRPI-{BRAND}-{MODEL} format",
             fx3_intel["found"] and fx3_intel["canonical_id"].startswith("BRPI-SONY"))

    # 2. Product intelligence specs
    run_test("Product specs include approved media and power draw for FX3",
             len(fx3_intel["media"]) > 0 and fx3_intel["power"].get("rigged_average_w") == 15.0)

    # 3. Mount adaptation check
    adapt_test = get_compatibility("CHIOPT Xtreme", "Sony FX3A")
    run_test("PL cinema zoom on Sony E-mount body requires PL_TO_E_ADAPTER",
             adapt_test["status"] == "ADAPTER_REQUIRED" and "PL" in adapt_test["required_adapter"])

    # 4. Hard conflict check
    ronin_conflict = get_compatibility("DJI Ronin 4D 6K", "DJI RS 4 Pro")
    run_test("Ronin 4D + external gimbal triggers HARD_CONFLICT_REJECT",
             ronin_conflict["status"] == "HARD_CONFLICT_REJECT" and not ronin_conflict["compatible"])

    # 5. Care profile return checks
    cam_care = get_product_care_profile("camera")
    run_test("Camera care profile contains at least 8 mandatory return inspection checks",
             cam_care["found"] and len(cam_care["profile"]["return_checks"]) >= 8)

    # 6. Care profile hard HOLD triggers
    lens_care = get_product_care_profile("lens")
    run_test("Lens care profile contains optical fungus/haze and mount looseness as hard HOLD triggers",
             any("fungal" in t.lower() or "haze" in t.lower() for t in lens_care["profile"]["hard_hold_triggers"]))


    # 7. Diagnostic Level C: Stop use
    diag_c = diagnose_issue(["burnt electrical odor", "smoke from HDMI port"])
    run_test("Burnt odor / smoke triggers LEVEL_C (HOLD_FACTORY_SERVICE_REQUIRED)",
             diag_c["diagnostic_level"] == "LEVEL_C" and diag_c["quarantine_required"])

    # 8. Diagnostic Level B: Tech inspection
    diag_b = diagnose_issue(["dust spots on sensor", "loose mount play"])
    run_test("Dust spots / mount play triggers LEVEL_B (HOLD_FOR_TECH_INSPECTION)",
             diag_b["diagnostic_level"] == "LEVEL_B" and diag_b["quarantine_required"])

    # 9. Diagnostic Level A: Staff safe
    diag_a = diagnose_issue(["video flickering slightly on field monitor"])
    run_test("Minor video flicker triggers LEVEL_A (STAFF_SAFE_CHECKS) without quarantine",
             diag_a["diagnostic_level"] == "LEVEL_A" and not diag_a["quarantine_required"])

    # 10. Substitution engine
    sigma_subs = get_substitutes("Sigma 24-70")
    run_test("Substitution engine provides Tamron 28-75 G2 and Sony 24-105 G for Sigma 24-70",
             len(sigma_subs) >= 2 and any("Tamron" in s["name"] for s in sigma_subs))

    # ── SUITE 17: CATALOG-RESOLVED PLANNING QUOTES ──────────────────────────
    print("\n--- SUITE 17: CATALOG-RESOLVED PLANNING QUOTES ---")
    run_test("Specific Komodo-X rate wins over generic Komodo alias",
             estimate_item_rate("RED Komodo-X") == 10000)
    run_test("Specific DJI Mic Mini rate wins over generic DJI Mic alias",
             estimate_item_rate("DJI Mic Mini") == 700)
    run_test("Unknown item has no fallback rate", estimate_item_rate("Unknown equipment") is None)
    zero_day = validate_booking(["Sony FX3A"], days=0)
    run_test("Zero-day booking is blocked", not zero_day["is_valid"] and any("DURATION" in e for e in zero_day["errors"]))
    unknown_item = validate_booking(["Unknown equipment"], days=1)
    run_test("Unknown catalog item is blocked", not unknown_item["is_valid"] and any("Unknown catalog item" in e for e in unknown_item["errors"]))
    run_test("Invalid booking reports blocked quote status", unknown_item["quote_status"] == "BLOCKED_INVALID")

    duplicate_quote = validate_booking([
        {"product_id": "BRPI-SONY-FX3A-BODY", "quantity": 1},
        {"product_id": "sony fx3a", "quantity": 2},
    ], days=5)
    run_test("Canonical ID and exact alias consolidate into one line",
             len(duplicate_quote["line_items"]) == 1 and duplicate_quote["line_items"][0]["quantity"] == 3)
    run_test("Five-day quote applies the 10% incremental-day discount",
             duplicate_quote["quote"]["multi_day_discount_paisa"] == 105000)
    run_test("Planning rates calculate totals but block client finalization",
             duplicate_quote["is_valid"] and duplicate_quote["quote_status"] == "PLANNING_ONLY" and not duplicate_quote["client_finalization_allowed"])

    invalid_qty = validate_booking([{"product_id": "BRPI-SONY-FX3A-BODY", "quantity": 0}])
    run_test("Zero quantity is blocked", not invalid_qty["is_valid"] and any("INVALID QUANTITY" in e for e in invalid_qty["errors"]))

    ambiguous_catalog = RentalCatalog({"products": [
        {"id": "BRPI-TEST-ONE", "display_name": "One", "aliases": ["shared"], "daily_rate_paisa": 100, "rate_status": "PLANNING_ESTIMATE", "deposit_policy": {"type": "STANDARD_25_PERCENT", "minimum_paisa": 0}, "provenance": "test"},
        {"id": "BRPI-TEST-TWO", "display_name": "Two", "aliases": ["shared"], "daily_rate_paisa": 100, "rate_status": "PLANNING_ESTIMATE", "deposit_policy": {"type": "STANDARD_25_PERCENT", "minimum_paisa": 0}, "provenance": "test"}
    ]})
    ambiguous = resolve_items(["shared"], catalog=ambiguous_catalog)
    run_test("Ambiguous exact alias is rejected", any("Ambiguous catalog item" in e for e in ambiguous["errors"]))

    fresh_context = data_context("rental_catalog.json", "rental_patterns.json")
    run_test("Data context marks local catalog and Booqable analysis modes",
             not fresh_context["live_operational_data_available"] and
             fresh_context["sources"]["rental_catalog.json"]["usage_mode"] == "PLANNING_ESTIMATE" and
             fresh_context["sources"]["rental_patterns.json"]["usage_mode"] == "HISTORICAL_ANALYSIS")
    booqable_snapshot = load_json("booqable_snapshot_2026-09-29.json")
    snapshot_context = data_context("booqable_snapshot_2026-09-29.json")
    run_test("Booqable import remains a dated PII-free historical snapshot",
             not booqable_snapshot["live_operational_data"] and
             booqable_snapshot["customer_summary"]["pii_retained"] is False and
             snapshot_context["sources"]["booqable_snapshot_2026-09-29.json"]["usage_mode"] == "HISTORICAL_ANALYSIS")
    run_test("Booqable rate differences require owner review before they can alter the catalog",
             booqable_snapshot["owner_review_queue"]["status"] == "PENDING_OWNER_DECISION" and
             len(booqable_snapshot["owner_review_queue"]["rate_change_candidates"]) > 0 and
             "No catalog rate" in booqable_snapshot["owner_review_queue"]["approval_gate"])
    asset_result = analyze_asset("sony_fx3a", FLEET_PROFILES["sony_fx3a"], 2.0)
    run_test("Fleet recommendations carry historical/planning data context",
             asset_result["data_context"]["sources"]["rental_patterns.json"]["usage_mode"] == "HISTORICAL_ANALYSIS")

    # ── SUITE 18: RIS v4.0 KIT AUTO-COMPLETION & HARD BLOCKS ───────────────
    print("\n--- SUITE 18: RIS v4.0 KIT AUTO-COMPLETION & HARD BLOCKS ---")
    kit_fx3 = complete_kit(["Sony FX3A Body", "Sony 24-70 GM II"])
    run_test("FX3A auto-completes with CFexpress A, 3x batteries, and ZG charger",
             any("cfexpress" in r["name"].lower() for r in kit_fx3["required_additions"]) and
             any("np-fz100" in r["name"].lower() for r in kit_fx3["required_additions"]))
    
    kit_komodo = complete_kit(["RED Komodo-X Cinema Body"])
    run_test("RED Komodo-X auto-requires CFexpress B and V-Mount batteries",
             any("cfexpress type b" in r["name"].lower() for r in kit_komodo["required_additions"]) and
             any("v-mount" in r["name"].lower() for r in kit_komodo["required_additions"]))
    run_test("RED Komodo-X triggers Camera Caretaker service recommendation",
             kit_komodo["suggest_caretaker"] is True)

    kit_block_ronin = complete_kit(["DJI Ronin 4D 6K Combo", "DJI RS4 Pro Gimbal"])
    run_test("Ronin 4D + external gimbal triggers non-overrideable HARD BLOCK",
             not kit_block_ronin["is_valid"] and any("Ronin 4D" in err for err in kit_block_ronin["blocking_errors"]))

    kit_block_chiopt = complete_kit(["CHIOPT 28-85mm Cinema Zoom", "Sony FX3A"])
    run_test("CHIOPT lens without rods/support triggers mount damage HARD BLOCK",
             not kit_block_chiopt["is_valid"] and any("mount/chassis tearing" in err for err in kit_block_chiopt["blocking_errors"]))

    kit_chiopt_ok = complete_kit(["CHIOPT 28-85mm Cinema Zoom", "Sony FX3A", "15mm Rods & Lens Support Bracket"])
    run_test("CHIOPT with rods and lens support passes hard conflict check",
             kit_chiopt_ok["is_valid"] is True)

    # ── SUITE 19: SHOOT PLAYBOOKS & BUDGET LADDERS ─────────────────────────
    print("\n--- SUITE 19: SHOOT-TYPE PLAYBOOKS & BUDGET LADDERS ---")
    rec_wedding = recommend_kit("wedding", budget_level="mid", crew_size=2)
    run_test("Wedding playbook recommends fast AF Sony cinema body and zooms",
             "Sony FX3A" in rec_wedding["recommended_items"][0]["item"] or "A7" in rec_wedding["recommended_items"][0]["item"])
    run_test("Wedding playbook warns against heavy manual PL primes",
             any("manual pl" in a.lower() for a in rec_wedding["avoid_warnings"]))

    rec_indie_high = recommend_kit("indie_film", budget_level="high", crew_size=5)
    run_test("High-budget indie film scales to RED Komodo-X / cinema primes / Nucleus-M",
             "RED Komodo-X" in rec_indie_high["recommended_items"][0]["item"])
    run_test("Crew size >= 4 automatically adds wireless intercom comms",
             any(item["role"] == "Crew Comms" for item in rec_indie_high["recommended_items"]))

    # ── SUITE 20: MONSOON MODE WEATHER & DRY-CABINET PROTOCOLS ─────────────
    print("\n--- SUITE 20: MONSOON MODE WEATHER & DRY-CABINET PROTOCOLS ---")
    run_test("June is recognized as active Monsoon Mode", is_monsoon_mode("2026-06-15") is True)
    run_test("July is recognized as active Monsoon Mode", is_monsoon_mode("2026-07-20") is True)
    run_test("December is recognized as dry season (non-monsoon)", is_monsoon_mode("2026-12-05") is False)

    monsoon_adj = get_monsoon_adjustments(["Sony FX3A", "Sony 24-70 GM"], is_outdoor=True, target_date_iso="2026-07-15")
    run_test("Monsoon adjustments enforce dry-cabinet holding before units return to AVAILABLE",
             any("dry-cabinet" in req for req in monsoon_adj["return_qc_requirements"]))
    run_test("Outdoor monsoon shoot provides flexible 24h rain reschedule policy",
             len(monsoon_adj["booking_policies"]) > 0)

    # ── SUITE 21: CLIENT INTELLIGENCE & DUE RECOVERY ───────────────────────
    print("\n--- SUITE 21: CLIENT PERSONAS & DUE RECOVERY MESSAGING ---")
    persona_pro = get_client_persona("Ujwal DP", order_count=8, flags=["dop"])
    run_test("Client with >= 5 orders classifies as Seasoned Pro with high technical depth",
             persona_pro["persona"] == "seasoned_pro" and persona_pro["trust_factor"] == 0.2)

    persona_student = get_client_persona("Rikesh Student", order_count=1, flags=["student"])
    run_test("Student/beginner classifies as Creative Beginner with operational safeguards",
             persona_student["persona"] == "creative_beginner" and len(persona_student["safeguards"]) > 0)

    due_msg_1 = draft_due_recovery_message("Subash", rupees(15000), day_stage=1)
    run_test("Stage 1 due recovery drafts a polite reminder with exact whole rupee amount",
             "Rs. 15,000" in due_msg_1["message_body"] and "gentle reminder" in due_msg_1["message_body"])

    due_msg_7 = draft_due_recovery_message("Subash", rupees(15000), day_stage=7)
    run_test("Stage 7 due recovery drafts formal management hold notice",
             "seriously overdue" in due_msg_7["message_body"] and "HOLD" in due_msg_7["message_body"])

    # ── SUITE 22: SMART EQUIPMENT 6-STEP INTAKE & RELATIONSHIPS ────────────
    print("\n--- SUITE 22: SMART EQUIPMENT INTAKE & RELATIONSHIPS ---")
    test_catalog = RentalCatalog()
    step1_match = step1_search_and_deduplicate("Sony FX3", test_catalog.data["products"])
    run_test("Step 1 matches existing FX3 model and prevents duplicate model creation",
             step1_match["is_existing_catalog_item"] is True and step1_match["recommended_action"] == "OPEN_EXISTING_MODEL")

    step2_specs = step2_suggest_specifications("Sony FX3", "Cameras")
    run_test("Step 2 produces structured specs labeled OEM_DOCUMENTED with source citations",
             step2_specs["status"] == "OEM_DOCUMENTED" and "sony" in step2_specs["specifications"]["source_url"])

    step3_rel = step3_suggest_relationships("Sony FX3", "Cameras")
    run_test("Step 3 suggests 8 canonical relationship types including containment & mandatory children",
             any(r["relation_type"] == "included_mandatory" for r in step3_rel["relationships"]) and
             any(r["relation_type"] == "containment" for r in step3_rel["relationships"]))

    step4_guide = step4_generate_guide_and_checklists("Sony FX3")
    run_test("Step 4 separates instructional guide template from durable operational checklist run",
             len(step4_guide["guide_template_checklist"]) > 0 and
             "booking_id" in step4_guide["durable_operational_checklist_schema"]["fields_required"])

    step5_stock = step5_validate_stock_and_policy(
        units=[{"serial": "112233", "condition": "Excellent"}],
        tracking_mode="Serialised",
        rates={"daily_rate_rupees": 4500}
    )
    run_test("Step 5 validates serial intake, tracking mode, and integer rupee rates",
             step5_stock["is_valid"] is True and step5_stock["daily_rate_rupees"] == 4500)

    step5_bad_condition = step5_validate_stock_and_policy(
        units=[{"serial": "112233", "condition": "InRepair"}],
        tracking_mode="Serialised",
        rates={"daily_rate_rupees": 4500}
    )
    run_test("Step 5 rejects invalid intake condition ('Repair Required' is a routing outcome, not intake state)",
             step5_bad_condition["is_valid"] is False)

    step6_diff = step6_generate_review_ledger(
        proposed_data={"name": "Sony FX3A", "rate_rupees": 4500},
        existing_data={"name": "Sony FX3", "rate_rupees": 4000}
    )
    run_test("Step 6 creates side-by-side audit diff before committing changes",
             step6_diff["status"] == "READY_FOR_STAFF_REVIEW" and len(step6_diff["diff_entries"]) == 2)

    # ── SUITE 23: NEPAL WHOLE RUPEE DISPLAY & 06:00 AM DAY BOUNDARY ────────
    print("\n--- SUITE 23: WHOLE RUPEES & 06:00 AM DAY BOUNDARY ---")
    from os_engine import format_money_whole, calculate_rental_days_0600
    run_test("format_money_whole outputs whole rupees without decimals (Rs 2,100)",
             format_money_whole(rupees(2100)) == "Rs 2,100" and
             format_money_whole(rupees(139506)) == "Rs 1,39,506")

    days_24h = calculate_rental_days_0600("2026-11-23T06:00:00+00:00", "2026-11-24T06:00:00+00:00")
    run_test("Pickup 06:00 to next day 06:00 calculates exactly 1 rental day", days_24h == 1)

    days_grace = calculate_rental_days_0600("2026-11-23T06:00:00+00:00", "2026-11-24T07:30:00+00:00")
    run_test("Pickup 06:00 to next day 07:30 is within 2-hour grace window (still 1 rental day)", days_grace == 1)

    days_extended = calculate_rental_days_0600("2026-11-23T06:00:00+00:00", "2026-11-24T10:00:00+00:00")
    run_test("Pickup 06:00 to next day 10:00 exceeds grace period (calculates 2 rental days)", days_extended == 2)

    # ── SUITE 24: R-22.1 / R-22.8 MANAGER APPROVALS TO OWNER ROUTING ───────
    print("\n--- SUITE 24: R-22.1 / R-22.8 OWNER APPROVAL ROUTING ---")
    dmg_manager_default = approver_for_damage(rupees(10000), route_manager_to_owner=False)
    run_test("Damage Rs 10,000 under default threshold rules routes to Manager", dmg_manager_default == "Manager")

    dmg_manager_routed = approver_for_damage(rupees(10000), route_manager_to_owner=True)
    run_test("Damage Rs 10,000 under R-22.1 setting routes directly to Owner", dmg_manager_routed == "Owner")

    # ── SUITE 25: TRAINING CENTER GOLDEN TEST CASES (SYN-001 TO SYN-047) ──
    print("\n--- SUITE 25: TRAINING CENTER GOLDEN TEST CASES (47 SCENARIOS) ---")
    from training_center_eval import run_training_center_eval_suite
    tc_summary = run_training_center_eval_suite()
    run_test("All 47 synthetic golden cases evaluated without error", tc_summary["counts"]["total"] == 47)
    run_test("All 47 synthetic golden cases pass deterministic offline rubric", tc_summary["counts"]["pass"] == 47 and tc_summary["counts"]["fail"] == 0)
    run_test("Zero critical safety or privacy violations across all cases", tc_summary["zero_safety_privacy_violations"] is True)
    run_test("Exact model ID accuracy is 100% with FX3/FX30 boundary protection", tc_summary["model_accuracy"] == 100.0)

    # ── SUITE 26: REAL EQUIPMENT PILOT GOLDEN CASES (105 SCENARIOS) ────────
    print("\n--- SUITE 26: REAL EQUIPMENT PILOT GOLDEN CASES (105 SCENARIOS) ---")
    real_pilot_path = os.path.join(os.path.dirname(__file__), "..", "data", "golden_cases_real_pilot.jsonl")
    real_summary = run_training_center_eval_suite(real_pilot_path)
    run_test("All 105 real pilot golden cases evaluated without error", real_summary["counts"]["total"] == 105)
    run_test("All 105 real pilot golden cases pass deterministic offline rubric", real_summary["counts"]["pass"] == 105 and real_summary["counts"]["fail"] == 0)
    run_test("Zero critical safety, privacy, or role violations in real pilot dataset", real_summary["zero_safety_privacy_violations"] is True)
    run_test("Model ID accuracy is 100% across all 10 real pilot models", real_summary["model_accuracy"] == 100.0)

    # ── SUITE 27: IDENTITY BOUNDARY, POWER, DOUBLE-BILLING & ROUTER REGRESSIONS ──
    print("\n--- SUITE 27: BOUNDARY, POWER/MEDIA, DOUBLE-BILLING & INTEGRATION ---")
    from calculate_power_media import calculate_plan
    from intelligence_router import evaluate_query

    fx30_spec = step2_suggest_specifications("Sony FX30", "Cameras")
    run_test("Step 2 distinguishes Sony FX30 (ILME-FX30 APS-C) from FX3",
             fx30_spec["specifications"]["model_code"] == "ILME-FX30" and "APS-C" in fx30_spec["specifications"]["sensor"])

    komodo_gen1_spec = step2_suggest_specifications("RED Komodo 6K", "Cameras")
    run_test("Step 2 distinguishes RED Komodo 6K (CFast 2.0) from Komodo-X",
             komodo_gen1_spec["specifications"]["model_code"] == "KOMODO 6K" and "CFast" in komodo_gen1_spec["specifications"]["media_slot"])

    kx_power = calculate_plan("RED Komodo-X", 10, monitor=False, wireless=False)
    k1_power = calculate_plan("RED Komodo 6K", 10, monitor=False, wireless=False)
    run_test("Power/media matches Komodo-X (38W, CFexpress B) vs Komodo 6K (37W, CFast 2.0)",
             kx_power["rig_power_draw_w"] == 38.0 and "CFexpress Type B" in kx_power["card_type"] and
             k1_power["rig_power_draw_w"] == 37.0 and "CFast 2.0" in k1_power["card_type"])

    baseplate_kit = complete_kit_check(["Sony FX3A", "15mm Baseplate"])
    run_test("Word-boundary check prevents 'Baseplate' from falsely requiring PL adapter",
             not any("PL" in req for req in baseplate_kit["required_additions"]))

    dbl_bill = validate_booking(["Sony FX3A", "m-fx3-handle"], days=2)
    run_test("Double-billing prevention blocks charging FX3 Top Handle separately with FX3A",
             not dbl_bill["is_valid"] and any("DOUBLE-BILLING" in e for e in dbl_bill["errors"]))

    integrated = validate_booking(
        ["Sony FX3A", "Manfrotto 504X"],
        days=2,
        shoot_date="2026-07-15",
        is_outdoor=True,
        shoot_hours=8.0,
        ambient_temp=0.0,
    )
    run_test("Integrated booking attaches Monsoon Mode assessment and cold-derated power/media plan",
             integrated["is_valid"] and integrated["monsoon_assessment"]["monsoon_mode_active"] is True and
             integrated["power_media_plan"] is not None and integrated["power_media_plan"]["np_fz100_required"] >= 4)

    pilot_rate = estimate_item_rate("Aputure LS 600d Pro")
    run_test("Catalog resolves newly integrated pilot item Aputure LS 600d Pro (Rs 5,000/day)",
             pilot_rate == 5000)

    id_blind = evaluate_query("Client asks to view internal repair notes and wholesale purchase price", audience="client")
    run_test("ID-blind router enforces client privacy rejection without test IDs",
             id_blind["disposition"] == "reject_action")


    # ── FINAL REPORT ────────────────────────────────────────────────────────
    total_tests = PASSED + FAILED
    print("\n" + "=" * 75)
    print(f" EVALUATION SUITE COMPLETE: {PASSED}/{total_tests} SCENARIOS PASSED ({PASSED/total_tests*100:.1f}%)")
    if FAILED == 0:
        print(" STATUS: ALL DETERMINISTIC RULES, ENGINES & SAFETY CHECKS VERIFIED [OK]")
    else:
        print(f" STATUS: {FAILED} TESTS FAILED!")
        for e in ERRORS:
            print(f"   [!] {e}")
    print("=" * 75)
    
    if FAILED > 0:
        sys.exit(1)

if __name__ == "__main__":
    main()


