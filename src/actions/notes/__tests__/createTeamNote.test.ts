import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTeamNote } from '../createTeamNote';
import { ActionNotImplementedError, ActionPermissionError } from '../../core';
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

describe('createTeamNote', () => {
  const mockRpc = vi.mocked(supabase.rpc);
  const validContext = { userId: 'user-123', role: 'Coordinator' as const };
  const ownerContext = { userId: 'owner-123', role: 'Owner' as const };
  const staffRoles = [
    'Owner', 'Admin', 'Manager', 'Coordinator',
    'Warehouse', 'Technician', 'Accounts', 'Driver',
  ] as const;
  const clientContext = { userId: 'client-123', role: 'Client' as const };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is implemented, so it does not throw ActionNotImplementedError', async () => {
    mockRpc.mockResolvedValue({ data: 'note-uuid-123', error: null } as any);
    await expect(createTeamNote({ body: 'Test note' }, ownerContext)).resolves.not.toBeInstanceOf(
      ActionNotImplementedError
    );
  });

  it('throws when called without context', async () => {
    await expect(createTeamNote({ body: 'Test note' })).rejects.toThrow(
      'was called without a session context'
    );
  });

  it.each(staffRoles)('allows authenticated %s staff to create team notes', async (role) => {
    const id = `note-${role}`;
    mockRpc.mockResolvedValue({ data: id, error: null } as any);

    const result = await createTeamNote(
      { body: 'Operational team note' },
      { userId: `staff-${role}`, role }
    );

    expect(result.noteId).toBe(id);
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it('throws ActionPermissionError for Client role without sending an RPC', async () => {
    await expect(
      createTeamNote({ body: 'Test note' }, clientContext)
    ).rejects.toThrow(ActionPermissionError);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('throws validation error for empty body', async () => {
    await expect(createTeamNote({ body: '' }, validContext)).rejects.toThrow(
      'Note body cannot be empty'
    );
    await expect(createTeamNote({ body: '   ' }, validContext)).rejects.toThrow(
      'Note body cannot be empty'
    );
  });

  it('throws validation error for body exceeding 10,000 characters', async () => {
    const longBody = 'a'.repeat(10001);
    await expect(createTeamNote({ body: longBody }, validContext)).rejects.toThrow(
      'Note body exceeds maximum length'
    );
  });

  it('creates note successfully for Coordinator role with full metadata', async () => {
    mockRpc.mockResolvedValue({ data: 'note-uuid-123', error: null } as any);

    const result = await createTeamNote(
      {
        body: 'Shift handover note',
        clientUuid: '123e4567-e89b-12d3-a456-426614174000',
        category: 'Shift Handover',
        priority: 'high',
        referenceId: 'BR-2613',
        pinned: true,
      },
      validContext
    );

    expect(result).toEqual({ noteId: 'note-uuid-123' });
    expect(mockRpc).toHaveBeenCalledWith('create_team_note', {
      p_body: 'Shift handover note',
      p_client_uuid: '123e4567-e89b-12d3-a456-426614174000',
      p_category: 'Shift Handover',
      p_priority: 'high',
      p_reference_id: 'BR-2613',
      p_reference_ids: [],
      p_pinned: true,
    });
  });

  it('throws on RPC error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'DB error' } } as any);

    await expect(createTeamNote({ body: 'Test note' }, validContext)).rejects.toThrow(
      'Failed to create team note: DB error'
    );
  });
});
