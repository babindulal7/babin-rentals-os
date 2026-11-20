// scripts/allowed-anon-views.mjs — Single Source of Truth for anon-readable public views
//
// Invariant: no internal or staff view in `public` may be readable by `anon`.
// anon may only read explicitly designated public customer-facing catalogue views.
//
// Shared by check-pglite.mjs, check-anon-exposure.mjs, and security audit gates (T7-02).

export const ALLOWED_ANON_VIEWS = new Set([
  'public_catalogue_v',
]);
