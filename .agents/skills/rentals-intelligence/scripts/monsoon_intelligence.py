"""
monsoon_intelligence.py - Babin Rentals Monsoon & Environmental Protection Engine

Operational rules for Nepal Monsoon (Ashadh - Ashwin / June - September):
- Monsoon Mode active window: June 1 to September 30
- Mandatory dry-cabinet holding and moisture/fungus checks on returns
- Outdoor shoot rain mitigation packages and crew briefings
- Flexible weather reschedule policies
- Wet/damp decontamination fee (Rs 5,000) for soaked returns
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional


MONSOON_START_MONTH = 6   # June
MONSOON_END_MONTH = 9     # September

MONSOON_FEES = {
    "rain_cover_rental_paisa": 50000,        # Rs 500 / day
    "wet_decontamination_fee_paisa": 500000, # Rs 5,000 for soaked gear requiring ultrasonic/dry chamber
    "silica_pelican_pack_paisa": 0           # Provided free on outdoor kits
}

OUTDOOR_KEYWORDS = [
    "outdoor", "field", "mountain", "terai", "street", "exterior", "mustang",
    "pokhara", "forest", "rain", "monsoon", "event", "wedding_baraat"
]

SENSITIVE_CATEGORIES = [
    "camera", "lens", "monitor", "audio", "wireless", "light"
]


def is_monsoon_mode(target_date_iso: Optional[str] = None) -> bool:
    """
    Checks if Monsoon Mode is active.
    Defaults to current date if target_date_iso is not supplied.
    """
    if target_date_iso:
        try:
            dt = datetime.fromisoformat(target_date_iso[:10])
        except Exception:
            dt = datetime.now()
    else:
        dt = datetime.now()
    return MONSOON_START_MONTH <= dt.month <= MONSOON_END_MONTH


def get_monsoon_adjustments(
    items: List[str],
    is_outdoor: bool = True,
    target_date_iso: Optional[str] = None
) -> Dict[str, Any]:
    """
    Evaluates items and generates monsoon-specific operational adjustments across
    Dispatch, Return QC, Storage, and Booking policy.
    """
    joined = " ".join(items).lower()
    active = is_monsoon_mode(target_date_iso)

    if not active and not is_outdoor:
        return {
            "monsoon_mode_active": False,
            "is_outdoor": False,
            "dispatch_requirements": [],
            "return_qc_requirements": ["Standard physical inspection"],
            "storage_protocols": ["Standard climate controlled shelving"],
            "suggested_fee_lines": []
        }

    dispatch_reqs: List[str] = []
    return_qc_reqs: List[str] = []
    storage_reqs: List[str] = []
    fee_lines: List[Dict[str, Any]] = []

    if active:
        dispatch_reqs.append("Pack all lenses and camera bodies with sealed silica packs in waterproof Pelican cases.")
        dispatch_reqs.append("Deliver mandatory verbal rain-briefing: No hot lens swapping in humid outdoor air.")
        if is_outdoor:
            dispatch_reqs.append("Equip camera body and matte box with heavy-duty clear rain poncho.")
            fee_lines.append({
                "line": "Monsoon Weatherproof Rain Protection Pack",
                "amount_paisa": MONSOON_FEES["rain_cover_rental_paisa"],
                "reason": "Protects electronic cinema body and lens barrel from drizzle and spray"
            })

        return_qc_reqs.append("MANDATORY 3-Point Moisture Audit: Sensor glass, lens internal barrels (torch inspection for fungus/fog), and battery contacts.")
        return_qc_reqs.append("Any gear returning damp must be routed to CLEANING_QUARANTINE with 24-hour dry-cabinet bake before returning to AVAILABLE.")
        
        storage_reqs.append("Maintain electronic dry cabinets at 40% - 45% Relative Humidity.")
        storage_reqs.append("Lenses stored without caps in UV/dry cabinets if returning from high-humidity valleys.")

    return {
        "monsoon_mode_active": active,
        "is_outdoor": is_outdoor,
        "dispatch_requirements": dispatch_reqs,
        "return_qc_requirements": return_qc_reqs,
        "storage_protocols": storage_reqs,
        "booking_policies": [
            "Outdoor shoots eligible for flexible 24-hour rain reschedule without cancellation forfeiture."
        ],
        "suggested_fee_lines": fee_lines,
        "warning_note": "Soaked returns requiring disassembly and ultrasonic drying incur standard Rs 5,000 decontamination fee."
    }


def apply_monsoon_mode_to_booking(
    order_id: str,
    items: List[str],
    is_outdoor: bool = True
) -> Dict[str, Any]:
    """
    Applies monsoon adjustments to a specific booking order.
    """
    adj = get_monsoon_adjustments(items, is_outdoor=is_outdoor)
    return {
        "order_id": order_id,
        "applied_date": datetime.now().isoformat(),
        "status": "MONSOON_MODE_APPLIED" if adj["monsoon_mode_active"] else "STANDARD_MODE",
        "adjustments": adj
    }
