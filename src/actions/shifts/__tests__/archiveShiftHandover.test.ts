import { describe, it, expect, vi, beforeEach } from 'vitest';
import { archiveShiftHandover } from '../archiveShiftHandover';
import { ActionNotImplementedError, ActionPermissionError } from '../../core';
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

describe('archiveShiftHandover', () => {
  const mockRpc = vi.mocked(supabase.rpc);
  const ownerContext = { userId: 'owner-123', role: 'Owner' as const };
  const coordinatorContext = { userId: 'coord-123', role: 'Coordinator' as const };
  const clientContext = { userId: 'client-123', role: 'Client' as const };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is implemented and does not throw ActionNotImplementedError', async () => {
    mockRpc.mockResolvedValue({ data: { id: 'handover-123' }, error: null } as any);
    await expect(
      archiveShiftHandover({ handoverId: 'handover-123' }, ownerContext)
    ).resolves.not.toBeInstanceOf(ActionNotImplementedError);
  });

  it('throws when called without session context', async () => {
    await expect(
      archiveShiftHandover({ handoverId: 'handover-123' })
    ).rejects.toThrow('was called without a session context');
  });

  it('denies Client role with ActionPermissionError', async () => {
    await expect(
      archiveShiftHandover({ handoverId: 'handover-123' }, clientContext)
    ).rejects.toThrow(ActionPermissionError);
  });

  it('validates handoverId is required', async () => {
    await expect(
      archiveShiftHandover({ handoverId: '' }, coordinatorContext)
    ).rejects.toThrow('Handover ID is required');
  });

  it('calls archive_shift_handover RPC with expected params', async () => {
    mockRpc.mockResolvedValue({
      data: { id: 'handover-123', status: 'archived', archived_at: '2026-10-30T12:00:00Z' },
      error: null,
    } as any);

    const result = await archiveShiftHandover(
      { handoverId: 'handover-123' },
      coordinatorContext
    );

    expect(result.handover).toEqual({
      id: 'handover-123',
      status: 'archived',
      archived_at: '2026-10-30T12:00:00Z',
    });
    expect(mockRpc).toHaveBeenCalledWith('archive_shift_handover', {
      p_handover_id: 'handover-123',
    });
  });

  it('throws when RPC returns an error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Not found' } } as any);
    await expect(
      archiveShiftHandover({ handoverId: 'handover-999' }, coordinatorContext)
    ).rejects.toThrow('Failed to archive shift handover: Not found');
  });
});
