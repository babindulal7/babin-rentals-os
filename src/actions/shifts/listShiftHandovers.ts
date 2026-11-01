import { createAction } from '../core';
import { supabase } from '../../lib/supabase';
import { canViewMoney } from '../../lib/rbac';

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
  execute: async (input, ctx) => {
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

    const rows = (data as Array<Record<string, unknown>>) ?? [];
    if (ctx.role && !canViewMoney(ctx.role)) {
      for (const row of rows) {
        row.cash_counted_paisa = null;
        row.cash_status = null;
        row.cash_variance_paisa = null;
      }
    }

    return {
      result: { handovers: rows },
      events: [],
    };
  },
});
