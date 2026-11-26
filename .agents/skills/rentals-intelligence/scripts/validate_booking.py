#!/usr/bin/env python3
"""Validate planning bookings using the local Rentals Intelligence catalog.

Legacy string items remain accepted. JSON input may use:
{"items": [{"product_id": "BRPI-SONY-FX3A-BODY", "quantity": 2}], "days": 3}
"""

from __future__ import annotations

import argparse
import json
import sys
from decimal import Decimal
from pathlib import Path
from typing import Any, Dict, List

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from catalog import RentalCatalog, data_context
from calculate_power_media import calculate_plan
from monsoon_intelligence import get_monsoon_adjustments
from os_engine import format_money, price, rupees, to_whole_rupee, validate_advance, validate_discount


CATALOG = RentalCatalog()


def estimate_item_rate(item_name: str) -> int | None:
    """Compatibility helper returning the resolved daily rate in whole NPR."""
    resolution = CATALOG.resolve(item_name)
    return resolution["product"]["daily_rate_paisa"] // 100 if resolution["status"] == "RESOLVED" else None


def resolve_items(items: List[Any], catalog: RentalCatalog = CATALOG) -> Dict[str, Any]:
    """Resolve strings or structured items into consolidated catalog line items."""
    errors: List[str] = []
    warnings: List[str] = []
    resolved: Dict[str, Dict[str, Any]] = {}
    for index, raw_item in enumerate(items, start=1):
        if isinstance(raw_item, str):
            requested_id, quantity = raw_item, 1
        elif isinstance(raw_item, dict):
            requested_id, quantity = raw_item.get("product_id"), raw_item.get("quantity", 1)
        else:
            errors.append(f"INVALID ITEM {index}: provide a product name/ID or an object with product_id and quantity.")
            continue
        if not isinstance(quantity, int) or isinstance(quantity, bool) or quantity < 1:
            errors.append(f"INVALID QUANTITY for item {index}: quantity must be a positive whole number.")
            continue
        resolution = catalog.resolve(requested_id)
        if resolution["status"] != "RESOLVED":
            errors.append(resolution["error"])
            continue
        product = resolution["product"]
        product_id = product["id"]
        if product_id in resolved:
            warnings.append(f"DUPLICATE ITEM CONSOLIDATED: {product['display_name']} quantities were combined.")
            resolved[product_id]["quantity"] += quantity
            continue
        resolved[product_id] = {
            "product_id": product_id,
            "display_name": product["display_name"],
            "quantity": quantity,
            "daily_rate_paisa": product["daily_rate_paisa"],
            "rate_status": product["rate_status"],
            "deposit_policy": product["deposit_policy"],
            "specification_key": product.get("specification_key"),
            "rule_tags": product.get("rule_tags", []),
            "rig_weight_g": product.get("rig_weight_g", 0),
            "included_children": product.get("included_children", []),
            "included_in_parents": product.get("included_in_parents", []),
            "provenance": product["provenance"],
        }
    return {"line_items": list(resolved.values()), "errors": errors, "warnings": warnings}


def _add_unique(target: List[str], value: str) -> None:
    if value not in target:
        target.append(value)


def _kit_checks(line_items: List[Dict[str, Any]]) -> Dict[str, Any]:
    errors: List[str] = []
    warnings: List[str] = []
    additions: List[str] = []
    tags = {tag for item in line_items for tag in item["rule_tags"]}
    product_ids = {item["product_id"] for item in line_items}

    # Double-billing prevention (§5.3): Child or separate line, never both
    for item in line_items:
        parents = set(item.get("included_in_parents", []))
        overlapping_parents = parents & product_ids
        if overlapping_parents:
            errors.append(
                f"DOUBLE-BILLING CONFLICT (§5.3): {item['display_name']} is already included as a mandatory child of {', '.join(sorted(overlapping_parents))}."
            )

    if "ronin_4d" in tags and "external_gimbal" in tags:
        errors.append("HARD CONFLICT: DJI Ronin 4D has an integrated 4-axis gimbal; remove the external gimbal.")
    if "chiopt" in tags and not ({"rods", "baseplate", "lens_support"} & tags):
        errors.append("HARD CONFLICT: CHIOPT cine zoom requires 15mm rods and a lens support bracket.")
        _add_unique(additions, "15mm Rods & Lens Support Bracket")
    if "glimmer" in tags and "matte_box" not in tags:
        errors.append("HARD CONFLICT: Glimmer filter requires a Tilta Mirage matte box.")
        _add_unique(additions, "Tilta Mirage Matte Box")
    if "red_camera" in tags:
        if "komodo_x" in tags:
            _add_unique(additions, "RED-approved CFexpress Type B media and reader")
            if "v_mount" not in tags:
                errors.append("POWER REQUIREMENT: RED Komodo-X requires a compatible V-Mount power solution.")
                _add_unique(additions, "99Wh / 150Wh V-Mount Batteries (minimum 2)")
        else:
            _add_unique(additions, "RED-approved CFast 2.0 media and reader")
            if "monitor" in tags and "BRPI-ACCSOON-M7" not in product_ids and "BRPI-PORTKEYS-BM5" in product_ids:
                warnings.append("SDI CHECK: Verify PortKeys BM5 SDI input or SDI-to-HDMI converter for RED Komodo 6K (no HDMI port on camera body).")
    if "pl_lens" in tags:
        if "pl_adapter" not in tags:
            _add_unique(additions, "PL-to-camera mount adapter")
        if "follow_focus" not in tags:
            warnings.append("RECOMMENDATION: Manual PL cine lenses benefit from a follow-focus system.")
            _add_unique(additions, "Wireless Follow Focus Motor")
        if "monitor" not in tags:
            warnings.append("RECOMMENDATION: Cinema lenses benefit from an external monitor for critical focus checks.")
    if "light" in tags and "c_stand" not in tags:
        warnings.append("SAFETY NOTICE: Studio lights require heavy-duty C-stands and sandbags.")
        _add_unique(additions, "C-Stand with Sandbag")
    return {"errors": errors, "warnings": warnings, "required_additions": additions, "tags": tags}


def validate_booking(
    items: List[Any], days: int = 1, client_flag: str | None = None,
    standing_discount_pct: int | float = 0, is_woman_dop: bool = False,
    has_valid_id: bool = False, has_letter: bool = False,
    discount_reason: str | None = None, approver_name: str | None = None,
    shoot_date: str | None = None, is_outdoor: bool = False,
    shoot_hours: float | None = None, ambient_temp: float = 20.0,
    codec: str | None = None, include_monsoon_fees: bool = False,
) -> Dict[str, Any]:
    errors: List[str] = []
    warnings: List[str] = []
    if not isinstance(days, int) or isinstance(days, bool) or days < 1:
        errors.append("RENTAL DURATION INVALID: days must be a positive whole number.")
        days = 1
    resolution = resolve_items(items)
    errors.extend(resolution["errors"])
    warnings.extend(resolution["warnings"])
    line_items = resolution["line_items"]
    kit = _kit_checks(line_items)
    errors.extend(kit["errors"])
    warnings.extend(kit["warnings"])

    daily_subtotal_paisa = sum(item["daily_rate_paisa"] * item["quantity"] for item in line_items)
    multi_day_discount_paisa = (
        to_whole_rupee(Decimal(daily_subtotal_paisa * (days - 4)) * Decimal("0.10"))
        if days >= 5 else 0
    )
    equipment_paisa = daily_subtotal_paisa * days - multi_day_discount_paisa
    try:
        applied_discount_pct = float(standing_discount_pct) if standing_discount_pct else 0.0
    except (TypeError, ValueError):
        applied_discount_pct = 0.0
        errors.append("INVALID DISCOUNT: standing_discount_pct must be numeric.")
    discount_source = "None"
    if applied_discount_pct:
        discount_source = f"Standing Client Discount ({applied_discount_pct:g}%)"
    elif client_flag == "college_project" and has_letter:
        applied_discount_pct, discount_source = 20.0, "College Project with Letter (20%)"
    elif client_flag == "student" and has_valid_id:
        applied_discount_pct, discount_source = 10.0, "Student with Valid ID (10%)"
    if is_woman_dop:
        applied_discount_pct += 5.0
        discount_source = f"{discount_source} + Woman Director/DoP (5%)" if discount_source != "None" else "Woman Director/DoP (5%)"
    discount_check = validate_discount(applied_discount_pct, discount_reason, approver_name)
    if not discount_check["valid"]:
        errors.append(f"LAW 10 DISCOUNT GATE FAILED: {discount_check['error']}")

    high_risk_tags = {"red_camera", "ronin_4d", "mantis", "great_joy", "chiopt", "athena"}
    needs_caretaker = equipment_paisa >= rupees(50000) or bool(kit["tags"] & high_risk_tags)
    caretaker_reason = "Equipment value is at least NPR 50,000" if equipment_paisa >= rupees(50000) else "Package contains high-risk cinema equipment"
    caretaker_fee_paisa = rupees(2000 * days) if needs_caretaker else 0

    # Monsoon environmental & weather checks
    item_names = [item["display_name"] for item in line_items]
    monsoon_assessment = get_monsoon_adjustments(item_names, is_outdoor=is_outdoor, target_date_iso=shoot_date) if (shoot_date or is_outdoor) else None
    monsoon_fee_paisa = 0
    if monsoon_assessment and monsoon_assessment["monsoon_mode_active"]:
        warnings.append("MONSOON MODE ACTIVE (Jun–Sep): Enforce silica/Pelican transport and 24-hour dry-cabinet quarantine upon return.")
        if include_monsoon_fees:
            monsoon_fee_paisa = sum(f["amount_paisa"] * days for f in monsoon_assessment.get("suggested_fee_lines", []))

    pricing = price(equipment=equipment_paisa, services=caretaker_fee_paisa + monsoon_fee_paisa, discount_percent=applied_discount_pct, vat_percent=13.0, payments=0)
    advance = validate_advance(pricing["rental_total"], 0)

    flat_deposits = [item["deposit_policy"]["amount_paisa"] for item in line_items if item["deposit_policy"]["type"] == "FLAT"]
    if flat_deposits:
        deposit_paisa, deposit_basis = max(flat_deposits), "Highest applicable flat deposit policy"
    else:
        deposit_paisa = max(rupees(10000), to_whole_rupee(Decimal(pricing["rental_total"]) * Decimal("0.25")))
        deposit_basis = "Standard 25% rental basis, NPR 10,000 minimum"

    planning_only = any(item["rate_status"] != "APPROVED_CURRENT" for item in line_items)
    quote_status = "BLOCKED_INVALID" if errors else ("PLANNING_ONLY" if planning_only else "CLIENT_FINALIZATION_ALLOWED")
    if planning_only:
        warnings.append("PLANNING ONLY: catalog rates are estimates and cannot be finalized for a client without an approved current rate card.")
    rig_weight_g = sum(item["rig_weight_g"] * item["quantity"] for item in line_items)
    if "external_gimbal" in kit["tags"] and "ronin_4d" not in kit["tags"]:
        gimbal_limit_g = 4500 if {"rs4_pro", "rs3_pro"} & kit["tags"] else 3000
        if rig_weight_g > gimbal_limit_g:
            errors.append(f"GIMBAL PAYLOAD OVERLOAD: rig weight {rig_weight_g / 1000:.2f}kg exceeds {gimbal_limit_g / 1000:.1f}kg.")
        elif rig_weight_g > gimbal_limit_g * 0.85:
            warnings.append(f"GIMBAL PAYLOAD WARNING: rig weight {rig_weight_g / 1000:.2f}kg is within 15% of the payload limit.")
    if "tripod" in kit["tags"] and rig_weight_g > 0:
        tripod_ids = {item["product_id"] for item in line_items if "tripod" in item["rule_tags"]}
        if "BRPI-STUDIO-ASSIST-TRIPOD" in tripod_ids:
            tripod_max_g = 15000
        elif "BRPI-MANFROTTO-504X" in tripod_ids:
            tripod_max_g = 12000
        else:
            tripod_max_g = 10000
        if rig_weight_g > tripod_max_g * 0.70:
            errors.append(f"TRIPOD PAYLOAD HEADROOM VIOLATION: rig weight {rig_weight_g / 1000:.2f}kg exceeds 70% safe limit ({tripod_max_g * 0.70 / 1000:.1f}kg) for selected tripod.")

    # Power & Media runtime plan for primary camera body (if present)
    camera_items = [item for item in line_items if "camera" in item["rule_tags"]]
    power_media_plan = None
    if camera_items and (shoot_hours is not None or ambient_temp != 20.0 or codec is not None):
        cam = camera_items[0]
        default_codec = "redcode hq 6k" if "red_camera" in cam["rule_tags"] else ("prores 422 hq 4k" if "ronin_4d" in cam["rule_tags"] else "xavc s-i 4k 24p")
        power_media_plan = calculate_plan(
            camera_name=cam["display_name"],
            hours=shoot_hours if shoot_hours is not None else 8.0,
            ambient_temp=ambient_temp,
            codec=codec or default_codec,
            monitor=("monitor" in kit["tags"]),
            wireless=("wireless_video" in kit["tags"]),
        )

    return {
        "is_valid": not errors,
        "quote_status": quote_status,
        "client_finalization_allowed": quote_status == "CLIENT_FINALIZATION_ALLOWED" and not errors,
        "errors": errors, "warnings": warnings, "required_additions": kit["required_additions"],
        "rig_weight_kg": round(rig_weight_g / 1000, 2), "line_items": line_items,
        "monsoon_assessment": monsoon_assessment,
        "power_media_plan": power_media_plan,
        "data_context": data_context("rental_catalog.json", "os_laws.json", "product_specs.json"),
        "quote": {
            "rental_days": days, "daily_subtotal_paisa": daily_subtotal_paisa,
            "equipment_paisa": equipment_paisa, "multi_day_discount_paisa": multi_day_discount_paisa,
            "gross_subtotal_paisa": pricing["subtotal"], "policy_discount_pct": applied_discount_pct,
            "policy_discount_source": discount_source, "discount_paisa": pricing["discount"],
            "taxable_paisa": pricing["taxable"], "vat_13_pct_paisa": pricing["vat"],
            "caretaker_required": needs_caretaker, "caretaker_reason": caretaker_reason,
            "caretaker_fee_paisa": caretaker_fee_paisa, "monsoon_fee_paisa": monsoon_fee_paisa,
            "rental_total_paisa": pricing["rental_total"],
            "security_deposit_paisa": deposit_paisa, "deposit_basis": deposit_basis,
            "advance_required_paisa": advance["required_paisa"], "advance_rule": advance["rule_description"],
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate a Babin Rentals planning booking")
    parser.add_argument("--items", nargs="+", help="Product IDs or exact catalog aliases")
    parser.add_argument("--days", type=int, default=1)
    parser.add_argument("--client-flag", choices=["student", "college_project"])
    parser.add_argument("--standing-discount", type=float, default=0)
    parser.add_argument("--is-woman-dop", action="store_true")
    parser.add_argument("--has-valid-id", action="store_true")
    parser.add_argument("--has-letter", action="store_true")
    parser.add_argument("--discount-reason")
    parser.add_argument("--approver-name")
    parser.add_argument("--shoot-date", help="ISO shoot date (YYYY-MM-DD) for Monsoon Mode check")
    parser.add_argument("--outdoor", action="store_true", help="Flag outdoor location for monsoon & rain checks")
    parser.add_argument("--shoot-hours", type=float, help="Planned shooting hours for power/media plan")
    parser.add_argument("--temp", type=float, default=20.0, help="Expected ambient temperature in Celsius")
    parser.add_argument("--codec", help="Target recording codec for media sizing")
    parser.add_argument("--json-file", help="Booking JSON; items may be strings or {product_id, quantity} objects")
    args = parser.parse_args()
    payload: Dict[str, Any] = {}
    if args.json_file:
        with open(args.json_file, encoding="utf-8") as file:
            payload = json.load(file)
    items = payload.get("items", args.items or [])
    if not items:
        parser.error("provide --items or a JSON file containing items")
    result = validate_booking(
        items=items, days=payload.get("days", args.days), client_flag=payload.get("client_flag", args.client_flag),
        standing_discount_pct=payload.get("standing_discount", args.standing_discount),
        is_woman_dop=payload.get("is_woman_dop", args.is_woman_dop),
        has_valid_id=payload.get("has_valid_id", args.has_valid_id), has_letter=payload.get("has_letter", args.has_letter),
        discount_reason=payload.get("discount_reason", args.discount_reason), approver_name=payload.get("approver_name", args.approver_name),
        shoot_date=payload.get("shoot_date", args.shoot_date), is_outdoor=payload.get("is_outdoor", args.outdoor),
        shoot_hours=payload.get("shoot_hours", args.shoot_hours), ambient_temp=payload.get("ambient_temp", args.temp),
        codec=payload.get("codec", args.codec),
    )
    print(f"Quote status: {result['quote_status']}")
    print(f"Validation: {'VALID' if result['is_valid'] else 'BLOCKED'}")
    for item in result["line_items"]:
        print(f"- {item['quantity']} × {item['display_name']} @ {format_money(item['daily_rate_paisa'])}/day [{item['rate_status']}]")
    for error in result["errors"]: print(f"ERROR: {error}")
    for warning in result["warnings"]: print(f"WARNING: {warning}")
    print(f"Rental total: {format_money(result['quote']['rental_total_paisa'])}")
    print(f"Security deposit: {format_money(result['quote']['security_deposit_paisa'])}")
    sys.exit(0 if result["is_valid"] else 1)


if __name__ == "__main__":
    main()
