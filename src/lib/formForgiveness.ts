/**
 * Form Forgiveness — Usability Principle 8 / USABILITY_TESTS.md §1.8.
 *
 * "Forms forgive. Phone numbers, PAN, serials and amounts accept spaces and
 * dashes; the app cleans them instead of rejecting them. Ask only for what the
 * task needs."
 *
 * This module provides single-purpose sanitizers and auto-normalizers for
 * inputs across the app. They should be called onBlur or onChange so user
 * input is cleaned rather than rejected with an error banner when valid
 * information was entered with common punctuation or prefixes.
 */

import { PHONE_LOCAL_RE } from './phone'

/**
 * Normalises phone numbers entered by users.
 *
 * Accepts:
 * - "+977 9801234567"
 * - "+977-980-123-4567"
 * - "09801234567" (domestic leading zero)
 * - "980 123 4567"
 * - "9801234567"
 *
 * Returns the cleaned 10-digit mobile number if valid, or the sanitized
 * digit string without punctuation/redundant prefixes.
 */
export function sanitizePhone(input: string): string {
  if (!input) return ''
  // Strip spaces, dashes, dots, parentheses, slashes
  let cleaned = input.replace(/[\s\-()./]/g, '')
  // Strip +977 or 977 country code prefix
  cleaned = cleaned.replace(/^(?:\+977|977)/, '')
  // Strip leading 0 if followed by 97 or 98 (Nepali mobile prefix)
  if (/^0(97|98)\d{8}$/.test(cleaned)) {
    cleaned = cleaned.slice(1)
  }
  return cleaned
}

/**
 * Checks whether an input string can be resolved to a valid 10-digit Nepali mobile number.
 */
export function isValidSanitizedPhone(input: string): boolean {
  return PHONE_LOCAL_RE.test(sanitizePhone(input))
}

/**
 * Normalises PAN / VAT numbers.
 *
 * Database CHECK `clients_pan_vat_nine_digits` requires exactly 9 digits.
 * Users frequently copy-paste PAN with spaces or hyphens (e.g. "600-123-456"
 * or "600 123 456").
 *
 * Strips whitespace, dashes, and periods. Returns the numeric string.
 */
export function sanitizePan(input: string): string {
  if (!input) return ''
  // Strip whitespace, hyphens, periods, slashes
  return input.replace(/[\s\-./]/g, '')
}

/**
 * Normalises money / currency inputs.
 *
 * Strips:
 * - Commas (e.g. "1,50,000" -> "150000")
 * - Currency prefixes / symbols ("Rs", "Rs.", "NPR", "रु", "रू")
 * - Trailing / leading whitespace
 *
 * Preserves decimal points if present.
 */
export function sanitizeMoneyInput(input: string): string {
  if (!input) return ''
  let cleaned = input.trim()
  // Remove currency prefix symbols (case-insensitive for English prefixes)
  cleaned = cleaned.replace(/^(?:rs\.?|npr|रु|रू)\s*/i, '')
  // Remove commas and spaces
  cleaned = cleaned.replace(/[,\s]/g, '')
  return cleaned
}

/**
 * Normalises a single hardware asset serial number.
 *
 * Trims leading/trailing whitespace, strips unprintable control characters,
 * and collapses multiple internal spaces.
 */
export function sanitizeSerial(input: string): string {
  if (!input) return ''
  return Array.from(input.trim())
    .filter((ch) => {
      const code = ch.charCodeAt(0)
      return !(code <= 0x1f || (code >= 0x7f && code <= 0x9f))
    })
    .join('')
    .replace(/\s+/g, ' ')
}

/**
 * Splits and cleans batch serial inputs (pasted from spreadsheets or documents).
 *
 * Accepts newlines, commas, or semicolons as delimiters. Trims each serial
 * and removes empty lines.
 */
export function sanitizeBatchSerials(input: string): string[] {
  if (!input) return []
  return input
    .split(/[\r\n,;]+/)
    .map((s) => sanitizeSerial(s))
    .filter((s) => s.length > 0)
}

/**
 * Normalises email input: trims whitespace and lowercases.
 */
export function sanitizeEmail(input: string): string {
  if (!input) return ''
  return input.trim().toLowerCase()
}
