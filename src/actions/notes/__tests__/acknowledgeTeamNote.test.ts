import { describe, it, expect, vi, beforeEach } from 'vitest';
import { acknowledgeTeamNote } from '../acknowledgeTeamNote';
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

describe('acknowledgeTeamNote', () => {
  const mockRpc = vi.mocked(supabase.rpc);
  const validContext = { userId: 'user-123', role: 'Coordinator' as const };
  const clientContext = { userId: 'client-123', role: 'Client' as const };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when called without context', async () => {
    await expect(acknowledgeTeamNote({ noteId: 'note-uuid' })).rejects.toThrow(
      'was called without a session context'
    );
  });

  it('throws ActionPermissionError for Client role', async () => {
    await expect(
      acknowledgeTeamNote({ noteId: 'note-uuid' }, clientContext)
    ).rejects.toThrow(ActionPermissionError);
  });

  it('throws validation error for missing noteId', async () => {
    await expect(
      acknowledgeTeamNote({ noteId: '' }, validContext)
    ).rejects.toThrow('Note ID is required');
  });

  it('throws validation error for invalid UUID format', async () => {
    await expect(
      acknowledgeTeamNote({ noteId: 'not-a-uuid' }, validContext)
    ).rejects.toThrow('Invalid note ID format');
  });

  it('acknowledges successfully for staff roles', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });

    const result = await acknowledgeTeamNote(
      { noteId: '123e4567-e89b-12d3-a456-426614174000' },
      validContext
    );

    expect(result).toEqual({ acknowledged: true });
    expect(mockRpc).toHaveBeenCalledWith('acknowledge_team_note', {
      p_note_id: '123e4567-e89b-12d3-a456-426614174000',
    });
  });

  it('returns false when already acknowledged', async () => {
    mockRpc.mockResolvedValue({ data: false, error: null });

    const result = await acknowledgeTeamNote(
      { noteId: '123e4567-e89b-12d3-a456-426614174000' },
      validContext
    );

    expect(result).toEqual({ acknowledged: false });
  });

  it('throws on RPC error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Note not found' } });

    await expect(
      acknowledgeTeamNote(
        { noteId: '123e4567-e89b-12d3-a456-426614174000' },
        validContext
      )
    ).rejects.toThrow('Failed to acknowledge team note: Note not found');
  });
});