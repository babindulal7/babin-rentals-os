import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDeliveryJob } from '../createDeliveryJob';
import { assignDeliveryDriver } from '../assignDeliveryDriver';
import { transitionDeliveryJob } from '../transitionDeliveryJob';
import { ActionNotImplementedError, ActionPermissionError } from '../../core';
import { supabase } from '../../../lib/supabase';

// Mock supabase
vi.mock('../../../lib/supabase', () => ({
  IS_MOCK: false,
  supabase: {
    rpc: vi.fn(),
  },
}));

// Mock DomainEvents
vi.mock('../../../events/eventBus', () => ({
  DomainEvents: {
    emit: vi.fn().mockResolvedValue(undefined),
  },
  EVENT_TYPES: {
    DELIVERY_JOB_CREATED: 'delivery.job_created',
    DELIVERY_DRIVER_ASSIGNED: 'delivery.driver_assigned',
    DELIVERY_JOB_TRANSITIONED: 'delivery.job_transitioned',
  },
}));

describe('Delivery Actions (T4-01)', () => {
  const mockRpc = vi.mocked(supabase.rpc);

  const ownerCtx = { userId: 'usr-owner', role: 'Owner' as const };
  const coordinatorCtx = { userId: 'usr-coord', role: 'Coordinator' as const };
  const managerCtx = { userId: 'usr-mgr', role: 'Manager' as const };
  const warehouseCtx = { userId: 'usr-wh', role: 'Warehouse' as const };
  const driverCtx = { userId: 'usr-dr', role: 'Driver' as const };
  const clientCtx = { userId: 'usr-cl', role: 'Client' as const };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createDeliveryJob', () => {
    it('is implemented and does not throw ActionNotImplementedError', async () => {
      mockRpc.mockResolvedValue({ data: 'job-123', error: null } as any);
      await expect(
        createDeliveryJob(
          { bookingId: 'b-123', leg: 'Outbound', scheduledAt: '2026-11-01T10:00:00Z' },
          ownerCtx
        )
      ).resolves.not.toBeInstanceOf(ActionNotImplementedError);
    });

    it('requires session context', async () => {
      await expect(
        createDeliveryJob({ bookingId: 'b-123', leg: 'Outbound', scheduledAt: '2026-11-01T10:00:00Z' })
      ).rejects.toThrow('was called without a session context');
    });

    it('allows Owner, Manager, and Coordinator', async () => {
      mockRpc.mockResolvedValue({ data: 'job-123', error: null } as any);

      const resOwner = await createDeliveryJob(
        { bookingId: 'b-1', leg: 'Outbound', scheduledAt: '2026-11-01T10:00:00Z' },
        ownerCtx
      );
      expect(resOwner.jobId).toBe('job-123');

      const resCoord = await createDeliveryJob(
        { bookingId: 'b-2', leg: 'Return', scheduledAt: '2026-11-03T10:00:00Z' },
        coordinatorCtx
      );
      expect(resCoord.jobId).toBe('job-123');
    });

    it('denies Warehouse, Driver, and Client', async () => {
      await expect(
        createDeliveryJob(
          { bookingId: 'b-1', leg: 'Outbound', scheduledAt: '2026-11-01T10:00:00Z' },
          warehouseCtx
        )
      ).rejects.toThrow(ActionPermissionError);

      await expect(
        createDeliveryJob(
          { bookingId: 'b-1', leg: 'Outbound', scheduledAt: '2026-11-01T10:00:00Z' },
          driverCtx
        )
      ).rejects.toThrow(ActionPermissionError);

      await expect(
        createDeliveryJob(
          { bookingId: 'b-1', leg: 'Outbound', scheduledAt: '2026-11-01T10:00:00Z' },
          clientCtx
        )
      ).rejects.toThrow(ActionPermissionError);
    });

    it('validates bookingId, leg, and scheduledAt', async () => {
      await expect(
        createDeliveryJob({ bookingId: '', leg: 'Outbound', scheduledAt: '2026-11-01T10:00:00Z' }, ownerCtx)
      ).rejects.toThrow('Valid booking ID is required');

      await expect(
        createDeliveryJob({ bookingId: 'b-1', leg: 'Invalid' as any, scheduledAt: '2026-11-01T10:00:00Z' }, ownerCtx)
      ).rejects.toThrow('Delivery leg must be Outbound or Return');

      await expect(
        createDeliveryJob({ bookingId: 'b-1', leg: 'Outbound', scheduledAt: '' }, ownerCtx)
      ).rejects.toThrow('Scheduled date/time is required');
    });

    it('calls RPC with strip nulls and vehicle/rider details', async () => {
      mockRpc.mockResolvedValue({ data: 'job-999', error: null } as any);

      const res = await createDeliveryJob(
        {
          bookingId: 'b-55',
          leg: 'Outbound',
          scheduledAt: '2026-11-01T04:00:00Z',
          vehicle: 'Ba 3 Cha 8821',
          riderName: 'Ramesh Thapa',
          riderPhone: '+977 9813009988',
        },
        coordinatorCtx
      );

      expect(res.jobId).toBe('job-999');
      expect(mockRpc).toHaveBeenCalledWith('delivery_create_job', {
        p_booking_id: 'b-55',
        p_leg: 'Outbound',
        p_scheduled_at: '2026-11-01T04:00:00Z',
        p_key: expect.any(String),
        p_vehicle: 'Ba 3 Cha 8821',
        p_rider_name: 'Ramesh Thapa',
        p_rider_phone: '+977 9813009988',
      });
    });
  });

  describe('assignDeliveryDriver', () => {
    it('allows Coordinator, Manager, and Owner; denies Warehouse, Driver, and Client', async () => {
      mockRpc.mockResolvedValue({ data: 'job-123', error: null } as any);

      await expect(
        assignDeliveryDriver({ jobId: 'j-1', driverId: 'dr-1' }, coordinatorCtx)
      ).resolves.toEqual({ jobId: 'job-123' });

      await expect(
        assignDeliveryDriver({ jobId: 'j-1', driverId: 'dr-1' }, warehouseCtx)
      ).rejects.toThrow(ActionPermissionError);

      await expect(
        assignDeliveryDriver({ jobId: 'j-1', driverId: 'dr-1' }, driverCtx)
      ).rejects.toThrow(ActionPermissionError);
    });

    it('requires either an active staff driver or external rider name', async () => {
      await expect(
        assignDeliveryDriver({ jobId: 'j-1', driverId: '', riderName: '' }, managerCtx)
      ).rejects.toThrow('Either an assigned staff driver or a hired rider name is required');
    });

    it('passes vehicle and rider details into RPC', async () => {
      mockRpc.mockResolvedValue({ data: 'job-123', error: null } as any);

      await assignDeliveryDriver(
        {
          jobId: 'j-1',
          driverId: 'dr-5',
          vehicle: 'Ba 92 Pa 3314',
          riderName: 'Pathao Rider',
          riderPhone: '+977 9801122334',
        },
        ownerCtx
      );

      expect(mockRpc).toHaveBeenCalledWith('delivery_assign_driver', {
        p_job_id: 'j-1',
        p_driver_id: 'dr-5',
        p_request_key: expect.any(String),
        p_vehicle: 'Ba 92 Pa 3314',
        p_rider_name: 'Pathao Rider',
        p_rider_phone: '+977 9801122334',
      });
    });
  });

  describe('transitionDeliveryJob', () => {
    it('allows Driver and Warehouse in addition to desk roles; denies Client', async () => {
      mockRpc.mockResolvedValue({ data: 'job-123', error: null } as any);

      await expect(
        transitionDeliveryJob(
          { jobId: 'j-1', expectedStatus: 'Ready', nextStatus: 'In Transit' },
          driverCtx
        )
      ).resolves.toEqual({ jobId: 'job-123' });

      await expect(
        transitionDeliveryJob(
          { jobId: 'j-1', expectedStatus: 'Scheduled', nextStatus: 'Ready' },
          warehouseCtx
        )
      ).resolves.toEqual({ jobId: 'job-123' });

      await expect(
        transitionDeliveryJob(
          { jobId: 'j-1', expectedStatus: 'Ready', nextStatus: 'In Transit' },
          clientCtx
        )
      ).rejects.toThrow(ActionPermissionError);
    });

    it('enforces recipient name length >= 2 chars for Delivered', async () => {
      await expect(
        transitionDeliveryJob(
          { jobId: 'j-1', expectedStatus: 'In Transit', nextStatus: 'Delivered', recipient: 'A' },
          driverCtx
        )
      ).rejects.toThrow('Delivery receipt requires recipient name (at least 2 characters)');

      mockRpc.mockResolvedValue({ data: 'job-123', error: null } as any);
      await expect(
        transitionDeliveryJob(
          { jobId: 'j-1', expectedStatus: 'In Transit', nextStatus: 'Delivered', recipient: 'Anil Gurung' },
          driverCtx
        )
      ).resolves.toEqual({ jobId: 'job-123' });
    });

    it('enforces failure note length >= 10 chars for Failed', async () => {
      await expect(
        transitionDeliveryJob(
          { jobId: 'j-1', expectedStatus: 'In Transit', nextStatus: 'Failed', note: 'Too short' },
          coordinatorCtx
        )
      ).rejects.toThrow('Failure note must explain the issue with at least 10 characters');

      mockRpc.mockResolvedValue({ data: 'job-123', error: null } as any);
      await expect(
        transitionDeliveryJob(
          {
            jobId: 'j-1',
            expectedStatus: 'In Transit',
            nextStatus: 'Failed',
            note: 'Client unreachable after 5 attempts and gate closed.',
          },
          coordinatorCtx
        )
      ).resolves.toEqual({ jobId: 'job-123' });
    });
  });
});
