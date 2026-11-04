import { createAction } from '../core';
import { supabase } from '../../lib/supabase';

export type CreateProblemReportInput = {
  description: string;
  clientUuid?: string | undefined;
  photoPath?: string | undefined;
  routePath?: string | undefined;
  appVersion?: string | undefined;
  userRole?: string | undefined;
  deviceCategory?: 'phone' | 'tablet' | 'desktop' | undefined;
  viewportWidth?: number | undefined;
  viewportHeight?: number | undefined;
  errorReference?: string | undefined;
};

export type CreateProblemReportOutput = {
  reportId: string;
};

export const createProblemReport = createAction<CreateProblemReportInput, CreateProblemReportOutput>({
  name: 'createProblemReport',
  permissions: ['problem_report.create'],
  implemented: true,
  validate: (input) => {
    if (!input.description || input.description.trim().length === 0) {
      throw new Error('Problem description cannot be empty');
    }
    if (input.description.length > 10000) {
      throw new Error('Problem description exceeds maximum length (10,000 characters)');
    }
    if (input.deviceCategory && !['phone', 'tablet', 'desktop'].includes(input.deviceCategory)) {
      throw new Error(`Invalid device category: ${input.deviceCategory}`);
    }
    if (input.routePath) {
      if (input.routePath.includes('?')) {
        throw new Error('Route path must not contain query string');
      }
      if (input.routePath.includes('token') || input.routePath.includes('password') || input.routePath.includes('secret')) {
        throw new Error('Route path must not contain sensitive parameters');
      }
    }
  },
  execute: async (input, ctx) => {
    const { data, error } = await supabase.rpc('create_problem_report', {
      p_description: input.description.trim(),
      p_client_uuid: input.clientUuid ?? null,
      p_photo_path: input.photoPath ?? null,
      p_route_path: input.routePath ?? null,
      p_app_version: input.appVersion ?? null,
      p_user_role: input.userRole ?? null,
      p_device_category: input.deviceCategory ?? null,
      p_viewport_width: input.viewportWidth ?? null,
      p_viewport_height: input.viewportHeight ?? null,
      p_error_reference: input.errorReference ?? null,
    });

    if (error) {
      throw new Error(`Failed to create problem report: ${error.message}`);
    }

    const reportId = data as string;

    return {
      result: { reportId },
      events: [
        {
          type: 'PROBLEM_REPORT_CREATED',
          payload: { reportId, authorId: ctx.userId, description: input.description.trim() },
        },
      ],
    };
  },
});