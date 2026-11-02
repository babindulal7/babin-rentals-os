import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deactivateDeliveryZone } from '../deactivateDeliveryZone';
import { ActionPermissionError } from '../../core';
import { supabase } from '../../../lib/supabase';

// Mock supabase
vi.mock('../../../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

// Mock DomainEvents
vi.mock('../../../events/eventBus', () => ({
  DomainEvents: {
    emit: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('deactivateDeliveryZone', () => {
  // Plain { data, error } replies, typed loosely as in the other action tests.
  const mockRpc = vi.mocked(supabase.rpc) as unknown as ReturnType<typeof vi.fn>;
  const managerContext = { userId: 'user-123', role: 'Manager' as const };
  const coordinatorContext = { userId: 'coord-123', role: 'Coordinator' as const };
  const ownerContext = { userId: 'owner-123', role: 'Owner' as const };
  const warehouseContext = { userId: 'warehouse-123', role: 'Warehouse' as const };
  const clientContext = { userId: 'client-123', role: 'Client' as const };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when called without context', async () => {
    await expect(deactivateDeliveryZone({ zoneId: 'zone-uuid' })).rejects.toThrow(
      'was called without a session context'
    );
  });

  it('throws ActionPermissionError for Warehouse role', async () => {
    await expect(
      deactivateDeliveryZone({ zoneId: 'zone-uuid' }, warehouseContext)
    ).rejects.toThrow(ActionPermissionError);
  });

  it('refuses Coordinator zone deactivation before querying database', async () => {
    await expect(deactivateDeliveryZone({ zoneId: '123e4567-e89b-12d3-a456-426614174000' }, coordinatorContext))
      .rejects.toThrow(ActionPermissionError);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('throws ActionPermissionError for Client role', async () => {
    await expect(
      deactivateDeliveryZone({ zoneId: 'zone-uuid' }, clientContext)
    ).rejects.toThrow(ActionPermissionError);
  });

  it('throws validation error for missing zoneId', async () => {
    await expect(
      deactivateDeliveryZone({ zoneId: '' }, managerContext)
    ).rejects.toThrow('Zone ID is required');
  });

  it('throws validation error for invalid UUID format', async () => {
    await expect(
      deactivateDeliveryZone({ zoneId: 'not-a-uuid' }, managerContext)
    ).rejects.toThrow('Invalid zone ID format');
  });

  it('deactivates zone successfully for Manager', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null } as any);

    const result = await deactivateDeliveryZone(
      { zoneId: '123e4567-e89b-12d3-a456-426614174000' },
      managerContext
    );

    expect(result).toEqual({ deactivated: true });
    expect(mockRpc).toHaveBeenCalledWith('deactivate_delivery_zone', {
      p_zone_id: '123e4567-e89b-12d3-a456-426614174000',
    });
  });

  it('deactivates zone successfully for Owner', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null } as any);

    const result = await deactivateDeliveryZone(
      { zoneId: '123e4567-e89b-12d3-a456-426614174000' },
      ownerContext
    );

    expect(result).toEqual({ deactivated: true });
  });

  it('returns false when zone not found', async () => {
    mockRpc.mockResolvedValue({ data: false, error: null } as any);

    const result = await deactivateDeliveryZone(
      { zoneId: '123e4567-e89b-12d3-a456-426614174000' },
      managerContext
    );

    expect(result).toEqual({ deactivated: false });
  });

  it('throws on RPC error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Zone not found' } } as any);

    await expect(
      deactivateDeliveryZone({ zoneId: '123e4567-e89b-12d3-a456-426614174000' }, managerContext)
    ).rejects.toThrow('Failed to deactivate delivery zone: Zone not found');
  });
});
