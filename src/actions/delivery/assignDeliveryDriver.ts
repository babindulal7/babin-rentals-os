import { createAction } from '../core';
import { IS_MOCK, supabase } from '../../lib/supabase';
import { EVENT_TYPES } from '../../events/eventBus';
import { assignDeliveryRider } from '../../lib/queries/delivery';
import type { SystemRole } from '../../types/database';

export type AssignDeliveryDriverInput = {
  jobId: string;
  driverId?: string | undefined;
  requestKey?: string | undefined;
  vehicle?: string | undefined;
  riderName?: string | undefined;
  riderPhone?: string | undefined;
};

export type AssignDeliveryDriverOutput = {
  jobId: string;
};

export const assignDeliveryDriver = createAction<AssignDeliveryDriverInput, AssignDeliveryDriverOutput>({
  name: 'assignDeliveryDriver',
  permissions: ['delivery.assign'],
  implemented: true,
  validate: (input) => {
    if (!input.jobId || typeof input.jobId !== 'string') {
      throw new Error('Valid delivery job ID is required');
    }
    const hasDriver = input.driverId && input.driverId.trim().length > 0;
    const hasRider = input.riderName && input.riderName.trim().length > 0;
    if (!hasDriver && !hasRider) {
      throw new Error('Either an assigned staff driver or a hired rider name is required');
    }
  },
  execute: async (input, ctx) => {
    const key = input.requestKey || (typeof crypto !== 'undefined' ? crypto.randomUUID() : undefined);
    if (!key) {
      throw new Error('Request key could not be generated (Law 8)');
    }

    if (IS_MOCK) {
      assignDeliveryRider(
        input.jobId,
        input.riderName || 'Staff Driver',
        input.riderPhone || '',
        input.vehicle || '',
        { role: (ctx.role as SystemRole) ?? null, isOnline: true },
      );
      return {
        result: { jobId: input.jobId },
        events: [
          {
            type: EVENT_TYPES.DELIVERY_DRIVER_ASSIGNED,
            payload: {
              jobId: input.jobId,
              driverId: input.driverId ?? null,
              riderName: input.riderName ?? null,
              vehicle: input.vehicle ?? null,
              actorId: ctx.userId,
            },
          },
        ],
      };
    }

    const { data, error } = await supabase.rpc('delivery_assign_driver', {
      p_job_id: input.jobId,
      p_driver_id: input.driverId || null,
      p_request_key: key,
      p_vehicle: input.vehicle ? input.vehicle.trim() : null,
      p_rider_name: input.riderName ? input.riderName.trim() : null,
      p_rider_phone: input.riderPhone ? input.riderPhone.trim() : null,
    });

    if (error) {
      throw new Error(`Failed to assign delivery driver/rider: ${error.message}`);
    }

    const jobId = data as string;

    return {
      result: { jobId },
      events: [
        {
          type: EVENT_TYPES.DELIVERY_DRIVER_ASSIGNED,
          payload: {
            jobId,
            driverId: input.driverId ?? null,
            riderName: input.riderName ?? null,
            vehicle: input.vehicle ?? null,
            actorId: ctx.userId,
          },
        },
      ],
    };
  },
});
