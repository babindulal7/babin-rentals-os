import { createAction } from '../core'
import { supabase } from '../../lib/supabase'
import { GLOSSARY_TERMS, validateGlossaryText, type GlossaryRevision } from '../../lib/glossaryStore'

interface Input {
  clientUuid: string
  termKey: string
  nepali: string
  expectedRevision: number
}

export const approveGlossaryTerm = createAction<Input, GlossaryRevision>({
  name: 'approveGlossaryTerm',
  permissions: ['glossary.manage'],
  implemented: true,
  validate(input) {
    const term = GLOSSARY_TERMS.find(item => item.id === input.termKey)
    if (!term) throw new Error('Choose an existing glossary term.')
    const problem = validateGlossaryText(term, input.nepali)
    if (problem) throw new Error(problem)
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.clientUuid)
      || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) throw new Error('Reload the glossary before approving.')
  },
  async execute(input) {
    const { data, error } = await supabase.rpc('approve_glossary_term', {
      p_client_uuid: input.clientUuid, p_term_key: input.termKey,
      p_nepali: input.nepali.trim(), p_expected_revision: input.expectedRevision,
    })
    if (error) throw new Error(error.message.replace(/^GATE:[^|]*\|/, ''))
    const row = data as Partial<GlossaryRevision> | null
    if (!row || row.term_key !== input.termKey || typeof row.original_nepali !== 'string'
      || row.nepali !== input.nepali.trim() || typeof row.revision !== 'number') throw new Error('Could not verify the saved glossary change. Reload its history before retrying.')
    return { result: row as GlossaryRevision, events: [] }
  },
})
