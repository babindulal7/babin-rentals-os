import { createAction } from '../core';
import { IS_MOCK, supabase } from '../../lib/supabase';
import { EVENT_TYPES } from '../../events/eventBus';
import { updateDeliveryStatus, type DeliveryStatus } from '../../lib/queries/delivery';
import type { SystemRole } from '../../types/database';

export type TransitionDeliveryJobInput = {
  jobId: string;
  expectedStatus: DeliveryStatus;
  nextStatus: DeliveryStatus;
  requestKey?: string | undefined;
  recipient?: string | undefined;
  note?: string | undefined;
};

export type TransitionDeliveryJobOutput = {
  jobId: string;
};

export const transitionDeliveryJob = createAction<TransitionDeliveryJobInput, TransitionDeliveryJobOutput>({
  name: 'transitionDeliveryJob',
  permissions: ['delivery.transition'],
  implemented: true,
  validate: (input) => {
    if (!input.jobId || typeof input.jobId !== 'string') {
      throw new Error('Valid delivery job ID is required');
    }
    if (!input.expectedStatus || !input.nextStatus) {
      throw new Error('Expected status and next status are required');
    }
    if (input.nextStatus === 'Delivered') {
      if (!input.recipient || input.recipient.trim().length < 2) {
        throw new Error('Delivery receipt requires recipient name (at least 2 characters)');
      }
    }
    if (input.nextStatus === 'Failed') {
      if (!input.note || input.note.trim().length < 10) {
        throw new Error('Failure note must explain the issue with at least 10 characters');
      }
    }
  },
  execute: async (input, ctx) => {
    const key = input.requestKey || (typeof crypto !== 'undefined' ? crypto.randomUUID() : undefined);
    if (!key) {
      throw new Error('Request key could not be generated (Law 8)');
    }

    if (IS_MOCK) {
      updateDeliveryStatus(input.jobId, input.nextStatus, { role: (ctx.role as SystemRole) ?? null, isOnline: true }, {
        recipientName: input.recipient,
        notes: input.note,
      });
      return {
        result: { jobId: input.jobId },
        events: [
          {
            type: EVENT_TYPES.DELIVERY_JOB_TRANSITIONED,
            payload: {
              jobId: input.jobId,
              previousStatus: input.expectedStatus,
              nextStatus: input.nextStatus,
              recipient: input.recipient ?? null,
              note: input.note ?? null,
              actorId: ctx.userId,
            },
          },
        ],
      };
    }

    const { data, error } = await supabase.rpc('delivery_transition_job', {
      p_job_id: input.jobId,
      p_expected_status: input.expectedStatus,
      p_next_status: input.nextStatus,
      p_request_key: key,
      p_recipient: input.recipient ? input.recipient.trim() : null,
      p_note: input.note ? input.note.trim() : null,
    });

    if (error) {
      throw new Error(`Failed to transition delivery job: ${error.message}`);
    }

    const jobId = data as string;

    return {
      result: { jobId },
      events: [
        {
          type: EVENT_TYPES.DELIVERY_JOB_TRANSITIONED,
          payload: {
            jobId,
            previousStatus: input.expectedStatus,
            nextStatus: input.nextStatus,
            recipient: input.recipient ?? null,
            note: input.note ?? null,
            actorId: ctx.userId,
          },
        },
      ],
    };
  },
});
