import { createAction } from '../core';
import { supabase } from '../../lib/supabase';

export type ListDeliveryZonesInput = {
  limit?: number;
  offset?: number;
  activeOnly?: boolean;
};

export type DeliveryZoneRow = {
  id: string;
  name: string;
  description: string | null;
  fee_paisa: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ListDeliveryZonesOutput = {
  zones: DeliveryZoneRow[];
};

export const listDeliveryZones = createAction<ListDeliveryZonesInput, ListDeliveryZonesOutput>({
  name: 'listDeliveryZones',
  permissions: ['delivery_zone.read'],
  implemented: true,
  validate: (input) => {
    if (input.limit !== undefined && (input.limit < 1 || input.limit > 100)) {
      throw new Error('Limit must be between 1 and 100');
    }
    if (input.offset !== undefined && input.offset < 0) {
      throw new Error('Offset cannot be negative');
    }
  },
  execute: async (input, ctx) => {
    const limit = input.limit ?? 50;
    const offset = input.offset ?? 0;
    const activeOnly = input.activeOnly ?? true;

    const { data, error } = await supabase.rpc('list_delivery_zones', {
      p_limit: limit,
      p_offset: offset,
      p_active_only: activeOnly,
    });

    if (error) {
      throw new Error(`Failed to list delivery zones: ${error.message}`);
    }

    return {
      result: {
        zones: ((data as DeliveryZoneRow[]) ?? []).map(zone => ({
          ...zone,
          fee_paisa: ['Warehouse', 'Technician', 'Driver'].includes(ctx.role) ? null : zone.fee_paisa,
        })),
      },
      events: [],
    };
  },
});