import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createProblemReport } from '../createProblemReport';
import { ActionPermissionError } from '../../core';
import { supabase } from '../../../lib/supabase';

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

vi.mock('../../../events/eventBus', () => ({
  DomainEvents: {
    emit: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('createProblemReport action (T4-11, B27, B48)', () => {
  const mockRpc = vi.mocked(supabase.rpc) as unknown as ReturnType<typeof vi.fn>;
  const warehouseContext = { userId: 'warehouse-1', role: 'Warehouse' as const };
  const clientContext = { userId: 'client-1', role: 'Client' as const };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when called without session context', async () => {
    await expect(createProblemReport({ description: 'Scanner broken' })).rejects.toThrow(
      'was called without a session context'
    );
  });

  it('throws ActionPermissionError for Client role', async () => {
    await expect(
      createProblemReport({ description: 'Scanner broken' }, clientContext)
    ).rejects.toThrow(ActionPermissionError);
  });

  it('admits Warehouse staff and creates report', async () => {
    mockRpc.mockResolvedValueOnce({ data: 'report-uuid-1', error: null });

    const res = await createProblemReport(
      {
        description: 'Scanner lens scratched on Camera A',
        clientUuid: '11111111-1111-4111-8111-111111111111',
        routePath: '/operations',
        deviceCategory: 'tablet',
        viewportWidth: 820,
        viewportHeight: 1180,
      },
      warehouseContext
    );

    expect(res.reportId).toBe('report-uuid-1');
    expect(mockRpc).toHaveBeenCalledWith('create_problem_report', {
      p_description: 'Scanner lens scratched on Camera A',
      p_client_uuid: '11111111-1111-4111-8111-111111111111',
      p_photo_path: null,
      p_route_path: '/operations',
      p_app_version: null,
      p_user_role: null,
      p_device_category: 'tablet',
      p_viewport_width: 820,
      p_viewport_height: 1180,
      p_error_reference: null,
    });
  });

  it('validates description is not empty', async () => {
    await expect(
      createProblemReport({ description: '   ' }, warehouseContext)
    ).rejects.toThrow('Problem description cannot be empty');
  });

  it('validates description length <= 10,000 characters', async () => {
    const longDesc = 'a'.repeat(10001);
    await expect(
      createProblemReport({ description: longDesc }, warehouseContext)
    ).rejects.toThrow('exceeds maximum length');
  });

  it('refuses routePath with query string', async () => {
    await expect(
      createProblemReport({ description: 'Broken button', routePath: '/rentals?booking=123' }, warehouseContext)
    ).rejects.toThrow('must not contain query string');
  });

  it('refuses routePath with sensitive parameter words', async () => {
    await expect(
      createProblemReport({ description: 'Auth issue', routePath: '/auth/verify-token' }, warehouseContext)
    ).rejects.toThrow('must not contain sensitive parameters');
  });

  it('validates deviceCategory if provided', async () => {
    await expect(
      createProblemReport(
        { description: 'Broken button', deviceCategory: 'smartwatch' as any },
        warehouseContext
      )
    ).rejects.toThrow('Invalid device category');
  });
});
