import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useAuth } from '../../lib/auth'
import { GLOSSARY_TERMS, applyGlossaryRevisions, appendGlossaryRevision, getGlossaryRevisions, glossaryVersion, subscribeGlossary, validateGlossaryText, type GlossaryTerm } from '../../lib/glossaryStore'
import { readGlossaryRevisions } from '../../lib/glossarySync'
import { canManageGlossary } from '../../lib/rbac'
import { newClientUuid } from '../../lib/supabase'
import { approveGlossaryTerm } from '../../actions/settings/approveGlossaryTerm'
import { loadNepaliFonts, FONT_STACK } from '../../lib/i18n'
import { Button } from '../../components/ui/Page'
import { Modal } from '../../components/ui/Modal'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { UnsavedLeaveDialog, useUnsavedRecord } from '../../components/ui/RecordWorkspace'

export function GlossarySettingsControl({ active = true }: { active?: boolean }) {
  const { user } = useAuth()
  const allowed = canManageGlossary(user?.role ?? 'Client')
  useSyncExternalStore(subscribeGlossary, glossaryVersion, glossaryVersion)
  const rows = getGlossaryRevisions()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<GlossaryTerm | null>(null)
  const [baseline, setBaseline] = useState('')
  const [draft, setDraft] = useState('')
  const [revision, setRevision] = useState(0)
  const [retryKey, setRetryKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [discard, setDiscard] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [online, setOnline] = useState(() => navigator.onLine)
  const loadRequest = useRef(0)
  const editingUserId = useRef(user?.id)
  editingUserId.current = user?.id
  const cancelLoad = useCallback(() => { loadRequest.current++ }, [])
  const dirty = selected !== null && draft !== baseline
  useUnsavedRecord(dirty)

  const load = useCallback(async () => {
    if (!allowed || !active) return
    const request = ++loadRequest.current
    setLoading(true)
    setError(null)
    try {
      const [result] = await Promise.all([readGlossaryRevisions(), loadNepaliFonts()])
      if (request !== loadRequest.current) return
      applyGlossaryRevisions(result)
    } catch (cause) {
      if (request !== loadRequest.current) return
      setError(cause instanceof Error ? cause.message : 'Could not load glossary changes.')
    } finally { if (request === loadRequest.current) setLoading(false) }
  }, [allowed, active])
  useEffect(() => {
    setSelected(null)
    setDraft('')
    setMessage(null)
  }, [user?.id])
  useEffect(() => { void load(); return cancelLoad }, [load, user?.id, cancelLoad])
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  if (!allowed || !active) return null

  const current = (term: GlossaryTerm) => rows.find(row => row.original_nepali === term.ne)
  const found = GLOSSARY_TERMS.filter(term => `${term.en} ${term.ne} ${current(term)?.nepali ?? ''} ${term.id}`.toLowerCase().includes(search.trim().toLowerCase()))
  function open(term: GlossaryTerm) {
    const latest = current(term)
    setSelected(term)
    setBaseline(latest?.nepali ?? term.ne)
    setDraft(latest?.nepali ?? term.ne)
    setRevision(latest?.revision ?? 0)
    setRetryKey(newClientUuid())
    setError(null)
    setMessage(null)
  }
  const close = () => { if (saving) return; if (dirty) setDiscard(true); else setSelected(null) }
  async function save() {
    if (!selected || !user || saving) return
    const problem = validateGlossaryText(selected, draft)
    if (problem) { setError(problem); return }
    setSaving(true)
    setError(null)
    try {
      const row = await approveGlossaryTerm({ clientUuid: retryKey, termKey: selected.id, nepali: draft, expectedRevision: revision },
        { userId: user.id, role: user.role, isOnline: online })
      if (editingUserId.current !== user.id) return
      appendGlossaryRevision(row)
      setMessage(`Approved and applied: ${selected.en}`)
      setSelected(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not confirm this change. Your draft is still here.')
    } finally { setSaving(false) }
  }

  return (
    <section aria-labelledby="glossary-heading" style={{ padding: 'var(--sp-md)', minWidth: 0 }}>
      <h3 id="glossary-heading">Glossary</h3>
      <p>Owner approval applies the new wording everywhere the matching Nepali term appears, including aliases. History is retained.</p>
      {message && <p role="status">{message}</p>}
      {!online && <p role="status">You are offline. Glossary changes cannot be approved until you reconnect.</p>}
      {loading ? <p role="status">Loading glossary…</p> : error && !selected ? <div role="alert">{error} <Button onClick={() => { void load() }}>Retry glossary</Button></div> : <>
        <label htmlFor="glossary-search">Search glossary</label>
        <input id="glossary-search" value={search} onChange={event => setSearch(event.target.value)} style={{ minHeight: 44, width: '100%', maxWidth: 480 }} />
        <p>{found.length === 0 ? 'No matching glossary terms.' : `Showing ${Math.min(found.length, 20)} of ${found.length} terms`}</p>
        {found.slice(0, 20).map(term => <div key={term.id} style={{ paddingBlock: 8, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
          <span style={{ flex: '1 1 200px', minWidth: 0, overflowWrap: 'anywhere' }}>{term.en} <span lang="ne" style={{ fontFamily: FONT_STACK.ne.body }}>{current(term)?.nepali ?? term.ne}</span></span>
          <Button variant="secondary" disabled={!online} onClick={() => open(term)} aria-label={`Edit glossary term ${term.en}`}>Edit</Button>
        </div>)}
      </>}
      <Modal isOpen={selected !== null} onClose={close} title={`Edit glossary: ${selected?.en ?? ''}`} footer={<>
        <Button variant="secondary" disabled={saving} onClick={close}>Cancel</Button>
        <Button variant="primary" disabled={saving || !online || !dirty} onClick={() => { void save() }}>{saving ? 'Approving…' : 'Approve and apply'}</Button>
      </>}>
        <label htmlFor="glossary-wording">Nepali wording</label>
        <input id="glossary-wording" lang="ne" value={draft} maxLength={300} disabled={saving} aria-describedby="glossary-edit-help"
          onChange={event => { setDraft(event.target.value); setRetryKey(newClientUuid()) }}
          style={{ minHeight: 44, width: '100%', fontFamily: FONT_STACK.ne.body, fontSize: 18 }} />
        <p id="glossary-edit-help">Approving changes the shared glossary immediately. Numbers, brands, identifiers and placeholders stay unchanged.</p>
        {error && <p role="alert">{error}</p>}
        {selected && <details><summary>Previous approved wording</summary>
          <p lang="ne">Original: {selected.ne}</p>
          {rows.filter(row => row.original_nepali === selected.ne).slice(0, 10).map(row => <p key={row.revision} lang="ne">{row.nepali}</p>)}
          <p>To restore earlier wording, enter it above and approve it as a new revision.</p>
        </details>}
      </Modal>
      <ConfirmDialog isOpen={discard} title="Discard glossary draft?" description="Discard the wording you are editing? This will not change the approved glossary." confirmLabel="Discard draft" cancelLabel="Keep editing"
        onClose={() => setDiscard(false)} onConfirm={() => { setDiscard(false); setSelected(null) }} />
      <UnsavedLeaveDialog />
    </section>
  )
}
