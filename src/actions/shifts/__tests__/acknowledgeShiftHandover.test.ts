import { describe, it, expect, vi, beforeEach } from 'vitest';
import { acknowledgeShiftHandover } from '../acknowledgeShiftHandover';
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

describe('acknowledgeShiftHandover', () => {
  const mockRpc = vi.mocked(supabase.rpc);
  const coordinatorContext = { userId: 'coord-123', role: 'Coordinator' as const };
  const technicianContext = { userId: 'tech-123', role: 'Technician' as const };
  const clientContext = { userId: 'client-123', role: 'Client' as const };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is implemented and does not throw ActionNotImplementedError', async () => {
    mockRpc.mockResolvedValue({ data: { id: 'handover-123' }, error: null } as any);
    await expect(
      acknowledgeShiftHandover({ handoverId: 'handover-123' }, coordinatorContext)
    ).resolves.not.toBeInstanceOf(ActionNotImplementedError);
  });

  it('throws when called without session context', async () => {
    await expect(
      acknowledgeShiftHandover({ handoverId: 'handover-123' })
    ).rejects.toThrow('was called without a session context');
  });

  it('denies Client role with ActionPermissionError', async () => {
    await expect(
      acknowledgeShiftHandover({ handoverId: 'handover-123' }, clientContext)
    ).rejects.toThrow(ActionPermissionError);
  });

  it('validates handoverId is required', async () => {
    await expect(
      acknowledgeShiftHandover({ handoverId: '' }, coordinatorContext)
    ).rejects.toThrow('Handover ID is required');
  });

  it('calls acknowledge_shift_handover RPC with expected params', async () => {
    mockRpc.mockResolvedValue({
      data: { id: 'handover-123', status: 'acknowledged', acknowledged_by: 'tech-123' },
      error: null,
    } as any);

    const result = await acknowledgeShiftHandover(
      {
        handoverId: 'handover-123',
        note: 'Count verified, Rs 15,000 in drawer.',
        operatorName: 'Sunil T.',
      },
      technicianContext
    );

    expect(result.handover).toEqual({
      id: 'handover-123',
      status: 'acknowledged',
      acknowledged_by: 'tech-123',
    });
    expect(mockRpc).toHaveBeenCalledWith('acknowledge_shift_handover', {
      p_handover_id: 'handover-123',
      p_acknowledgement_note: 'Count verified, Rs 15,000 in drawer.',
      p_operator_name: 'Sunil T.',
    });
  });

  it('throws when RPC returns an error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Already acknowledged' } } as any);
    await expect(
      acknowledgeShiftHandover({ handoverId: 'handover-123' }, coordinatorContext)
    ).rejects.toThrow('Failed to acknowledge shift handover: Already acknowledged');
  });
});
