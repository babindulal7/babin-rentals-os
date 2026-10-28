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
  const warehouseContext = { userId: 'warehouse-123', role: 'Warehouse' as const };
  const clientContext = { userId: 'client-123', role: 'Client' as const };

  const rpcOk = (data: unknown) => ({ data, error: null, count: null, status: 200, statusText: 'OK' } as any);
  const rpcErr = (message: string) => ({ data: null, error: { message, details: '', hint: '', code: '42000', name: 'PostgrestError', toJSON: () => ({}) }, count: null, status: 400, statusText: 'Error' } as any);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is implemented, so it does not throw ActionNotImplementedError', async () => {
    mockRpc.mockResolvedValue(rpcOk('note-uuid-123'));
    await expect(createTeamNote({ body: 'Test note' }, ownerContext)).resolves.not.toBeInstanceOf(
      ActionNotImplementedError
    );
  });

  it('throws when called without context', async () => {
    await expect(createTeamNote({ body: 'Test note' })).rejects.toThrow(
      'was called without a session context'
    );
  });

  it('throws ActionPermissionError for Warehouse role', async () => {
    await expect(
      createTeamNote({ body: 'Test note' }, warehouseContext)
    ).rejects.toThrow(ActionPermissionError);
  });

  it('throws ActionPermissionError for Client role', async () => {
    await expect(
      createTeamNote({ body: 'Test note' }, clientContext)
    ).rejects.toThrow(ActionPermissionError);
  });

  it('throws validation error for empty body', async () => {
    await expect(
      createTeamNote({ body: '' }, ownerContext)
    ).rejects.toThrow('Note body cannot be empty');
  });

  it('throws validation error for body too long', async () => {
    const longBody = 'x'.repeat(10001);
    await expect(
      createTeamNote({ body: longBody }, ownerContext)
    ).rejects.toThrow('Note body exceeds maximum length');
  });

  it('creates note successfully for Owner', async () => {
    mockRpc.mockResolvedValue(rpcOk('note-uuid-123'));

    const result = await createTeamNote({ body: 'Test note' }, ownerContext);

    expect(result).toEqual({ noteId: 'note-uuid-123' });
    expect(mockRpc).toHaveBeenCalledWith('create_team_note', {
      p_body: 'Test note',
    });
  });

  it('creates note successfully for Coordinator', async () => {
    mockRpc.mockResolvedValue(rpcOk('note-uuid-456'));

    const result = await createTeamNote({ body: 'Coordinator note' }, validContext);

    expect(result).toEqual({ noteId: 'note-uuid-456' });
  });

  it('trims whitespace from body', async () => {
    mockRpc.mockResolvedValue(rpcOk('note-uuid-789'));

    await createTeamNote({ body: '  Trimmed note  ' }, ownerContext);

    expect(mockRpc).toHaveBeenCalledWith('create_team_note', {
      p_body: 'Trimmed note',
    });
  });

  it('throws on RPC error', async () => {
    mockRpc.mockResolvedValue(rpcErr('DB error'));

    await expect(
      createTeamNote({ body: 'Test note' }, ownerContext)
    ).rejects.toThrow('Failed to create team note: DB error');
  });
});