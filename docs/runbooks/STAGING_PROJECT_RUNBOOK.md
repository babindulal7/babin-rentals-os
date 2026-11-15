# Staging Project & Environment Isolation Runbook (T1-02)

**Card:** T1-02 · Staging project  
**Target:** Independent Supabase project `babin-staging` (`klhmsrunqrdxjudyhnkm`)  
**Production Ref:** `sxguwvgoserhdolewibb` (STRICTLY FORBIDDEN TARGET)  
**Authority:** Rule N-5, Rule N-8, Law 3, Ruling S10, Ruling G10  

---

## 1. Project Baseline & Cost Governance (Ruling S10)

1. **Existing Provisioning:**
   - Per hosted rehearsal audit (12 Nov 2026), independent staging project `babin-staging` (`klhmsrunqrdxjudyhnkm`) is already provisioned in the identical region (`aws-0-ap-south-1`).
   - **DO NOT create another project.** Re-creating projects duplicates costs and invalidates existing infrastructure connectors.
2. **Owner Cost Gate:**
   - Paid resource upgrades or production data duplication are gated on Babin's explicit sign-off.
   - Current staging state: 0 application tables, 0 migration history rows, clean baseline.

---

## 2. Environment Isolation Checklist

Before any staging restore or credential exchange:

- [ ] **Hard Ref Check**: Staging project ref MUST be `klhmsrunqrdxjudyhnkm`. Verify that `sxguwvgoserhdolewibb` is NEVER supplied as staging URL.
- [ ] **Credential Boundary**: Staging environment variables are stored strictly in `.env.staging.local`. Verify this filename is present in `.gitignore`.
- [ ] **Data Minimization & Anonymization**: No unmasked client phone numbers or national identity photos may be exposed in staging. Real client data is protected behind Cloudflare Access (T1-07).
- [ ] **No Secret Commits (Rule N-8)**: Never commit `.env.staging.local`, staging connection URIs, service role keys, or JWT tokens to Git, PR descriptions, or chat logs.

---

## 3. Staging Restore Procedure (The Restore Drill)

*Execution requires Babin's approval and validated T1-01 dump.*

1. **Pre-Flight Connection Inspection:**
   ```powershell
   # Verify connection URL targets klhmsrunqrdxjudyhnkm only
   $env:BABIN_STAGING_DB_URL = "postgresql://postgres.klhmsrunqrdxjudyhnkm:[PASSWORD]@aws-0-ap-south-1.pooler.supabase.com:5432/postgres"
   node -e 'const u = new URL(process.env.BABIN_STAGING_DB_URL); if (!u.hostname.includes("klhmsrunqrdxjudyhnkm")) throw new Error("REFUSING NON-STAGING TARGET");'
   ```

2. **Execute Database Restore:**
   ```powershell
   psql "$env:BABIN_STAGING_DB_URL" -f "backups\<certified-t1-01-dump>.sql"
   ```

3. **Validate Row Counts (Non-Personal Evidence):**
   Execute read-only row count validation:
   ```sql
   select 'bookings' as tbl, count(*) from public.bookings
   union all
   select 'clients', count(*) from public.clients
   union all
   select 'products', count(*) from public.products
   union all
   select 'invoices', count(*) from public.invoices
   union all
   select 'security_deposits', count(*) from public.security_deposits;
   ```
   *Record aggregate counts in PROGRESS.md — do not output individual customer names or phone numbers.*

---

## 4. Nine-Role Staging Verification Harness

After restore or test-seed population, execute the repository's native read-only staging verifier:

```bash
# Requires .env.staging.local populated with BABIN_STAGING_* vars
node scripts/verify-staging-readonly.mjs
```

This automates:
- Validation of 9 roles: `Owner`, `Admin`, `Manager`, `Coordinator`, `Warehouse`, `Technician`, `Accounts`, `Driver`, `Client`.
- Law 6 money-blindness verification (`Warehouse`, `Technician`, `Driver`, `Client` read null for money columns).
- Negative permission tests: Client A/B cross-booking denial, Driver unassigned job denial, anon view/RPC execution denial.

---

## 5. Staging-Readiness Handoff to Mac Agent (T1-05 / T1-06 / T1-07)

When staging restore is completed and verified, deliver the following readiness template to the Mac Agent (Lane A) via repository documentation or owner relay:

```markdown
### Staging Readiness Handoff Notice (To: Mac Agent)
- Staging Project Reference: `klhmsrunqrdxjudyhnkm`
- Region: `ap-south-1` (Mumbai)
- Database Engine: PostgreSQL 17.11
- State: Restored from T1-01 certified backup (SHA-256 verified)
- Security Verification: 9-role read-only harness executed (REPORT attached in artifacts)
- Test Identities: 9 test seats provisioned (Owner, Admin, Manager, Coordinator, Warehouse, Technician, Accounts, Driver, Client)
- Sensitive Credentials: Transferred via 1Password / Owner vault (NOT via GitHub or chat).
```
