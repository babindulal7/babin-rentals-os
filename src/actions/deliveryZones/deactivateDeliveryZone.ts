import { createAction } from '../core';
import { supabase } from '../../lib/supabase';

export type DeactivateDeliveryZoneInput = {
  zoneId: string;
};

export type DeactivateDeliveryZoneOutput = {
  deactivated: boolean;
};

export const deactivateDeliveryZone = createAction<DeactivateDeliveryZoneInput, DeactivateDeliveryZoneOutput>({
  name: 'deactivateDeliveryZone',
  permissions: ['delivery_zone.manage'],
  implemented: true,
  validate: (input) => {
    if (!input.zoneId) {
      throw new Error('Zone ID is required');
    }
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(input.zoneId)) {
      throw new Error('Invalid zone ID format');
    }
  },
  execute: async (input, ctx) => {
    void ctx;
    const { data, error } = await supabase.rpc('deactivate_delivery_zone', {
      p_zone_id: input.zoneId,
    });

    if (error) {
      throw new Error(`Failed to deactivate delivery zone: ${error.message}`);
    }

    const deactivated = data as boolean;

    return {
      result: { deactivated },
      events: deactivated ? [
        {
          type: 'DELIVERY_ZONE_DEACTIVATED',
          payload: { zoneId: input.zoneId, deactivatedBy: ctx.userId },
        },
      ] : [],
    };
  },
});