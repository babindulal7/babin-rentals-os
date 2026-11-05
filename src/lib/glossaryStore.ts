import source from '../i18n/glossary.ne.json'

export interface GlossaryTerm {
  id: string
  group: string
  en: string
  ne: string
  approved: string | null
  catalogueKey?: string
}
export interface GlossaryRevision {
  term_key: string
  original_nepali: string
  nepali: string
  revision: number
}
export const GLOSSARY_TERMS: readonly GlossaryTerm[] = source.terms
let revisions: readonly GlossaryRevision[] = []
let version = 0
const listeners = new Set<() => void>()

export function subscribeGlossary(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
export function glossaryVersion(): number { return version }
export function getGlossaryRevisions(): readonly GlossaryRevision[] { return revisions }
export function appendGlossaryRevision(row: GlossaryRevision): void {
  applyGlossaryRevisions([row, ...revisions.filter(item => item.revision !== row.revision)])
}
export function applyGlossaryRevisions(rows: readonly GlossaryRevision[]): void {
  revisions = [...rows].sort((a, b) => b.revision - a.revision)
  version++
  listeners.forEach(listener => listener())
}
export function currentGlossaryText(term: GlossaryTerm): string {
  return revisions.find(row => row.original_nepali === term.ne)?.nepali ?? term.ne
}
export function validateGlossaryText(term: GlossaryTerm, text: string): string | null {
  if (!text.trim() || text.trim().length > 300) return 'Enter a term between 1 and 300 characters.'
  if (/[०-९]/.test(text)) return 'Keep numbers in Latin digits.'
  if (/[{}]/.test(text.replace(/\{[^}]+\}/g, ''))) return 'Keep the original placeholders unchanged.'
  const placeholders = (value: string) => [...value.matchAll(/\{[^}]+\}/g)].map(match => match[0]).sort().join('|')
  if (placeholders(text) !== placeholders(term.ne)) return 'Keep the original placeholders unchanged.'
  const latin = (value: string) => (value.match(/[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*/g) ?? []).sort().join('|')
  if (latin(text) !== latin(term.ne)) return 'Keep the original Latin numbers, brands and identifiers unchanged.'
  return null
}

/** RULING 2026-11-05 C-6: approved glossary edits apply to every matching term immediately. */
export function applyGlossaryText(text: string, lang: 'en' | 'ne'): string {
  if (lang === 'en' || revisions.length === 0) return text
  const replacements = new Map<string, string>()
  for (const row of revisions) if (!replacements.has(row.original_nepali)) replacements.set(row.original_nepali, row.nepali)
  const terms = [...replacements.keys()].filter(Boolean).sort((a, b) => b.length - a.length)
  if (!terms.length) return text
  const escaped = terms.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  // Unicode letters/marks define term boundaries; JavaScript \b does not work for Devanagari.
  const pattern = new RegExp(`(^|[^\\p{L}\\p{M}\\p{N}_])(${escaped})(?=$|[^\\p{L}\\p{M}\\p{N}_])`, 'gu')
  return text.replace(pattern, (_match, prefix: string, term: string) => prefix + (replacements.get(term) ?? term))
}
