import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../lib/auth';
import { listTeamNotes, createTeamNote, acknowledgeTeamNote, type TeamNoteRow } from '../../actions/notes';
import type { ActionContext } from '../../actions/core';
import { formatAdDateTime } from '../../lib/bs';
import { canCreateTeamNote, isStaff as checkIsStaff } from '../../lib/rbac';

export interface TeamNotesPanelProps {
  /** Maximum number of notes to show initially */
  initialLimit?: number;
  /** Whether to auto-refresh */
  autoRefresh?: boolean;
  /** Refresh interval in ms */
  refreshInterval?: number;
}

function actionCtx(user: { id: string; role: ActionContext['role'] } | null | undefined): ActionContext | undefined {
  return user ? { userId: user.id, role: user.role } : undefined;
}

export function TeamNotesPanel({
  initialLimit = 20,
  autoRefresh = true,
  refreshInterval = 30000,
}: TeamNotesPanelProps) {
  const { user } = useAuth();
  const ctx = actionCtx(user);
  const role = user?.role;
  const [notes, setNotes] = useState<TeamNoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newNoteBody, setNewNoteBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [acknowledging, setAcknowledging] = useState<Set<string>>(new Set());
  const [showComposer, setShowComposer] = useState(false);

  const canCreate = role ? canCreateTeamNote(role) : false;
  const isStaff = role ? checkIsStaff(role) : false;

  const fetchNotes = useCallback(async () => {
    if (!isStaff || !ctx) return;
    try {
      setLoading(true);
      setError(null);
      const { notes: fetchedNotes } = await listTeamNotes({ limit: initialLimit, offset: 0 }, ctx);
      setNotes(fetchedNotes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load team notes');
    } finally {
      setLoading(false);
    }
  }, [initialLimit, isStaff, ctx]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchNotes, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchNotes, refreshInterval]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteBody.trim() || submitting || !ctx) return;
    setSubmitting(true);
    try {
      await createTeamNote({ body: newNoteBody.trim() }, ctx);
      setNewNoteBody('');
      setShowComposer(false);
      await fetchNotes();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create note');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAcknowledge = async (noteId: string) => {
    if (acknowledging.has(noteId) || !ctx) return;
    setAcknowledging((prev) => new Set(prev).add(noteId));
    try {
      const { acknowledged } = await acknowledgeTeamNote({ noteId }, ctx);
      if (acknowledged) {
        await fetchNotes();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to acknowledge note');
    } finally {
      setAcknowledging((prev) => {
        const next = new Set(prev);
        next.delete(noteId);
        return next;
      });
    }
  };

  const isAcknowledged = (note: TeamNoteRow) => note.acknowledged_by?.includes(user?.id ?? '');

  if (!isStaff) {
    return (
      <div className="team-notes-panel" role="region" aria-label="Team notes">
        <div className="team-notes-empty">
          <p>Team notes are available to staff members only.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="team-notes-panel" role="region" aria-label="Team notes">
      <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: 8, fontStyle: 'italic' }}>
        Notes are seen by all staff.
      </div>
      {canCreate && (
        <button
          type="button"
          className="team-notes-toggle"
          onClick={() => setShowComposer(!showComposer)}
          aria-expanded={showComposer}
        >
          {showComposer ? 'Cancel' : 'New Note'}
        </button>
      )}

      {showComposer && canCreate && (
        <form onSubmit={handleCreate} className="team-notes-composer">
          <textarea
            value={newNoteBody}
            onChange={(e) => setNewNoteBody(e.target.value)}
            placeholder="Write a note for the team…"
            rows={3}
            maxLength={10000}
            aria-label="Note body"
            disabled={submitting}
          />
          <div className="team-notes-composer-actions">
            <span className="char-count">
              {newNoteBody.length} / 10,000
            </span>
            <button type="submit" disabled={!newNoteBody.trim() || submitting}>
              {submitting ? 'Posting…' : 'Post'}
            </button>
            <button type="button" onClick={() => setShowComposer(false)} disabled={submitting}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {error && (
        <div className="team-notes-error" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <div className="team-notes-loading" aria-live="polite">
          Loading team notes…
        </div>
      ) : notes.length === 0 ? (
        <div className="team-notes-empty">
          <p>No team notes yet. {canCreate ? 'Create the first one!' : 'Notes will appear here.'}</p>
        </div>
      ) : (
        <ul className="team-notes-list" role="list" aria-label="Team notes">
          {notes.map((note) => (
            <li key={note.id} className="team-note">
              <div className="team-note-header">
                <span className="team-note-author">
                  {note.author_id === user?.id ? 'You' : note.author_id.slice(0, 8)}
                </span>
                <time className="team-note-time" dateTime={note.created_at}>
                  {formatAdDateTime(note.created_at)}
                </time>
              </div>
              <div className="team-note-body">{note.body}</div>
              <div className="team-note-footer">
                <span className="team-note-ack-count">
                  {note.acknowledged_by?.length ?? 0} acknowledged
                </span>
                {!isAcknowledged(note) && (
                  <button
                    type="button"
                    className="team-note-ack"
                    onClick={() => handleAcknowledge(note.id)}
                    disabled={acknowledging.has(note.id)}
                    aria-pressed={false}
                  >
                    {acknowledging.has(note.id) ? 'Acknowledging…' : 'Acknowledge'}
                  </button>
                )}
                {isAcknowledged(note) && (
                  <span className="team-note-acked" aria-live="polite">
                    ✓ Acknowledged
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}