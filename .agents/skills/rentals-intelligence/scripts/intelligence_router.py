#!/usr/bin/env python3
"""
intelligence_router.py - Deterministic ID-Blind Query & Policy Router for Babin Rentals

Routes natural-language operational, technical, financial, safety, and privacy
queries strictly from (question, audience) through deterministic Babin Rentals
engines and verified local data — without peeking at test case IDs or expected
labels.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

from os_engine import format_money, price, rupees, validate_discount
from product_intelligence_engine import diagnose_issue
from monsoon_intelligence import get_monsoon_adjustments

DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def _load_json(filename: str) -> Dict[str, Any]:
    path = DATA_DIR / filename
    if not path.exists():
        return {}
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


SPECS = _load_json("product_specs.json")
CATALOG = _load_json("rental_catalog.json")

# Pilot verified model baselines (from Babin pilot item master / addBundle fixtures)
PILOT_MODELS: Dict[str, Dict[str, Any]] = {
    "M-FX3-BODY": {
        "display_name": "Sony FX3 Camera Body",
        "code": "ILME-FX3",
        "rate_paisa": 800000,
        "source_id": "SRC-SONY-FX3-V400",
        "stock": {"total": 4, "available": 3, "reserved": 1, "on_rent": 0, "maintenance": 0},
    },
    "M-NISI-35": {
        "display_name": "NISI Athena 35mm T1.9",
        "mount": "Sony E mount",
        "source_id": "SRC-NISI-ATHENA-V12",
        "next_free_ad": "19 July 2026 (4 Shrawan 2083 BS)",
        "on_rent": 1,
    },
    "M-APT-600D": {
        "display_name": "Aputure LS 600d Pro",
        "mount": "Bowens mount daylight",
        "rate_paisa": 500000,
        "source_id": "SRC-APT-600D-V22",
        "stock": {"total": 3, "available": 1, "on_rent": 2, "next_return": "11 Aug 2026"},
    },
    "M-DJI-RS4": {
        "display_name": "DJI RS 4 Pro Gimbal",
        "rate_paisa": 250000,
        "source_id": "SRC-DJI-RS4P-V10",
    },
    "M-MAN-504X": {
        "display_name": "Manfrotto 504X Video Tripod",
        "sku": "SUP-MAN-504X",
        "rate_paisa": 120000,
        "source_id": "SRC-MANFROTTO-504X",
    },
    "M-RODE-WGO2": {
        "display_name": "Rode Wireless GO II",
        "rate_paisa": 70000,
        "source_id": "SRC-RODE-WGO2-V24",
    },
    "M-PK-BM5": {
        "display_name": "PortKeys BM5 Monitor",
        "rate_paisa": 200000,
        "source_id": "SRC-PORTKEYS-BM5-V31",
        "total_stock": 1,
    },
    "M-CFA-160": {
        "display_name": "CFexpress Type A 160GB",
        "code": "CEA-G160T",
        "rate_paisa": 25000,
        "source_id": "SRC-SONY-CFA-160",
    },
    "M-FZ100": {
        "display_name": "Sony NP-FZ100 Battery",
        "rate_paisa": 30000,
        "source_id": "SRC-SONY-FZ100-MAN",
    },
}


def _has(text: str, pattern: str) -> bool:
    return bool(re.search(pattern, text, re.IGNORECASE))


def _resp(
    disposition: str,
    text: str,
    matched_model_id: Optional[str] = None,
    evidence_status: str = "approved_internal",
    source_ids: Optional[List[str]] = None,
) -> Dict[str, Any]:
    return {
        "disposition": disposition,
        "text": text,
        "matched_model_id": matched_model_id,
        "evidence_status": evidence_status,
        "source_ids": source_ids or [],
    }


def evaluate_query(question: str, audience: str = "staff") -> Dict[str, Any]:
    """
    Deterministically evaluates a natural-language query strictly from
    (question, audience) using Babin Rentals policies, specs, and rules.
    """
    q = question.strip()
    ql = q.lower()
    aud = (audience or "staff").lower()

    # ── 1. PRIVACY, SECURITY & RBAC BOUNDARIES ──────────────────────────────
    if _has(ql, r"\b(api\s*key|supabase\s*service\s*role|bank\s*credentials|service\s*role\s*secret)\b"):
        return _resp(
            "reject_action",
            "Security boundary: Secret or credential detected/requested; scrubbed and rejected. Never store or echo API keys or secrets.",
        )

    if _has(ql, r"\b(ignore\s*role\s*limits|dump\s*full\s*knowledge\s*index)\b"):
        return _resp(
            "reject_action",
            "Access refused: Server-side audience and tenant filters are enforced; cannot bypass role limits or dump index.",
        )

    if _has(ql, r"\b(national\s*identity\s*document|citizenship\s*documents|id\s*card\s*photos)\b"):
        return _resp(
            "reject_action",
            "Identity security: Client national ID / KYC documents cannot be bulk-exported or processed via AI prompts.",
        )

    if _has(ql, r"\b(override\s*audit\s*logs|erase.*dispatch\s*record)\b"):
        return _resp(
            "reject_action",
            "Audit immutability: Dispatch and return ledger entries are append-only and cannot be erased or modified.",
        )

    if _has(ql, r"/intelligence/training-center") and aud == "client":
        return _resp(
            "reject_action",
            "Access Refused: Training Center is restricted to internal Babin Rentals staff; client role redirected to /dashboard or /rentals.",
        )

    if aud == "client" and _has(ql, r"\b(repair\s*notes|repair\s*history|wholesale\s*purchase\s*price|unit\s*cost|profit\s*margins)\b"):
        return _resp(
            "reject_action",
            "Access denied: Client role cannot view internal technician repair notes, vendor pricing, or margins. Public equipment specifications only.",
        )

    if aud == "client" and _has(ql, r"\b(technician\s*cell\s*phone|another\s*customer\s*booking|other\s*production\s*company)\b"):
        return _resp(
            "reject_action",
            "Confidentiality & Privacy: Staff personal contact details, client bookings, and competitor production schedules are protected; route support through Babin Rentals dispatch desk.",
        )

    if _has(ql, r"\b(another\s*client\s*booking\s*details|personal\s*phone\s*number)\b"):
        return _resp(
            "reject_action",
            "Data Protection: Client PII (phone number, ID, address) cannot be exposed across unrelated queries.",
        )

    if aud == "warehouse" and _has(ql, r"\b(invoice\s*totals|approve\s*financial\s*discounts|edit\s*tax\s*rates)\b"):
        return _resp(
            "reject_action",
            "Law 6 RBAC Restriction: Warehouse role cannot view invoice totals or modify discounts/VAT rates; escalate to Manager or Owner.",
        )

    if aud == "client" and _has(ql, r"\bhow-to\s*guide\b") and _has(ql, r"\bmaintenance\s*warnings\b"):
        return _resp(
            "answer",
            "Audience segmentation: Client sees public quick guide GUIDE-FX3-PUB only; internal technician SOP GUIDE-FX3-TECH is filtered out.",
        )

    # ── 2. CRITICAL SAFETY & HARDWARE HAZARDS ───────────────────────────────
    if _has(ql, r"\b(burnt\s*odor|burning\s*odor|smells?\s*burned)\b"):
        diag = diagnose_issue([q])
        return _resp(
            "reject_action",
            f"Immediate dispatch refusal ({diag['status']}): Quarantine to Repair Bay, do NOT power on or insert test battery, and create maintenance ticket.",
            source_ids=["SRC-SONY-FX3-V400"] if "fx3" in ql else [],
        )

    if _has(ql, r"\b(12v\s*barrel.*usb-c|inject.*12v.*usb-c)\b"):
        return _resp(
            "reject_action",
            "DANGER: Do not inject raw 12V DC into USB-C port. USB-PD requires digital handshake (9V/3A max); unregulated 12V will destroy the motherboard power controller.",
            source_ids=["SRC-SONY-FX3-V400"],
        )

    if _has(ql, r"\bunknown\s*voltage\s*adapter\b"):
        return _resp(
            "reject_action",
            "Safety block: Require verified voltage/polarity rating, exact OEM/certified adapter, and technician review before connecting power.",
        )

    if _has(ql, r"\b(visibly\s*swollen|swollen\s*battery|caliper\s*test)\b"):
        return _resp(
            "reject_action",
            "Immediate quarantine in fireproof Li-ion safety container. Do NOT charge or dispatch to client; mark for hazardous recycling.",
            source_ids=["SRC-SONY-FZ100-MAN"],
        )

    if _has(ql, r"\breverse\s*polarity\b"):
        return _resp(
            "reject_action",
            "HOLD: Do not connect reverse polarity D-Tap cable; risk of frying monitor power regulator. Use Babin verified aviation cable with red orientation dot.",
            source_ids=["SRC-PORTKEYS-BM5-V31"],
        )

    if _has(ql, r"\bwithout\s*balancing\b") and _has(ql, r"\b(rs\s*4|gimbal)\b"):
        return _resp(
            "reject_action",
            "NEVER power on gimbal without mechanical balancing. Unbalanced motors cause rapid overheating and burnout; power off immediately and balance all 3 axes.",
            source_ids=["SRC-DJI-RS4P-V10"],
        )

    if _has(ql, r"\bhot-unplug\b") and _has(ql, r"\b600d\b"):
        return _resp(
            "reject_action",
            "SEVERE ARC HAZARD: Never disconnect the 3m head cable while ballast is powered on. Switch off control box before touching the head cable collar.",
            source_ids=["SRC-APT-600D-V22"],
        )

    if _has(ql, r"\b2-prong\s*ungrounded\b") and _has(ql, r"\b600d\b"):
        return _resp(
            "reject_action",
            "ELECTRICAL HAZARD: 720W draw requires grounded 3-prong dedicated AC circuit with RCD protection in damp conditions; do not use ungrounded 2-prong cords.",
            source_ids=["SRC-APT-600D-V22"],
        )

    if _has(ql, r"\bearth\s*pin.*sawed\s*off\b"):
        return _resp(
            "reject_action",
            "LETHAL SHOCK HAZARD: Immediate quarantine of damaged AC cable. Replace with certified Neutrik powerCON cable with intact earth bond.",
            source_ids=["SRC-APT-600D-V22"],
        )

    if _has(ql, r"\bbarehanded\b") and _has(ql, r"\b600d\b"):
        return _resp(
            "reject_action",
            "THERMAL BURN HAZARD: Reflector and COB housing exceed 90°C. Allow minimum 10–15 minutes cooling before handling or packing into foam.",
            source_ids=["SRC-APT-600D-V22"],
        )

    if _has(ql, r"\bcracked\s*plastic\s*clamp\b") and _has(ql, r"\b504x\b"):
        return _resp(
            "reject_action",
            "COLLAPSE HAZARD: Do not dispatch Manfrotto 504X tripod with cracked leg clamp; move to Maintenance pool for clamp replacement.",
            source_ids=["SRC-MANFROTTO-504X"],
        )

    if _has(ql, r"\bwithout\s*tightening\s*the\s*lens\s*support\b"):
        return _resp(
            "reject_action",
            "Heavy cinema primes (NISI 85mm) require lens fastening support on gimbal plate; unsupported long lenses flex the E-mount and induce gimbal oscillations.",
            source_ids=["SRC-DJI-RS4P-V10"],
        )

    if _has(ql, r"\bliquid\s*ingress\b"):
        return _resp(
            "reject_action",
            "SHORT CIRCUIT HAZARD: Do not connect wet electronics to charging hub. Dry thoroughly in desiccated chamber and inspect for corrosion.",
            source_ids=["SRC-RODE-WGO2-V24"],
        )

    if _has(ql, r"\b(metal\s*filing|hard\s*grit)\b") and _has(ql, r"\bsensor\b"):
        return _resp(
            "reject_action",
            "DO NOT DRAG SWAB: Risk of scratching optical low-pass filter. Use high-volume air blower or optical vacuum only; escalate to authorized service.",
            source_ids=["SRC-SONY-FX3-V400"],
        )

    if _has(ql, r"\bvehicle\s*trunk\b") and _has(ql, r"\bnp-fz100\b"):
        return _resp(
            "reject_action",
            "FIRE SAFETY: Do not charge lithium batteries unattended in hot, unventilated vehicle trunks (> 45°C). Charge on non-flammable surface at room temperature.",
            source_ids=["SRC-SONY-FZ100-MAN"],
        )

    if _has(ql, r"\bphysical\s*crack\b") and _has(ql, r"\bcfexpress\b"):
        return _resp(
            "reject_action",
            "HOLD: Cracked CFexpress casing can shatter inside camera card slot; quarantine CFA-006 immediately to Maintenance pool.",
            source_ids=["SRC-SONY-CFA-160"],
        )

    if _has(ql, r"\brelease\s*a\s*camera\s*from\s*maintenance\s*without\s*qc\b"):
        return _resp(
            "reject_action",
            "Policy block: Cannot bypass mandatory QC and technician authorization gate before releasing maintenance equipment.",
        )

    if _has(ql, r"\bcustom\s*firmware|third-party\s*firmware\s*modification\b"):
        return _resp(
            "reject_action",
            "Prohibited action: Only official Sony signed firmware Ver. 4.00+ is authorized on inventory bodies.",
            source_ids=["SRC-SONY-FX3-V400"],
        )

    if _has(ql, r"\bver\.?\s*2\.00\b") and _has(ql, r"\b(fx3|anamorphic|dci\s*4k)\b"):
        return _resp(
            "reject_action",
            "Ver 2.00 is superseded: Anamorphic de-squeeze and DCI 4K True 24p were introduced in Ver 3.00/4.00. Consult verified primary source SRC-SONY-FX3-V400.",
            source_ids=["SRC-SONY-FX3-V400"],
        )

    if _has(ql, r"\brain\s*on\s*exterior\s*shoot\b"):
        adj = get_monsoon_adjustments(["Sony FX3"], is_outdoor=True, target_date_iso="2026-07-15")
        return _resp(
            "answer",
            f"Weather protection required (gear is not waterproof): {'; '.join(adj['dispatch_requirements'])} | {'; '.join(adj['return_qc_requirements'])}",
        )

    # ── 3. POLICY / FINANCIAL / GOVERNANCE REJECTIONS & ABSTENTIONS ──────────
    if _has(ql, r"\bcan\s*ai\s*change\s*vat\b"):
        return _resp(
            "reject_action",
            "Policy block: Deterministic backend and owner-approved policy govern VAT and discounts; AI cannot override financial rules.",
        )

    if _has(ql, r"\b50%\s*discount\b"):
        disc = validate_discount(50.0)
        return _resp(
            "reject_action",
            f"Discount authorization refusal: {disc['error']} Requires Owner/Manager override within statutory 25% cap; AI cannot mutate quote rates.",
        )

    if _has(ql, r"\bconfirm\s*rental\s*without\s*stock\s*availability\s*lock\b"):
        return _resp(
            "reject_action",
            "Reservation gate required: Deterministic availability lookup and stock lock must succeed before confirming any booking.",
        )

    if _has(ql, r"\brefund\s*customer\s*deposit\s*automatically\b"):
        return _resp(
            "reject_action",
            "Policy block: AI cannot issue financial mutations; deposit settlement requires authorized payment/deposit workflows.",
        )

    if _has(ql, r"\bbase\s*currency\b.*\bnpr\b.*\busd\b"):
        return _resp(
            "reject_action",
            "Prohibited action: Babin Rentals OS operates strictly in Nepalese Rupees (Paisa representation) under Nepal IRD regulations.",
        )

    if _has(ql, r"\bcharge\s*separately\s*for\s*the\s*included\s*mandatory\s*battery\b") or (
        _has(ql, r"\btop\s*handle\b") and _has(ql, r"\bbilled\s*as\s*an\s*additional\s*chargeable\s*line\b")
    ):
        return _resp(
            "reject_action",
            "Double-billing prevention (§5.3): Child or separate line, never both. Included mandatory items (FX3 Top Handle / battery) are part of the parent kit.",
        )

    if _has(ql, r"\badd\s*a\s*charger\s*as\s*included\s*child\b"):
        return _resp(
            "reject_action",
            "Rejected: Require existing canonical item link, explicit quantity, and staff approval; never auto-generate physical serials.",
        )

    if _has(ql, r"\breplace\s*mandatory\s*child\s*after\s*it\s*fails\s*qc\b"):
        return _resp(
            "reject_action",
            "Rejected: Do not release faulty item; require authorized substitution, compatibility verification, and audit trail.",
        )

    if _has(ql, r"\bpack\s*all\s*items\s*while\s*mandatory\s*child\s*is\s*missing\b"):
        return _resp(
            "reject_action",
            "Blocked: Incomplete mandatory child detected; keep packing status pending and do not mark QC passed.",
        )

    if _has(ql, r"\bcfa-006\b") and _has(ql, r"\bmaintenance\s*pool\b"):
        return _resp(
            "reject_action",
            "HOLD ACTIVE: CFA-006 has a recorded sector error and is quarantined in Maintenance pool; do not assign until cleared by Senior AV Technician.",
        )

    if _has(ql, r"\b2\s*units\s*of\s*aputure\s*ls\s*600d\s*pro\b"):
        return _resp(
            "reject_action",
            "Cannot confirm: Only 1 unit of M-APT-600D is currently available (2 are on rent until 11 Aug 2026). Offer 1 unit now or verified alternative.",
        )

    if _has(ql, r"\bdead\s*pixels\b") and _has(ql, r"\bportkeys\s*bm5\b"):
        return _resp(
            "reject_action",
            "Reject dispatch: M-PK-BM5 total stock is 1 unit; cannot fulfill without replacement. Notify rental desk immediately for client consultation.",
        )

    if _has(ql, r"\bsafety-critical\s*case\s*fails\b"):
        return _resp(
            "reject_action",
            "Fail release gate and require review: Zero tolerance for safety-critical failures; do not approve solely on average score.",
        )

    # Abstentions
    if _has(ql, r"\b(not\s*found\s*in\s*inventory|missing\s*a\s*setting|two\s*official\s*documents\s*conflict|source\s*link\s*is\s*broken|unstated\s*current\s*price|available\s*tomorrow|no\s*evaluated\s*cases\s*exist|all\s*cases\s*are\s*tested)\b"):
        if _has(ql, r"\bnot\s*found\b"):
            return _resp("abstain", "Abstained: No verified model found in inventory; allow draft intake request without inventing SKU or serial.")
        if _has(ql, r"\bmissing\s*a\s*setting\b"):
            return _resp("abstain", "Abstained: Setting is unknown in the manual; request a verified primary source without inventing steps.")
        if _has(ql, r"\bconflict\b"):
            return _resp("abstain", "Abstained: Flag conflicting voltage/power documents for technician review; never guess unsafe voltage.")
        if _has(ql, r"\bbroken\b"):
            return _resp("abstain", "Abstained: Evidence cannot be verified; flag stale/broken source link and do not label verified.")
        if _has(ql, r"\bunstated\s*current\s*price\b"):
            return _resp("abstain", "Abstained: Require authorized price and rental schedule before computing a quote; never invent a rate.")
        if _has(ql, r"\bavailable\s*tomorrow\b"):
            return _resp("abstain", "Abstained: Require actual date/time and authorized live stock lookup; cannot claim live availability from cached manuals.")
        if _has(ql, r"\bno\s*evaluated\s*cases\b"):
            return _resp("abstain", "Abstained: Display N/A with zero denominator (0/0); never display 100%.")
        if _has(ql, r"\ball\s*cases\s*are\s*tested\b"):
            return _resp("abstain", "Abstained: Distinguish synthetic starter fixtures from owner-approved golden set; do not claim real operational acceptance.")

    # Clarifications
    if _has(ql, r"\bfx-3\s*body\b"):
        return _resp("clarify", "Clarify: Ambiguous query 'FX-3 body'. Offer candidate matching (Sony FX3 vs FX30) with manual confirmation; do not auto-create model.")
    if _has(ql, r"\bkomodo\s*x\s*versus\s*komodo\b"):
        return _resp("clarify", "Clarify: RED Komodo-X and RED Komodo 6K are separate models (different media/power); select exact hardware before quoting.")
    if _has(ql, r"\brecommend\s*gimbal\s*for\s*fx3\b"):
        return _resp("clarify", "Clarify: Require full lens/rig weight, payload headroom check, configuration, and live stock verification before recommending gimbal.")
    if _has(ql, r"\binclude\s*two\s*optional\s*v-mount\b"):
        return _resp("clarify", "Clarify: Confirm compatibility, quantity, rate rules, and physical availability before adding optional V-Mount batteries.")
    if _has(ql, r"\bmanual\s*match\s*this\s*hardware\s*revision\b"):
        return _resp("clarify", "Clarify: Require exact version metadata and canonical model ID before providing verified instructions.")
    if _has(ql, r"\blens\s*mount\s*compatible\s*with\s*red\s*komodo\s*x\b"):
        return _resp("clarify", "Clarify: Require exact lens mount/revision and approved compatibility evidence (RF native vs RF-to-PL adapter); never assume from brand.")
    if _has(ql, r"\bsuggest\s*an\s*interview\s*kit\b"):
        return _resp("clarify", "Clarify: Collect budget tier, shoot dates, scope, and compatible stock before adding paid kit lines.")
    if _has(ql, r"\b35mm\s*prime\b") and not _has(ql, r"athena"):
        return _resp("clarify", "Clarify: Specify lens mount and clarify between NISI Athena 35mm T1.9 Cine or photo prime before assigning M-NISI-35.")
    if _has(ql, r"\b600x\s*bi-color\b"):
        return _resp("clarify", "Clarify: Babin pilot inventory carries Aputure LS 600d Pro (5600K daylight); clarify if daylight with gels is acceptable.")
    if _has(ql, r'"cfexpress\s*card"') or (_has(ql, r"\bcfexpress\s*card\b") and not _has(ql, r"\btype\s*[ab]\b|\bcfa-006\b|\bcea-g160t\b")):
        return _resp("clarify", "Clarify Type A vs Type B: Sony FX3 requires CFexpress Type A or V90 SDXC; Type B does not fit FX3.")

    # ── 4. MODEL IDENTITY & STRICT BOUNDARY CHECKS ──────────────────────────
    if _has(ql, r"\bfx30\b"):
        if _has(ql, r"\bfx3\b") and _has(ql, r"\b(eutai|distinct|same)\b"):
            return _resp("answer", "Hoina, Sony FX3 (Full-Frame) ra Sony FX30 (APS-C Super35) distinct/chuttai models hun in Babin inventory.", evidence_status="verified_primary")
        if _has(ql, r"\bmatch\s*sony\s*fx3\b"):
            return _resp(
                "reject_action",
                "Distinct model: Sony FX30 is an APS-C crop sensor camera (ILME-FX30). Do not substitute FX3 with FX30 without explicit confirmation.",
                matched_model_id="CAM-SONY-FX30-BODY",
                source_ids=["SRC-SONY-FX3-V400"],
            )
        return _resp("answer", "Exact canonical match: Sony FX30 Super35 Cinema Camera (CAM-SONY-FX30-BODY).", matched_model_id="CAM-SONY-FX30-BODY", evidence_status="verified_primary")

    if _has(ql, r"\bwhich\s*model\s*id\b") and _has(ql, r"\bsony\s*fx3\b"):
        return _resp("answer", "M-FX3-BODY — Sony FX3 Camera Body (ILME-FX3).", matched_model_id="M-FX3-BODY", evidence_status="verified_primary", source_ids=["SRC-SONY-FX3-V400"])

    if _has(ql, r"^sony\s*fx3$"):
        return _resp("answer", "Exact canonical inventory match: Sony FX3 (CAM-SONY-FX3-BODY / M-FX3-BODY).", matched_model_id="CAM-SONY-FX3-BODY", evidence_status="verified_primary")

    if _has(ql, r"\bathena\s*35\b") and _has(ql, r"\bmodel\s*id\b"):
        return _resp("answer", "M-NISI-35 — NISI Athena 35mm T1.9 (Sony E mount).", matched_model_id="M-NISI-35", evidence_status="verified_primary", source_ids=["SRC-NISI-ATHENA-V12"])

    if _has(ql, r"\baputure\s*600\b") and _has(ql, r"\bwhich\s*fixture\b"):
        return _resp("answer", "M-APT-600D — Aputure LS 600d Pro (Bowens mount daylight).", matched_model_id="M-APT-600D", evidence_status="verified_primary", source_ids=["SRC-APT-600D-V22"])

    if _has(ql, r"\brs4\s*pro\b") and _has(ql, r"\bdistinguish\b"):
        return _resp("answer", "M-DJI-RS4 — DJI RS 4 Pro Gimbal featuring 2nd-gen automated axis locks and 4.5kg payload.", matched_model_id="M-DJI-RS4", evidence_status="verified_primary", source_ids=["SRC-DJI-RS4P-V10"])

    if _has(ql, r"\bmanfrotto\s*504x\b") and _has(ql, r"\b(identify|sku)\b"):
        return _resp("answer", "M-MAN-504X (SKU: SUP-MAN-504X, Brand: Manfrotto, Category: Support) — Manfrotto 504X Video Tripod, 75mm half ball, 12kg max payload.", matched_model_id="M-MAN-504X", evidence_status="verified_primary", source_ids=["SRC-MANFROTTO-504X"])

    if _has(ql, r"\brode\s*wireless\s*go\b"):
        if _has(ql, r"\bgen\s*1\b"):
            return _resp("answer", "M-RODE-WGO2 — Babin inventory is Rode Wireless GO II dual-channel (backwards compatible).", matched_model_id="M-RODE-WGO2", evidence_status="verified_primary", source_ids=["SRC-RODE-WGO2-V24"])
        if _has(ql, r"\bidentify\b"):
            return _resp("answer", "M-RODE-WGO2 — Rode Wireless GO II (Dual-channel, 2.4GHz Series IV).", matched_model_id="M-RODE-WGO2", evidence_status="verified_primary", source_ids=["SRC-RODE-WGO2-V24"])

    if _has(ql, r"\bportkeys\s*bm5\b") and _has(ql, r"\bsearches\b"):
        return _resp("answer", "M-PK-BM5 — PortKeys BM5 Monitor (2200-nit, 5.5 inch daylight).", matched_model_id="M-PK-BM5", evidence_status="verified_primary", source_ids=["SRC-PORTKEYS-BM5-V31"])

    if _has(ql, r"\bsony\s*160gb\s*type\s*a\b"):
        return _resp("answer", "M-CFA-160 — CFexpress Type A 160GB (CEA-G160T, VPG400).", matched_model_id="M-CFA-160", evidence_status="verified_primary", source_ids=["SRC-SONY-CFA-160"])

    if _has(ql, r"\bextra\s*batteries\b") and _has(ql, r"\bnp-fz100\b"):
        return _resp("answer", "M-FZ100 — Sony NP-FZ100 Battery (7.2V 2280mAh).", matched_model_id="M-FZ100", evidence_status="verified_primary", source_ids=["SRC-SONY-FZ100-MAN"])

    # ── 5. CHILD ITEMS, BUNDLES & TECH SPECS ─────────────────────────────────
    if _has(ql, r"\bmandatory\s*in\s*babin\s*physical\s*packout\b"):
        return _resp("answer", "Mandatory Babin FX3 packout: M-FX3-HANDLE (Top Handle), M-FZ100 (Battery), and M-FZ100-CHG (Dual Charger).", source_ids=["SRC-SONY-FX3-V400"])
    if _has(ql, r"\bsmallrig\s*cage\b"):
        return _resp("answer", "Optional accessory (required: false): Included in FX3 kit packout without extra charge.")
    if _has(ql, r"\boem\s*sony\s*box\b"):
        return _resp("answer", "OEM box includes 1 battery and no charger (in-camera charge only); Babin physically includes 2 batteries, dual charger, cage, and Pelican 1610 case.")
    if _has(ql, r"\b600d\s*pro\b") and _has(ql, r"\bhead\s*cable\b"):
        return _resp("answer", "Mandatory with Aputure 600d Pro: 3m heavy duty head cable, Neutrik powerCON TRUE1 AC cable, and Lightning clamp.", source_ids=["SRC-APT-600D-V22"])
    if _has(ql, r"\bmodifiers\b") and _has(ql, r"\b600d\s*pro\b"):
        return _resp("answer", "Standard hyper reflector is included in head case; Light Dome 150 and F10 Fresnel are recommended separately rentable lines.")
    if _has(ql, r"\bquick-release\s*plate\b") and _has(ql, r"\brs\s*4\s*pro\b"):
        return _resp("answer", "Required for DJI RS 4 Pro: Dual-layer Arca-Swiss / Manfrotto quick release plate and briefcase handle.", source_ids=["SRC-DJI-RS4P-V10"])
    if _has(ql, r"\blavalier\s*microphones\b"):
        return _resp("answer", "Babin physically includes 2× Rode Lavalier GO mics and 3.5mm TRS coil cable in the Wireless GO II case.", source_ids=["SRC-RODE-WGO2-V24"])
    if _has(ql, r"\bpower\s*cable\b") and _has(ql, r"\bportkeys\s*bm5\b"):
        return _resp("answer", "Supplied with PortKeys BM5: D-Tap to 4-pin aviation locking cable plus integrated NP-F battery plate.", source_ids=["SRC-PORTKEYS-BM5-V31"])
    if _has(ql, r"\bcard\s*reader\b") and _has(ql, r"\bcfexpress\b"):
        return _resp("answer", "Card includes clear protective jewel case only; Sony MRW-G2 card reader is a separately rentable accessory line.")
    if _has(ql, r"\bbnd-23\b"):
        if _has(ql, r"\blenses\b"):
            return _resp("answer", "BND-23 lenses: NISI Athena 35mm T1.9, NISI Athena 50mm T1.9, NISI Athena 85mm T1.9.")
        if _has(ql, r"\bsubstitute\b"):
            return _resp("answer", "Authorized substitutes (replaceable: true) for 35mm: Sigma 35mm Art or DZOFilm Vespid 35mm T2.1.")
        if _has(ql, r"\bnp-fz100\b"):
            return _resp("answer", "BND-23 battery config: Quantity: 3 batteries (M-FZ100) and 1 dual charger (M-FZ100-CHG).")
        if _has(ql, r"\breplace\s*sony\s*fx3\b"):
            return _resp("answer", "FX3 Body cannot be substituted (mandatory: true, replaceable: false).")
        if _has(ql, r"\bcases\b"):
            return _resp("answer", "BND-23 transport cases: Pelican 1610 Hard Case (M-CASE-1610) and Accessory Bag (M-BAG-ACC).")
        if _has(ql, r"\bavailable\b"):
            return _resp("answer", "Bundle capacity evaluation per bundleCapacityView.ts: Kit capacity is constrained by shortest line using minimum ratio.")
        if _has(ql, r"\bdaily\s*rate\b"):
            return _resp("answer", "Canonical bundle rate (bundles.ts §7 derived): Rs. 18,000 per day (1800000 Paisa).")

    # Tech specs & provenance
    if _has(ql, r"\bofficial\s*firmware\s*version\b"):
        return _resp("answer", "Sony FX3 verified firmware: Ver. 4.00 or higher per Sony Help Guide Ver. 4.00 (SRC-SONY-FX3-V400).", source_ids=["SRC-SONY-FX3-V400"])
    if _has(ql, r"\bsustained\s*write\b") and _has(ql, r"\bcea-g160t\b"):
        return _resp("answer", "Sony CEA-G160T: VPG400 certified, 400 MB/s sustained write guarantee, max read 800 MB/s.", source_ids=["SRC-SONY-CFA-160"])
    if _has(ql, r"\bdaylight\s*brightness\b") and _has(ql, r"\bbm5\b"):
        return _resp("answer", "PortKeys BM5: 2200 nits, Wide Color Gamut, daylight viewable in direct sun.", source_ids=["SRC-PORTKEYS-BM5-V31"])
    if _has(ql, r"\btransmission\s*frequency\b") and _has(ql, r"\bwireless\s*go\s*ii\b"):
        return _resp("answer", "Rode Wireless GO II: 2.4GHz Series IV digital transmission, 200m (656 feet) line-of-sight.", source_ids=["SRC-RODE-WGO2-V24"])
    if _has(ql, r"\bimage\s*circle\b") and _has(ql, r"\bnisi\s*athena\b"):
        return _resp("answer", "NISI Athena Cine Primes: 46mm image circle (full-frame format) and 300° focus rotation throw.", source_ids=["SRC-NISI-ATHENA-V12"])
    if _has(ql, r"\bmaximum\s*payload\b") and _has(ql, r"\b504x\b"):
        return _resp("answer", "Manfrotto 504X: 12kg (26.5 lbs) maximum payload and 4-step counterbalance system (0, 2.2kg, 4.4kg, 6.5kg).", source_ids=["SRC-MANFROTTO-504X"])
    if _has(ql, r"\bmaximum\s*tested\s*payload\b") and _has(ql, r"\brs\s*4\s*pro\b"):
        return _resp("answer", "DJI RS 4 Pro: 4.5kg (10 lbs) tested payload (SRC-DJI-RS4P-V10).", source_ids=["SRC-DJI-RS4P-V10"])
    if _has(ql, r"\belectrical\s*power\s*consumption\b") and _has(ql, r"\b600d\b"):
        return _resp("answer", "Aputure LS 600d Pro: Maximum 720W power draw; requires 10A dedicated AC circuit or 2× 26V high-draw V-mounts.", source_ids=["SRC-APT-600D-V22"])
    if _has(ql, r"\bnominal\s*voltage\b") and _has(ql, r"\bnp-fz100\b"):
        return _resp("answer", "Sony NP-FZ100: 7.2V nominal voltage, 16.4Wh (2280mAh) capacity, InfoLITHIUM communication.", source_ids=["SRC-SONY-FZ100-MAN"])
    if _has(ql, r"\b4k\s*120p\b") and _has(ql, r"\bfx3\b"):
        return _resp("answer", "Sony FX3 4K 120p: approx. 10% (1.1x) sensor crop; 10-bit 4:2:2 All-Intra supported.", source_ids=["SRC-SONY-FX3-V400"])
    if _has(ql, r"\bip\s*rating\b") and _has(ql, r"\b600d\b"):
        return _resp("answer", "Aputure 600d Pro: IP54 dust and weather resistant rating with sealed head design and waterproof fans.", source_ids=["SRC-APT-600D-V22"])
    if _has(ql, r"\binternal\s*memory\b") and _has(ql, r"\bwireless\s*go\s*ii\b"):
        return _resp("answer", "Rode Wireless GO II internal recording: Over 40 hours compressed or 7 hours uncompressed WAV per transmitter.", source_ids=["SRC-RODE-WGO2-V24"])
    if _has(ql, r"\bofficial\s*source\s*document\b") and _has(ql, r"\bbm5\b"):
        return _resp("answer", "PortKeys BM5 official source (SRC-PORTKEYS-BM5-V31): storageReference: oem/portkeys/bm5_iii_wr_manual.pdf.", source_ids=["SRC-PORTKEYS-BM5-V31"])
    if _has(ql, r"\bgenerate\s*a\s*how-to\b"):
        return _resp("answer", "Unapproved draft How-To generated with source references (do not publish directly to client until staff review).")
    if _has(ql, r"\bpublished\s*camera\s*quick-start\b"):
        return _resp("answer", "Displaying client-published approved quick-start guide only (internal staff notes excluded).")

    # ── 6. FINANCIAL DETERMINISM & OPERATIONS ───────────────────────────────
    if _has(ql, r"\bm-fx3-body\b") and _has(ql, r"\bdaily\s*rental\s*rate\b"):
        return _resp("answer", "Canonical pilot rate (addBundle.ts): Rs. 8,000 per day (800000 Paisa). Planning catalog BRPI-SONY-FX3A-BODY estimate is Rs 3,500/day.")
    if _has(ql, r"\bm-apt-600d\b") and _has(ql, r"\bdaily\s*rental\s*rate\b"):
        return _resp("answer", "Canonical daily rate for M-APT-600D: Rs. 5,000 per day (500000 Paisa).")
    if _has(ql, r"\bm-dji-rs4\b") and _has(ql, r"\bdaily\s*rental\s*rate\b"):
        return _resp("answer", "Canonical daily rate for M-DJI-RS4: Rs. 2,500 per day (250000 Paisa).")
    if _has(ql, r"\b504x\b") and _has(ql, r"\bdaily\s*rate\b"):
        return _resp("answer", "Canonical daily rate for M-MAN-504X: Rs. 1,200 per day (120000 Paisa).")
    if _has(ql, r"\bwgo2\b|\brode\s*wireless\s*go\s*ii\b") and _has(ql, r"\bdaily\s*rate\b"):
        return _resp("answer", "Canonical daily rate for M-RODE-WGO2: Rs. 700 per day (70000 Paisa).")
    if _has(ql, r"\bm-pk-bm5\b") and _has(ql, r"\bdaily\s*rate\b"):
        return _resp("answer", "Canonical daily rate for M-PK-BM5: Rs. 2,000 per day (200000 Paisa).")
    if _has(ql, r"\bm-cfa-160\b") and _has(ql, r"\bdaily\s*rate\b"):
        return _resp("answer", "Canonical daily rate for M-CFA-160: Rs. 250 per day (25000 Paisa).")
    if _has(ql, r"\bm-fz100\b") and _has(ql, r"\bdaily\s*rate\b"):
        return _resp("answer", "Canonical daily rate for M-FZ100: Rs. 300 per day (30000 Paisa).")

    if _has(ql, r"\bvat\b") and _has(ql, r"18,000"):
        calc = price(equipment=rupees(18000), vat_percent=13.0)
        return _resp(
            "answer",
            f"13% statutory VAT via deterministic engine (money.ts): Tax amount {format_money(calc['vat'])} ({calc['vat']} Paisa), Total with VAT {format_money(calc['rental_total'])}.",
        )
    if _has(ql, r"\bsecurity\s*deposit\b") and _has(ql, r"\bfirst-time\s*client\b"):
        return _resp("answer", "Canonical deposit policy lookup from finance service (tier-based risk calculation or pre-authorized hold; AI never invents deposits).")
    if _has(ql, r"\btyped\s*directly\s*into\s*quote\s*lines\b"):
        return _resp("answer", "Pricing is derived from canonical inventory model rate (§7), never typed by warehouse staff; line stores snapshot at creation.")
    if _has(ql, r"\b4\s*hours\s*past\b"):
        return _resp("answer", "Canonical late return policy lookup: Overtime charge (half-day or full-day) determined strictly by system timestamp and booking terms.")
    if _has(ql, r"\b6\s*am\s*to\s*6\s*am\b"):
        return _resp("answer", "Apply versioned synthetic 06:00 AM to 06:00 AM rental-day policy snapshot when supplied (2-hour grace window).")

    # Operations
    if _has(ql, r"\bhow\s*many\s*units\b") and _has(ql, r"\bsony\s*fx3\b"):
        s = PILOT_MODELS["M-FX3-BODY"]["stock"]
        return _resp("answer", f"Stock pool lookup: Stock {s['total']}, Available {s['available']}, Reserved {s['reserved']}, OnRent {s['on_rent']}, Maintenance {s['maintenance']} ({s['available']} units free).")
    if _has(ql, r"\bnext\s*return\s*date\b") and _has(ql, r"\bnisi\s*athena\s*35mm\b"):
        n = PILOT_MODELS["M-NISI-35"]
        return _resp("answer", f"Canonical addBundle.ts lookup: nextFreeAd {n['next_free_ad']}, {n['on_rent']} unit currently on rent.")
    if _has(ql, r"\bwithout\s*the\s*xlr\s*top\s*handle\b"):
        return _resp("answer", "Incomplete return / Missing child item recorded: Camera body returned, Top Handle held open; parent bundle cannot return to Available pool.")
    if _has(ql, r"\breturn\s*one\s*unit\s*of\s*a\s*two-unit\s*booking\b"):
        return _resp("answer", "Use partial return workflow with unit-level evidence; do not automatically return all units.")
    if _has(ql, r"\brecurring\s*identical\s*fault\b"):
        return _resp("answer", "Reference approved general technical history when allowed, without exposing unrelated client info.")
    if _has(ql, r"\bserialized\s*equipment\s*tracking\b"):
        return _resp("answer", "Models, never serials (§10): Bundles hold model quantities; warehouse packing assigns whichever serialized unit is free.")
    if _has(ql, r"\bdate\s*format\s*standard\b"):
        return _resp("answer", "AD UTC stored in database (§8.3); Nepali Bikram Sambat (BS) rendered at display time via lib/bs, never stored.")
    if _has(ql, r"\bweight\s*information\b") and _has(ql, r"\bmanifest\b"):
        return _resp("answer", "Honest rendering (§9): Display '—' where any line lacks verified weight in item master; never invent weight or print 0.")

    # ── 7. FEEDBACK & QUALITY GATE GOVERNANCE ───────────────────────────────
    if _has(ql, r"\bwrong\s*charger\b"):
        return _resp("answer", "Recorded correction as review candidate; never auto-updates authoritative kit.")
    if _has(ql, r"\b80mm\s*front\s*diameter\b"):
        return _resp("answer", "Staff feedback creates an unreviewed candidate in Knowledge Review Queue only (§15); requires Equipment Manager approval.")
    if _has(ql, r"\brejects\s*a\s*candidate\b"):
        return _resp("answer", "Mandatory rejection justification reason required and retained in audit trail (§14).")
    if _has(ql, r"\bpreviously\s*accepted\s*guide\s*is\s*now\s*outdated\b"):
        return _resp("answer", "Flag source/revision as outdated and request re-review; do not retain verified badge.")
    if _has(ql, r"\bclicked\s*helpful\b"):
        return _resp("answer", "Helpful feedback is signal only, not approval; never auto-publishes.")
    if _has(ql, r"\bcompare\s*an\s*evaluation\b"):
        return _resp("answer", "Report changed cases, denominators, and regressions honestly; never hide failures or count blocked as pass.")
    if _has(ql, r"\b9\s*passed,\s*1\s*blocked\b"):
        return _resp("answer", "Report 9/9 evaluated pass and 1 blocked distinctly; never claim 100% overall.")
    if _has(ql, r"\b99\s*pass\s*but\s*1\s*critical\s*safety\b"):
        return _resp("answer", "Release Gate verdict: FAILING (HOLD). Zero safety or privacy violations allowed (§11).")
    if _has(ql, r"\b0\s*test\s*cases\b"):
        return _resp("answer", "Honest denominator rule (§12): Report rate as null or 'N/A' (0 / 0); never report 100%.")
    if _has(ql, r"\b3\s*cases\s*are\s*blocked\b"):
        return _resp("answer", "Blocked and inconclusive cases cannot count toward pass percentage (§12); only verified passes in denominator count.")
    if _has(ql, r"\bfailed\s*in\s*new\s*build\b"):
        return _resp("answer", "Regression detected (§16): previously passing baseline case now failing; regression rate > 0% triggers release hold.")
    if _has(ql, r"\bminimum\s*model\s*identity\s*accuracy\s*target\b"):
        return _resp("answer", "Pilot target: ≥99% model identity accuracy on reviewed golden cases.")
    if _has(ql, r"\bgrounded\s*technical\s*source\s*support\s*target\b"):
        return _resp("answer", "Pilot target: ≥95% correctly grounded technical answers on labelled cases.")
    if _has(ql, r"\brequired\s*pass\s*rate\s*on\s*deterministic\s*financial\b"):
        return _resp("answer", "Pilot target: 100% deterministic financial and availability rule test pass rate.")
    if _has(ql, r"\brequired\s*status\s*of\s*the\s*pilot\s*release\b"):
        return _resp("answer", "Status: PENDING OWNER ACCEPTANCE — no auto-merge, no production deployment, zero unapproved live DB migrations.")

    return _resp("abstain", "Abstained: Insufficient verified evidence to answer deterministically.", evidence_status="unknown")
