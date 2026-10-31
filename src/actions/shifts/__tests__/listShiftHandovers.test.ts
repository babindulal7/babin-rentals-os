import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listShiftHandovers } from '../listShiftHandovers';
import { ActionNotImplementedError, ActionPermissionError } from '../../core';
import { supabase } from '../../../lib/supabase';

vi.mock('../../../lib/supabase', () => {
  const queryBuilder: any = {};
  queryBuilder.select = vi.fn().mockReturnValue(queryBuilder);
  queryBuilder.is = vi.fn().mockReturnValue(queryBuilder);
  queryBuilder.order = vi.fn().mockReturnValue(queryBuilder);
  queryBuilder.range = vi.fn().mockReturnValue(queryBuilder);

  return {
    supabase: {
      from: vi.fn().mockReturnValue(queryBuilder),
      _builder: queryBuilder,
    },
  };
});

describe('listShiftHandovers', () => {
  const queryBuilder = (supabase as any)._builder;
  const coordinatorContext = { userId: 'coord-123', role: 'Coordinator' as const };
  const warehouseContext = { userId: 'wh-123', role: 'Warehouse' as const };
  const clientContext = { userId: 'client-123', role: 'Client' as const };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is implemented and does not throw ActionNotImplementedError', async () => {
    queryBuilder.range.mockResolvedValue({ data: [], error: null });
    await expect(
      listShiftHandovers({}, coordinatorContext)
    ).resolves.not.toBeInstanceOf(ActionNotImplementedError);
  });

  it('throws when called without session context', async () => {
    await expect(listShiftHandovers({})).rejects.toThrow(
      'was called without a session context'
    );
  });

  it('denies Client role with ActionPermissionError', async () => {
    await expect(listShiftHandovers({}, clientContext)).rejects.toThrow(
      ActionPermissionError
    );
  });

  it('allows staff roles to list shift handovers with pagination', async () => {
    const mockHandovers = [
      { id: 'sh-1', shift_code: 'A', status: 'acknowledged' },
      { id: 'sh-2', shift_code: 'B', status: 'pending' },
    ];
    queryBuilder.range.mockResolvedValue({ data: mockHandovers, error: null });

    const result = await listShiftHandovers({ limit: 10, offset: 5 }, warehouseContext);

    expect(result.handovers).toEqual(mockHandovers);
    expect(supabase.from).toHaveBeenCalledWith('shift_handovers_v');
    expect(queryBuilder.select).toHaveBeenCalledWith('*');
    expect(queryBuilder.is).toHaveBeenCalledWith('archived_at', null);
    expect(queryBuilder.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(queryBuilder.range).toHaveBeenCalledWith(5, 14);
  });

  it('throws if query returns an error', async () => {
    queryBuilder.range.mockResolvedValue({ data: null, error: { message: 'Database error' } });
    await expect(listShiftHandovers({}, coordinatorContext)).rejects.toThrow(
      'Failed to list shift handovers: Database error'
    );
  });
});
