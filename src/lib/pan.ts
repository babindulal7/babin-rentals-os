/**
 * Client PAN / VAT numbers — one rule, one place.
 *
 * `clients.pan_vat` carries a hard database CHECK —
 * `supabase/migrations/0005_clients.sql:93`:
 *
 *     constraint clients_pan_vat_nine_digits check (pan_vat is null or pan_vat ~ '^[0-9]{9}$')
 *
 * Keeping the pattern and rejection copy in one shared helper ensures every
 * create/edit/import screen and action agrees with Postgres before submit.
 */

import { sanitizePan } from './formForgiveness'

/** Stored/validated PAN/VAT shape. Mirrors `clients_pan_vat_nine_digits` verbatim. */
export const PAN_RE = /^[0-9]{9}$/

/** One consistent rejection message across Add Client, Record Editor, Import, and actions. */
export const PAN_REJECTION = 'PAN/VAT must be exactly nine digits.'

export { sanitizePan }

/** True when a trimmed PAN/VAT string is a 9-digit numeric identifier. */
export function isValidPan(raw: string): boolean {
  return PAN_RE.test(raw.trim())
}
