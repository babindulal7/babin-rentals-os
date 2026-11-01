import { createAction, ActionPermissionError } from '../core';
import { supabase } from '../../lib/supabase';
import { canViewMoney } from '../../lib/rbac';

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
    const role = ctx.role;
    const isMoneyRole = role ? canViewMoney(role) : false;

    // Law 6: Money-blind roles cannot record cash figures
    if (role && !isMoneyRole) {
      if (
        (input.cashCountedPaisa !== undefined && input.cashCountedPaisa !== null && input.cashCountedPaisa > 0) ||
        (input.cashVariancePaisa !== undefined && input.cashVariancePaisa !== null && input.cashVariancePaisa !== 0) ||
        (input.cashStatus !== undefined && input.cashStatus !== null && input.cashStatus !== 'matched')
      ) {
        throw new ActionPermissionError('createShiftHandover', 'record cash values in shift handover (Law 6)', role);
      }
    }

    const clientUuid = input.clientUuid ?? crypto.randomUUID();
    const { data, error } = await supabase.rpc('create_shift_handover', {
      p_client_uuid: clientUuid,
      p_shift_code: input.shiftCode ?? 'A',
      p_from_user_name: input.fromUserName ?? 'Staff Member',
      p_from_user_role: input.fromUserRole ?? role ?? 'Operations',
      p_to_user_id: input.toUserId ?? null,
      p_to_user_name: input.toUserName ?? null,
      p_cash_counted_paisa: isMoneyRole ? (input.cashCountedPaisa ?? 0) : null,
      p_cash_status: isMoneyRole ? (input.cashStatus ?? 'matched') : null,
      p_cash_variance_paisa: isMoneyRole ? (input.cashVariancePaisa ?? 0) : null,
      p_notes: input.notes ?? '',
      p_open_items: input.openItems ?? [],
      p_checklist: input.checklist ?? [],
    });

    if (error) {
      throw new Error(`Failed to create shift handover: ${error.message}`);
    }

    const handover = (data as Record<string, unknown>) ?? {};
    if (!isMoneyRole) {
      handover.cash_counted_paisa = null;
      handover.cash_status = null;
      handover.cash_variance_paisa = null;
    }

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
