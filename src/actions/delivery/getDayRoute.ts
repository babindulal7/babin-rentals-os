import { createAction } from '../core';
import { IS_MOCK, supabase } from '../../lib/supabase';
import { ZONE_FEE_STATUSES, type ZoneFeeStatus } from '../../lib/deliveryFeeGrid';

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
  /** Why the fee is or is not shown (migration 0246). Null for a money-blind caller. */
  zoneFeeStatus: ZoneFeeStatus | null;
}

/** One row as get_day_route returns it (snake_case, migration 0246). */
type DayRouteRow = {
  id: string;
  booking_id: string;
  booking_no: string;
  leg: 'Outbound' | 'Return';
  scheduled_at: string;
  status: string;
  route_position: number | null;
  client_name: string;
  client_phone: string;
  address: string;
  neighborhood: string;
  map_pin_lat: number | null;
  map_pin_lng: number | null;
  driver_name: string | null;
  driver_phone: string | null;
  vehicle: string | null;
  zone_name: string | null;
  zone_fee_paisa: number | string | null;
  zone_fee_status: string | null;
};

const KNOWN_ZONE_FEE_STATUSES: readonly string[] = ZONE_FEE_STATUSES

function toZoneFeeStatus(value: string | null): ZoneFeeStatus | null {
  return value !== null && KNOWN_ZONE_FEE_STATUSES.includes(value) ? (value as ZoneFeeStatus) : null
}

/** Map a snake_case route row to the screen shape. Money stays integer paisa. */
export function toDayRouteStop(row: DayRouteRow): DayRouteStop {
  return {
    id: row.id,
    bookingId: row.booking_id,
    bookingNo: row.booking_no,
    leg: row.leg,
    scheduledAt: row.scheduled_at,
    status: row.status,
    routePosition: row.route_position,
    clientName: row.client_name,
    clientPhone: row.client_phone,
    address: row.address,
    neighborhood: row.neighborhood,
    mapPinLat: row.map_pin_lat,
    mapPinLng: row.map_pin_lng,
    driverName: row.driver_name,
    driverPhone: row.driver_phone,
    vehicle: row.vehicle,
    zoneName: row.zone_name,
    zoneFeePaisa: row.zone_fee_paisa === null ? null : Number(row.zone_fee_paisa),
    zoneFeeStatus: toZoneFeeStatus(row.zone_fee_status),
  }
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

    const rows = (data ?? []) as DayRouteRow[]
    return { result: { stops: rows.map(toDayRouteStop) }, events: [] };
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