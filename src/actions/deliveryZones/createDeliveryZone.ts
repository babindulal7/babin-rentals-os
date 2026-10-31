import { createAction } from '../core';
import { DomainEvents } from '../../events/eventBus';
import { supabase } from '../../lib/supabase';

export type CreateDeliveryZoneInput = {
  name: string;
  description: string;
  feePaisa: number;
};

export type CreateDeliveryZoneOutput = {
  zoneId: string;
};

export const createDeliveryZone = createAction<CreateDeliveryZoneInput, CreateDeliveryZoneOutput>({
  name: 'createDeliveryZone',
  permissions: ['delivery_zone.create'],
  implemented: true,
  validate: (input) => {
    if (!input.name || input.name.trim().length === 0) {
      throw new Error('Zone name cannot be empty');
    }
    if (input.name.length > 100) {
      throw new Error('Zone name exceeds maximum length (100 characters)');
    }
    if (input.description && input.description.length > 500) {
      throw new Error('Description exceeds maximum length (500 characters)');
    }
    if (input.feePaisa < 0) {
      throw new Error('Zone fee cannot be negative');
    }
    if (!Number.isInteger(input.feePaisa)) {
      throw new Error('Zone fee must be an integer (paisa)');
    }
  },
  execute: async (input, ctx) => {
    const { data, error } = await supabase.rpc('create_delivery_zone', {
      p_name: input.name.trim(),
      p_description: input.description?.trim() ?? '',
      p_fee_paisa: input.feePaisa,
    });

    if (error) {
      throw new Error(`Failed to create delivery zone: ${error.message}`);
    }

    const zoneId = data as string;

    return {
      result: { zoneId },
      events: [
        {
          type: 'DELIVERY_ZONE_CREATED',
          payload: { zoneId, name: input.name.trim(), feePaisa: input.feePaisa, createdBy: ctx.userId },
        },
      ],
    };
  },
});