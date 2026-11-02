import { createAction } from '../core';
import { supabase } from '../../lib/supabase';

export type ListTeamNotesInput = {
  limit?: number | undefined;
  offset?: number | undefined;
  includeArchived?: boolean | undefined;
  category?: string | undefined;
  referenceId?: string | undefined;
};

export type TeamNoteRow = {
  id: string;
  client_uuid?: string | null;
  body: string;
  author_id: string;
  author_name: string;
  author_role: string;
  created_at: string;
  updated_at?: string;
  category: string;
  priority: string;
  status: string;
  resolved_at?: string | null;
  resolved_by?: string | null;
  pinned: boolean;
  pinned_at?: string | null;
  pinned_by?: string | null;
  is_archived: boolean;
  archived_at?: string | null;
  archived_by?: string | null;
  reference_id?: string | null;
  reference_ids?: string[];
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
  execute: async (input) => {
    const limit = input.limit ?? 50;
    const offset = input.offset ?? 0;
    const includeArchived = input.includeArchived ?? false;
    const category = input.category ?? null;
    const referenceId = input.referenceId ? input.referenceId.trim().toUpperCase() : null;

    const { data, error } = await supabase.rpc('list_team_notes', {
      p_limit: limit,
      p_offset: offset,
      p_include_archived: includeArchived,
      p_category: category,
      p_reference_id: referenceId,
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
