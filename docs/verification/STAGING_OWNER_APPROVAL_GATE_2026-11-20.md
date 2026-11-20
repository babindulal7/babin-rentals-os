# Babin Rentals OS — Staging Owner Approval Gate (20 Nov 2026)

**Original audit baseline SHA:** `b555f7d63b6300e3466e6419bddce312357c7a78` (revalidate against the PR head before any proposed execution)  
**Target staging project:** `klhmsrunqrdxjudyhnkm` (`babin-staging`, Singapore, PostgreSQL 17.11)  
**Protected production project:** `sxguwvgoserhdolewibb` (**EXCLUDED / UNTOUCHED**)  
**Migration Scope:** 242 SQL migration files (4,969,099 bytes)  
**Approval Status:** **UNAPPROVED — HARD STOP (owner approval not established)**

---

## 1. Owner Decision Packet

Before any SQL statements are executed against the hosted staging project `klhmsrunqrdxjudyhnkm`, the product owner must review and explicitly approve this statement packet:

1. **Target Confirmation:** All operations apply strictly to staging project `klhmsrunqrdxjudyhnkm`. The production project `sxguwvgoserhdolewibb` is completely untouched.
2. **Seed & Privacy Controls:**
   - `0012_seed_data.sql` is **replaced** with non-deliverable synthetic fixtures (`example.invalid`, test PAN `999999999`).
   - `0047_seed_reference_corpus.sql` is **quarantined** (~1.87 MB).
   - `0082_seed_operational_stage_corpus.sql` is **quarantined**.
3. **Transaction & Hazard Boundaries:**
   - `0013` enum additions committed in an independent transaction prior to `0014` policy execution.
   - `0188_smart_reservation_holds.sql` executed before `0188_staff_renting_gear.sql`.
   - `0241_extension_clash_manager_decision_and_at_risk.sql` enforces Coordinator monetary resolution lockout.
4. **Outbound Communications Lockdown:**
   - Email SMTP, SMS, WhatsApp dispatches, and live Booqable hooks are completely disabled/mocked.
5. **Rollback Safety:**
   - Baseline pre-install snapshot and clean-slate disaster recovery runbook are reviewed and ready.

---

## 2. Review Documents Index

* **Dependency Manifest:** [STAGING_CURRENT_DEPENDENCY_MANIFEST_2026-11-20.md](STAGING_CURRENT_DEPENDENCY_MANIFEST_2026-11-20.md)
* **Synthetic Fixtures:** [STAGING_SYNTHETIC_FIXTURE_SPEC_2026-11-20.md](STAGING_SYNTHETIC_FIXTURE_SPEC_2026-11-20.md)
* **Backup & Restore Runbook:** [STAGING_BACKUP_RESTORE_RUNBOOK_2026-11-20.md](STAGING_BACKUP_RESTORE_RUNBOOK_2026-11-20.md)
* **Acceptance Batch Matrix:** [STAGING_ACCEPTANCE_BATCH_MATRIX_2026-11-20.md](STAGING_ACCEPTANCE_BATCH_MATRIX_2026-11-20.md)

---

## 3. Formal Sign-Off Block

| Field | Value |
|---|---|
| **Proposed Action** | Review a staging-only migration plan with 242 source files, excluding/replacing the three quarantined seed files; execution requires a separately verified manifest and authorization |
| **Owner Decision** | **PENDING — no staging execution authorized** |
| **Authorized By** | **Not recorded** |
| **Date** | **Pending explicit approval** |
| **Signature / Decision** | **PENDING — must be entered only after explicit owner authorization** |

> **HARD STOP:** The owner has not approved this operation in this approval gate. Phase C (Staging Installation), Phase D (Hosted Acceptance), any destructive reset and any remote database write MUST NOT BE EXECUTED. A draft document, CI pass, PR merge or agent-generated signature never constitutes owner authorization. Obtain independent review and explicit, separately recorded owner approval of the exact execution manifest and recovery plan first.
