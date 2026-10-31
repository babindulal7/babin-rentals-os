import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateDeliveryZone } from '../updateDeliveryZone';
import { ActionPermissionError } from '../../core';
import { supabase } from '../../../../lib/supabase';

// Mock supabase
vi.mock('../../../../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

// Mock DomainEvents
vi.mock('../../../../events/eventBus', () => ({
  DomainEvents: {
    emit: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('updateDeliveryZone', () => {
  const mockRpc = vi.mocked(supabase.rpc);
  const coordinatorContext = { userId: 'user-123', role: 'Coordinator' as const };
  const ownerContext = { userId: 'owner-123', role: 'Owner' as const };
  const warehouseContext = { userId: 'warehouse-123', role: 'Warehouse' as const };
  const clientContext = { userId: 'client-123', role: 'Client' as const };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when called without context', async () => {
    await expect(updateDeliveryZone({ zoneId: 'zone-uuid' })).rejects.toThrow(
      'was called without a session context'
    );
  });

  it('throws ActionPermissionError for Warehouse role', async () => {
    await expect(
      updateDeliveryZone({ zoneId: 'zone-uuid', name: 'Updated' }, warehouseContext)
    ).rejects.toThrow(ActionPermissionError);
  });

  it('throws ActionPermissionError for Client role', async () => {
    await expect(
      updateDeliveryZone({ zoneId: 'zone-uuid', name: 'Updated' }, clientContext)
    ).rejects.toThrow(ActionPermissionError);
  });

  it('throws validation error for missing zoneId', async () => {
    await expect(
      updateDeliveryZone({ zoneId: '' }, coordinatorContext)
    ).rejects.toThrow('Zone ID is required');
  });

  it('throws validation error for invalid UUID format', async () => {
    await expect(
      updateDeliveryZone({ zoneId: 'not-a-uuid' }, coordinatorContext)
    ).rejects.toThrow('Invalid zone ID format');
  });

  it('throws validation error for empty name', async () => {
    await expect(
      updateDeliveryZone({ zoneId: '123e4567-e89b-12d3-a456-426614174000', name: '' }, coordinatorContext)
    ).rejects.toThrow('Zone name cannot be empty');
  });

  it('throws validation error for negative fee', async () => {
    await expect(
      updateDeliveryZone({ zoneId: '123e4567-e89b-12d3-a456-426614174000', feePaisa: -100 }, coordinatorContext)
    ).rejects.toThrow('Zone fee cannot be negative');
  });

  it('throws validation error for non-integer fee', async () => {
    await expect(
      updateDeliveryZone({ zoneId: '123e4567-e89b-12d3-a456-426614174000', feePaisa: 350000.5 }, coordinatorContext)
    ).rejects.toThrow('Zone fee must be an integer');
  });

  it('updates zone successfully for Coordinator', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });

    const result = await updateDeliveryZone(
      { zoneId: '123e4567-e89b-12d3-a456-426614174000', name: 'Updated Zone', feePaisa: 400000 },
      coordinatorContext
    );

    expect(result).toEqual({ updated: true });
    expect(mockRpc).toHaveBeenCalledWith('update_delivery_zone', {
      p_zone_id: '123e4567-e89b-12d3-a456-426614174000',
      p_name: 'Updated Zone',
      p_description: null,
      p_fee_paisa: 400000,
      p_is_active: null,
    });
  });

  it('updates zone successfully for Owner', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });

    const result = await updateDeliveryZone(
      { zoneId: '123e4567-e89b-12d3-a456-426614174000', isActive: false },
      ownerContext
    );

    expect(result).toEqual({ updated: true });
  });

  it('returns false when zone not found', async () => {
    mockRpc.mockResolvedValue({ data: false, error: null });

    const result = await updateDeliveryZone(
      { zoneId: '123e4567-e89b-12d3-a456-426614174000', name: 'Updated' },
      coordinatorContext
    );

    expect(result).toEqual({ updated: false });
  });

  it('throws on RPC error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Zone not found' } });

    await expect(
      updateDeliveryZone({ zoneId: '123e4567-e89b-12d3-a456-426614174000', name: 'Updated' }, coordinatorContext)
    ).rejects.toThrow('Failed to update delivery zone: Zone not found');
  });
});