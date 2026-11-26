import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateProblemReportStatus } from '../updateProblemReportStatus';
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

describe('updateProblemReportStatus action (T4-11, B27, B48)', () => {
  const mockRpc = vi.mocked(supabase.rpc) as unknown as ReturnType<typeof vi.fn>;
  const ownerContext = { userId: 'owner-1', role: 'Owner' as const };
  const adminContext = { userId: 'admin-1', role: 'Admin' as const };
  const coordinatorContext = { userId: 'coord-1', role: 'Coordinator' as const };
  const warehouseContext = { userId: 'warehouse-1', role: 'Warehouse' as const };
  const clientContext = { userId: 'client-1', role: 'Client' as const };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when called without session context', async () => {
    await expect(
      updateProblemReportStatus({ reportId: 'pr-1', status: 'seen' })
    ).rejects.toThrow('was called without a session context');
  });

  it('throws ActionPermissionError for non-Owner/Admin roles', async () => {
    await expect(
      updateProblemReportStatus({ reportId: 'pr-1', status: 'seen' }, coordinatorContext)
    ).rejects.toThrow(ActionPermissionError);

    await expect(
      updateProblemReportStatus({ reportId: 'pr-1', status: 'seen' }, warehouseContext)
    ).rejects.toThrow(ActionPermissionError);

    await expect(
      updateProblemReportStatus({ reportId: 'pr-1', status: 'seen' }, clientContext)
    ).rejects.toThrow(ActionPermissionError);
  });

  it('admits Owner and Admin to update status with valid reason', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });

    const resOwner = await updateProblemReportStatus(
      {
        reportId: 'pr-1',
        status: 'fixed',
        reason: 'Replaced barcode scanner hardware',
      },
      ownerContext
    );
    expect(resOwner.updated).toBe(true);

    const resAdmin = await updateProblemReportStatus(
      {
        reportId: 'pr-1',
        status: 'seen',
        reason: 'Investigating scanner hardware',
      },
      adminContext
    );
    expect(resAdmin.updated).toBe(true);
  });

  it('validates status is one of the four named states', async () => {
    await expect(
      updateProblemReportStatus(
        { reportId: 'pr-1', status: 'deleted' as any },
        ownerContext
      )
    ).rejects.toThrow('Invalid status');
  });

  it('validates reason is at least 10 characters if provided', async () => {
    await expect(
      updateProblemReportStatus(
        { reportId: 'pr-1', status: 'wont_fix', reason: 'too short' },
        ownerContext
      )
    ).rejects.toThrow('Status change reason must be at least 10 characters');
  });
});
