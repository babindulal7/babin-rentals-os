import { describe, it, expect } from 'vitest'
import glossary from './glossary.ne.json'
import { EN, NE } from '../lib/i18n'
import { NAV_GROUPS } from '../data/nav'

/* T6-01 — the glossary is a draft until Babin approves it. These tests keep the
   draft honest so later waves (T6-02+) can lean on it. */

type Term = {
  id: string
  group: string
  en: string
  ne: string
  alt?: string[]
  catalogueKey?: string
  approved: string | null
}
const terms = glossary.terms as Term[]
const byId = new Map(terms.map((t) => [t.id, t]))

describe('Nepali glossary (T6-01)', () => {
  it('has unique ids and non-empty text', () => {
    expect(new Set(terms.map((t) => t.id)).size).toBe(terms.length)
    for (const t of terms) {
      expect(t.en.trim(), t.id).not.toBe('')
      expect(t.ne.trim(), t.id).not.toBe('')
    }
  })

  it('keeps digits Latin — no Devanagari digits anywhere', () => {
    for (const t of terms) expect(t.ne, t.id).not.toMatch(/[०-९]/)
  })

  it('never uses the word "customer" in a term (Law 15)', () => {
    for (const t of terms) expect(t.en.toLowerCase(), t.id).not.toContain('customer')
  })

  it('keeps every word already verified in src/lib/i18n.ts', () => {
    const withKey = terms.filter((t) => t.catalogueKey)
    expect(withKey.length).toBe(Object.keys(NE).length)
    for (const t of withKey) {
      const key = t.catalogueKey as keyof typeof EN
      expect(t.ne, t.id).toBe(NE[key])
      expect(t.en, t.id).toBe(EN[key])
    }
  })

  it('covers every sidebar destination', () => {
    const labels = NAV_GROUPS.flatMap((g) => g.sections.map((s) => s.label))
    const navEn = new Set(terms.filter((t) => t.group === 'nav').map((t) => t.en))
    for (const label of labels) expect(navEn.has(label), label).toBe(true)
  })

  it('covers all 13 booking stages and 9 roles', () => {
    const stage = new Set(terms.filter((t) => t.group === 'stage').map((t) => t.en))
    for (const s of ['Quote', 'Draft', 'Confirmed', 'Preparing', 'Ready', 'Dispatched', 'On Rent', 'Return Due', 'Inspection', 'Cleaning', 'Completed', 'Closed', 'Cancelled']) {
      expect(stage.has(s), s).toBe(true)
    }
    const role = new Set(terms.filter((t) => t.group === 'role').map((t) => t.en))
    for (const r of ['Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse', 'Technician', 'Accounts', 'Driver', 'Client']) {
      expect(role.has(r), r).toBe(true)
    }
  })

  it('never ships an unapproved term: approved is null or an ISO date, and a draft file has none set', () => {
    for (const t of terms) {
      expect(t.approved === null || /^\d{4}-\d{2}-\d{2}$/.test(t.approved), t.id).toBe(true)
    }
    if (glossary.approval.status === 'draft') {
      expect(terms.every((t) => t.approved === null)).toBe(true)
    }
    expect(byId.size).toBeGreaterThan(200)
  })
})
