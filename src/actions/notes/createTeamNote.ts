import { createAction } from '../core';
import { supabase } from '../../lib/supabase';

export type CreateTeamNoteInput = {
  body: string;
};

export type CreateTeamNoteOutput = {
  noteId: string;
};

export const createTeamNote = createAction<CreateTeamNoteInput, CreateTeamNoteOutput>({
  name: 'createTeamNote',
  permissions: ['team_note.create'],
  implemented: true,
  validate: (input) => {
    if (!input.body || input.body.trim().length === 0) {
      throw new Error('Note body cannot be empty');
    }
    if (input.body.length > 10000) {
      throw new Error('Note body exceeds maximum length (10,000 characters)');
    }
  },
  execute: async (input, ctx) => {
    const { data, error } = await supabase.rpc('create_team_note', {
      p_body: input.body.trim(),
    });

    if (error) {
      throw new Error(`Failed to create team note: ${error.message}`);
    }

    const noteId = data as string;

    return {
      result: { noteId },
      events: [
        {
          type: 'TEAM_NOTE_CREATED',
          payload: { noteId, authorId: ctx.userId, body: input.body.trim() },
        },
      ],
    };
  },
});