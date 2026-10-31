import { createAction } from '../core';
import { DomainEvents } from '../../events/eventBus';
import { supabase } from '../../lib/supabase';

export type UpdateDeliveryZoneInput = {
  zoneId: string;
  name?: string;
  description?: string;
  feePaisa?: number;
  isActive?: boolean;
};

export type UpdateDeliveryZoneOutput = {
  updated: boolean;
};

export const updateDeliveryZone = createAction<UpdateDeliveryZoneInput, UpdateDeliveryZoneOutput>({
  name: 'updateDeliveryZone',
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
    if (input.name !== undefined) {
      if (!input.name.trim()) {
        throw new Error('Zone name cannot be empty');
      }
      if (input.name.length > 100) {
        throw new Error('Zone name exceeds maximum length (100 characters)');
      }
    }
    if (input.description && input.description.length > 500) {
      throw new Error('Description exceeds maximum length (500 characters)');
    }
    if (input.feePaisa !== undefined) {
      if (input.feePaisa < 0) {
        throw new Error('Zone fee cannot be negative');
      }
      if (!Number.isInteger(input.feePaisa)) {
        throw new Error('Zone fee must be an integer (paisa)');
      }
    }
  },
  execute: async (input, ctx) => {
    const { data, error } = await supabase.rpc('update_delivery_zone', {
      p_zone_id: input.zoneId,
      p_name: input.name?.trim() ?? null,
      p_description: input.description?.trim() ?? null,
      p_fee_paisa: input.feePaisa ?? null,
      p_is_active: input.isActive ?? null,
    });

    if (error) {
      throw new Error(`Failed to update delivery zone: ${error.message}`);
    }

    const updated = data as boolean;

    return {
      result: { updated },
      events: updated ? [
        {
          type: 'DELIVERY_ZONE_UPDATED',
          payload: { zoneId: input.zoneId, updatedBy: ctx.userId },
        },
      ] : [],
    };
  },
});