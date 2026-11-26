import { describe, expect, it } from 'vitest'
import { noteInCategory } from '../noteCategoryFilter'
import type { NoteCategory } from '../../../lib/queries/internalNotes'

const note = (category: NoteCategory) => ({ category })

describe('noteInCategory (sweep-A-floor-4)', () => {
  it('counts a stored Gear Alert under the Equipment Alert chip', () => {
    expect(noteInCategory(note('Gear Alert'), 'Equipment Alert')).toBe(true)
  })

  it('counts a stored Equipment Alert under the Equipment Alert chip', () => {
    expect(noteInCategory(note('Equipment Alert'), 'Equipment Alert')).toBe(true)
  })

  it('keeps other categories exact, ignoring case only', () => {
    expect(noteInCategory(note('Shift Handover'), 'Equipment Alert')).toBe(false)
    expect(noteInCategory(note('Shift Handover'), 'shift handover')).toBe(true)
    expect(noteInCategory(note('Gear Alert'), 'Shift Handover')).toBe(false)
  })
})
