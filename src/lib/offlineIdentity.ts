import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { IS_MOCK, supabase } from './supabase'

export interface OfflineIdentity {
  actorId: string
  environment: string
}
export interface OfflineSession extends OfflineIdentity {
  client: SupabaseClient
}

/** Credentials stay in memory; only actor/project identifiers enter IndexedDB.
 * Replay uses a captured token so an account switch during a request cannot
 * cause pending work to be submitted with the next operator's credentials.
 */
export async function getOfflineSession(): Promise<OfflineSession | null> {
  const { data, error } = await supabase.auth.getSession()
  const session = data.session
  if (error || !session?.user.id) return null
  if (IS_MOCK) return { actorId: session.user.id, environment: 'mock', client: supabase }
  if (!session.access_token) return null
  const accessToken = session.access_token
  const actorId = session.user.id
  const url = import.meta.env['VITE_SUPABASE_URL']
  const key = import.meta.env['VITE_SUPABASE_ANON_KEY']
  if (!url || !key) return null
  return {
    actorId,
    environment: new URL(url).href.replace(/\/+$/, ''),
    client: createClient(url, key, { accessToken: async () => accessToken }),
  }
}

export function ownsOfflineWork(work: Partial<OfflineIdentity>, identity: OfflineIdentity): boolean {
  return work.actorId === identity.actorId && work.environment === identity.environment
}
