import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listProblemReports } from '../listProblemReports';
import { ActionPermissionError } from '../../core';
import { supabase } from '../../../lib/supabase';

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

describe('listProblemReports action (T4-11, B27, B48)', () => {
  const mockRpc = vi.mocked(supabase.rpc) as unknown as ReturnType<typeof vi.fn>;
  const warehouseContext = { userId: 'warehouse-1', role: 'Warehouse' as const };
  const ownerContext = { userId: 'owner-1', role: 'Owner' as const };
  const clientContext = { userId: 'client-1', role: 'Client' as const };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when called without session context', async () => {
    await expect(listProblemReports({})).rejects.toThrow('was called without a session context');
  });

  it('throws ActionPermissionError for Client role', async () => {
    await expect(listProblemReports({}, clientContext)).rejects.toThrow(ActionPermissionError);
  });

  it('admits Warehouse staff to list own reports', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          id: 'pr-1',
          description: 'Scanner issue',
          status: 'open',
          created_at: '2026-11-03T10:00:00Z',
        },
      ],
      error: null,
    });

    const res = await listProblemReports({ limit: 10, offset: 0, status: 'open' }, warehouseContext);
    expect(res.reports).toHaveLength(1);
    expect(mockRpc).toHaveBeenCalledWith('list_problem_reports', {
      p_limit: 10,
      p_offset: 0,
      p_status: 'open',
      p_author_id: null,
      p_search: null,
    });
  });

  it('validates limit is between 1 and 100', async () => {
    await expect(listProblemReports({ limit: 0 }, ownerContext)).rejects.toThrow(
      'Limit must be between 1 and 100'
    );
    await expect(listProblemReports({ limit: 101 }, ownerContext)).rejects.toThrow(
      'Limit must be between 1 and 100'
    );
  });

  it('validates offset is non-negative', async () => {
    await expect(listProblemReports({ offset: -1 }, ownerContext)).rejects.toThrow(
      'Offset must be non-negative'
    );
  });
});
