import { createAction } from '../core';
import { supabase } from '../../lib/supabase';

export type PinTeamNoteInput = {
  noteId: string;
  pinned?: boolean;
};

export type PinTeamNoteOutput = {
  pinned: boolean;
};

export const pinTeamNote = createAction<PinTeamNoteInput, PinTeamNoteOutput>({
  name: 'pinTeamNote',
  permissions: ['team_note.pin'],
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
    const isPinned = input.pinned ?? true;
    const { data, error } = await supabase.rpc('pin_team_note', {
      p_note_id: input.noteId,
      p_pinned: isPinned,
    });

    if (error) {
      throw new Error(`Failed to pin team note: ${error.message}`);
    }

    return {
      result: { pinned: (data as boolean) ?? isPinned },
      events: [
        {
          type: 'TEAM_NOTE_PINNED',
          payload: { noteId: input.noteId, pinnedBy: ctx.userId, pinned: isPinned },
        },
      ],
    };
  },
});
