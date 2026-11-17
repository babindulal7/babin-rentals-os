# T3-13 Verification: Fully booked → similar item or sub-rent

## Overview
- **Card**: `T3-13`
- **Specification Source**: `docs/plans/T3_BOOKING_MONEY.md:184-196`
- **Branch**: `lane-c/T3-13-fully-booked-to-similar-item-or`
- **Requirement**:
  When a product has no free unit for requested dates, New Rental shows both:
  1. "Similar we own — free" (same category and type, e.g. another camera or 24-70 lens). Evaluated dynamically via `findSimilarFreeEquipment(group, allEquipmentGroups)`. Shows 1-tap chip to add the free similar unit immediately.
  2. "Sub-rent from a partner" (cross-hire from external partners e.g. `GearHouse KTM`, `Kathmandu Cinema Works`, `Everest Cine Rentals`, etc.). Shows 1-tap quick sub-rent as well as partner & rate modal. Records supplier and supplier rate (money roles only).
  3. The booked item itself stays blocked (`27 Jul hard block`) — staff picks a real option, not a lie.

---

## Changes Implemented

### 1. Pure Algorithm & Model Updates (`src/lib/availability.ts`, `src/modules/rentals/booking/itemCatalogue.ts`)
- `findSimilarFreeEquipment`: matches same category, filters candidates with `freeCount > 0`, prioritizes brand match and name token similarity.
- `SUBRENTAL_PARTNERS`: Kathmandu-based sub-rental partners (`GearHouse KTM`, `Kathmandu Cinema Works`, `Everest Cine Rentals`, `Pokhara Film Gear`, `Shine Pictures`).
- `EquipmentModelGroup`: added `freeCount?: number` populated deterministically during group aggregation.
- `BookingLineDraft`: added `supplier?: string` and `supplierCost?: number`.

### 2. Sub-Rental Partner Modal (`src/modules/rentals/booking/SubRentalPartnerModal.tsx`)
- Allows staff to choose external partner from `SUBRENTAL_PARTNERS` or enter custom partner.
- **Law 6 (Money Blindness)**: Client rate and supplier cost inputs are completely omitted from the DOM when `showPrices === false`.
- Touch targets conform to ≥ 44px ergonomics.

### 3. Fully Booked Alternatives UI (`src/modules/rentals/booking/AddItemPanel.tsx`)
- Detects `isFullyBooked` (`!isSubRentalMode && (freeCount === 0 || (bulk && group.availability.level === 'unavailable'))`).
- Renders the `Fully Booked Alternatives` region:
  - **Banner**: "Fully booked for these dates (27 Jul hard block)"
  - **Choice 1: Similar we own — free**: 1-tap buttons for each free similar model (`+ Similar free: [Name]`). Tapping adds the free unit in 1 tap. If none available, states *"No similar free gear in stock for these dates"*.
  - **Choice 2: Sub-rent from a partner**:
    - 1-tap quick sub-rent button `+ Sub-rent (GearHouse KTM)`
    - `Choose partner / rate…` button opening `SubRentalPartnerModal`
  - The booked item's serial chips remain blocked (`Icon name="error"`) and cannot be directly added.

### 4. Overbooking Override Modal Integration (`src/modules/rentals/booking/OverbookingOverrideModal.tsx`)
- When Sub-rent is chosen from the override dialog on a booked unit, partner select and rate inputs (gated by `showPrices`) are provided and passed to `onSubRent`.

---

## Test Verification

### Test Suites Executed
1. `src/lib/__tests__/similarEquipment.test.ts` (6/6 passing)
   - Excludes target item and different categories
   - Excludes booked out items
   - Ranks brand match and token similarity
   - Respects limit and excludeKeys
   - Validates `SUBRENTAL_PARTNERS`
2. `src/modules/rentals/booking/__tests__/SubRentalPartnerModal.test.tsx` (2/2 passing)
   - Law 6 money blindness verification (price inputs hidden from non-money roles)
   - Partner selection, custom partner, rate, and cost recording
3. `src/modules/rentals/booking/__tests__/AddItemPanel.similarSubrent.test.tsx` (5/5 passing)
   - Renders alternatives block with both choices
   - 1-tap addition of free similar gear
   - 1-tap addition of sub-rental line carrying supplier and rate
   - Sub-rental partner modal trigger
   - Blocked unit cannot be directly added
4. `src/modules/rentals/booking/__tests__/AddItemPanel.overbooking.test.tsx` (3/3 passing)
   - Regressions preserved

### Gates Validation
- `npm run typecheck` -> **PASS (0 errors)**
- `npm run lint` -> **PASS (0 warnings)**
- `npm run test` -> **PASS**
- `npm run gates` -> **PASS (17/17 gates green)**
