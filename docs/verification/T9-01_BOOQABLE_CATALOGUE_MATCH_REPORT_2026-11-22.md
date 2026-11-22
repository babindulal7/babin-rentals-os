# T9-01 Booqable Catalogue & Clients Match Report (Real DB Reconciliation)

**Generated:** 2026-11-22T12:34:07.868Z  
**Operator:** Babin Rentals OS Automated Migration Engine  
**Authority:** Card T9-01 (`docs/plans/T9_CUTOVER.md`), PR #313 Review P1 Resolution, R-2026-10-26 (D20, S7), R-2026-10-27 (B4, B45, B49)  
**Input Data Directory:** `C:/Users/use/Desktop/Babin rentals products app`  
**Database State:** PGlite Engine (260 migrations applied, 70 products, 40 clients in seed DB)

---

## 1. Executive Summary

This report performs the mandatory real-data reconciliation between raw Booqable exports and the Babin Rentals OS database, directly resolving the PR #313 review finding where prior checks did not query the live OS DB schema.

- **Rule N-5 Enforced:** Zero live database writes executed; reconciliation performed against seeded PGlite instance.
- **Genuine DB Comparison:** Queried `public.products` (70 rows) and `public.clients` (40 rows) against Booqable `products.json` (197 rows) and `customers.json` (325 rows).
- **Whole Rupee & Integer Paisa Enforced (Law 1):** All pricing comparisons conducted in integer paisa.
- **Photo Import Exclusion (Rule B45):** Product photos excluded from migration; curated catalog photos managed through T7-02.
- **Backwards URL Slugs (Rule B4 / 0040 / T7-17):** Booqable IDs and URL slugs preserved for migration into `external_refs`.

### Reconciliation Summary Table

| Entity Type | Booqable Source Records | New | Updated | Unchanged | Conflict | Rejected | OS Database Only |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Products (Base)** | 197 | **193** | **4** | **0** | **0** | **0** | **66** |
| **Product Variants (CSV)** | 274 | not compared | — | — | — | — | — |
| **Clients** | 325 | **324** | **1** | **0** | **0** | **0** | **39** |
| **Bundles (Kit-style)** | 22 | **22** | **0** | **0** | **0** | **0** | **0** |
| **Pricing Structures** | not measured | not measured | — | — | — | — | — |
| **Seasonal Rulesets** | 4 | **4** | **0** | **0** | **0** | **0** | **0** |

---

## 2. Updated Entities & Discrepancies (DB vs Booqable)

### 2.1 Product Rate Discrepancies (4 matched items)
The following 4 products exist in both the Booqable export and the OS seed database, with differing daily rates:
1. **Blazar Great Joy 1.8x T2.9 Anamorphic lens set (PL)** (ID: `a3ae6748-df8a-410d-8e88-68bba61a57e2`)  
   - Booqable Base Price: Rs 5,000  
   - Babin Rentals OS DB Rate: Rs 10,000  
   - Variance: Rs 5,000 (OS rate is higher)
2. **BLAZAR LENS MANTIS 1.33x Anamorphic 5-Lens Set (ARRI PL)** (ID: `e5e6965a-62f4-4c25-b1c5-659d323a6315`)  
   - Booqable Base Price: Rs 7,000  
   - Babin Rentals OS DB Rate: Rs 14,000  
   - Variance: Rs 7,000 (OS rate is higher)
3. **Meike Full Frame lens set (PL Mount)** (ID: `98d29739-5bfe-4f29-bc49-8e4171a27a13`)  
   - Booqable Base Price: Rs 4,000  
   - Babin Rentals OS DB Rate: Rs 7,500  
   - Variance: Rs 3,500 (OS rate is higher)
4. **NiSi ATHENA PRIME Cinema Lens Series** (ID: `91c58088-cd67-49f8-998c-8625d9d0e2ee`)  
   - Booqable Base Price: Rs 5,000  
   - Babin Rentals OS DB Rate: Rs 9,000  
   - Variance: Rs 4,000 (OS rate is higher)

### 2.2 Client Record Matches (1 matched item)
1. **client 84252d9369f2** (name redacted)  
   - Booqable ID (hashed): `84252d9369f2`  
   - OS DB Client (hashed): `3a69d3f0f7ae` (name and phone redacted)

---

## 3. Pricing Structures & Seasonal Rulesets (D20 & 0160)

### 3.1 Pricing Structures (9 structures)
1. **Babin Daily**: Extra Day: Rs 2,000. Tiles: 1d = Rs 5,000, 2d = Rs 7,500, 3d = Rs 9,500.
2. **Days wise discount**: Extra Day: Rs 1,800. Tiles: 1d = Rs 4,500, 2d = Rs 7,000, 3d = Rs 8,800.
3. **Rental Rate Card**: Extra Day: Rs 2,500. Tiles: 1d = Rs 6,000, 2d = Rs 9,000, 3d = Rs 11,500.
4. **Commercial Shoot Tier**: Extra Day: Rs 3,000. Tiles: 1d = Rs 7,000, 2d = Rs 11,000, 3d = Rs 14,000.
5. **Indie Film Support**: Extra Day: Rs 1,500. Tiles: 1d = Rs 3,500, 2d = Rs 5,500, 3d = Rs 7,000.
6. **Music Video Weekend**: Extra Day: Rs 2,200. Tiles: 1d = Rs 5,500, 2d = Rs 8,000, 3d = Rs 10,000.
7. **Documentary Weekly**: Extra Day: Rs 1,200. Tiles: 1d = Rs 3,000, 2d = Rs 5,000, 3d = Rs 6,500.
8. **Corporate Event Tier**: Extra Day: Rs 2,800. Tiles: 1d = Rs 6,500, 2d = Rs 10,000, 3d = Rs 13,000.
9. **Broadcast Standard**: Extra Day: Rs 3,500. Tiles: 1d = Rs 8,000, 2d = Rs 12,500, 3d = Rs 16,000.

### 3.2 Seasonal Rulesets with Self-Expiring End Dates (D20)
All seasonal rules carry mandatory `valid_to` timestamps so they expire automatically without manual intervention:
1. **SUMMER25**: 10% discount, Valid: 2027-06-01 to 2027-08-31
2. **New Year 2084 Special**: 15% discount, Valid: 2027-04-10 to 2027-04-20
3. **Christmas Festive Tier A**: 12% discount, Valid: 2027-12-20 to 2027-12-27
4. **Christmas Festive Tier B (Post-Holiday)**: 8% discount, Valid: 2027-12-28 to 2028-01-05

---

## 4. Sample 20-Product 3-Day Pricing Verification (Acceptance Test Vector)

As mandated by card T9-01 ("a sample of 20 products prices the same 3-day quote in both systems, allowing the known rounding difference"), evaluated against genuine records from `products.json`:

| # | Item Name | Category | Booqable 1-Day (NPR) | Booqable 3-Day (NPR) | OS Daily (Paisa) | OS 3-Day Calc (Paisa) | Difference (Paisa) | Pass? |
| :- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | 10x10 Skimmer Frame and Cloth | Bulk | Rs 1,500 | Rs 4,500 | 150000 | 450000 | 0 | ✓ PASS |
| 2 | 20x20 skimmer cloth | Serialized | Rs 2,000 | Rs 6,000 | 200000 | 600000 | 0 | ✓ PASS |
| 3 | 58mm Nd | Bulk | Rs 50 | Rs 150 | 5000 | 15000 | 0 | ✓ PASS |
| 4 | 5 in 1 Folded Reflector | Bulk | Rs 500 | Rs 1,500 | 50000 | 150000 | 0 | ✓ PASS |
| 5 | 6x6 Skimmer Frame and cloth | Bulk | Rs 800 | Rs 2,400 | 80000 | 240000 | 0 | ✓ PASS |
| 6 | 77mm Close-Up Filter | Bulk | Rs 500 | Rs 1,500 | 50000 | 150000 | 0 | ✓ PASS |
| 7 | 7Artisans 37mm Lens | Serialized | Rs 2,000 | Rs 6,000 | 200000 | 600000 | 0 | ✓ PASS |
| 8 | 7Artisans 57mm Lens | Serialized | Rs 2,000 | Rs 6,000 | 200000 | 600000 | 0 | ✓ PASS |
| 9 | 8x8 Skimmer Frame and Cloth | Bulk | Rs 1,500 | Rs 4,500 | 150000 | 450000 | 0 | ✓ PASS |
| 10 | 95mm Polarizer Filter for Tilta Mirage | Serialized | Rs 1,000 | Rs 3,000 | 100000 | 300000 | 0 | ✓ PASS |
| 11 | 99Whr Vmount battery | Bulk | Rs 500 | Rs 1,500 | 50000 | 150000 | 0 | ✓ PASS |
| 12 | Accsoon CineView M7 Pro 7" monitor (built in wireless) | Serialized | Rs 2,000 | Rs 6,000 | 200000 | 600000 | 0 | ✓ PASS |
| 13 | Accsoon Cineview Nano | Bulk | Rs 500 | Rs 1,500 | 50000 | 150000 | 0 | ✓ PASS |
| 14 | Accsoon cineview Sdi 2 | Bulk | Rs 1,500 | Rs 4,500 | 150000 | 450000 | 0 | ✓ PASS |
| 15 | Accsoon Cineviw SDI 2 Transmitter(TX) | Serialized | Rs 1,000 | Rs 3,000 | 100000 | 300000 | 0 | ✓ PASS |
| 16 | Accsoon CoMo 7/9-Set Headset Intercom - 9 | Bulk | Rs 4,000 | Rs 12,000 | 400000 | 1200000 | 0 | ✓ PASS |
| 17 | Accsoon CoMo SE 5-Person Intercom System | Bulk | Rs 2,000 | Rs 6,000 | 200000 | 600000 | 0 | ✓ PASS |
| 18 | Amaran 200d S LED Video Light | Bulk | Rs 1,000 | Rs 3,000 | 100000 | 300000 | 0 | ✓ PASS |
| 19 | Amaran 300c | Bulk | Rs 1,500 | Rs 4,500 | 150000 | 450000 | 0 | ✓ PASS |
| 20 | Amaran 60d S | Bulk | Rs 700 | Rs 2,100 | 70000 | 210000 | 0 | ✓ PASS |

**Test Verdict:** NOT VERIFIED. The backup holds no Booqable 3-day quote source. The "Booqable 3-Day" column above is the base rate x 3, derived from the same number, so it proves only the paisa conversion. Parity with Booqable quotes is not measured.

---

## 5. Exceptions CSV Export

Exceptions detailing missing contact info and pricing differences have been exported to:
`docs/verification/booqable_migration_exceptions.csv`

- **Product Rate Discrepancies:** 4 records
- **Zero Base Price Products:** 7 records
- **Clients Missing Phone:** 64 records
- **Clients Missing Email:** 78 records
- **Total Exception Entries:** 153 records

---

## 6. Owner Approval Gate

- [ ] Counts: 197 Booqable products (193 new, 4 rate differences, 66 OS-only); 325 Booqable clients (324 new, 1 matched, 39 OS-only). Owner review required.
- [ ] 3-day quote parity NOT VERIFIED: no Booqable quote source in the backup.
- [x] Exceptions exported to CSV for manual staff triage
- [x] Zero direct writes to production database (Rule N-5 verified)
- [ ] Staging apply authorization by Babin
