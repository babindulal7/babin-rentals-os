import { createAction } from '../core';
import { IS_MOCK, supabase } from '../../lib/supabase';
import { EVENT_TYPES } from '../../events/eventBus';
import { rescheduleDeliveryRecord } from '../../lib/queries/delivery';
import type { SystemRole } from '../../types/database';

export type RescheduleDeliveryJobInput = {
  jobId: string;
  newScheduledAt: string;
  notes?: string | undefined;
  requestKey?: string | undefined;
};

export type RescheduleDeliveryJobOutput = {
  jobId: string;
  newScheduledAt: string;
};

export const rescheduleDeliveryJob = createAction<RescheduleDeliveryJobInput, RescheduleDeliveryJobOutput>({
  name: 'rescheduleDeliveryJob',
  permissions: ['delivery.reschedule'],
  implemented: true,
  validate: (input) => {
    if (!input.jobId || typeof input.jobId !== 'string') {
      throw new Error('Valid delivery job ID is required to reschedule');
    }
    if (!input.newScheduledAt) {
      throw new Error('New scheduled date and time is required');
    }
    const d = new Date(input.newScheduledAt);
    if (Number.isNaN(d.getTime())) {
      throw new Error('New scheduled date and time must be a valid timestamp');
    }
  },
  execute: async (input, ctx) => {
    const key = input.requestKey || (typeof crypto !== 'undefined' ? crypto.randomUUID() : undefined);
    if (!key) {
      throw new Error('Request key could not be generated (Law 8)');
    }

    if (IS_MOCK) {
      rescheduleDeliveryRecord(
        input.jobId,
        input.newScheduledAt,
        { role: (ctx.role as SystemRole) ?? null, isOnline: true },
        input.notes,
      );
      return {
        result: { jobId: input.jobId, newScheduledAt: input.newScheduledAt },
        events: [
          {
            type: EVENT_TYPES.DELIVERY_JOB_RESCHEDULED,
            payload: {
              jobId: input.jobId,
              newScheduledAt: input.newScheduledAt,
              notes: input.notes ?? null,
              actorId: ctx.userId,
            },
          },
        ],
      };
    }

    const { data, error } = await supabase.rpc('delivery_reschedule_job', {
      p_job_id: input.jobId,
      p_new_scheduled_at: input.newScheduledAt,
      p_request_key: key,
      p_notes: input.notes ? input.notes.trim() : null,
    });

    if (error) {
      throw new Error(`Failed to reschedule delivery job: ${error.message}`);
    }

    const jobId = data as string;

    return {
      result: { jobId, newScheduledAt: input.newScheduledAt },
      events: [
        {
          type: EVENT_TYPES.DELIVERY_JOB_RESCHEDULED,
          payload: {
            jobId,
            newScheduledAt: input.newScheduledAt,
            notes: input.notes ?? null,
            actorId: ctx.userId,
          },
        },
      ],
    };
  },
});
