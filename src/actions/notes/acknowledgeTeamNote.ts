import { createAction } from '../core';
import { supabase } from '../../lib/supabase';

export type AcknowledgeTeamNoteInput = {
  noteId: string;
};

export type AcknowledgeTeamNoteOutput = {
  acknowledged: boolean;
};

export const acknowledgeTeamNote = createAction<AcknowledgeTeamNoteInput, AcknowledgeTeamNoteOutput>({
  name: 'acknowledgeTeamNote',
  permissions: ['team_note.acknowledge'],
  implemented: true,
  validate: (input) => {
    if (!input.noteId) {
      throw new Error('Note ID is required');
    }
    // Basic UUID validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(input.noteId)) {
      throw new Error('Invalid note ID format');
    }
  },
  execute: async (input, ctx) => {
    const { data, error } = await supabase.rpc('acknowledge_team_note', {
      p_note_id: input.noteId,
    });

    if (error) {
      throw new Error(`Failed to acknowledge team note: ${error.message}`);
    }

    const acknowledged = data as boolean;

    return {
      result: { acknowledged },
      events: [
        {
          type: 'TEAM_NOTE_ACKNOWLEDGED',
          payload: { noteId: input.noteId, acknowledgedBy: ctx.userId, acknowledged },
        },
      ],
    };
  },
});