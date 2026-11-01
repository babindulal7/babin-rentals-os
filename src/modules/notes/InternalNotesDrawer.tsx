/**
 * InternalNotesDrawer — Team Dispatch & Operations Scratchpad Drawer.
 *
 * Ported from standalone (script_1.js:2269352, 2301646).
 * Enables warehouse staff, technicians, and drivers to log quick notes,
 * gear alerts, shift handover items, and booking reminders with auto-detected ID tags.
 */
import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Badge } from '../../components/ui/Badge'
import { FilterDrawer } from '../../components/ui/FilterDrawer'
import { Button } from '../../components/ui/Button'
import { useAuth } from '../../lib/auth'
import { IS_MOCK, supabase } from '../../lib/supabase'
import { useOptionalToast } from '../../components/ui/Toast'
import { canReadTeamNotes } from '../../lib/rbac'
import {
  listTeamNotes,
  createTeamNote,
  pinTeamNote,
  resolveTeamNote,
  archiveTeamNote,
} from '../../actions/notes'
import {
  listInternalNotes,
  addInternalNote,
  togglePinNote,
  toggleResolveNote,
  deleteInternalNote,
  extractReferenceId,
  getReferenceUrl,
  teamNoteRowToInternalNote,
  type InternalNote,
  type NoteCategory,
  type NotePriority,
} from '../../lib/queries/internalNotes'

interface InternalNotesDrawerProps {
  isOpen: boolean
  onClose: () => void
  initialReference?: string
}

export default function InternalNotesDrawer(props: InternalNotesDrawerProps) {
  const { user } = useAuth()
  const role = user?.role

  if (IS_MOCK) return <InternalNotesPreview {...props} />

  // Security gate: Client and unauthenticated denied
  if (!role || !canReadTeamNotes(role)) {
    return (
      <FilterDrawer id="team-internal-notes" open={props.isOpen} onClose={props.onClose} side="right" width={360}
        title="Team Internal Notes" keepMounted>
        <div role="status" style={{ padding: 'var(--sp-md)' }}>
          <h2>Restricted Access</h2>
          <p>Team notes are available to staff members only.</p>
        </div>
      </FilterDrawer>
    )
  }

  // Refuse if live supabase RPC is unavailable
  if (typeof (supabase as unknown as { rpc?: unknown })?.rpc !== 'function') {
    return (
      <FilterDrawer id="team-internal-notes" open={props.isOpen} onClose={props.onClose} side="right" width={360}
        title="Team Internal Notes" keepMounted>
        <div role="status" style={{ padding: 'var(--sp-md)' }}>
          <h2>Shared team notes unavailable</h2>
          <p>Team notes cannot be shared between staff yet. Existing entries on this device have been kept.</p>
        </div>
      </FilterDrawer>
    )
  }

  return <InternalNotesLiveDrawer {...props} />
}

function InternalNotesLiveDrawer({ isOpen, onClose, initialReference }: InternalNotesDrawerProps) {
  const { user } = useAuth()
  const toast = useOptionalToast()
  const navigate = useNavigate()
  const ctx = useMemo(
    () => (user ? { userId: user.id, role: user.role } : undefined),
    [user]
  )

  const [notes, setNotes] = useState<InternalNote[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [category, setCategory] = useState<NoteCategory>('General')
  const [priority, setPriority] = useState<NotePriority>('normal')
  const [filterCategory, setFilterCategory] = useState<string>('All')
  const [submitting, setSubmitting] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const reloadNotes = useCallback(async () => {
    if (!ctx) return
    try {
      setLoading(true)
      setError(null)
      const res = await listTeamNotes({ limit: 50, offset: 0, includeArchived: false }, ctx)
      setNotes(res.notes.map(teamNoteRowToInternalNote))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Shared team notes unavailable')
    } finally {
      setLoading(false)
    }
  }, [ctx])

  useEffect(() => {
    if (isOpen) {
      reloadNotes()
      if (initialReference) {
        setDraft(prev => prev.includes(initialReference) ? prev : prev ? `${initialReference} — ${prev}` : `${initialReference} — `)
      }
      const timer = window.setTimeout(() => textareaRef.current?.focus(), 150)
      return () => window.clearTimeout(timer)
    }
  }, [isOpen, initialReference, reloadNotes])

  const detectedRef = useMemo(() => extractReferenceId(draft), [draft])

  const handlePost = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!draft.trim() || submitting || !ctx) return
    setSubmitting(true)
    try {
      await createTeamNote(
        {
          body: draft.trim(),
          category,
          priority,
          clientUuid: crypto.randomUUID(),
        },
        ctx
      )
      setDraft('')
      await reloadNotes()
      toast?.showSuccessToast('Note Posted', 'Internal log updated successfully.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post note')
    } finally {
      setSubmitting(false)
    }
  }

  const handleTogglePin = async (id: string) => {
    if (!ctx) return
    const note = notes.find(n => n.id === id)
    if (!note) return
    await pinTeamNote({ noteId: id, pinned: !note.pinned }, ctx)
    await reloadNotes()
  }

  const handleToggleResolve = async (id: string) => {
    if (!ctx) return
    const note = notes.find(n => n.id === id)
    if (!note) return
    const resolved = note.status !== 'resolved'
    await resolveTeamNote({ noteId: id, resolved }, ctx)
    await reloadNotes()
  }

  const handleDelete = async (id: string) => {
    if (!ctx) return
    await archiveTeamNote({ noteId: id, archived: true }, ctx)
    toast?.showSuccessToast('Note Archived', 'Archived and removed from active log.')
    await reloadNotes()
  }

  const filteredNotes = useMemo(() => {
    const list = filterCategory === 'All'
      ? notes
      : notes.filter(n => n.category.toLowerCase() === filterCategory.toLowerCase())

    return [...list].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1
      if (!a.pinned && b.pinned) return 1
      return b.timestamp - a.timestamp
    })
  }, [notes, filterCategory])

  return (
    <FilterDrawer id="team-internal-notes" open={isOpen} onClose={onClose} side="right" width={360}
      title="Team Internal Notes" description="Shift handover scratchpad & equipment advisories" keepMounted>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
        <div style={{ fontSize: '11px', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="info" size={13} />
          <span style={{ fontWeight: 600 }}>Notes are seen by all staff.</span>
        </div>
        <Button onClick={() => { onClose(); navigate('/notes') }}>Open Team Notes page</Button>
      </div>

      {/* Note Composer */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--card)' }}>
        <form onSubmit={handlePost} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <textarea
            ref={textareaRef}
            rows={3}
            aria-label="Internal note draft"
            value={draft}
            disabled={submitting}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                handlePost()
              }
            }}
            placeholder="Post a shift note, equipment alert, client remark... (Ctrl+Enter to post)"
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 'var(--r-btn)',
              border: '1px solid var(--border)',
              background: 'var(--input-bg)',
              color: 'var(--text)',
              fontSize: 'var(--t-body)',
              resize: 'none',
              fontFamily: 'inherit',
            }}
          />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <select
                value={category}
                aria-label="Note category"
                disabled={submitting}
                onChange={e => setCategory(e.target.value as NoteCategory)}
                style={{
                  padding: '6px 8px',
                  borderRadius: 'var(--r-btn)',
                  border: '1px solid var(--border)',
                  background: 'var(--input-bg)',
                  color: 'var(--text)',
                  fontSize: '11px',
                  fontWeight: 600,
                }}
              >
                <option value="General">General</option>
                <option value="Equipment Alert">Equipment Alert</option>
                <option value="Shift Handover">Shift Handover</option>
                <option value="Logistics & Transport">Logistics</option>
                <option value="Client Remark">Client Remark</option>
              </select>

              <select
                value={priority}
                aria-label="Note priority"
                disabled={submitting}
                onChange={e => setPriority(e.target.value as NotePriority)}
                style={{
                  padding: '6px 8px',
                  borderRadius: 'var(--r-btn)',
                  border: '1px solid var(--border)',
                  background: 'var(--input-bg)',
                  color: 'var(--text)',
                  fontSize: '11px',
                  fontWeight: 600,
                }}
              >
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">🚨 Urgent</option>
              </select>

              {detectedRef && (
                <span
                  style={{
                    fontFamily: 'var(--font-id, sans-serif)',
                    fontVariantNumeric: 'tabular-nums',
                    fontSize: '11px',
                    fontWeight: 700,
                    background: 'rgba(28, 92, 196, 0.1)',
                    color: 'var(--accent)',
                    padding: '2px 6px',
                    borderRadius: 4,
                    border: '1px solid rgba(28, 92, 196, 0.2)',
                  }}
                >
                  #{detectedRef}
                </span>
              )}
            </div>

            <Button variant="primary" type="submit" disabled={!draft.trim() || submitting} style={{ minHeight: 44, padding: '0 14px' }}>
              <Icon name="plus" size={14} />
              {submitting ? 'Posting…' : 'Post'}
            </Button>
          </div>
        </form>
      </div>

      {/* Filter Categories */}
      <div
        style={{
          padding: '10px 20px',
          display: 'flex',
          gap: 6,
          overflowX: 'auto',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface-2)',
        }}
      >
        {(['All', 'Shift Handover', 'Equipment Alert', 'Logistics & Transport', 'Client Remark', 'General'] as const).map(cat => (
          <button
            key={cat}
            onClick={() => setFilterCategory(cat)}
            style={{
              padding: '4px 10px',
              borderRadius: 'var(--r-pill)',
              border: '1px solid var(--border)',
              background: filterCategory === cat ? 'var(--accent)' : 'var(--card)',
              color: filterCategory === cat ? '#fff' : 'var(--text2)',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {cat === 'Logistics & Transport' ? 'Logistics' : cat}
          </button>
        ))}
      </div>

      {/* Notes Feed */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {error && (
          <div role="alert" style={{ color: 'var(--danger)', fontSize: '12px', padding: '8px 12px', background: 'rgba(217, 72, 69, 0.08)', borderRadius: 'var(--r-sm)' }}>
            {error}
          </div>
        )}
        {loading && notes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 10px', color: 'var(--muted)', fontSize: 'var(--t-caption)' }}>
            Loading team notes…
          </div>
        ) : filteredNotes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 10px', color: 'var(--muted)', fontSize: 'var(--t-caption)' }}>
            No notes in this category yet.
          </div>
        ) : (
          filteredNotes.map(n => {
            const isResolved = n.status === 'resolved'
            const isUrgent = n.priority === 'urgent'
            const tone: 'danger' | 'primary' | 'warning' | 'neutral' =
              n.category === 'Gear Alert' || n.category === 'Equipment Alert'
                ? 'danger'
                : n.category === 'Shift Handover'
                ? 'primary'
                : n.category === 'Logistics & Transport'
                ? 'primary'
                : n.category === 'Client Remark'
                ? 'warning'
                : 'neutral'

            const initials = n.author
              .split(' ')
              .map(w => w[0])
              .join('')
              .slice(0, 2)
              .toUpperCase()

            return (
              <div
                key={n.id}
                style={{
                  padding: '12px 14px',
                  borderRadius: 'var(--r-card)',
                  border: `1px solid ${n.pinned ? 'var(--accent)' : 'var(--border)'}`,
                  borderLeft: isUrgent && !isResolved ? '4px solid var(--danger)' : undefined,
                  background: isResolved
                    ? 'var(--surface-2)'
                    : n.pinned
                    ? 'rgba(28, 92, 196, 0.03)'
                    : 'var(--card)',
                  boxShadow: 'var(--shadow-card)',
                  position: 'relative',
                  opacity: isResolved ? 0.8 : 1,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: '50%',
                        background: isResolved ? 'var(--card)' : 'var(--surface-2)',
                        border: '1px solid var(--border)',
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: '10px',
                        fontWeight: 700,
                        color: 'var(--text)',
                      }}
                    >
                      {initials}
                    </span>
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 700, lineHeight: 1.2 }}>{n.author}</div>
                      <div style={{ fontSize: '10px', color: 'var(--muted)' }}>{n.authorRole} · {n.at}</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {isUrgent && !isResolved && <Badge label="URGENT" tone="danger" />}
                    <Badge label={n.category} tone={tone} />
                    {isResolved && <Badge label="DONE" tone="in" />}
                    <button
                      type="button"
                      onClick={() => handleTogglePin(n.id)}
                      title={n.pinned ? 'Unpin note' : 'Pin note to top'}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: n.pinned ? 'var(--accent)' : 'var(--muted)',
                        cursor: 'pointer',
                        padding: 4,
                        display: 'grid',
                        placeItems: 'center',
                      }}
                    >
                      <Icon name="bell" size={13} fill={Boolean(n.pinned)} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(n.id)}
                      title="Archive note"
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: 'var(--muted)',
                        cursor: 'pointer',
                        padding: 4,
                        display: 'grid',
                        placeItems: 'center',
                      }}
                    >
                      <Icon name="close" size={13} />
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    fontSize: 'var(--t-body)',
                    color: isResolved ? 'var(--muted)' : 'var(--text)',
                    lineHeight: 1.45,
                    whiteSpace: 'pre-wrap',
                    textDecoration: isResolved ? 'line-through' : 'none',
                  }}
                >
                  {n.text}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                  {n.referenceId ? (
                    <Link
                      to={getReferenceUrl(n.referenceId)}
                      onClick={onClose}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '2px 8px',
                        borderRadius: 'var(--r-pill)',
                        background: 'var(--surface-2)',
                        border: '1px solid var(--border)',
                        fontSize: '11px',
                        fontFamily: 'var(--font-id, sans-serif)',
                        fontVariantNumeric: 'tabular-nums',
                        fontWeight: 700,
                        color: 'var(--accent)',
                        textDecoration: 'none',
                      }}
                      title={`Open ${n.referenceId}`}
                    >
                      <Icon name="receipt" size={11} />
                      {n.referenceId}
                      <Icon name="external_link" size={10} style={{ opacity: 0.7 }} />
                    </Link>
                  ) : <span />}

                  <button
                    type="button"
                    onClick={() => handleToggleResolve(n.id)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: isResolved ? 'var(--muted)' : 'var(--success-text)',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3,
                      padding: '2px 6px',
                    }}
                  >
                    <Icon name="check" size={12} />
                    {isResolved ? 'Reopen' : 'Done'}
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </FilterDrawer>
  )
}

function InternalNotesPreview({ isOpen, onClose, initialReference }: InternalNotesDrawerProps) {
  const { user } = useAuth()
  const toast = useOptionalToast()
  const navigate = useNavigate()
  const [notes, setNotes] = useState<InternalNote[]>(() => listInternalNotes())
  const [draft, setDraft] = useState('')
  const [category, setCategory] = useState<NoteCategory>('General')
  const [priority, setPriority] = useState<NotePriority>('normal')
  const [filterCategory, setFilterCategory] = useState<string>('All')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const reloadNotes = () => {
    setNotes(listInternalNotes())
  }

  useEffect(() => {
    const handleUpdate = () => reloadNotes()
    window.addEventListener('babin:notes-updated', handleUpdate)
    return () => window.removeEventListener('babin:notes-updated', handleUpdate)
  }, [])

  useEffect(() => {
    if (isOpen) {
      reloadNotes()
      if (initialReference) {
        setDraft(prev => prev.includes(initialReference) ? prev : prev ? `${initialReference} — ${prev}` : `${initialReference} — `)
      }
      const timer = window.setTimeout(() => textareaRef.current?.focus(), 150)
      return () => window.clearTimeout(timer)
    }
  }, [isOpen, initialReference])

  const detectedRef = useMemo(() => extractReferenceId(draft), [draft])

  const handlePost = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!draft.trim()) return

    const authorName = user?.name || 'Staff Member'
    const authorRole = user?.role || 'Operations'

    addInternalNote({
      author: authorName,
      authorRole,
      text: draft,
      category,
      priority,
    })

    setDraft('')
    reloadNotes()
    toast?.showSuccessToast('Note Posted', 'Internal log updated successfully.')
  }

  const handleTogglePin = (id: string) => {
    togglePinNote(id)
    reloadNotes()
  }

  const handleToggleResolve = (id: string) => {
    toggleResolveNote(id, user?.name || 'Operations Staff')
    reloadNotes()
  }

  const handleDelete = (id: string) => {
    deleteInternalNote(id)
    reloadNotes()
  }

  const filteredNotes = useMemo(() => {
    const list = filterCategory === 'All'
      ? notes
      : notes.filter(n => n.category.toLowerCase() === filterCategory.toLowerCase())

    // Sort: pinned first, then newest timestamp
    return [...list].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1
      if (!a.pinned && b.pinned) return 1
      return b.timestamp - a.timestamp
    })
  }, [notes, filterCategory])

  return (
    <FilterDrawer id="team-internal-notes" open={isOpen} onClose={onClose} side="right" width={360}
      title="Team Internal Notes" description="Shift handover scratchpad & equipment advisories" keepMounted>
      <Button onClick={() => { onClose(); navigate('/notes') }}>Open Team Notes page</Button>
        {/* Note Composer */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--card)' }}>
          <form onSubmit={handlePost} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <textarea
              ref={textareaRef}
              rows={3}
              aria-label="Internal note draft"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  handlePost()
                }
              }}
              placeholder="Post a shift note, equipment alert, client remark... (Ctrl+Enter to post)"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 'var(--r-btn)',
                border: '1px solid var(--border)',
                background: 'var(--input-bg)',
                color: 'var(--text)',
                fontSize: 'var(--t-body)',
                resize: 'none',
                fontFamily: 'inherit',
              }}
            />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <select
                  value={category}
                  aria-label="Note category"
                  onChange={e => setCategory(e.target.value as NoteCategory)}
                  style={{
                    padding: '6px 8px',
                    borderRadius: 'var(--r-btn)',
                    border: '1px solid var(--border)',
                    background: 'var(--input-bg)',
                    color: 'var(--text)',
                    fontSize: '11px',
                    fontWeight: 600,
                  }}
                >
                  <option value="General">General</option>
                  <option value="Equipment Alert">Equipment Alert</option>
                  <option value="Shift Handover">Shift Handover</option>
                  <option value="Logistics & Transport">Logistics</option>
                  <option value="Client Remark">Client Remark</option>
                </select>

                <select
                  value={priority}
                  aria-label="Note priority"
                  onChange={e => setPriority(e.target.value as NotePriority)}
                  style={{
                    padding: '6px 8px',
                    borderRadius: 'var(--r-btn)',
                    border: '1px solid var(--border)',
                    background: 'var(--input-bg)',
                    color: 'var(--text)',
                    fontSize: '11px',
                    fontWeight: 600,
                  }}
                >
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">🚨 Urgent</option>
                </select>

                {detectedRef && (
                  <span
                    style={{
                      fontFamily: 'var(--font-id, sans-serif)',
                      fontVariantNumeric: 'tabular-nums',
                      fontSize: '11px',
                      fontWeight: 700,
                      background: 'rgba(28, 92, 196, 0.1)',
                      color: 'var(--accent)',
                      padding: '2px 6px',
                      borderRadius: 4,
                      border: '1px solid rgba(28, 92, 196, 0.2)',
                    }}
                  >
                    #{detectedRef}
                  </span>
                )}
              </div>

              <Button variant="primary" type="submit" disabled={!draft.trim()} style={{ minHeight: 44, padding: '0 14px' }}>
                <Icon name="plus" size={14} />
                Post
              </Button>
            </div>
          </form>
        </div>

        {/* Filter Categories */}
        <div
          style={{
            padding: '10px 20px',
            display: 'flex',
            gap: 6,
            overflowX: 'auto',
            borderBottom: '1px solid var(--border)',
            background: 'var(--surface-2)',
          }}
        >
          {(['All', 'Shift Handover', 'Equipment Alert', 'Logistics & Transport', 'Client Remark', 'General'] as const).map(cat => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              style={{
                padding: '4px 10px',
                borderRadius: 'var(--r-pill)',
                border: '1px solid var(--border)',
                background: filterCategory === cat ? 'var(--accent)' : 'var(--card)',
                color: filterCategory === cat ? '#fff' : 'var(--text2)',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {cat === 'Logistics & Transport' ? 'Logistics' : cat}
            </button>
          ))}
        </div>

        {/* Notes Feed */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filteredNotes.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 10px', color: 'var(--muted)', fontSize: 'var(--t-caption)' }}>
              No notes in this category yet.
            </div>
          ) : (
            filteredNotes.map(n => {
              const isResolved = n.status === 'resolved'
              const isUrgent = n.priority === 'urgent'
              const tone: 'danger' | 'primary' | 'warning' | 'neutral' =
                n.category === 'Gear Alert' || n.category === 'Equipment Alert'
                  ? 'danger'
                  : n.category === 'Shift Handover'
                  ? 'primary'
                  : n.category === 'Logistics & Transport'
                  ? 'primary'
                  : n.category === 'Client Remark'
                  ? 'warning'
                  : 'neutral'

              const initials = n.author
                .split(' ')
                .map(w => w[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()

              return (
                <div
                  key={n.id}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 'var(--r-card)',
                    border: `1px solid ${n.pinned ? 'var(--accent)' : 'var(--border)'}`,
                    borderLeft: isUrgent && !isResolved ? '4px solid var(--danger)' : undefined,
                    background: isResolved
                      ? 'var(--surface-2)'
                      : n.pinned
                      ? 'rgba(28, 92, 196, 0.03)'
                      : 'var(--card)',
                    boxShadow: 'var(--shadow-card)',
                    position: 'relative',
                    opacity: isResolved ? 0.8 : 1,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: '50%',
                          background: isResolved ? 'var(--card)' : 'var(--surface-2)',
                          border: '1px solid var(--border)',
                          display: 'grid',
                          placeItems: 'center',
                          fontSize: '10px',
                          fontWeight: 700,
                          color: 'var(--text)',
                        }}
                      >
                        {initials}
                      </span>
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 700, lineHeight: 1.2 }}>{n.author}</div>
                        <div style={{ fontSize: '10px', color: 'var(--muted)' }}>{n.authorRole} · {n.at}</div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {isUrgent && !isResolved && <Badge label="URGENT" tone="danger" />}
                      <Badge label={n.category} tone={tone} />
                      {isResolved && <Badge label="DONE" tone="in" />}
                      <button
                        type="button"
                        onClick={() => handleTogglePin(n.id)}
                        title={n.pinned ? 'Unpin note' : 'Pin note to top'}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color: n.pinned ? 'var(--accent)' : 'var(--muted)',
                          cursor: 'pointer',
                          padding: 4,
                          display: 'grid',
                          placeItems: 'center',
                        }}
                      >
                        <Icon name="bell" size={13} fill={Boolean(n.pinned)} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(n.id)}
                        title="Delete note"
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color: 'var(--muted)',
                          cursor: 'pointer',
                          padding: 4,
                          display: 'grid',
                          placeItems: 'center',
                        }}
                      >
                        <Icon name="close" size={13} />
                      </button>
                    </div>
                  </div>

                  <div
                    style={{
                      fontSize: 'var(--t-body)',
                      color: isResolved ? 'var(--muted)' : 'var(--text)',
                      lineHeight: 1.45,
                      whiteSpace: 'pre-wrap',
                      textDecoration: isResolved ? 'line-through' : 'none',
                    }}
                  >
                    {n.text}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                    {n.referenceId ? (
                      <Link
                        to={getReferenceUrl(n.referenceId)}
                        onClick={onClose}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '2px 8px',
                          borderRadius: 'var(--r-pill)',
                          background: 'var(--surface-2)',
                          border: '1px solid var(--border)',
                          fontSize: '11px',
                          fontFamily: 'var(--font-id, sans-serif)',
                          fontVariantNumeric: 'tabular-nums',
                          fontWeight: 700,
                          color: 'var(--accent)',
                          textDecoration: 'none',
                        }}
                        title={`Open ${n.referenceId}`}
                      >
                        <Icon name="receipt" size={11} />
                        {n.referenceId}
                        <Icon name="external_link" size={10} style={{ opacity: 0.7 }} />
                      </Link>
                    ) : <span />}

                    <button
                      type="button"
                      onClick={() => handleToggleResolve(n.id)}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: isResolved ? 'var(--muted)' : 'var(--success-text)',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 3,
                        padding: '2px 6px',
                      }}
                    >
                      <Icon name="check" size={12} />
                      {isResolved ? 'Reopen' : 'Done'}
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
    </FilterDrawer>
  )
}
