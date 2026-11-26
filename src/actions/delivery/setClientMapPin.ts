import { createAction } from '../core';
import { IS_MOCK, supabase } from '../../lib/supabase';
import { EVENT_TYPES } from '../../events/eventBus';

export type SetClientMapPinInput = {
  clientId: string;
  lat: number;
  lng: number;
  requestKey?: string | undefined;
};

export type SetClientMapPinOutput = {
  clientId: string;
  lat: number;
  lng: number;
};

export const setClientMapPin = createAction<SetClientMapPinInput, SetClientMapPinOutput>({
  name: 'setClientMapPin',
  permissions: ['delivery.setClientMapPin'],
  implemented: true,
  validate: (input) => {
    if (!input.clientId || typeof input.clientId !== 'string') {
      throw new Error('Valid client ID is required');
    }
    if (typeof input.lat !== 'number' || input.lat < -90 || input.lat > 90) {
      throw new Error('Latitude must be a number between -90 and 90');
    }
    if (typeof input.lng !== 'number' || input.lng < -180 || input.lng > 180) {
      throw new Error('Longitude must be a number between -180 and 180');
    }
  },
  execute: async (input, _ctx) => {
    const key = input.requestKey || (typeof crypto !== 'undefined' ? crypto.randomUUID() : undefined);
    if (!key) {
      throw new Error('Request key could not be generated (Law 8)');
    }

    if (IS_MOCK) {
      return {
        result: { clientId: input.clientId, lat: input.lat, lng: input.lng },
        events: [
          {
            type: EVENT_TYPES.CLIENT_UPDATED,
            payload: {
              clientId: input.clientId,
              mapPinLat: input.lat,
              mapPinLng: input.lng,
              actorId: _ctx.userId,
            },
          },
        ],
      };
    }

    const { error } = await supabase.rpc('set_client_map_pin', {
      p_client_id: input.clientId,
      p_lat: input.lat,
      p_lng: input.lng,
    });

    if (error) {
      throw new Error(`Failed to set client map pin: ${error.message}`);
    }

    return {
      result: { clientId: input.clientId, lat: input.lat, lng: input.lng },
      events: [
        {
          type: EVENT_TYPES.CLIENT_UPDATED,
          payload: {
            clientId: input.clientId,
            mapPinLat: input.lat,
            mapPinLng: input.lng,
            actorId: _ctx.userId,
          },
        },
      ],
    };
  },
});