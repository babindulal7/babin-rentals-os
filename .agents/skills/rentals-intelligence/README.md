# Babin Rentals — Advanced Rental Intelligence Toolkit

This directory contains the complete, upgraded, production-grade **Babin Rentals Intelligence System (RIS v4.0)** and skill implementation, aligning the **Babin Rentals OS ERP**, **AV Brain Knowledge Base**, and **Field Operations**.

---

## 🚀 Key Upgrades & Integrated Engines

### 1. Kit Intelligence & Auto-Completion (`scripts/kit_intelligence.py`)
- **Hard Conflicts Enforcement:** Non-overrideable blocks (e.g. Ronin 4D + external gimbal = REJECT; CHIOPT zoom without 15mm rods and support = REJECT; Glimmerglass 95mm without Tilta Mirage = REJECT).
- **Auto-Completion Triggers:** RED Komodo-X auto-requires CFexpress Type B, V-Mount batteries, dual charger, and reader; Sony FX3A auto-requires CFexpress Type A, 3x NP-FZ100 batteries, and charger.
- **Production Blueprints:** 9 shoot-type playbooks (Wedding, Music Video, Commercial, Documentary, Indie Film, Corporate Event, etc.).
- **6-Vector Budget Scaling Ladders:** Low, Mid, and High-End Cinema across Body, Lens, Power, Monitoring, Follow Focus, and Lighting.
- **Camera Caretaker Auto-Pitch:** Suggests on-set technician (Rs 2,000/day) on high-value kits ($\ge\text{Rs }50,000$) or cinema bodies to protect client deposits.
- **Kit Completeness Scoring:** Evaluates coverage across the 8 essential production slots (0–100%).

### 2. Monsoon Mode & Environmental Safety (`scripts/monsoon_intelligence.py`)
- **Active Season:** Automatic trigger from June 1 to September 30 (Kathmandu monsoon).
- **Dry-Cabinet Quarantine:** Mandatory moisture/fungus audits on return; damp units require a 24-hour dry-cabinet bake before returning to `AVAILABLE`.
- **Weather Policies:** Flexible 24-hour rain reschedule for outdoor shoots.
- **Soaked Return Surcharge:** Standard Rs 5,000 decontamination fee for waterlogged returns.

### 3. Client Intelligence & Due Recovery (`scripts/client_intelligence.py`)
- **Persona Classification (§P):** Seasoned Pro (direct, technical), Creative Beginner (warm, educational, guardrailed), Corporate/Event (formal, SLA-focused).
- **Due Recovery Messaging (§J4):** Staged, respectful Nepalese business communications across Day 1 (polite reminder), Day 3 (statement follow-up), Day 5 (urgent notice before hold), and Day 7 (formal management freeze).

### 4. Smart Add Equipment 6-Step Intake (`scripts/smart_equipment_entry.py`)
- **Step 1:** Model search & deduplication against canonical catalogue (`BRPI-*`) and aliases first.
- **Step 2:** Sourced technical specifications (`OEM_DOCUMENTED`, `BABIN_BENCH_TESTED`, `UNREVIEWED_DRAFT`).
- **Step 3:** 8 canonical relationship types (`included_mandatory`, `included_optional`, `required_to_operate`, `compatible_accessory`, `recommended_addon`, `chargeable_extra`, `containment`, `bundle_component`).
- **Step 4:** Dual how-to guide & checklist decoupling (Static model guide vs durable booking-linked checklist run).
- **Step 5:** Physical serial intake (never auto-generated; 3 tracking modes: `Serialised`, `Quantity`, `Consumable`; 5 intake conditions: `Excellent`, `Good`, `Fair`, `Damaged`, `Lost`).
- **Step 6:** Side-by-side diff ledger and review preview.

### 5. OS Domain Engines & Financial Rulings (`scripts/os_engine.py`)
- **Nepal Whole Rupee Standard (RULINGS-2026-11-22):** Formats rates and balances in whole rupees (`Rs 2,100`), suppressing decimals and paisa.
- **06:00 AM Rental Day Boundaries:** Pickup at 06:00 AM returning next day 06:00 AM counts as 1 rental day, with a 2-hour grace period.
- **Owner Approval Routing (R-22.1 / R-22.8):** Damage under Rs 25,000, late fee waivers, and extension clashes route to Owner when enabled in settings.
- **Deposit Liability Isolation (Law 5):** Security deposits are strictly excluded from rental totals and outstanding balances.
- **Discount Gates (Law 10):** Discounts $>10\%$ require $\ge10$-character reason and named approver; 25% hard cap.

---

## 🧪 Running the Verification Suite

Run all 127 deterministic tests:

```powershell
python scripts/run_eval_suite.py
```

Or double-click `run_eval_suite.bat` in this folder.

```text
===========================================================================
 EVALUATION SUITE COMPLETE: 127/127 SCENARIOS PASSED (100.0%)
 STATUS: ALL DETERMINISTIC RULES, ENGINES & SAFETY CHECKS VERIFIED [OK]
===========================================================================
```

---

## 📂 Folder Layout

- `scripts/`: Python engines for kit intelligence, monsoon mode, client personas, smart equipment intake, OS pricing, and validation.
- `data/`: Canonical catalogue (`rental_catalog.json`), specifications, power/payload matrices, and manifests.
- `references/`: Comprehensive operational playbooks (`smart_equipment_workflow.md`, `how_to_and_checklists.md`, `monsoon_and_safety_playbook.md`, `shoot_playbooks_and_ladders.md`, etc.).
- `SKILL.md`: The active Antigravity/Gemini agent skill specification.
