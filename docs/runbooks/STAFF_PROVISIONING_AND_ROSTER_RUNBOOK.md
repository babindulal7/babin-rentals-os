# Babin Rentals OS — Real Staff Accounts Provisioning Runbook & Roster Template
**Card:** [T1-13 · Real staff accounts on live](../plans/T1_RELEASE.md#t1-13--real-staff-accounts-on-live)  
**Date:** 23 November 2026 (Asia/Kathmandu)  
**Author:** Windows Antigravity  
**Target Environment:** Production (`sxguwvgoserhdolewibb`, strictly operator-managed)  
**Safety Status:** PREPARATION & RUNBOOK ONLY — ZERO PASSWORDS OR CREDENTIALS IN CODE (Rule N-8)  

---

## 1. Executive Summary & Policy Rules

Per card specification T1-13 and rulings W56, Law 3, Law 6, and Rule N-8:
- **More than 10 staff** use the app daily across warehouse, bookings, tech, delivery, and management.
- **Law 3 (Nothing is deleted):** Old or obsolete test accounts must be **deactivated** (`is_active = false`), never dropped from the database.
- **Law 6 (Money Blindness):** Floor roles (`Warehouse`, `Technician`, `Driver`) must be assigned strictly money-blind roles, with DOM/payload money masking enforced in Postgres RLS.
- **MFA Enforcement (T1-17 / 0267):** Money-viewing roles (`Owner`, `Admin`, `Manager`, `Accounts`) must complete AAL2 two-step verification upon sign-in.
- **4-Digit Quick PIN (T1-15):** Every staff member configures a personal 4-digit PIN for rapid user switching on shared warehouse and front-desk devices.

---

## 2. Staff Roster & Role Mapping Specification

The production roster must map every operational seat to one of the canonical system roles:

| Staff Role | System Role Name | Money Visibility | Storage / KYC Review | Multi-Factor Authentication | Typical Responsibility |
|---|---|---|---|---|---|
| **Executive** | `Owner` | **Full Access** | Full View | **Required (AAL2)** | Final authority, financial approvals, settings |
| **System Admin** | `Admin` | **Full Access** | Full View | **Required (AAL2)** | Account provisioning, role assignments, audit |
| **Ops Manager** | `Manager` | **Full Access** | Full View | **Required (AAL2)** | Extensions, cash decisions, rate overrides |
| **Finance Operator** | `Accounts` | **Full Access** | Denied | **Required (AAL2)** | Invoices, payment reconciliation, VAT ledgers |
| **Booking Desk** | `Coordinator` | **Money-Blind** | Full View | Optional (AAL1) | Customer intake, schedule holds, bookings |
| **Warehouse Lead** | `Warehouse` | **Money-Blind** | Denied | Optional (AAL1) | Prep, pack equipment, scan barcodes |
| **Bench Tech** | `Technician` | **Money-Blind** | Denied | Optional (AAL1) | Maintenance, check-in tests, repair jobs |
| **Delivery Driver** | `Driver` | **Money-Blind** | Denied | Optional (AAL1) | Transport runs, delivery handovers |

---

## 3. Account Provisioning Procedure (Operator Steps)

All staff account creation must be carried out in the app via **Settings ▸ People & Access** or using Supabase Dashboard Auth Invite:

### Step 1: Account Creation & Invitation
1. In the Supabase Dashboard (`sxguwvgoserhdolewibb` ▸ Authentication ▸ Users):
   - Click **Invite User**.
   - Enter the staff member's official corporate email (`name@babinrentals.com`).
2. Staff member receives the secure invitation email and sets their initial secure passphrase.

### Step 2: Role Binding in `public.users`
Execute via Supabase Dashboard SQL Editor (sanitized parameterized template):
```sql
-- Template for staff profile linkage:
insert into public.users (
  id,
  client_uuid,
  email,
  full_name,
  employee_code,
  mobile,
  branch_id,
  primary_role,
  is_active
) values (
  '<auth_user_uuid_from_auth_users>',
  gen_random_uuid(),
  'staff-name@babinrentals.com',
  'Full Staff Name',
  'EMP-XXX',
  '+977-98XXXXXXXX',
  (select id from public.branches limit 1),
  'Coordinator', -- Assign appropriate system_role
  true
)
on conflict (id) do update set
  primary_role = excluded.primary_role,
  is_active = excluded.is_active;
```

### Step 3: Deactivating Obsolete / Test Accounts
Never delete rows (Law 3). To deactivate previous temporary accounts:
```sql
update public.users
set is_active = false,
    updated_at = now()
where email like '%test%' or email like '%dummy%';
```

### Step 4: First Sign-In & 4-Digit PIN Configuration (On Staff Device)
1. Staff member logs into `app.babinrentals.com` on their dedicated device.
2. If assigned a money role, the system prompts for AAL2 TOTP setup (Google Authenticator / 1Password).
3. The staff member opens their user profile and sets their personal 4-digit PIN for floor switching.

---

## 4. Verification & Acceptance Checklist
- [ ] Every staff member on the roster has completed at least one successful sign-in.
- [ ] Role list in `public.users` exactly matches Babin's official staffing roster.
- [ ] Money-blind roles verified to see zero financial figures on live screens.
- [ ] Obsolete test accounts deactivated (`is_active = false`).
