import { describe, it, expect } from 'vitest'
import { startInspection } from '../startInspection'
import { passInspection } from '../passInspection'
import { failInspection } from '../failInspection'

const CTX = { userId: 'u-tech-1', role: 'Technician' as const, isOnline: true }

describe('inspection actions — fail-closed until database persistence lands', () => {
  it.each([
    ['START_INSPECTION', startInspection],
    ['PASS_INSPECTION', passInspection],
    ['FAIL_INSPECTION', failInspection],
  ])('refuses %s rather than reporting an unpersisted write as succeeded', async (_name, fn) => {
    await expect(fn({ id: 'insp-001' }, CTX)).rejects.toThrow(/not connected to the database|not implemented/i)
  })
})
