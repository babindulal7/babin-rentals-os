# Verification Report: T3-02 Deposits per product, entered before go-live

## Card Summary
- **Lane**: C (Money / Booking)
- **Branch**: `lane-c/T3-02-deposits-per-product-entered-before-go`
- **Plan Reference**: `docs/plans/T3_BOOKING_MONEY.md:36-50`
- **Objective**: Bulk editor for `products.deposit_fixed` / `deposit_percent` (and `replacement_value` where missing), with progress readiness meter ("X / Y set"), inline row editing, filter for unconfigured products, and CSV round-trip with dry run diffing. Adheres to Law 6 (Money blindness - strictly hidden and blocked for non-money roles like Warehouse).

## Implementation Details

### 1. Pure Calculation & CSV Engine (`src/lib/productDeposit.ts`)
- Added `DepositRuleType` (`'fixed' | 'percent' | 'none'`).
- Added `ProductDepositRow` interface.
- Pure calculation helpers:
  - `depositRuleType(product)`: extracts rule type from fixed or percentage deposit.
  - `hasDepositRule(product)`: verifies if valid fixed amount or (percentage + replacement value) is present.
  - `calculateEffectiveDeposit(product)`: computes accurate deposit in paisa (fixed paisa or percent × replacement value).
- Pure CSV round-trip utilities:
  - `exportDepositSetupCsv(products)`: exports RFC 4180 CSV with headers: `Product ID`, `Product Name`, `SKU`, `Category`, `Rule Type`, `Fixed Deposit (NPR)`, `Deposit Percent (%)`, `Replacement Value (NPR)`.
  - `parseDepositSetupCsv(csvText, currentProducts)`: dry-run CSV parser that parses rows, validates rule requirements, compares against current product states, and calculates comprehensive diffs (`changeCount`, `errorCount`, `entries`).

### 2. Deposit Setup Bulk Editor (`src/modules/inventory/DepositSetup.tsx`)
- **Access Control & Law 6**:
  - Gated using `gateContext` and `canViewMoneyField(gctx, 'booking')`.
  - Money-blind roles (Warehouse, Technician, Driver, Client) receive `<RestrictedState reason="Deposit setup is a money role action." />`.
- **Readiness Progress Meter**:
  - Displays `${configuredCount} / ${totalCount} set (${percentConfigured}%)` with a visual progress bar and status badge.
- **Filter Toolbar**:
  - Real-time search query across product name, SKU, and brand.
  - Segmented filters: `All`, `No deposit set`, `Deposit set`.
  - Category selector dropdown.
- **Inline Multi-Row Editor**:
  - Rule Type select (`Fixed (NPR)`, `Percent (%)`, `No Deposit`).
  - Inputs for Fixed Deposit, Percent (%), and Replacement Value.
  - Live calculated Effective Deposit preview.
  - Row-level dirty tracking and individual Save button invoking `bulk_update_products` RPC with client UUID for idempotency.
- **Multi-Select & Bulk Apply**:
  - Checkboxes for selecting multiple or all products.
  - Bulk Edit Modal: applies fixed amount or percent of replacement value across all selected items.
- **CSV Import with Mandatory Dry-Run Modal**:
  - Upload CSV trigger runs `parseDepositSetupCsv`.
  - Dry Run Modal renders exact table diff (Old value → New value), error highlights, change count, and requires explicit confirmation before applying.

### 3. Inventory Integration (`src/modules/inventory/Inventory.tsx`)
- Added `'Deposit Setup'` tab to `TABS`, strictly filtered by `money` flag so non-money roles cannot see the tab.
- Rendered `<DepositSetup embedded />` when `'Deposit Setup'` tab is selected.

## Automated Verification
1. **Unit Tests**:
   - `src/lib/__tests__/productDepositSetup.test.ts` (6/6 passing)
   - `src/modules/inventory/__tests__/DepositSetup.test.tsx` (4/4 passing)
2. **Typecheck & Lint**:
   - `npm run typecheck` (passed with 0 errors)
   - `npm run lint` (passed with 0 errors)
3. **Full Gates Suite**:
   - `npm run gates` (17/17 steps passing)
