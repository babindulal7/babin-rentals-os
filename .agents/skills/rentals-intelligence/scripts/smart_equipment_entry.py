"""
smart_equipment_entry.py - Babin Rentals Smart Add Equipment Workflow

Implements the 6-Step Smart Equipment Entry Flow defined in the 23 Nov Master Plan:
1. Model Search & Deduplication: Match existing catalogue models (BRPI-*) first.
2. Sourced Specifications: Structured technical attributes with explicit evidence status.
3. Parent-Child Relationship Taxonomy: 8 distinct relationship types.
4. Dual How-To & Checklist Architecture: Instructional templates vs durable operational checklist runs.
5. Physical Stock & Rental Policy: Validates serial intake, tracking modes, and intake conditions.
6. Diff & Review Ledger: Side-by-side audit before committing changes.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional


RELATIONSHIP_TYPES = [
    "included_mandatory",   # Comes with kit; auto-inherited on packing list
    "included_optional",    # Selectable inclusion; tracked if checked
    "required_to_operate",  # Technical dependency; warning if missing
    "compatible_accessory", # Verified mechanical/electrical fit; suggested
    "recommended_addon",    # Strategic rental recommendation
    "chargeable_extra",     # Explicit line item with its own rate
    "containment",          # Stored In (Pelican case, soft bag); one container at a time
    "bundle_component"      # Member of a saved bundle package
]

TRACKING_MODES = ["Serialised", "Quantity", "Consumable"]

INTAKE_CONDITIONS = ["Excellent", "Good", "Fair", "Damaged", "Lost"]


def _has_token(text: str, pattern: str) -> bool:
    """Match a model token or phrase with alphanumeric boundaries."""
    return bool(re.search(rf"(?<![a-z0-9])(?:{pattern})(?![a-z0-9])", text.lower()))


def step1_search_and_deduplicate(query: str, catalog_products: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Step 1: Check existing Babin catalogue models and aliases first.
    Prevents creating duplicate models for items already in inventory and enforces
    strict identity boundaries (e.g. FX3 vs FX30, Komodo vs Komodo-X, 600d vs 600x).
    """
    clean_query = query.strip().lower()
    norm_query = re.sub(r"[^a-z0-9]+", " ", clean_query).strip()
    exact_matches: List[Dict[str, Any]] = []
    alias_matches: List[Dict[str, Any]] = []

    for product in catalog_products:
        pid = product.get("id", "").lower()
        dname = product.get("display_name", "").lower()
        aliases = [a.lower() for a in product.get("aliases", [])]
        norm_dname = re.sub(r"[^a-z0-9]+", " ", dname).strip()
        norm_aliases = [re.sub(r"[^a-z0-9]+", " ", a).strip() for a in aliases]

        if clean_query == pid or clean_query == dname or norm_query == norm_dname:
            exact_matches.append(product)
        elif any(clean_query == a or norm_query == na for a, na in zip(aliases, norm_aliases)):
            alias_matches.append(product)
        elif (
            _has_token(norm_dname, re.escape(norm_query))
            or any(_has_token(na, re.escape(norm_query)) for na in norm_aliases)
        ):
            alias_matches.append(product)

    is_duplicate = len(exact_matches) > 0 or len(alias_matches) > 0

    return {
        "query": query,
        "is_existing_catalog_item": is_duplicate,
        "exact_matches": exact_matches,
        "alias_matches": alias_matches,
        "recommended_action": "OPEN_EXISTING_MODEL" if is_duplicate else "PROCEED_TO_SPEC_DRAFT",
        "guidance": "Select existing catalogue model to update instead of creating a duplicate entry." if is_duplicate else "New model detected. Proceed to Step 2 specification drafting."
    }


def step2_suggest_specifications(model_name: str, category: str) -> Dict[str, Any]:
    """
    Step 2: Proposes structured technical specifications with explicit source status.
    Every fact is labeled as OEM_DOCUMENTED, BABIN_BENCH_TESTED, or UNREVIEWED_DRAFT.
    Enforces strict model boundaries (FX30 != FX3, Komodo 6K != Komodo-X, 600d != 600x).
    """
    if _has_token(model_name, r"fx\s*30|ilme[\s\-_]*fx30"):
        specs = {
            "brand": "Sony",
            "model_code": "ILME-FX30",
            "mount": "Sony E-Mount",
            "sensor": "Super35 / APS-C 20.1MP Exmor R CMOS (Distinct from Full-Frame FX3)",
            "base_iso": "Dual Base ISO 800 / 2,500 (S-Log3)",
            "recording_formats": "XAVC S, XAVC HS, XAVC S-I 4K 120p 10-bit 4:2:2",
            "cooling": "Internal Active Cooling Fan",
            "power_draw_watts": 12.0,
            "weight_grams": 646,
            "skill_level": "Intermediate",
            "source_status": "OEM_DOCUMENTED",
            "source_url": "https://electronics.sony.com/imaging/cinema-line/all-cinema-line-cameras/p/ilmefx30b"
        }
    elif _has_token(model_name, r"fx\s*3a?|ilme[\s\-_]*fx3"):
        specs = {
            "brand": "Sony",
            "model_code": "ILME-FX3",
            "mount": "Sony E-Mount",
            "sensor": "Full Frame 12.1MP Exmor R BSI CMOS",
            "base_iso": "Dual Base ISO 800 / 12,800 (S-Log3)",
            "recording_formats": "XAVC S, XAVC HS, XAVC S-I 4K 120p 10-bit 4:2:2",
            "cooling": "Internal Active Cooling Fan",
            "power_draw_watts": 15.0,
            "weight_grams": 715,
            "skill_level": "Intermediate",
            "source_status": "OEM_DOCUMENTED",
            "source_url": "https://electronics.sony.com/imaging/cinema-line/all-cinema-line-cameras/p/ilmefx3"
        }
    elif _has_token(model_name, r"komodo[\s\-_]*x"):
        specs = {
            "brand": "RED Digital Cinema",
            "model_code": "Komodo-X 6K",
            "mount": "Locking Canon RF Mount",
            "sensor": "6K Super35 Global Shutter CMOS (19.9MP)",
            "media_slot": "CFexpress Type B (RED PRO)",
            "power_input": "Integrated Micro V-Mount (14.4V) + 6-pin LEMO DC",
            "dynamic_range": "16.5+ Stops",
            "recording_formats": "REDCODE RAW (HQ/MQ/LQ), Apple ProRes 422 HQ up to 4K 120p",
            "power_draw_watts": 45.0,
            "weight_grams": 1190,
            "skill_level": "Professional / DP Required",
            "source_status": "OEM_DOCUMENTED",
            "source_url": "https://www.red.com/komodo-x"
        }
    elif _has_token(model_name, r"komodo(?:\s*6k)?"):
        specs = {
            "brand": "RED Digital Cinema",
            "model_code": "KOMODO 6K",
            "mount": "Canon RF Mount (Mechanical)",
            "sensor": "6K Super35 Global Shutter CMOS (19.9MP)",
            "media_slot": "CFast 2.0 (RED-Verified Only)",
            "power_input": "Dual Canon BP-9XX (7.2V) or 2-pin LEMO DC (7-17V)",
            "video_output": "1x 12G-SDI BNC (No HDMI port)",
            "dynamic_range": "16+ Stops",
            "recording_formats": "REDCODE RAW (HQ/MQ/LQ), Apple ProRes 422 HQ up to 4K 60p",
            "power_draw_watts": 37.0,
            "weight_grams": 952,
            "skill_level": "Professional / DP Required",
            "source_status": "OEM_DOCUMENTED",
            "source_url": "https://www.red.com/komodo"
        }
    else:
        specs = {
            "brand": "Generic / Unverified",
            "model_code": model_name,
            "category": category,
            "skill_level": "Intermediate",
            "source_status": "UNREVIEWED_DRAFT",
            "notes": "Evidence requires verification against manufacturer datasheet."
        }

    return {
        "model_name": model_name,
        "specifications": specs,
        "status": specs.get("source_status", "UNREVIEWED_DRAFT"),
        "rule_enforced": "Staff review required before moving to Approved status."
    }


def step3_suggest_relationships(model_name: str, category: str) -> Dict[str, Any]:
    """
    Step 3: Suggests child items, dependencies, and packaging classified into
    the 8 canonical relationship types.
    """
    relations: List[Dict[str, Any]] = []

    if _has_token(model_name, r"fx\s*30|ilme[\s\-_]*fx30"):
        relations.extend([
            {"relation_type": "included_mandatory", "item_name": "Sony NP-FZ100 Rechargeable Battery (2x)", "qty": 2},
            {"relation_type": "included_mandatory", "item_name": "Sony Dual Channel Fast Charger", "qty": 1},
            {"relation_type": "included_optional", "item_name": "XLR-H1 Top Handle Unit (Verify Variant)", "qty": 1},
            {"relation_type": "required_to_operate", "item_name": "CFexpress Type A or V90 SD Card", "qty": 2},
            {"relation_type": "containment", "item_name": "Pelican Hard Case (Verify FX30 Foam Fit)", "qty": 1}
        ])
    elif _has_token(model_name, r"fx\s*3a?|ilme[\s\-_]*fx3"):
        relations.extend([
            {"relation_type": "included_mandatory", "item_name": "Sony NP-FZ100 Rechargeable Battery (3x)", "qty": 3},
            {"relation_type": "included_mandatory", "item_name": "Sony ZG Dual Channel Fast Charger", "qty": 1},
            {"relation_type": "included_mandatory", "item_name": "Sony FX3 Top Handle Audio Unit with XLR", "qty": 1},
            {"relation_type": "containment", "item_name": "Custom Foam Pelican 1510 Hard Case", "qty": 1},
            {"relation_type": "required_to_operate", "item_name": "CFexpress Type A or V90 SD Card", "qty": 2},
            {"relation_type": "compatible_accessory", "item_name": "Tilta Full Camera Cage for Sony FX3", "qty": 1},
            {"relation_type": "recommended_addon", "item_name": "Accsoon M7 Pro Wireless 7-inch Monitor", "qty": 1},
            {"relation_type": "chargeable_extra", "item_name": "Sony FE 24-70mm f/2.8 GM II Lens", "qty": 1}
        ])
    elif _has_token(model_name, r"komodo[\s\-_]*x"):
        relations.extend([
            {"relation_type": "included_mandatory", "item_name": "RED Wing Grip Handle", "qty": 1},
            {"relation_type": "included_mandatory", "item_name": "RED 45W AC Power Adapter", "qty": 1},
            {"relation_type": "containment", "item_name": "Pelican Storm iM2500 Hard Case", "qty": 1},
            {"relation_type": "required_to_operate", "item_name": "CFexpress Type B RED-Verified Card (1TB)", "qty": 2},
            {"relation_type": "required_to_operate", "item_name": "Micro V-Mount 99Wh Batteries (2x)", "qty": 2},
            {"relation_type": "recommended_addon", "item_name": "Babin Rentals Camera Caretaker Service", "qty": 1}
        ])
    elif _has_token(model_name, r"komodo(?:\s*6k)?"):
        relations.extend([
            {"relation_type": "included_mandatory", "item_name": "RED Outrigger Top Handle", "qty": 1},
            {"relation_type": "included_mandatory", "item_name": "RED 45W AC Power Adapter (2-pin LEMO)", "qty": 1},
            {"relation_type": "containment", "item_name": "Pelican Storm iM2500 Hard Case", "qty": 1},
            {"relation_type": "required_to_operate", "item_name": "RED-Verified CFast 2.0 Card (512GB)", "qty": 2},
            {"relation_type": "required_to_operate", "item_name": "Canon BP-9XX Batteries (2x) or V-Mount 2-pin LEMO Plate", "qty": 2},
            {"relation_type": "required_to_operate", "item_name": "12G-SDI Monitor or SDI-to-HDMI Cross-Converter", "qty": 1},
            {"relation_type": "recommended_addon", "item_name": "Babin Rentals Camera Caretaker Service", "qty": 1}
        ])

    return {
        "model_name": model_name,
        "relationship_count": len(relations),
        "relationships": relations,
        "valid_types": RELATIONSHIP_TYPES
    }


def step4_generate_guide_and_checklists(model_name: str) -> Dict[str, Any]:
    """
    Step 4: Generates model How-to guidance, distinguishing instructional guide
    checklists from durable booking-linked checklist instances.
    """
    name_lower = model_name.lower()

    guide = {
        "quick_start_steps": [
            "Inspect physical housing, sensor glass, and connector pins before mounting lens.",
            "Format recording media in-camera before starting recording.",
            "Confirm base ISO profile (S-Log3 or RAW) matches production brief."
        ],
        "safety_warnings": [
            "Never perform hot lens changes outdoors during high humidity or rain.",
            "Do not exceed maximum continuous payload on fluid head.",
            "Ensure 12V-16.8V D-Tap polarity is verified before plugging accessory cables."
        ],
        "common_mistakes": [
            "Using consumer SD cards for high-bitrate All-Intra 4K capture.",
            "Mounting heavy cine zoom without 15mm baseplate rod support.",
            "Powering monitor via D-Tap while HDMI is plugged in without common ground."
        ]
    }

    # Dual checklist separation:
    # 1. Guide Checklist (instructional template)
    guide_template_checklist = [
        "Camera body firmware baseline reset",
        "Sensor clean check under direct penlight",
        "Clean HDMI/SDI port video signal verified",
        "Battery bay door and locking latch intact"
    ]

    # 2. Durable Operational Run requirements
    durable_checklist_schema = {
        "fields_required": ["booking_id", "asset_serial_id", "technician_user_id", "timestamp_iso", "photo_evidence_url"],
        "lifecycle_events": ["PACKING", "HANDOVER_DISPATCH", "RETURN_INSPECTION", "CLEANING_RESET"]
    }

    return {
        "model_name": model_name,
        "guide_content": guide,
        "guide_template_checklist": guide_template_checklist,
        "durable_operational_checklist_schema": durable_checklist_schema
    }


def step5_validate_stock_and_policy(
    units: List[Dict[str, Any]],
    tracking_mode: str = "Serialised",
    rates: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Step 5: Enforces operational stock laws:
    - Tracking Mode must be Serialised, Quantity, or Consumable.
    - Intake condition must be one of the canonical 5.
    - Asset serials are never generated automatically; must be physically entered.
    - Money must be expressed in whole rupees.
    """
    errors: List[str] = []

    if tracking_mode not in TRACKING_MODES:
        errors.append(f"Invalid tracking mode: '{tracking_mode}'. Must be one of {TRACKING_MODES}.")

    valid_units: List[Dict[str, Any]] = []
    for idx, u in enumerate(units):
        serial = str(u.get("serial", "")).strip()
        condition = u.get("condition", "Excellent")

        if tracking_mode == "Serialised" and not serial:
            errors.append(f"Unit {idx + 1}: Serialized mode requires an exact physical serial number.")

        if condition not in INTAKE_CONDITIONS:
            errors.append(f"Unit {idx + 1}: Invalid intake condition '{condition}'. Must be one of {INTAKE_CONDITIONS}.")

        valid_units.append({
            "unit_index": idx + 1,
            "serial": serial,
            "condition": condition,
            "asset_code_status": "ASSIGNED_ON_DATABASE_LOCK"
        })

    rates = rates or {}
    daily_rate_rupees = rates.get("daily_rate_rupees", 0)
    if daily_rate_rupees != int(daily_rate_rupees):
        errors.append(f"Daily rate Rs {daily_rate_rupees} contains decimals. Whole rupees required per RULINGS-2026-11-22.")

    return {
        "tracking_mode": tracking_mode,
        "unit_count": len(valid_units),
        "units": valid_units,
        "daily_rate_rupees": int(daily_rate_rupees),
        "is_valid": len(errors) == 0,
        "errors": errors
    }


def step6_generate_review_ledger(
    proposed_data: Dict[str, Any],
    existing_data: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Step 6: Produces a side-by-side review diff before saving.
    Ensures no destructive silent overwrite occurs.
    """
    diff: Dict[str, Any] = {}
    for key, value in proposed_data.items():
        old_val = (existing_data or {}).get(key, None)
        if old_val != value:
            diff[key] = {
                "before": old_val,
                "after": value,
                "state": "MODIFIED" if old_val is not None else "NEW"
            }

    return {
        "status": "READY_FOR_STAFF_REVIEW",
        "has_changes": len(diff) > 0,
        "diff_entries": diff,
        "requires_owner_signoff": proposed_data.get("requires_owner_approval", False)
    }
