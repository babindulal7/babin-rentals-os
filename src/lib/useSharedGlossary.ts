import { useEffect } from 'react'
import { supabase } from './supabase'
import { readGlossaryRevisions } from './glossarySync'
import { applyGlossaryRevisions } from './glossaryStore'
import { captureError } from './monitoring'
import type { SystemRole } from '../types/database'

export function useSharedGlossary(userId: string | null, role: SystemRole): void {
  useEffect(() => {
    applyGlossaryRevisions([])
    if (!userId || role === 'Client') return
    let active = true
    let generation = 0
    const refresh = () => {
      const request = ++generation
      void readGlossaryRevisions().then(rows => {
        if (active && request === generation) applyGlossaryRevisions(rows)
      }).catch(cause => {
        if (active) captureError(cause instanceof Error ? cause : new Error('Glossary refresh failed'), { where: 'glossarySync' })
      })
    }
    refresh()
    const channel = typeof supabase.channel === 'function'
      ? supabase.channel(`approved-glossary-${userId}`).on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'glossary_term_revisions',
      }, refresh).subscribe(status => { if (status === 'SUBSCRIBED') refresh() }) : null
    window.addEventListener('online', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      active = false
      window.removeEventListener('online', refresh)
      window.removeEventListener('focus', refresh)
      if (channel) void supabase.removeChannel(channel)
    }
  }, [userId, role])
}
