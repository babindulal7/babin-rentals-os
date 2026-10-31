import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getDeliveryZoneFee } from '../getDeliveryZoneFee';
import { ActionPermissionError } from '../../core';
import { supabase } from '../../../lib/supabase';

// Mock supabase
vi.mock('../../../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

describe('getDeliveryZoneFee', () => {
  // Plain { data, error } replies, typed loosely as in the other action tests.
  const mockRpc = vi.mocked(supabase.rpc) as unknown as ReturnType<typeof vi.fn>;
  const coordinatorContext = { userId: 'user-123', role: 'Coordinator' as const };
  const clientContext = { userId: 'client-123', role: 'Client' as const };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when called without context', async () => {
    await expect(getDeliveryZoneFee({ zoneName: 'Ring Road' })).rejects.toThrow(
      'was called without a session context'
    );
  });

  it('throws ActionPermissionError for Client role', async () => {
    await expect(
      getDeliveryZoneFee({ zoneName: 'Ring Road' }, clientContext)
    ).rejects.toThrow(ActionPermissionError);
  });

  it('throws validation error for missing zoneName', async () => {
    await expect(
      getDeliveryZoneFee({ zoneName: '' }, coordinatorContext)
    ).rejects.toThrow('Zone name is required');
  });

  it('gets fee successfully for Coordinator', async () => {
    mockRpc.mockResolvedValue({ data: 350000, error: null });

    const result = await getDeliveryZoneFee(
      { zoneName: 'Ring Road' },
      coordinatorContext
    );

    expect(result).toEqual({ feePaisa: 350000 });
    expect(mockRpc).toHaveBeenCalledWith('get_delivery_zone_fee', {
      p_zone_name: 'Ring Road',
    });
  });

  it('gets fee successfully for Owner', async () => {
    mockRpc.mockResolvedValue({ data: 0, error: null });

    const result = await getDeliveryZoneFee(
      { zoneName: 'Outside Valley' },
      { userId: 'owner-123', role: 'Owner' as const }
    );

    expect(result).toEqual({ feePaisa: 0 });
  });

  it('trims whitespace from zone name', async () => {
    mockRpc.mockResolvedValue({ data: 350000, error: null });

    await getDeliveryZoneFee(
      { zoneName: '  Ring Road  ' },
      coordinatorContext
    );

    expect(mockRpc).toHaveBeenCalledWith('get_delivery_zone_fee', {
      p_zone_name: 'Ring Road',
    });
  });

  it('throws on RPC error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Zone not found or inactive: Invalid Zone' } });

    await expect(
      getDeliveryZoneFee({ zoneName: 'Invalid Zone' }, coordinatorContext)
    ).rejects.toThrow('Failed to get delivery zone fee: Zone not found or inactive: Invalid Zone');
  });
});