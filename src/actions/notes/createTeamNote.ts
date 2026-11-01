import { createAction } from '../core';
import { supabase } from '../../lib/supabase';

export type CreateTeamNoteInput = {
  body: string;
  clientUuid?: string | undefined;
  category?: string | undefined;
  priority?: string | undefined;
  referenceId?: string | undefined;
  referenceIds?: string[] | undefined;
  pinned?: boolean | undefined;
};

export type CreateTeamNoteOutput = {
  noteId: string;
};

const VALID_CATEGORIES = [
  'General',
  'Equipment Alert',
  'Gear Alert',
  'Shift Handover',
  'Client Remark',
  'Logistics & Transport',
];

const VALID_PRIORITIES = ['urgent', 'high', 'normal', 'low'];

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
    if (input.category && !VALID_CATEGORIES.includes(input.category)) {
      throw new Error(`Invalid note category: ${input.category}`);
    }
    if (input.priority && !VALID_PRIORITIES.includes(input.priority)) {
      throw new Error(`Invalid note priority: ${input.priority}`);
    }
  },
  execute: async (input, ctx) => {
    const { data, error } = await supabase.rpc('create_team_note', {
      p_body: input.body.trim(),
      p_client_uuid: input.clientUuid ?? null,
      p_category: input.category ?? 'General',
      p_priority: input.priority ?? 'normal',
      p_reference_id: input.referenceId ? input.referenceId.trim().toUpperCase() : null,
      p_reference_ids: input.referenceIds ?? [],
      p_pinned: input.pinned ?? false,
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
