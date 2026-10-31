import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDeliveryZone } from '../createDeliveryZone';
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

describe('createDeliveryZone', () => {
  const mockRpc = vi.mocked(supabase.rpc);
  const coordinatorContext = { userId: 'user-123', role: 'Coordinator' as const };
  const ownerContext = { userId: 'owner-123', role: 'Owner' as const };
  const warehouseContext = { userId: 'warehouse-123', role: 'Warehouse' as const };
  const clientContext = { userId: 'client-123', role: 'Client' as const };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when called without context', async () => {
    await expect(createDeliveryZone({ name: 'Test Zone', description: 'Test', feePaisa: 350000 })).rejects.toThrow(
      'was called without a session context'
    );
  });

  it('throws ActionPermissionError for Warehouse role', async () => {
    await expect(
      createDeliveryZone({ name: 'Test Zone', description: 'Test', feePaisa: 350000 }, warehouseContext)
    ).rejects.toThrow(ActionPermissionError);
  });

  it('throws ActionPermissionError for Client role', async () => {
    await expect(
      createDeliveryZone({ name: 'Test Zone', description: 'Test', feePaisa: 350000 }, clientContext)
    ).rejects.toThrow(ActionPermissionError);
  });

  it('throws validation error for empty name', async () => {
    await expect(
      createDeliveryZone({ name: '', description: 'Test', feePaisa: 350000 }, coordinatorContext)
    ).rejects.toThrow('Zone name cannot be empty');
  });

  it('throws validation error for negative fee', async () => {
    await expect(
      createDeliveryZone({ name: 'Test Zone', description: 'Test', feePaisa: -100 }, coordinatorContext)
    ).rejects.toThrow('Zone fee cannot be negative');
  });

  it('throws validation error for non-integer fee', async () => {
    await expect(
      createDeliveryZone({ name: 'Test Zone', description: 'Test', feePaisa: 350000.5 }, coordinatorContext)
    ).rejects.toThrow('Zone fee must be an integer');
  });

  it('creates zone successfully for Coordinator', async () => {
    mockRpc.mockResolvedValue({ data: 'zone-uuid-123', error: null } as any);

    const result = await createDeliveryZone(
      { name: 'Test Zone', description: 'Test description', feePaisa: 350000 },
      coordinatorContext
    );

    expect(result).toEqual({ zoneId: 'zone-uuid-123' });
    expect(mockRpc).toHaveBeenCalledWith('create_delivery_zone', {
      p_name: 'Test Zone',
      p_description: 'Test description',
      p_fee_paisa: 350000,
    });
  });

  it('creates zone successfully for Owner', async () => {
    mockRpc.mockResolvedValue({ data: 'zone-uuid-456', error: null } as any);

    const result = await createDeliveryZone(
      { name: 'Owner Zone', description: '', feePaisa: 500000 },
      ownerContext
    );

    expect(result).toEqual({ zoneId: 'zone-uuid-456' });
  });

  it('trims whitespace from name and description', async () => {
    mockRpc.mockResolvedValue({ data: 'zone-uuid-789', error: null } as any);

    await createDeliveryZone(
      { name: '  Trimmed Zone  ', description: '  Desc  ', feePaisa: 400000 },
      coordinatorContext
    );

    expect(mockRpc).toHaveBeenCalledWith('create_delivery_zone', {
      p_name: 'Trimmed Zone',
      p_description: 'Desc',
      p_fee_paisa: 400000,
    });
  });

  it('throws on RPC error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'DB error' } } as any);

    await expect(
      createDeliveryZone({ name: 'Test Zone', description: 'Test', feePaisa: 350000 }, coordinatorContext)
    ).rejects.toThrow('Failed to create delivery zone: DB error');
  });
});
