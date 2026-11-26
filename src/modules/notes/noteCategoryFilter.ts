import type { NoteCategory } from '../../lib/queries/internalNotes'

/**
 * The stored categories the Equipment Alert chip covers. The database accepts
 * both spellings and seeded alerts are stored as 'Gear Alert', so the chip, its
 * count and the Equipment Alerts card must all read the same set (sweep-A-floor-4).
 */
const EQUIPMENT_ALERT_STORED: readonly NoteCategory[] = ['Equipment Alert', 'Gear Alert']

/** Whether a note sits under a category filter value. 'All' is the caller's to handle. */
export function noteInCategory(note: { category: NoteCategory }, category: string): boolean {
  if (category === 'Equipment Alert') return EQUIPMENT_ALERT_STORED.includes(note.category)
  return note.category.toLowerCase() === category.toLowerCase()
}
