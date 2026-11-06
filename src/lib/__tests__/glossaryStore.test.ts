import { beforeEach, describe, expect, it } from 'vitest'
import { applyGlossaryRevisions, applyGlossaryText, mergeGlossaryRevisions, appendGlossaryRevision, GLOSSARY_TERMS, validateGlossaryText } from '../glossaryStore'

beforeEach(() => applyGlossaryRevisions([]))
describe('approved glossary replacements', () => {
  it('does not roll back a new approval when an older or empty read arrives late', () => {
    const older = { term_key: 'nav.today', original_nepali: 'आज', nepali: 'अहिले', revision: 1 }
    appendGlossaryRevision({ ...older, nepali: 'आजै', revision: 2 })
    mergeGlossaryRevisions([])
    mergeGlossaryRevisions([older])
    expect(applyGlossaryText('आज', 'ne')).toBe('आजै')
    applyGlossaryRevisions([]) // Account changes explicitly clear the observed history.
    expect(applyGlossaryText('आज', 'ne')).toBe('आज')
  })
  it('updates repeated whole terms and preserves amounts, IDs and English', () => {
    applyGlossaryRevisions([{ term_key: 'msg.pending', original_nepali: 'विचाराधीन', nepali: 'पर्खँदै', revision: 1 }])
    expect(applyGlossaryText('विचाराधीन · विचाराधीन NPR {amount} B-715', 'ne')).toBe('पर्खँदै · पर्खँदै NPR {amount} B-715')
    expect(applyGlossaryText('विचाराधीन', 'en')).toBe('विचाराधीन')
    expect(applyGlossaryText('विचाराधीनको', 'ne')).toBe('विचाराधीनको')
  })
  it('uses the newest approved revision, supports reversal, and never chains replacements', () => {
    applyGlossaryRevisions([
      { term_key: 'a', original_nepali: 'आज', nepali: 'अहिले', revision: 1 },
      { term_key: 'b', original_nepali: 'अहिले', nepali: 'पछि', revision: 2 },
    ])
    expect(applyGlossaryText('आज', 'ne')).toBe('अहिले')
    applyGlossaryRevisions([{ term_key: 'a', original_nepali: 'आज', nepali: 'आज', revision: 3 }])
    expect(applyGlossaryText('आज', 'ne')).toBe('आज')
  })
  it('refuses missing/oversized terms, Devanagari digits and changed placeholders', () => {
    const term = GLOSSARY_TERMS[0]!
    expect(validateGlossaryText(term, '')).not.toBeNull()
    expect(validateGlossaryText(term, 'a'.repeat(301))).not.toBeNull()
    expect(validateGlossaryText(term, '२०')).not.toBeNull()
    expect(validateGlossaryText(term, '{amount}')).not.toBeNull()
  })
})
