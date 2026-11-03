import { createAction } from '../core';
import { IS_MOCK, supabase } from '../../lib/supabase';
import { EVENT_TYPES } from '../../events/eventBus';

export type SetRoutePositionInput = {
  jobId: string;
  routePosition: number;
  requestKey?: string | undefined;
};

export type SetRoutePositionOutput = {
  jobId: string;
  routePosition: number;
};

export const setRoutePosition = createAction<SetRoutePositionInput, SetRoutePositionOutput>({
  name: 'setRoutePosition',
  permissions: ['delivery.setRoutePosition'],
  implemented: true,
  validate: (input) => {
    if (!input.jobId || typeof input.jobId !== 'string') {
      throw new Error('Valid delivery job ID is required');
    }
    if (typeof input.routePosition !== 'number' || input.routePosition < 0) {
      throw new Error('Route position must be a non-negative integer');
    }
  },
  execute: async (input, _ctx) => {
    const key = input.requestKey || (typeof crypto !== 'undefined' ? crypto.randomUUID() : undefined);
    if (!key) {
      throw new Error('Request key could not be generated (Law 8)');
    }

    if (IS_MOCK) {
      return {
        result: { jobId: input.jobId, routePosition: input.routePosition },
        events: [
          {
            type: EVENT_TYPES.DELIVERY_JOB_RESCHEDULED,
            payload: {
              jobId: input.jobId,
              routePosition: input.routePosition,
              actorId: _ctx.userId,
            },
          },
        ],
      };
    }

    const { error } = await supabase.rpc('set_delivery_route_position', {
      p_job_id: input.jobId,
      p_route_position: input.routePosition,
    });

    if (error) {
      throw new Error(`Failed to set route position: ${error.message}`);
    }

    return {
      result: { jobId: input.jobId, routePosition: input.routePosition },
      events: [
        {
          type: EVENT_TYPES.DELIVERY_JOB_RESCHEDULED,
          payload: {
            jobId: input.jobId,
            routePosition: input.routePosition,
            actorId: _ctx.userId,
          },
        },
      ],
    };
  },
});