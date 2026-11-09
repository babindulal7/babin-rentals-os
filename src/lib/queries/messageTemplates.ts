import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabase'
import type { MessageTemplate } from '../../actions/settings/messageTemplates'

export type { MessageTemplate }

export async function fetchActiveMessageTemplates(): Promise<MessageTemplate[]> {
  const { data, error } = await supabase
    .from('message_templates')
    .select('*')
    .eq('is_active', true)
    .order('category', { ascending: true })
    .order('name', { ascending: true })

  if (error) {
    throw new Error(`Failed to load message templates: ${error.message}`)
  }

  return (data || []) as MessageTemplate[]
}

export async function fetchMessageTemplateHistory(templateKey: string): Promise<MessageTemplate[]> {
  const { data, error } = await supabase
    .from('message_templates')
    .select('*')
    .eq('template_key', templateKey)
    .order('version', { ascending: false })

  if (error) {
    throw new Error(`Failed to load template history for ${templateKey}: ${error.message}`)
  }

  return (data || []) as MessageTemplate[]
}

export function useMessageTemplates() {
  const [templates, setTemplates] = useState<MessageTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchActiveMessageTemplates()
      setTemplates(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return { templates, loading, error, reload }
}

export function useMessageTemplateHistory(templateKey: string | null) {
  const [history, setHistory] = useState<MessageTemplate[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!templateKey) {
      setHistory([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await fetchMessageTemplateHistory(templateKey)
      setHistory(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [templateKey])

  useEffect(() => {
    void reload()
  }, [reload])

  return { history, loading, error, reload }
}
