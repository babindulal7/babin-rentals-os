import { createAction } from '../core';
import { supabase } from '../../lib/supabase';

export type ArchiveTeamNoteInput = {
  noteId: string;
  archived?: boolean;
};

export type ArchiveTeamNoteOutput = {
  archived: boolean;
};

export const archiveTeamNote = createAction<ArchiveTeamNoteInput, ArchiveTeamNoteOutput>({
  name: 'archiveTeamNote',
  permissions: ['team_note.archive'],
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
    const isArchived = input.archived ?? true;
    const { data, error } = await supabase.rpc('archive_team_note', {
      p_note_id: input.noteId,
      p_archived: isArchived,
    });

    if (error) {
      throw new Error(`Failed to archive team note: ${error.message}`);
    }

    return {
      result: { archived: (data as boolean) ?? isArchived },
      events: [
        {
          type: 'TEAM_NOTE_ARCHIVED',
          payload: { noteId: input.noteId, archivedBy: ctx.userId, archived: isArchived },
        },
      ],
    };
  },
});
