import { createAction } from '../core';

export type AttachDeliveryProofInput = {
  jobId: string;
  requestKey: string;
  photoPath?: string | undefined;
  signaturePath?: string | undefined;
};

export type AttachDeliveryProofOutput = {
  jobId: string;
};

export const attachDeliveryProof = createAction<AttachDeliveryProofInput, AttachDeliveryProofOutput>({
  name: 'attachDeliveryProof',
  permissions: ['delivery.proof'],
  implemented: true,
  validate: (input) => {
    if (!input.jobId) {
      throw new Error('Job ID is required');
    }
    if (!input.requestKey) {
      throw new Error('Request key is required for idempotency');
    }
    if (!input.photoPath && !input.signaturePath) {
      throw new Error('At least one proof artifact (photo or signature) must be provided');
    }
  },
  execute: async (input) => {
    const { supabase } = await import('../../lib/supabase');

    const { data, error } = await supabase.rpc('delivery_attach_proof', {
      p_job_id: input.jobId,
      p_request_key: input.requestKey,
      p_photo_path: input.photoPath,
      p_signature_path: input.signaturePath,
    });

    if (error) {
      throw new Error(`Failed to attach proof: ${error.message}`);
    }

    return {
      result: { jobId: data as string },
      events: [],
    };
  },
});
