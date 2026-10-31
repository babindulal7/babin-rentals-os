import { createAction } from '../core';
import { supabase } from '../../lib/supabase';

export type GetDeliveryZoneFeeInput = {
  zoneName: string;
};

export type GetDeliveryZoneFeeOutput = {
  feePaisa: number;
};

export const getDeliveryZoneFee = createAction<GetDeliveryZoneFeeInput, GetDeliveryZoneFeeOutput>({
  name: 'getDeliveryZoneFee',
  permissions: ['delivery_zone.read'],
  implemented: true,
  validate: (input) => {
    if (!input.zoneName || input.zoneName.trim().length === 0) {
      throw new Error('Zone name is required');
    }
  },
  execute: async (input, ctx) => {
    const { data, error } = await supabase.rpc('get_delivery_zone_fee', {
      p_zone_name: input.zoneName.trim(),
    });

    if (error) {
      throw new Error(`Failed to get delivery zone fee: ${error.message}`);
    }

    return {
      result: { feePaisa: data as number },
      events: [],
    };
  },
});