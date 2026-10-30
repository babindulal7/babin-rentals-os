import { createAction } from '../core';
import { IS_MOCK, supabase } from '../../lib/supabase';
import { EVENT_TYPES } from '../../events/eventBus';
import { createDeliveryRecord } from '../../lib/queries/delivery';
import type { SystemRole } from '../../types/database';

export type CreateDeliveryJobInput = {
  bookingId: string;
  leg: 'Outbound' | 'Return';
  scheduledAt: string;
  clientUuid?: string | undefined;
  vehicle?: string | undefined;
  riderName?: string | undefined;
  riderPhone?: string | undefined;
};

export type CreateDeliveryJobOutput = {
  jobId: string;
};

export const createDeliveryJob = createAction<CreateDeliveryJobInput, CreateDeliveryJobOutput>({
  name: 'createDeliveryJob',
  permissions: ['delivery.create'],
  implemented: true,
  validate: (input) => {
    if (!input.bookingId || typeof input.bookingId !== 'string') {
      throw new Error('Valid booking ID is required to create a delivery job');
    }
    if (input.leg !== 'Outbound' && input.leg !== 'Return') {
      throw new Error('Delivery leg must be Outbound or Return');
    }
    if (!input.scheduledAt) {
      throw new Error('Scheduled date/time is required');
    }
  },
  execute: async (input, ctx) => {
    const key = input.clientUuid || (typeof crypto !== 'undefined' ? crypto.randomUUID() : undefined);
    if (!key) {
      throw new Error('Request key could not be generated (Law 8)');
    }

    if (IS_MOCK) {
      const created = createDeliveryRecord(
        {
          bookingNo: 'BR-2616',
          clientName: input.riderName ? `Dispatched to ${input.riderName}` : 'Client',
          clientPhone: input.riderPhone ?? '',
          address: 'Kathmandu Valley',
          neighborhood: 'Central',
          mode: input.riderName ? 'Courier / Rider' : 'Babin Delivery',
          driverName: input.riderName,
          driverPhone: input.riderPhone,
          vehiclePlate: input.vehicle,
          status: 'Scheduled',
          scheduledDate: input.scheduledAt.slice(0, 10),
          scheduledTime: input.scheduledAt.slice(11, 16) || '10:00',
          deliveryFeeNpr: 1500,
        },
        { role: (ctx.role as SystemRole) ?? null, isOnline: true },
      );
      return {
        result: { jobId: created.id },
        events: [
          {
            type: EVENT_TYPES.DELIVERY_JOB_CREATED,
            payload: {
              jobId: created.id,
              bookingId: input.bookingId,
              leg: input.leg,
              scheduledAt: input.scheduledAt,
              actorId: ctx.userId,
            },
          },
        ],
      };
    }

    const { data, error } = await supabase.rpc('delivery_create_job', {
      p_booking_id: input.bookingId,
      p_leg: input.leg,
      p_scheduled_at: input.scheduledAt,
      p_key: key,
      p_vehicle: input.vehicle ? input.vehicle.trim() : null,
      p_rider_name: input.riderName ? input.riderName.trim() : null,
      p_rider_phone: input.riderPhone ? input.riderPhone.trim() : null,
    });

    if (error) {
      throw new Error(`Failed to create delivery job: ${error.message}`);
    }

    const jobId = data as string;

    return {
      result: { jobId },
      events: [
        {
          type: EVENT_TYPES.DELIVERY_JOB_CREATED,
          payload: {
            jobId,
            bookingId: input.bookingId,
            leg: input.leg,
            scheduledAt: input.scheduledAt,
            actorId: ctx.userId,
          },
        },
      ],
    };
  },
});
