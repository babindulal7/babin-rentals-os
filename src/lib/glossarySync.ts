import { supabase } from './supabase'
import { mergeGlossaryRevisions, type GlossaryRevision } from './glossaryStore'

export async function readGlossaryRevisions(): Promise<GlossaryRevision[]> {
  const rows: GlossaryRevision[] = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from('glossary_term_revisions')
      .select('term_key,original_nepali,nepali,revision').order('revision', { ascending: false }).range(offset, offset + 499)
    if (error) throw new Error('Could not load approved glossary changes. Try again when connected.')
    const page: unknown[] = data ?? []
    for (const item of page) {
      if (!item || typeof item !== 'object') throw new Error('Could not read glossary history.')
      const row = item as Record<string, unknown>
      if (typeof row.term_key !== 'string' || typeof row.original_nepali !== 'string'
        || typeof row.nepali !== 'string' || typeof row.revision !== 'number') throw new Error('Could not read glossary history.')
      rows.push({ term_key: row.term_key, original_nepali: row.original_nepali, nepali: row.nepali, revision: row.revision })
    }
    if (page.length < 500) return rows
  }
}

export async function hydrateGlossary(): Promise<void> {
  mergeGlossaryRevisions(await readGlossaryRevisions())
}
