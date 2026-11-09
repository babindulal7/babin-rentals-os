import { describe, expect, it } from 'vitest'
import { canEnable, evaluateLanguageReadiness } from '../languageReadiness'

const source = { tools: { 'tools.title': 'Tools' } }
const translations = { tools: { 'tools.title': 'औजार' } }
const approvals = { entries: { 'tools.title': {
  english: 'Tools', nepali: 'औजार', reviewedBy: 'Babin', reviewedAt: '2026-11-05',
} } }
const release = { approvedBy: 'Babin', approvedAt: '2026-11-05', modules: {
  tools: { conversionComplete: true, layoutCheckedBy: 'Babin', layoutCheckedAt: '2026-11-05' },
} }

describe('whole-app language readiness', () => {
  it('keeps the current incomplete staff app in English', () => {
    expect(canEnable('en')).toBe(true)
    expect(canEnable('ne')).toBe(false)
    expect(canEnable('ne', 'tools')).toBe(false)
  })

  it('requires conversion, exact reviewed text, layout checks and final approval', () => {
    expect(evaluateLanguageReadiness(source, translations, approvals, release).ready).toBe(true)
    expect(evaluateLanguageReadiness(source, translations, { entries: {} }, release).ready).toBe(false)
    expect(evaluateLanguageReadiness(source, { tools: {} }, approvals, release).ready).toBe(false)
    expect(evaluateLanguageReadiness(source, translations, approvals, { ...release, approvedAt: null }).ready).toBe(false)
    expect(evaluateLanguageReadiness(source, translations, approvals, { ...release, modules: {} }).ready).toBe(false)
    expect(evaluateLanguageReadiness(source, translations, approvals, { ...release, modules: {
      tools: { ...release.modules.tools, conversionComplete: false },
    } }).ready).toBe(false)
    expect(evaluateLanguageReadiness(source, translations, approvals, { ...release, modules: {
      tools: { ...release.modules.tools, layoutCheckedAt: null },
    } }).ready).toBe(false)
  })

  it('invalidates approval when either source or translation changes', () => {
    expect(evaluateLanguageReadiness({ tools: { 'tools.title': 'Equipment tools' } }, translations, approvals, release).ready).toBe(false)
    expect(evaluateLanguageReadiness(source, { tools: { 'tools.title': 'उपकरण' } }, approvals, release).ready).toBe(false)
  })

  it('fails closed for an empty catalogue and missing modules', () => {
    expect(evaluateLanguageReadiness({}, {}, approvals, release).ready).toBe(false)
    expect(evaluateLanguageReadiness({ ...source, finance: { 'finance.title': 'Finance' } }, translations, approvals, release).ready).toBe(false)
  })
})
