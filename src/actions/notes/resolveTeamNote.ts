import { createAction } from '../core';
import { supabase } from '../../lib/supabase';

export type ResolveTeamNoteInput = {
  noteId: string;
  resolved?: boolean;
};

export type ResolveTeamNoteOutput = {
  resolved: boolean;
};

export const resolveTeamNote = createAction<ResolveTeamNoteInput, ResolveTeamNoteOutput>({
  name: 'resolveTeamNote',
  permissions: ['team_note.resolve'],
  implemented: true,
  validate: (input) => {
    if (!input.noteId) {
      throw new Error('Note ID is required');
    }
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(input.noteId)) {
      throw new Error('Invalid note ID format');
    }
  },
  execute: async (input, ctx) => {
    const isResolved = input.resolved ?? true;
    const { data, error } = await supabase.rpc('resolve_team_note', {
      p_note_id: input.noteId,
      p_resolved: isResolved,
    });

    if (error) {
      throw new Error(`Failed to resolve team note: ${error.message}`);
    }

    return {
      result: { resolved: (data as boolean) ?? isResolved },
      events: [
        {
          type: 'TEAM_NOTE_RESOLVED',
          payload: { noteId: input.noteId, resolvedBy: ctx.userId, resolved: isResolved },
        },
      ],
    };
  },
});
