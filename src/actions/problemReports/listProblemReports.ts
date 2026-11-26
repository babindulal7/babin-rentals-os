import { createAction } from '../core';
import { supabase } from '../../lib/supabase';

export type ProblemReportRow = {
  id: string;
  client_uuid: string | null;
  description: string;
  photo_path: string | null;
  author_id: string;
  author_name: string;
  author_role: string;
  created_at: string;
  updated_at: string;
  status: 'open' | 'seen' | 'fixed' | 'wont_fix';
  status_changed_at: string | null;
  status_changed_by: string | null;
  status_change_reason: string | null;
  route_path: string | null;
  app_version: string | null;
  user_role: string | null;
  device_category: 'phone' | 'tablet' | 'desktop' | null;
  viewport_width: number | null;
  viewport_height: number | null;
  error_reference: string | null;
};

export type ListProblemReportsInput = {
  limit?: number;
  offset?: number;
  status?: 'open' | 'seen' | 'fixed' | 'wont_fix' | undefined;
  authorId?: string | undefined;
  search?: string | undefined;
};

export type ListProblemReportsOutput = {
  reports: ProblemReportRow[];
};

export const listProblemReports = createAction<ListProblemReportsInput, ListProblemReportsOutput>({
  name: 'listProblemReports',
  permissions: ['problem_report.read'],
  implemented: true,
  validate: (input) => {
    if (input.limit !== undefined && (input.limit < 1 || input.limit > 100)) {
      throw new Error('Limit must be between 1 and 100');
    }
    if (input.offset !== undefined && input.offset < 0) {
      throw new Error('Offset must be non-negative');
    }
    if (input.status && !['open', 'seen', 'fixed', 'wont_fix'].includes(input.status)) {
      throw new Error(`Invalid status: ${input.status}`);
    }
  },
  execute: async (input, _ctx) => {
    const { data, error } = await supabase.rpc('list_problem_reports', {
      p_limit: input.limit ?? 50,
      p_offset: input.offset ?? 0,
      p_status: input.status ?? null,
      p_author_id: input.authorId ?? null,
      p_search: input.search ?? null,
    });

    if (error) {
      throw new Error(`Failed to list problem reports: ${error.message}`);
    }

    const reports = (data ?? []) as unknown as ProblemReportRow[];

    return {
      result: { reports },
      events: [],
    };
  },
});