import { createAction } from '../core';
import { supabase } from '../../lib/supabase';

export type ListShiftHandoversInput = {
  limit?: number | undefined;
  offset?: number | undefined;
};

export type ListShiftHandoversOutput = {
  handovers: Array<Record<string, unknown>>;
};

export const listShiftHandovers = createAction<ListShiftHandoversInput, ListShiftHandoversOutput>({
  name: 'listShiftHandovers',
  permissions: ['shift_handover.read'],
  implemented: true,
  validate: () => {},
  execute: async (input) => {
    const limit = input.limit ?? 50;
    const offset = input.offset ?? 0;

    const { data, error } = await supabase
      .from('shift_handovers_v')
      .select('*')
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new Error(`Failed to list shift handovers: ${error.message}`);
    }

    return {
      result: { handovers: (data as Array<Record<string, unknown>>) ?? [] },
      events: [],
    };
  },
});
