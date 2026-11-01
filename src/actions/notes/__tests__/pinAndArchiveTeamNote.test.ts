import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pinTeamNote } from '../pinTeamNote';
import { archiveTeamNote } from '../archiveTeamNote';
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

describe('pinTeamNote and archiveTeamNote', () => {
  const mockRpc = vi.mocked(supabase.rpc);
  const warehouseContext = { userId: 'warehouse-123', role: 'Warehouse' as const };
  const clientContext = { userId: 'client-123', role: 'Client' as const };
  const noteId = '123e4567-e89b-12d3-a456-426614174000';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('pinTeamNote', () => {
    it('throws when called without context', async () => {
      await expect(pinTeamNote({ noteId })).rejects.toThrow('was called without a session context');
    });

    it('throws ActionPermissionError for Client role', async () => {
      await expect(pinTeamNote({ noteId }, clientContext)).rejects.toThrow(ActionPermissionError);
    });

    it('pins note successfully for Warehouse staff', async () => {
      mockRpc.mockResolvedValue({ data: true, error: null } as any);
      const res = await pinTeamNote({ noteId, pinned: true }, warehouseContext);
      expect(res.pinned).toBe(true);
      expect(mockRpc).toHaveBeenCalledWith('pin_team_note', {
        p_note_id: noteId,
        p_pinned: true,
      });
    });

    it('unpins note successfully for Warehouse staff', async () => {
      mockRpc.mockResolvedValue({ data: false, error: null } as any);
      const res = await pinTeamNote({ noteId, pinned: false }, warehouseContext);
      expect(res.pinned).toBe(false);
      expect(mockRpc).toHaveBeenCalledWith('pin_team_note', {
        p_note_id: noteId,
        p_pinned: false,
      });
    });
  });

  describe('archiveTeamNote', () => {
    it('throws when called without context', async () => {
      await expect(archiveTeamNote({ noteId })).rejects.toThrow('was called without a session context');
    });

    it('throws ActionPermissionError for Client role', async () => {
      await expect(archiveTeamNote({ noteId }, clientContext)).rejects.toThrow(ActionPermissionError);
    });

    it('archives note successfully for Warehouse staff (Law 3: archive, never delete)', async () => {
      mockRpc.mockResolvedValue({ data: true, error: null } as any);
      const res = await archiveTeamNote({ noteId, archived: true }, warehouseContext);
      expect(res.archived).toBe(true);
      expect(mockRpc).toHaveBeenCalledWith('archive_team_note', {
        p_note_id: noteId,
        p_archived: true,
      });
    });
  });
});
