import { createAction } from '../core';
import { supabase } from '../../lib/supabase';
import { canViewMoney } from '../../lib/rbac';

export type AcknowledgeShiftHandoverInput = {
  handoverId: string;
  note?: string | null | undefined;
  operatorName?: string | null | undefined;
};

export type AcknowledgeShiftHandoverOutput = {
  handover: Record<string, unknown>;
};

export const acknowledgeShiftHandover = createAction<AcknowledgeShiftHandoverInput, AcknowledgeShiftHandoverOutput>({
  name: 'acknowledgeShiftHandover',
  permissions: ['shift_handover.acknowledge'],
  implemented: true,
  validate: (input) => {
    if (!input.handoverId) {
      throw new Error('Handover ID is required');
    }
  },
  execute: async (input, ctx) => {
    const role = ctx.role;
    const isMoneyRole = role ? canViewMoney(role) : false;

    const { data, error } = await supabase.rpc('acknowledge_shift_handover', {
      p_handover_id: input.handoverId,
      p_acknowledgement_note: input.note ?? null,
      p_operator_name: input.operatorName ?? null,
    });

    if (error) {
      throw new Error(`Failed to acknowledge shift handover: ${error.message}`);
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
          type: 'SHIFT_HANDOVER_ACKNOWLEDGED',
          payload: { id: input.handoverId, operatorId: ctx.userId },
        },
      ],
    };
  },
});
