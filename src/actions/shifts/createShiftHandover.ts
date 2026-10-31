import { createAction } from '../core';
import { supabase } from '../../lib/supabase';

export type CreateShiftHandoverInput = {
  clientUuid?: string | undefined;
  shiftCode?: string | undefined;
  fromUserName?: string | undefined;
  fromUserRole?: string | undefined;
  toUserId?: string | null | undefined;
  toUserName?: string | null | undefined;
  cashCountedPaisa?: number | null | undefined;
  cashStatus?: 'matched' | 'short' | 'over' | undefined;
  cashVariancePaisa?: number | undefined;
  notes?: string | undefined;
  openItems?: Array<Record<string, unknown>> | undefined;
  checklist?: Array<{ key: string; label: string; done?: boolean | undefined }> | undefined;
};

export type CreateShiftHandoverOutput = {
  handover: Record<string, unknown>;
};

export const createShiftHandover = createAction<CreateShiftHandoverInput, CreateShiftHandoverOutput>({
  name: 'createShiftHandover',
  permissions: ['shift_handover.create'],
  implemented: true,
  validate: (input) => {
    if (input.cashCountedPaisa !== undefined && input.cashCountedPaisa !== null && input.cashCountedPaisa < 0) {
      throw new Error('Cash counted paisa cannot be negative');
    }
  },
  execute: async (input, ctx) => {
    const clientUuid = input.clientUuid ?? crypto.randomUUID();
    const { data, error } = await supabase.rpc('create_shift_handover', {
      p_client_uuid: clientUuid,
      p_shift_code: input.shiftCode ?? 'A',
      p_from_user_name: input.fromUserName ?? 'Staff Member',
      p_from_user_role: input.fromUserRole ?? ctx.role ?? 'Operations',
      p_to_user_id: input.toUserId ?? null,
      p_to_user_name: input.toUserName ?? null,
      p_cash_counted_paisa: input.cashCountedPaisa ?? 0,
      p_cash_status: input.cashStatus ?? 'matched',
      p_cash_variance_paisa: input.cashVariancePaisa ?? 0,
      p_notes: input.notes ?? '',
      p_open_items: input.openItems ?? [],
      p_checklist: input.checklist ?? [],
    });

    if (error) {
      throw new Error(`Failed to create shift handover: ${error.message}`);
    }

    const handover = (data as Record<string, unknown>) ?? {};
    return {
      result: { handover },
      events: [
        {
          type: 'SHIFT_HANDOVER_CREATED',
          payload: { id: handover.id, shiftCode: input.shiftCode, authorId: ctx.userId },
        },
      ],
    };
  },
});
