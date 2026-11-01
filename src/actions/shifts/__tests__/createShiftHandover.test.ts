import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createShiftHandover } from '../createShiftHandover';
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

describe('createShiftHandover', () => {
  const mockRpc = vi.mocked(supabase.rpc);
  const coordinatorContext = { userId: 'coord-123', role: 'Coordinator' as const };
  const warehouseContext = { userId: 'wh-123', role: 'Warehouse' as const };
  const driverContext = { userId: 'dr-123', role: 'Driver' as const };
  const clientContext = { userId: 'client-123', role: 'Client' as const };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is implemented and does not throw ActionNotImplementedError', async () => {
    mockRpc.mockResolvedValue({ data: { id: 'handover-123' }, error: null } as any);
    await expect(
      createShiftHandover({ shiftCode: 'A' }, coordinatorContext)
    ).resolves.not.toBeInstanceOf(ActionNotImplementedError);
  });

  it('throws when called without session context', async () => {
    await expect(createShiftHandover({ shiftCode: 'A' })).rejects.toThrow(
      'was called without a session context'
    );
  });

  it('denies Client role with ActionPermissionError', async () => {
    await expect(
      createShiftHandover({ shiftCode: 'A' }, clientContext)
    ).rejects.toThrow(ActionPermissionError);
  });

  it('allows staff roles like Warehouse and Driver to create handovers', async () => {
    mockRpc.mockResolvedValue({ data: { id: 'handover-wh' }, error: null } as any);
    const whResult = await createShiftHandover(
      { shiftCode: 'A', fromUserName: 'Warehouse Op' },
      warehouseContext
    );
    expect(whResult.handover).toEqual({
      id: 'handover-wh',
      cash_counted_paisa: null,
      cash_status: null,
      cash_variance_paisa: null,
    });

    mockRpc.mockResolvedValue({ data: { id: 'handover-dr' }, error: null } as any);
    const drResult = await createShiftHandover(
      { shiftCode: 'B', fromUserName: 'Driver Op' },
      driverContext
    );
    expect(drResult.handover).toEqual({
      id: 'handover-dr',
      cash_counted_paisa: null,
      cash_status: null,
      cash_variance_paisa: null,
    });
  });

  it('validates cash counted paisa cannot be negative', async () => {
    await expect(
      createShiftHandover({ cashCountedPaisa: -500 }, coordinatorContext)
    ).rejects.toThrow('Cash counted paisa cannot be negative');
  });

  it('calls create_shift_handover RPC with correct params and idempotency client_uuid', async () => {
    mockRpc.mockResolvedValue({ data: { id: 'handover-abc', client_uuid: 'uuid-123' }, error: null } as any);

    const result = await createShiftHandover(
      {
        clientUuid: 'custom-client-uuid-1',
        shiftCode: 'B',
        fromUserName: 'Babin D.',
        fromUserRole: 'Coordinator',
        toUserId: 'user-to-1',
        toUserName: 'Saroj K.',
        cashCountedPaisa: 1500000,
        cashStatus: 'matched',
        cashVariancePaisa: 0,
        notes: 'Smooth shift, all gear returned.',
        checklist: [{ key: 'c1', label: 'Cash counted', done: true }],
      },
      coordinatorContext
    );

    expect(result.handover).toEqual({ id: 'handover-abc', client_uuid: 'uuid-123' });
    expect(mockRpc).toHaveBeenCalledWith('create_shift_handover', {
      p_client_uuid: 'custom-client-uuid-1',
      p_shift_code: 'B',
      p_from_user_name: 'Babin D.',
      p_from_user_role: 'Coordinator',
      p_to_user_id: 'user-to-1',
      p_to_user_name: 'Saroj K.',
      p_cash_counted_paisa: 1500000,
      p_cash_status: 'matched',
      p_cash_variance_paisa: 0,
      p_notes: 'Smooth shift, all gear returned.',
      p_open_items: [],
      p_checklist: [{ key: 'c1', label: 'Cash counted', done: true }],
    });
  });

  it('throws if RPC returns an error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'DB connection failure' } } as any);
    await expect(
      createShiftHandover({ shiftCode: 'A' }, coordinatorContext)
    ).rejects.toThrow('Failed to create shift handover: DB connection failure');
  });
});
