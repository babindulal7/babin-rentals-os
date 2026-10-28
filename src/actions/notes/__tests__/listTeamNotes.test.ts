import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listTeamNotes, type TeamNoteRow } from '../listTeamNotes';
import { ActionPermissionError } from '../../core';
import { supabase } from '../../../../lib/supabase';

// Mock supabase
vi.mock('../../../../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

describe('listTeamNotes', () => {
  const mockRpc = vi.mocked(supabase.rpc);
  const validContext = { userId: 'user-123', role: 'Coordinator' as const };
  const clientContext = { userId: 'client-123', role: 'Client' as const };

  const mockNotes: TeamNoteRow[] = [
    {
      id: '111e4567-e89b-12d3-a456-426614174000',
      body: 'First note',
      author_id: 'author-1',
      created_at: '2026-10-28T10:00:00Z',
      acknowledged_by: ['user-123'],
    },
    {
      id: '222e4567-e89b-12d3-a456-426614174000',
      body: 'Second note',
      author_id: 'author-2',
      created_at: '2026-10-28T09:00:00Z',
      acknowledged_by: [],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when called without context', async () => {
    await expect(listTeamNotes({})).rejects.toThrow(
      'was called without a session context'
    );
  });

  it('throws ActionPermissionError for Client role', async () => {
    await expect(listTeamNotes({}, clientContext)).rejects.toThrow(ActionPermissionError);
  });

  it('throws validation error for limit < 1', async () => {
    await expect(listTeamNotes({ limit: 0 }, validContext)).rejects.toThrow('Limit must be between 1 and 100');
  });

  it('throws validation error for limit > 100', async () => {
    await expect(listTeamNotes({ limit: 101 }, validContext)).rejects.toThrow('Limit must be between 1 and 100');
  });

  it('throws validation error for negative offset', async () => {
    await expect(listTeamNotes({ offset: -1 }, validContext)).rejects.toThrow('Offset cannot be negative');
  });

  it('lists notes with defaults', async () => {
    mockRpc.mockResolvedValue({ data: mockNotes, error: null });

    const result = await listTeamNotes({}, validContext);

    expect(result).toEqual({ notes: mockNotes });
    expect(mockRpc).toHaveBeenCalledWith('list_team_notes', {
      p_limit: 50,
      p_offset: 0,
    });
  });

  it('respects custom limit and offset', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });

    await listTeamNotes({ limit: 10, offset: 20 }, validContext);

    expect(mockRpc).toHaveBeenCalledWith('list_team_notes', {
      p_limit: 10,
      p_offset: 20,
    });
  });

  it('returns empty array when no notes', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    const result = await listTeamNotes({}, validContext);

    expect(result).toEqual({ notes: [] });
  });

  it('throws on RPC error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Permission denied' } });

    await expect(listTeamNotes({}, validContext)).rejects.toThrow('Failed to list team notes: Permission denied');
  });
});