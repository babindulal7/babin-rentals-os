import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listDeliveryZones, type DeliveryZoneRow } from '../listDeliveryZones';
import { supabase } from '../../../lib/supabase';

// Mock supabase
vi.mock('../../../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

describe('listDeliveryZones', () => {
  const mockRpc = vi.mocked(supabase.rpc);

  const mockZones: DeliveryZoneRow[] = [
    {
      id: '111e4567-e89b-12d3-a456-426614174000',
      name: 'Ring Road',
      description: 'Inside Kathmandu Ring Road',
      fee_paisa: 350000,
      is_active: true,
      created_at: '2026-10-28T10:00:00Z',
      updated_at: '2026-10-28T10:00:00Z',
    },
    {
      id: '222e4567-e89b-12d3-a456-426614174000',
      name: 'Boudha',
      description: 'Boudha and surrounding areas',
      fee_paisa: 350000,
      is_active: true,
      created_at: '2026-10-28T09:00:00Z',
      updated_at: '2026-10-28T09:00:00Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when called without context', async () => {
    await expect(listDeliveryZones({})).rejects.toThrow(
      'was called without a session context'
    );
  });

  it('throws ActionPermissionError for Client role', async () => {
    await expect(listDeliveryZones({}, { userId: 'client-123', role: 'Client' as const })).rejects.toThrow('Your role (Client) cannot perform "listDeliveryZones"');
  });

  it('throws validation error for limit < 1', async () => {
    await expect(listDeliveryZones({ limit: 0 }, { userId: 'user-123', role: 'Coordinator' as const })).rejects.toThrow('Limit must be between 1 and 100');
  });

  it('throws validation error for limit > 100', async () => {
    await expect(listDeliveryZones({ limit: 101 }, { userId: 'user-123', role: 'Coordinator' as const })).rejects.toThrow('Limit must be between 1 and 100');
  });

  it('throws validation error for negative offset', async () => {
    await expect(listDeliveryZones({ offset: -1 }, { userId: 'user-123', role: 'Coordinator' as const })).rejects.toThrow('Offset cannot be negative');
  });

  it('lists zones with defaults', async () => {
    mockRpc.mockResolvedValue({ data: mockZones, error: null } as any);

    const result = await listDeliveryZones({}, { userId: 'user-123', role: 'Coordinator' as const });

    expect(result).toEqual({ zones: mockZones });
    expect(mockRpc).toHaveBeenCalledWith('list_delivery_zones', {
      p_limit: 50,
      p_offset: 0,
      p_active_only: true,
    });
  });

  it('masks monetary columns even when an older RPC returns them to Warehouse', async () => {
    mockRpc.mockResolvedValue({ data: mockZones, error: null } as any);
    const result = await listDeliveryZones(
      {},
      { userId: 'warehouse-123', role: 'Warehouse' as const },
    );
    expect(result.zones.map(z => z.fee_paisa)).toEqual([null, null]);
    expect(result.zones.map(z => z.name)).toEqual(['Ring Road', 'Boudha']);
  });

  it('respects custom limit and offset', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null } as any);

    await listDeliveryZones({ limit: 10, offset: 20 }, { userId: 'user-123', role: 'Coordinator' as const });

    expect(mockRpc).toHaveBeenCalledWith('list_delivery_zones', {
      p_limit: 10,
      p_offset: 20,
      p_active_only: true,
    });
  });

  it('respects activeOnly filter', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null } as any);

    await listDeliveryZones({ activeOnly: false }, { userId: 'user-123', role: 'Coordinator' as const });

    expect(mockRpc).toHaveBeenCalledWith('list_delivery_zones', {
      p_limit: 50,
      p_offset: 0,
      p_active_only: false,
    });
  });

  it('returns empty array when no zones', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null } as any);

    const result = await listDeliveryZones({}, { userId: 'user-123', role: 'Coordinator' as const });

    expect(result).toEqual({ zones: [] });
  });

  it('throws on RPC error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Permission denied' } } as any);

    await expect(listDeliveryZones({}, { userId: 'user-123', role: 'Coordinator' as const })).rejects.toThrow('Failed to list delivery zones: Permission denied');
  });
});
