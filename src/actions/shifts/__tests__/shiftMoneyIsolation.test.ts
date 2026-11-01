import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createShiftHandover,
  acknowledgeShiftHandover,
  archiveShiftHandover,
  listShiftHandovers,
} from '../index';
import { ActionPermissionError } from '../../core';
import { supabase } from '../../../lib/supabase';
import type { SystemRole } from '../../../lib/rbac';

vi.mock('../../../lib/supabase', () => {
  const queryBuilder: any = {};
  queryBuilder.select = vi.fn().mockReturnValue(queryBuilder);
  queryBuilder.is = vi.fn().mockReturnValue(queryBuilder);
  queryBuilder.order = vi.fn().mockReturnValue(queryBuilder);
  queryBuilder.range = vi.fn().mockReturnValue(queryBuilder);

  return {
    supabase: {
      rpc: vi.fn(),
      from: vi.fn().mockReturnValue(queryBuilder),
      _builder: queryBuilder,
    },
  };
});

vi.mock('../../../events/eventBus', () => ({
  DomainEvents: {
    emit: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('P0 Shift Handover — 9-Role Money Isolation & Boundary Security', () => {
  const mockRpc = vi.mocked(supabase.rpc);
  const queryBuilder = (supabase as any)._builder;

  const FINANCIAL_ROLES: SystemRole[] = ['Owner', 'Admin', 'Manager', 'Coordinator', 'Accounts'];
  const MONEY_BLIND_ROLES: SystemRole[] = ['Warehouse', 'Technician', 'Driver'];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createShiftHandover — 9-role authorization and cash submission boundaries', () => {
    FINANCIAL_ROLES.forEach((role) => {
      it(`allows financial role (${role}) to submit cash counts and receive unmasked figures`, async () => {
        const mockRow = {
          id: `handover-${role.toLowerCase()}`,
          client_uuid: 'uuid-1',
          shift_code: 'A',
          from_user_name: `${role} User`,
          from_user_role: role,
          cash_counted_paisa: 1500000,
          cash_status: 'matched',
          cash_variance_paisa: 0,
          notes: 'Count verified',
          checklist: [],
        };
        mockRpc.mockResolvedValue({ data: mockRow, error: null } as any);

        const result = await createShiftHandover(
          {
            shiftCode: 'A',
            cashCountedPaisa: 1500000,
            cashStatus: 'matched',
            cashVariancePaisa: 0,
            notes: 'Count verified',
          },
          { userId: `u-${role}`, role }
        );

        expect(result.handover.cash_counted_paisa).toBe(1500000);
        expect(result.handover.cash_status).toBe('matched');
        expect(result.handover.cash_variance_paisa).toBe(0);
        expect(mockRpc).toHaveBeenCalledWith(
          'create_shift_handover',
          expect.objectContaining({
            p_cash_counted_paisa: 1500000,
            p_cash_status: 'matched',
            p_cash_variance_paisa: 0,
          })
        );
      });
    });

    MONEY_BLIND_ROLES.forEach((role) => {
      it(`strictly refuses cash submissions from money-blind role (${role})`, async () => {
        await expect(
          createShiftHandover(
            {
              shiftCode: 'A',
              cashCountedPaisa: 50000,
              notes: 'Attempting to submit cash as money-blind role',
            },
            { userId: `u-${role}`, role }
          )
        ).rejects.toThrow(ActionPermissionError);

        expect(mockRpc).not.toHaveBeenCalled();
      });

      it(`allows money-blind role (${role}) to create operational handovers with cash fields strictly masked to null`, async () => {
        // Even if underlying mock RPC mistakenly returned cash fields, the action layer enforces Law 6 masking
        const mockRowWithLeak = {
          id: `handover-${role.toLowerCase()}`,
          client_uuid: 'uuid-blind',
          shift_code: 'B',
          from_user_name: `${role} User`,
          from_user_role: role,
          cash_counted_paisa: 999900,
          cash_status: 'matched',
          cash_variance_paisa: 500,
          notes: 'Warehouse operational handover',
          checklist: [],
        };
        mockRpc.mockResolvedValue({ data: mockRowWithLeak, error: null } as any);

        const result = await createShiftHandover(
          {
            shiftCode: 'B',
            notes: 'Warehouse operational handover',
          },
          { userId: `u-${role}`, role }
        );

        expect(result.handover.id).toBe(`handover-${role.toLowerCase()}`);
        expect(result.handover.cash_counted_paisa).toBeNull();
        expect(result.handover.cash_status).toBeNull();
        expect(result.handover.cash_variance_paisa).toBeNull();
        expect(mockRpc).toHaveBeenCalledWith(
          'create_shift_handover',
          expect.objectContaining({
            p_cash_counted_paisa: null,
            p_cash_status: null,
            p_cash_variance_paisa: null,
          })
        );
      });
    });

    it('denies Client role with ActionPermissionError', async () => {
      await expect(
        createShiftHandover({ shiftCode: 'A' }, { userId: 'u-client', role: 'Client' })
      ).rejects.toThrow(ActionPermissionError);
    });

    it('denies anonymous call without session context', async () => {
      await expect(createShiftHandover({ shiftCode: 'A' })).rejects.toThrow(
        'was called without a session context'
      );
    });
  });

  describe('acknowledgeShiftHandover — 9-role masking and refusal boundaries', () => {
    FINANCIAL_ROLES.forEach((role) => {
      it(`returns cash figures to financial role (${role}) upon acknowledgement`, async () => {
        const mockRow = {
          id: 'handover-1',
          status: 'acknowledged',
          acknowledged_by: `u-${role}`,
          cash_counted_paisa: 750000,
          cash_status: 'matched',
          cash_variance_paisa: 0,
        };
        mockRpc.mockResolvedValue({ data: mockRow, error: null } as any);

        const result = await acknowledgeShiftHandover(
          { handoverId: 'handover-1', note: 'All good' },
          { userId: `u-${role}`, role }
        );

        expect(result.handover.cash_counted_paisa).toBe(750000);
        expect(result.handover.cash_status).toBe('matched');
      });
    });

    MONEY_BLIND_ROLES.forEach((role) => {
      it(`masks cash figures to null for money-blind role (${role}) upon acknowledgement`, async () => {
        const mockRow = {
          id: 'handover-1',
          status: 'acknowledged',
          acknowledged_by: `u-${role}`,
          cash_counted_paisa: 750000,
          cash_status: 'matched',
          cash_variance_paisa: 0,
        };
        mockRpc.mockResolvedValue({ data: mockRow, error: null } as any);

        const result = await acknowledgeShiftHandover(
          { handoverId: 'handover-1', note: 'Equipment confirmed' },
          { userId: `u-${role}`, role }
        );

        expect(result.handover.cash_counted_paisa).toBeNull();
        expect(result.handover.cash_status).toBeNull();
        expect(result.handover.cash_variance_paisa).toBeNull();
      });
    });

    it('denies Client role with ActionPermissionError', async () => {
      await expect(
        acknowledgeShiftHandover(
          { handoverId: 'handover-1' },
          { userId: 'u-client', role: 'Client' }
        )
      ).rejects.toThrow(ActionPermissionError);
    });

    it('denies anonymous session without context', async () => {
      await expect(
        acknowledgeShiftHandover({ handoverId: 'handover-1' })
      ).rejects.toThrow('was called without a session context');
    });
  });

  describe('archiveShiftHandover — 9-role masking and refusal boundaries', () => {
    FINANCIAL_ROLES.forEach((role) => {
      it(`returns cash figures to financial role (${role}) upon archiving`, async () => {
        const mockRow = {
          id: 'handover-1',
          status: 'archived',
          archived_by: `u-${role}`,
          cash_counted_paisa: 50000,
          cash_status: 'short',
          cash_variance_paisa: -200,
        };
        mockRpc.mockResolvedValue({ data: mockRow, error: null } as any);

        const result = await archiveShiftHandover(
          { handoverId: 'handover-1' },
          { userId: `u-${role}`, role }
        );

        expect(result.handover.cash_counted_paisa).toBe(50000);
        expect(result.handover.cash_status).toBe('short');
      });
    });

    MONEY_BLIND_ROLES.forEach((role) => {
      it(`masks cash figures to null for money-blind role (${role}) upon archiving`, async () => {
        const mockRow = {
          id: 'handover-1',
          status: 'archived',
          archived_by: `u-${role}`,
          cash_counted_paisa: 50000,
          cash_status: 'short',
          cash_variance_paisa: -200,
        };
        mockRpc.mockResolvedValue({ data: mockRow, error: null } as any);

        const result = await archiveShiftHandover(
          { handoverId: 'handover-1' },
          { userId: `u-${role}`, role }
        );

        expect(result.handover.cash_counted_paisa).toBeNull();
        expect(result.handover.cash_status).toBeNull();
        expect(result.handover.cash_variance_paisa).toBeNull();
      });
    });

    it('denies Client role with ActionPermissionError', async () => {
      await expect(
        archiveShiftHandover(
          { handoverId: 'handover-1' },
          { userId: 'u-client', role: 'Client' }
        )
      ).rejects.toThrow(ActionPermissionError);
    });

    it('denies anonymous session without context', async () => {
      await expect(
        archiveShiftHandover({ handoverId: 'handover-1' })
      ).rejects.toThrow('was called without a session context');
    });
  });

  describe('listShiftHandovers — 9-role list view sanitization', () => {
    const rawRows = [
      {
        id: 'h-1',
        shift_code: 'A',
        cash_counted_paisa: 120000,
        cash_status: 'matched',
        cash_variance_paisa: 0,
      },
      {
        id: 'h-2',
        shift_code: 'B',
        cash_counted_paisa: 54000,
        cash_status: 'short',
        cash_variance_paisa: -600,
      },
    ];

    FINANCIAL_ROLES.forEach((role) => {
      it(`preserves cash data for financial role (${role}) in listing`, async () => {
        queryBuilder.range.mockResolvedValue({ data: rawRows, error: null });

        const result = await listShiftHandovers({}, { userId: `u-${role}`, role });

        expect(result.handovers).toHaveLength(2);
        expect(result.handovers[0]?.cash_counted_paisa).toBe(120000);
        expect(result.handovers[1]?.cash_variance_paisa).toBe(-600);
      });
    });

    MONEY_BLIND_ROLES.forEach((role) => {
      it(`masks all cash data to null for money-blind role (${role}) in listing`, async () => {
        queryBuilder.range.mockResolvedValue({ data: rawRows, error: null });

        const result = await listShiftHandovers({}, { userId: `u-${role}`, role });

        expect(result.handovers).toHaveLength(2);
        result.handovers.forEach((h) => {
          expect(h.cash_counted_paisa).toBeNull();
          expect(h.cash_status).toBeNull();
          expect(h.cash_variance_paisa).toBeNull();
        });
      });
    });

    it('denies Client role with ActionPermissionError', async () => {
      await expect(
        listShiftHandovers({}, { userId: 'u-client', role: 'Client' })
      ).rejects.toThrow(ActionPermissionError);
    });

    it('denies anonymous session without context', async () => {
      await expect(listShiftHandovers({})).rejects.toThrow(
        'was called without a session context'
      );
    });
  });
});
