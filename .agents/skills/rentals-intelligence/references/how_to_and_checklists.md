# Babin Rentals — How-To Intelligence & Operational Checklist Specification

This reference establishes the standards for **Model-Aware Equipment Guides** and the **Dual-Checklist Architecture** for Babin Rentals.

---

## 1. Structure of an Equipment How-To Guide

Every approved guide follows the proven 5-section layout, enhanced with operational metadata:

### Section 1: At a Glance & Quick Start
- **Core Summary:** Sensor size, mount, primary application, and difficulty rating.
- **Quick Start Steps:**
  1. Base build & balance before powering on.
  2. Media initialization: Format CFexpress / SD cards *in-camera*.
  3. Setting check: Frame rate, base ISO (S-Log3 / RAW), audio input levels.

### Section 2: Be Careful (Safety & Damage Warnings)
- **High-Risk Components:** Sensor glass, EVF ribbon cables, D-Tap reverse polarity risks.
- **Thermal & Environmental:** Maximum ambient operating temperatures, humidity warnings, dust caps.
- **Electrical Warning:** Never connect or disconnect D-Tap accessories while powered on without common ground.

### Section 3: Common Mistakes
- Model-specific failure modes observed in field returns:
  - Using consumer V30 SD cards for All-Intra 4K 120p recording.
  - Operating heavy cinema zooms (e.g. CHIOPT) without 15mm baseplate rod support.
  - Leaving lithium batteries discharged in cold environments.

### Section 4: Before You Rent: Prep Checklist Template
- Instructional checklist for prep bay technicians and 1st ACs.
- Verifies firmware reset, clean sensor, port integrity, and packing completeness.

### Section 5: Client Instructions & Talking Points
- Client-facing summary: Handover protocol, battery management tips, return deadlines, emergency contact.
- Internal staff talking points for handover demonstrations.

---

## 2. Dual Checklist Architecture

| Property | Model Guide Checklist Template | Durable Operational Checklist Run |
|---|---|---|
| **Scope** | Static, reusable catalogue template | Dynamic instance tied to a specific order |
| **Storage** | Model / bundle record | `equipment_checklist_runs` table |
| **Required Context** | Model category and options | `booking_id`, `asset_id`, `technician_id`, `timestamp` |
| **Evidence** | None (pure instruction) | Time-stamped photos, sensor inspect sign-off |
| **Legal / Custody State** | Educational only | Binding handover / return condition audit |

### 4 Lifecycle Stages of an Operational Checklist Run:
1. **PACKING:** Technician pulls serialized units from shelf, verifies child items against packing list, matches Pelican case cutouts.
2. **HANDOVER / DISPATCH:** Outbound physical condition inspection with client signature and photo of client receiving gear.
3. **RETURN INSPECTION:** Check-in count against original pull sheet, immediate sensor light-beam test, lens element inspection, damage rating.
4. **CLEANING & RESET:** Decontamination, sensor dry wipe, firmware reset, battery recharge, return to `AVAILABLE` or routing to `MAINTENANCE`.
