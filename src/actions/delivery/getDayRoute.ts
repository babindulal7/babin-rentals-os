import { createAction } from '../core';
import { IS_MOCK, supabase } from '../../lib/supabase';
import { EVENT_TYPES } from '../../events/eventBus';

export interface DayRouteStop {
  id: string;
  bookingId: string;
  bookingNo: string;
  leg: 'Outbound' | 'Return';
  scheduledAt: string;
  status: string;
  routePosition: number | null;
  clientName: string;
  clientPhone: string;
  address: string;
  neighborhood: string;
  mapPinLat: number | null;
  mapPinLng: number | null;
  driverName: string | null;
  driverPhone: string | null;
  vehicle: string | null;
  zoneName: string | null;
  zoneFeePaisa: number | null;
}

export type GetDayRouteInput = {
  branchId: string;
  date: string; // YYYY-MM-DD
};

export type GetDayRouteOutput = {
  stops: DayRouteStop[];
};

export const getDayRoute = createAction<GetDayRouteInput, GetDayRouteOutput>({
  name: 'getDayRoute',
  permissions: ['delivery.view'],
  implemented: true,
  validate: (input) => {
    if (!input.branchId || typeof input.branchId !== 'string') {
      throw new Error('Valid branch ID is required');
    }
    if (!input.date || typeof input.date !== 'string') {
      throw new Error('Date (YYYY-MM-DD) is required');
    }
  },
  execute: async (input, _ctx) => {
    if (IS_MOCK) {
      return { result: { stops: [] }, events: [] };
    }

    const { data, error } = await supabase.rpc('get_day_route', {
      p_branch_id: input.branchId,
      p_date: input.date,
    });

    if (error) {
      throw new Error(`Failed to get day route: ${error.message}`);
    }

    return { result: { stops: data as DayRouteStop[] }, events: [] };
  },
});

export type GenerateMapLinksInput = {
  branchId: string;
  date: string; // YYYY-MM-DD
  shopLat?: number;
  shopLng?: number;
};

export type GenerateMapLinksOutput = {
  links: Array<{ stops: string[]; url: string }>;
};

export const generateMapLinks = createAction<GenerateMapLinksInput, GenerateMapLinksOutput>({
  name: 'generateMapLinks',
  permissions: ['delivery.view'],
  implemented: true,
  validate: (input) => {
    if (!input.branchId || typeof input.branchId !== 'string') {
      throw new Error('Valid branch ID is required');
    }
    if (!input.date || typeof input.date !== 'string') {
      throw new Error('Date (YYYY-MM-DD) is required');
    }
    if (input.shopLat !== undefined && (typeof input.shopLat !== 'number' || input.shopLat < -90 || input.shopLat > 90)) {
      throw new Error('Shop latitude must be between -90 and 90');
    }
    if (input.shopLng !== undefined && (typeof input.shopLng !== 'number' || input.shopLng < -180 || input.shopLng > 180)) {
      throw new Error('Shop longitude must be between -180 and 180');
    }
  },
  execute: async (input, _ctx) => {
    if (IS_MOCK) {
      return { result: { links: [] }, events: [] };
    }

    const { data, error } = await supabase.rpc('generate_google_maps_links', {
      p_branch_id: input.branchId,
      p_date: input.date,
      p_shop_lat: input.shopLat ?? 27.7172,
      p_shop_lng: input.shopLng ?? 85.3240,
    });

    if (error) {
      throw new Error(`Failed to generate map links: ${error.message}`);
    }

    return { result: { links: data as GenerateMapLinksOutput['links'] }, events: [] };
  },
});