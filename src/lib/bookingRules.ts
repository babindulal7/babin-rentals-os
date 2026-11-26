import { readLocal, writeLocal } from './safeStorage'

/**
 * redesign v1 §3 — the "Allow overbooking" valve (Settings ▸ Financial ▸
 * Booking rules). Off by default; when on, a booked/maintenance chip in Add
 * Item becomes tappable and opens the override dialog instead of staying
 * dead.
 *
 * T1-16 removes the other six non-persisted Settings switches. This legacy
 * toggle is still explicitly **device-only**, backed by localStorage rather
 * than a shared database policy. T2-23 replaces it with per-product rules.
 * It only changes the Add Item override UI and never overrides server-side
 * reservation checks.
 *
 * TODO(decision) — PLAN.md §4: should this toggle be global, or restricted to
 * Owner/Admin? A global switch means a Coordinator can overbook once an
 * Owner turns it on; per-role is the safer default but is a new capability
 * string. Not assumed either way — this ships the global, simpler reading of
 * the spec's literal text.
 */

const KEY = 'br.bookingRules.allowOverbooking'

function readAllowOverbooking(): boolean {
  return readLocal(KEY) === 'true'
}

export function getAllowOverbooking(): boolean {
  return readAllowOverbooking()
}

export function setAllowOverbooking(value: boolean): void {
  writeLocal(KEY, value ? 'true' : 'false')
}
