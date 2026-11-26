"""
kit_intelligence.py - Babin Rentals Kit Intelligence & Auto-Completion Engine

Integrates RIS v4.0 Layer 2 & Layer 3 domain logic:
- Auto-completion dependency triggers (§R4)
- Hard conflict non-overrideable blocks (§24)
- Shoot-type playbooks (9 production types: Wedding, Doc, Music Video, etc.)
- 6-vector budget scaling ladders (Low, Mid, High-End Cinema)
- Camera Caretaker auto-suggestion (Rs 2,000/day on high-value kits)
- Kit completeness score across 8 essential cinema slots
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def _load_json_safe(filename: str) -> Dict[str, Any]:
    path = DATA_DIR / filename
    if not path.exists():
        return {}
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def _has_keyword(text: str, keyword: str) -> bool:
    return bool(re.search(rf"(?<![a-z0-9]){re.escape(keyword.lower())}(?![a-z0-9])", text.lower()))


# ============================================================
# LAYER 3: HARD CONFLICTS & DEPENDENCY TRIGGERS
# ============================================================

HARD_BLOCKS = [
    {
        "pattern": r"(?=.*\bronin\s*4d\b)(?=.*\b(rs\s*3|rs\s*4|rs\s*5|gimbal|crane|steadicam)\b)",
        "reason": "HARD BLOCK: DJI Ronin 4D contains an integrated 4-axis motorized gimbal. Pairing with an external gimbal is mechanically redundant and prohibited.",
        "rule_id": "HARD_BLOCK_RONIN4D_GIMBAL"
    },
    {
        "pattern": r"(?=.*\bchiopt\b)(?!.*\b(rods?|lens\s*support|support\s*bracket)\b)",
        "reason": "HARD BLOCK: Heavy cinema zoom (CHIOPT) requires 15mm baseplate rods and lens support. Operating without lens support causes permanent mount/chassis tearing.",
        "rule_id": "HARD_BLOCK_CHIOPT_NO_SUPPORT"
    },
    {
        "pattern": r"(?=.*\b(glimmer|black\s*pro\s*mist|promist)\b)(?=.*\b95mm\b)(?!.*\b(mirage|matte\s*box)\b)",
        "reason": "HARD BLOCK: Circular 95mm cine filters require Tilta Mirage or compatible clamp-on matte box to mount safely.",
        "rule_id": "HARD_BLOCK_FILTER_NO_MATTEBOX"
    },
    {
        "pattern": r"(?=.*\bkomodo[\s\-_]*x\b)(?=.*\bcfast\b)",
        "reason": "HARD BLOCK: RED Komodo-X uses CFexpress Type B media only; CFast 2.0 cards are physically incompatible.",
        "rule_id": "HARD_BLOCK_KOMODOX_CFAST"
    },
    {
        "pattern": r"(?=.*\bkomodo(?:\s*6k)?\b)(?!.*\bkomodo[\s\-_]*x\b)(?=.*\bcfexpress\b)",
        "reason": "HARD BLOCK: RED Komodo 6K (Gen 1) uses RED-verified CFast 2.0 media only; CFexpress cards do not fit.",
        "rule_id": "HARD_BLOCK_KOMODO6K_CFEXPRESS"
    },
    {
        "pattern": r"(?=.*\bkomodo(?:\s*6k)?\b)(?!.*\bkomodo[\s\-_]*x\b)(?=.*\bhdmi\b)(?!.*\b(sdi|converter|cross[\s\-_]*converter)\b)",
        "reason": "HARD BLOCK: RED Komodo 6K has no HDMI output port (12G-SDI only); direct HDMI monitoring requires an SDI monitor or SDI-to-HDMI converter.",
        "rule_id": "HARD_BLOCK_KOMODO6K_HDMI"
    },
    {
        "pattern": r"(?=.*\bpl\s*lens\b)(?=.*\b(fx3a?|a7s?\s*(?:iii|iv|v|3|4|5)|e\s*mount)\b)(?!.*\b(pl[\s\-_]*to[\s\-_]*e|mount\s*adapter|adapter)\b)",
        "reason": "HARD BLOCK: PL-mount cinema lens on Sony E-mount body requires a verified PL-to-E mechanical mount adapter.",
        "rule_id": "HARD_BLOCK_PL_E_ADAPTER_MISSING"
    }
]

DEPENDENCY_TRIGGERS = [
    {
        "trigger": r"\bchiopt\b",
        "require": [
            {"name": "15mm Rod System", "category": "Support", "reason": "Mandatory lens support base for heavy zoom"},
            {"name": "Heavy Duty Lens Support Bracket", "category": "Support", "reason": "Mount strain relief"}
        ],
        "suggest": [
            {"name": "Tilta Mirage Matte Box", "category": "Optics", "reason": "Front element flare control"}
        ]
    },
    {
        "trigger": r"\bkomodo[\s\-_]*x\b",
        "require": [
            {"name": "CFexpress Type B Media (512GB/1TB)", "category": "Media", "reason": "High-bitrate R3D raw capture"},
            {"name": "CFexpress Type B USB-C Card Reader", "category": "Media", "reason": "Data offload"},
            {"name": "V-Mount Batteries (2x Minimum)", "category": "Power", "reason": "High continuous camera power draw"},
            {"name": "Dual V-Mount Fast Charger", "category": "Power", "reason": "Continuous power turnover"}
        ],
        "suggest": [
            {"name": "Camera Caretaker Service", "category": "Service", "reason": "On-set safety and deposit protection for cinema body"}
        ]
    },
    {
        "trigger": r"\bkomodo(?:\s*6k)?\b(?!.*komodo[\s\-_]*x)",
        "require": [
            {"name": "RED-Verified CFast 2.0 Media (512GB)", "category": "Media", "reason": "Komodo 6K requires CFast 2.0 media"},
            {"name": "CFast 2.0 USB-C Card Reader", "category": "Media", "reason": "Data offload"},
            {"name": "Dual Canon BP-9XX or V-Mount 2-Pin LEMO Power", "category": "Power", "reason": "Continuous camera power"},
            {"name": "12G-SDI Monitor or SDI-to-HDMI Converter", "category": "Monitoring", "reason": "Komodo 6K has 12G-SDI output only"}
        ],
        "suggest": [
            {"name": "Camera Caretaker Service", "category": "Service", "reason": "On-set safety and deposit protection for cinema body"}
        ]
    },
    {
        "trigger": r"\bfx\s*30\b",
        "require": [
            {"name": "Sony CFexpress Type A / V90 SDXC Card", "category": "Media", "reason": "Super35 4K 120p recording"},
            {"name": "NP-FZ100 Batteries (2x Minimum)", "category": "Power", "reason": "Full day coverage"},
            {"name": "Dual Battery Charger", "category": "Power", "reason": "Recharging"}
        ],
        "suggest": [
            {"name": "Confirm APS-C E-Mount Lens Coverage (FX30 is Super35, not Full-Frame FX3)", "category": "Optics", "reason": "Boundary verification"}
        ]
    },
    {
        "trigger": r"\b(?:fx\s*3a?|ilme[\s\-_]*fx3)\b",
        "require": [
            {"name": "Sony CFexpress Type A Tough Card (160GB+)", "category": "Media", "reason": "All-I 4K 120p high-speed recording"},
            {"name": "CFexpress Type A / SD Dual Card Reader", "category": "Media", "reason": "Field backup"},
            {"name": "NP-FZ100 Batteries (3x Minimum)", "category": "Power", "reason": "Full day coverage"},
            {"name": "Dual/Triple Battery Charger", "category": "Power", "reason": "Overnight/interval recharging"}
        ],
        "suggest": [
            {"name": "Tilta FX3 Camera Cage with Top Handle", "category": "Support", "reason": "Port protection and rigging"},
            {"name": "V-Mount Battery Plate (D-Tap to FZ100)", "category": "Power", "reason": "Continuous all-day power"}
        ]
    },
    {
        "trigger": r"\bpl\s*lens\b",
        "require": [
            {"name": "Manual Follow Focus or Wireless Nucleus", "category": "Focus", "reason": "Geared cinema focus ring operation"},
            {"name": "High-Bright Director/Focus Monitor", "category": "Monitoring", "reason": "Critical manual focus verification"}
        ],
        "suggest": [
            {"name": "Tilta Mirage Matte Box System", "category": "Optics", "reason": "4x5.65 filter mounting"}
        ]
    },
    {
        "trigger": r"\b(wireless\s*tx|transmission|mars|accsoon|cosmo)\b",
        "require": [
            {"name": "TX and RX Unit Pair with Antennas", "category": "Monitoring", "reason": "Wireless video link completeness"},
            {"name": "Locking HDMI/SDI Video Cables (2x)", "category": "Cables", "reason": "Primary and backup video patch"},
            {"name": "D-Tap / NP-F Dedicated Power Source", "category": "Power", "reason": "Transmitter power supply"}
        ],
        "suggest": [
            {"name": "Director Monitor Cage with Handles", "category": "Support", "reason": "Client/Director mobile viewing"}
        ]
    },
    {
        "trigger": r"\b(aputure|amaran\s*300c?|amaran\s*200d?|light\s*storm|600x|600d|400x)\b",
        "require": [
            {"name": "Heavy Duty C-Stand with Grip Head & Arm", "category": "Grip", "reason": "Light fixture elevation"},
            {"name": "Shot Bag / Sandbag (10kg+)", "category": "Safety", "reason": "Mandatory fixture toppling protection"},
            {"name": "16A Heavy Duty Power Extension Cable", "category": "Power", "reason": "High-load electrical safety"}
        ],
        "suggest": [
            {"name": "Light Dome Softbox / Lantern Modifier", "category": "Optics", "reason": "Beam diffusion"}
        ]
    }
]


# ============================================================
# LAYER 2: SHOOT-TYPE PLAYBOOKS & BUDGET SCALING LADDERS
# ============================================================

SHOOT_PLAYBOOKS: Dict[str, Dict[str, Any]] = {
    "wedding": {
        "title": "Wedding & Event Production",
        "recommended_camera": "Sony FX3A / Sony A7IV",
        "recommended_lenses": ["Sony FE 24-70mm f/2.8 GM II", "Sony FE 70-200mm f/2.8 GM OSS II", "Sigma 28-105mm f/2.8 Art"],
        "recommended_support": ["DJI RS4 Pro / RS3 Gimbal", "K&F Carbon Fiber Video Tripod"],
        "recommended_audio": ["DJI Mic 2 / Mic Mini Wireless Dual Kit"],
        "recommended_lighting": ["Amaran 200d / 300c LED", "Amaran RGB Tube Lights"],
        "avoid": ["Manual PL primes", "Bulky anamorphic sets", "Heavy unassisted cinema rigs"],
        "strategy": "Speed, ultra-reliable eye autofocus, low-light sensitivity, compact dual-card redundancy."
    },
    "documentary": {
        "title": "Documentary & Expedition",
        "recommended_camera": "Sony FX3A / Sony FX6",
        "recommended_lenses": ["Sony FE 24-105mm f/4 G OSS", "Sony FE 16-35mm f/2.8 GM II", "Sigma 24-70mm f/2.8 Art"],
        "recommended_support": ["Miller / K&F Fluid Head Tripod", "Dana Dolly System"],
        "recommended_audio": ["Wireless Lavalier Kit + Shotgun Mic + Deadcat"],
        "recommended_lighting": ["Compact Bi-color Flex Mats / Amaran 100x"],
        "avoid": ["Fragile non-weather-sealed accessories", "Excessive battery plates requiring wall power"],
        "strategy": "Rugged portability, extensive battery reserve, dual media backup, weather resistance."
    },
    "music_video": {
        "title": "Music Video & Stylized Commercial",
        "recommended_camera": "RED Komodo-X / DJI Ronin 4D / Sony FX3A",
        "recommended_lenses": ["Blazar Mantis 1.8x Anamorphic Set", "NiSi Athena Prime Set", "CHIOPT 28-85mm Cinema Zoom"],
        "recommended_support": ["Tilta Float Handheld Gimbal Support", "DJI RS4 Pro", "Easyrig Vario 5"],
        "recommended_audio": ["On-camera scratch mic (Playback track is pre-recorded)"],
        "recommended_lighting": ["Aputure 600x Pro", "Amaran 300c Color LED", "C-stand grid with flags and diffusers"],
        "avoid": ["Unstabilized budget lenses without character"],
        "strategy": "High optical character, dynamic range, anamorphic flare, expressive camera movement."
    },
    "commercial": {
        "title": "Brand Commercial & Advertising",
        "recommended_camera": "RED Komodo-X / ARRI Alexa Mini / Sony FX3A",
        "recommended_lenses": ["NiSi Athena Full Cinema Set (14-85mm)", "Sony GM Prime Trio"],
        "recommended_support": ["Heavy Duty Studio Tripod", "Motorized Slider / Jib"],
        "recommended_audio": ["Boom pole + Sennheiser 416 + Wireless IFB Monitoring"],
        "recommended_lighting": ["Aputure 600x / 400x Studio Kit", "Skypanel / 4x4 Diffusion Frames"],
        "avoid": ["Run-and-gun consumer setups"],
        "strategy": "Exact color fidelity, director and client SDI wireless monitors, repeatable focus marks."
    },
    "indie_film": {
        "title": "Narrative Independent Film",
        "recommended_camera": "RED Komodo-X / Sony FX3A Rigged Cinema",
        "recommended_lenses": ["NiSi Athena Cinema Primes", "Blazar Great Joy Anamorphic"],
        "recommended_support": ["Shoulder Rig + V-Mount Power Distro", "Studio Assist Tripod", "Dana Dolly"],
        "recommended_audio": ["Field Recorder (Zoom F6) + Shotgun Boom + Wireless Lavs"],
        "recommended_lighting": ["Aputure 300c / 600x + Complete Grip & Sandbag Package"],
        "avoid": ["Uncalibrated auto-focus hunts"],
        "strategy": "Cinematic texture, 100% manual focus control with Nucleus-M, AC and DP wireless monitoring."
    },
    "corporate_event": {
        "title": "Corporate Conference & Live Event",
        "recommended_camera": "Sony A7IV / Sony FX3A Dual Setup",
        "recommended_lenses": ["Sony FE 70-200mm f/2.8 GM II", "Sony FE 24-70mm f/2.8 GM II"],
        "recommended_support": ["Solid Fluid Head Tripods (2x)"],
        "recommended_audio": ["Direct XLR Audio Interface / Wireless Receivers"],
        "recommended_lighting": ["Even Soft Key Lighting (Amaran 200d with Lantern)"],
        "avoid": ["Extravagant color effects", "Untested single-battery rigs"],
        "strategy": "Continuous AC power/dummy battery, uninterrupted long record times, dual-slot recording."
    }
}

BUDGET_SCALING_LADDER: Dict[str, Dict[str, str]] = {
    "low": {
        "label": "Budget / Run & Gun",
        "camera_body": "Sony A7IV Mirrorless Hybrid",
        "lens_tier": "Sigma Art / Tamron G2 High-Speed Zooms",
        "nd_filtration": "77mm/82mm Variable ND Screw-on Filter",
        "power_solution": "NP-FZ100 High-Capacity Batteries (4x)",
        "monitoring": "On-Camera 5-inch 4K Monitor",
        "focus_control": "Camera Native Fast Hybrid Autofocus",
        "lighting": "Amaran 100d / Tube Lights with Light Stands"
    },
    "mid": {
        "label": "Standard Professional",
        "camera_body": "Sony FX3A Cinema Line Body",
        "lens_tier": "Sony G Master Zooms or NiSi Athena Primes",
        "nd_filtration": "Tilta Mirage Matte Box with Variable ND Module",
        "power_solution": "Dual 99Wh V-Mount Batteries with D-Tap Distribution",
        "monitoring": "Accsoon M7 Pro Wireless Director/Operator Monitor",
        "focus_control": "Tilta Nucleus Nano II Wireless Follow Focus",
        "lighting": "Amaran 300c / 200d with Softboxes and C-Stands"
    },
    "high": {
        "label": "High-End Cinema Package",
        "camera_body": "RED Komodo-X / DJI Ronin 4D 6K Cinema System",
        "lens_tier": "Full Cine Prime Set (NiSi Athena / Blazar Anamorphic)",
        "nd_filtration": "4x5.65 Full Spectrum IRND Kit + Tilta Mirage System",
        "power_solution": "Quad 150Wh V-Mount Grid with Dual Fast Charger",
        "monitoring": "Desview 7-inch High-Bright OLED + Accsoon Wireless Multi-Receiver",
        "focus_control": "Tilta Nucleus-M Dual-Motor Follow Focus + 1st AC Rig",
        "lighting": "Aputure 600x Pro + 400x Pro with Full Grip Truck Setup"
    }
}

CARETAKER_POLICY = {
    "daily_rate_paisa": 200000,  # Rs 2,000 / day
    "auto_suggest_threshold_paisa": 5000000,  # Rs 50,000 kit value
    "critical_keywords": ["red", "komodo", "ronin 4d", "anamorphic", "blazar", "chiopt"],
    "pitch": "Camera Caretaker (Rs 2,000/day): Provides dedicated on-set equipment technician, protects your security deposit, ensures proper lens/filter handling, and provides fast setup."
}


# ============================================================
# ENGINE IMPLEMENTATION
# ============================================================

def complete_kit(items: List[str]) -> Dict[str, Any]:
    """
    Evaluates a gear kit list, applies Layer 1 hard blocks, executes Layer 3
    dependency triggers, suggests required companion accessories, and scores
    kit completeness across 8 essential production slots.
    """
    joined = " ".join(items).lower()
    blocking_errors: List[str] = []
    required_additions: List[Dict[str, Any]] = []
    suggested_additions: List[Dict[str, Any]] = []
    warnings: List[str] = []

    # 1. Evaluate Hard Blocks
    for block in HARD_BLOCKS:
        if re.search(block["pattern"], joined):
            blocking_errors.append(block["reason"])

    # 2. Evaluate Dependency Triggers
    seen_requires = set()
    for dep in DEPENDENCY_TRIGGERS:
        if re.search(dep["trigger"], joined):
            for req in dep.get("require", []):
                if req["name"] not in seen_requires:
                    seen_requires.add(req["name"])
                    required_additions.append(req)
            for sug in dep.get("suggest", []):
                if sug["name"] not in seen_requires:
                    seen_requires.add(sug["name"])
                    suggested_additions.append(sug)

    # 3. Caretaker Suggestion Check (token-bounded so 'red' doesn't match 'infrared'/'powered')
    suggest_caretaker = any(_has_keyword(joined, kw) for kw in CARETAKER_POLICY["critical_keywords"])
    if suggest_caretaker:
        suggested_additions.append({
            "name": "Babin Rentals Camera Caretaker Service",
            "category": "Service",
            "daily_rate_paisa": CARETAKER_POLICY["daily_rate_paisa"],
            "reason": CARETAKER_POLICY["pitch"]
        })

    # 3b. Merge verified compatibility graph advisories when data exists
    compat_graph = _load_json_safe("compatibility_graph.json")
    for rel in compat_graph.get("relationships", []):
        if rel.get("relation") == "REQUIRES":
            src_tokens = rel.get("source", "").lower().replace("_", " ")
            if "accsoon" in src_tokens and _has_keyword(joined, "accsoon"):
                req_name = "4x RP-SMA Dual-Band Antennas (Verify Count)"
                if req_name not in seen_requires:
                    seen_requires.add(req_name)
                    required_additions.append({"name": req_name, "category": "Monitoring", "reason": "Required by compatibility graph"})

    # 4. Kit Completeness Scoring (8 essential slots)
    essential_slots = {
        "camera": bool(re.search(r"\b(camera|fx3a?|fx30|a7\w*|komodo(?:\s*x)?|ronin\s*4d|body)\b", joined)),
        "lens": bool(re.search(r"\b(lens|sigma|tamron|gm|nisi|athena|chiopt|blazar|prime|zoom)\b", joined)),
        "media": bool(re.search(r"\b(media|card|cfexpress|sd|sdxc|cfast|prossd)\b", joined) or any(r["category"] == "Media" for r in required_additions)),
        "power": bool(re.search(r"\b(battery|batteries|v-mount|vmount|np-f\w*|fz100|tb50|charger|power)\b", joined) or any(r["category"] == "Power" for r in required_additions)),
        "support": bool(re.search(r"\b(tripod|504x|gimbal|rs3|rs4|rig|cage|stand|rods?)\b", joined) or any(r["category"] == "Support" for r in required_additions)),
        "monitoring": bool(re.search(r"\b(monitor|accsoon|portkeys|bm5|desview|wireless|screen)\b", joined) or any(r["category"] == "Monitoring" for r in required_additions)),
        "audio": bool(re.search(r"\b(mic|audio|lav|shotgun|rode|wireless\s*go|sound)\b", joined)),
        "safety_filtration": bool(re.search(r"\b(nd|vnd|filter|mirage|matte\s*box|sandbag)\b", joined) or any(r["category"] in ("Optics", "Safety") for r in required_additions))
    }

    slots_filled = sum(1 for filled in essential_slots.values() if filled)
    completeness_score = round((slots_filled / len(essential_slots)) * 100, 1)

    return {
        "original_items": items,
        "is_valid": len(blocking_errors) == 0,
        "blocking_errors": blocking_errors,
        "required_additions": required_additions,
        "suggested_additions": suggested_additions,
        "essential_slots": essential_slots,
        "completeness_score": completeness_score,
        "suggest_caretaker": suggest_caretaker
    }


def recommend_kit(
    shoot_type: str,
    budget_level: str = "mid",
    crew_size: int = 3,
    location: str = "local",
    client_name: Optional[str] = None
) -> Dict[str, Any]:
    """
    Generates a full equipment blueprint based on shoot parameters, budget tier,
    crew size, and location. Provides contextual 'why' reasoning and upgrades.
    """
    norm_shoot = shoot_type.lower().strip().replace(" ", "_")
    if norm_shoot not in SHOOT_PLAYBOOKS:
        norm_shoot = "commercial" if "ad" in norm_shoot else "wedding"

    norm_budget = budget_level.lower().strip()
    if norm_budget not in BUDGET_SCALING_LADDER:
        norm_budget = "mid"

    playbook = SHOOT_PLAYBOOKS[norm_shoot]
    ladder = BUDGET_SCALING_LADDER[norm_budget]

    kit_items: List[Dict[str, str]] = [
        {"role": "Primary Camera", "item": ladder["camera_body"], "reason": "Optimized for shoot character and budget"},
        {"role": "Primary Optics", "item": ladder["lens_tier"], "reason": "Covers required focal lengths"},
        {"role": "Exposure Control", "item": ladder["nd_filtration"], "reason": "Exposure control and depth of field management"},
        {"role": "Power Supply", "item": ladder["power_solution"], "reason": "Continuous shooting runtime"},
        {"role": "Monitoring", "item": ladder["monitoring"], "reason": "Focus and composition checking"},
        {"role": "Focus Control", "item": ladder["focus_control"], "reason": "Precise lens operation"},
        {"role": "Lighting Package", "item": ladder["lighting"], "reason": "Scene illumination and mood"}
    ]

    # Contextual Notes
    why_reasons: List[str] = [
        f"Shoot Type '{playbook['title']}': {playbook['strategy']}",
        f"Budget Tier '{ladder['label']}': Aligned across camera, optics, ND filtration, power, and wireless monitoring."
    ]

    if crew_size >= 4:
        why_reasons.append(f"Crew size of {crew_size}: Requires dedicated director monitoring and follow focus unit.")
        kit_items.append({"role": "Crew Comms", "item": "Hollyland Solidcom Wireless Intercom (4-Headset Kit)", "reason": "Director-DP-Gaffer coordination"})

    if "mountain" in location.lower() or "high_altitude" in location.lower() or "mustang" in location.lower():
        why_reasons.append(f"Remote/Mountain shoot at '{location}': Triggers cold-weather power derating (40% buffer) and waterproof pelican transport.")
        kit_items.append({"role": "Power Reserve", "item": "Extra 99Wh V-Mount Packs (2x) + High-Altitude Inverter", "reason": "Cold temperature capacity drop"})

    # Upgrades (max 3)
    upgrades: List[Dict[str, Any]] = []
    if norm_budget == "low":
        upgrades.append({
            "item": "Sony FX3A Cinema Line Body instead of A7IV",
            "delta_paisa": 300000,
            "benefit": "Active cooling, 16-bit RAW output, cinema ergonomics, and high low-light dual ISO."
        })
        upgrades.append({
            "item": "Tilta Mirage Matte Box with VND",
            "delta_paisa": 120000,
            "benefit": "Eliminates X-cross polarization artifacts on wide lenses, lighter front weight."
        })
    elif norm_budget == "mid":
        upgrades.append({
            "item": "RED Komodo-X 6K Cinema Package",
            "delta_paisa": 800000,
            "benefit": "Global shutter eliminates rolling shutter distortion on action, 6K 80fps R3D raw capture."
        })
        upgrades.append({
            "item": "Blazar Mantis 1.8x Full Frame Anamorphic Set",
            "delta_paisa": 700000,
            "benefit": "True widescreen 2.39:1 cinema scope aesthetic, organic oval bokeh and horizontal streaks."
        })

    return {
        "shoot_type": norm_shoot,
        "playbook_title": playbook["title"],
        "budget_level": norm_budget,
        "ladder_label": ladder["label"],
        "recommended_items": kit_items,
        "why_justification": " | ".join(why_reasons),
        "avoid_warnings": playbook["avoid"],
        "upgrade_options": upgrades[:3]
    }
