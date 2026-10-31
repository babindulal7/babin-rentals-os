import { createAction } from '../core';
import { supabase } from '../../lib/supabase';

export type ArchiveShiftHandoverInput = {
  handoverId: string;
};

export type ArchiveShiftHandoverOutput = {
  handover: Record<string, unknown>;
};

export const archiveShiftHandover = createAction<ArchiveShiftHandoverInput, ArchiveShiftHandoverOutput>({
  name: 'archiveShiftHandover',
  permissions: ['shift_handover.archive'],
  implemented: true,
  validate: (input) => {
    if (!input.handoverId) {
      throw new Error('Handover ID is required');
    }
  },
  execute: async (input, ctx) => {
    const { data, error } = await supabase.rpc('archive_shift_handover', {
      p_handover_id: input.handoverId,
    });

    if (error) {
      throw new Error(`Failed to archive shift handover: ${error.message}`);
    }

    const handover = (data as Record<string, unknown>) ?? {};
    return {
      result: { handover },
      events: [
        {
          type: 'SHIFT_HANDOVER_ARCHIVED',
          payload: { id: input.handoverId, operatorId: ctx.userId },
        },
      ],
    };
  },
});
