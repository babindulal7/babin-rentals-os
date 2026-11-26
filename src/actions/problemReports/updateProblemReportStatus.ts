import { createAction } from '../core';
import { supabase } from '../../lib/supabase';

export type UpdateProblemReportStatusInput = {
  reportId: string;
  status: 'open' | 'seen' | 'fixed' | 'wont_fix';
  reason?: string | undefined;
};

export type UpdateProblemReportStatusOutput = {
  updated: boolean;
};

export const updateProblemReportStatus = createAction<UpdateProblemReportStatusInput, UpdateProblemReportStatusOutput>({
  name: 'updateProblemReportStatus',
  permissions: ['problem_report.manage'],
  implemented: true,
  validate: (input) => {
    if (!['open', 'seen', 'fixed', 'wont_fix'].includes(input.status)) {
      throw new Error(`Invalid status: ${input.status}`);
    }
    if (input.reason !== undefined && input.reason !== null && input.reason.trim().length > 0 && input.reason.trim().length < 10) {
      throw new Error('Status change reason must be at least 10 characters');
    }
  },
  execute: async (input, ctx) => {
    const { data, error } = await supabase.rpc('update_problem_report_status', {
      p_report_id: input.reportId,
      p_status: input.status,
      p_reason: input.reason ?? null,
    });

    if (error) {
      throw new Error(`Failed to update problem report status: ${error.message}`);
    }

    const updated = data as boolean;

    return {
      result: { updated },
      events: [
        {
          type: 'PROBLEM_REPORT_STATUS_CHANGED',
          payload: { reportId: input.reportId, newStatus: input.status, changedBy: ctx.userId, reason: input.reason },
        },
      ],
    };
  },
});