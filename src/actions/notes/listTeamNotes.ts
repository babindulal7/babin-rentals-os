import { createAction } from '../core';
import { supabase } from '../../lib/supabase';

export type ListTeamNotesInput = {
  limit?: number;
  offset?: number;
};

export type TeamNoteRow = {
  id: string;
  body: string;
  author_id: string;
  created_at: string;
  acknowledged_by: string[];
};

export type ListTeamNotesOutput = {
  notes: TeamNoteRow[];
};

export const listTeamNotes = createAction<ListTeamNotesInput, ListTeamNotesOutput>({
  name: 'listTeamNotes',
  permissions: ['team_note.read'],
  implemented: true,
  validate: (input) => {
    if (input.limit !== undefined && (input.limit < 1 || input.limit > 100)) {
      throw new Error('Limit must be between 1 and 100');
    }
    if (input.offset !== undefined && input.offset < 0) {
      throw new Error('Offset cannot be negative');
    }
  },
  execute: async (input, ctx) => {
    const limit = input.limit ?? 50;
    const offset = input.offset ?? 0;

    const { data, error } = await supabase.rpc('list_team_notes', {
      p_limit: limit,
      p_offset: offset,
    });

    if (error) {
      throw new Error(`Failed to list team notes: ${error.message}`);
    }

    return {
      result: { notes: (data as TeamNoteRow[]) ?? [] },
      events: [],
    };
  },
});