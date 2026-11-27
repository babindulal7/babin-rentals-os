import { describe, it, expect, vi, beforeEach } from 'vitest'

const { rpcMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
}))

vi.mock('../../../lib/supabase', () => ({
  supabase: { rpc: rpcMock },
}))

import { pinTeamNote } from '../pinTeamNote'

const ctx = { userId: 'usr-1', role: 'Coordinator' as const }
const NOTE_UUID = '22222222-2222-4222-8222-222222222222'

describe('pinTeamNote', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects empty or non-UUID noteId', async () => {
    await expect(pinTeamNote({ noteId: '' }, ctx)).rejects.toThrow(/Note ID is required/i)
    await expect(pinTeamNote({ noteId: 'bad' }, ctx)).rejects.toThrow(/Invalid note ID format/i)
  })

  it('calls pin_team_note RPC and returns pinned boolean', async () => {
    rpcMock.mockResolvedValueOnce({ data: false, error: null })
    const res = await pinTeamNote({ noteId: NOTE_UUID, pinned: false }, ctx)
    expect(rpcMock).toHaveBeenCalledWith('pin_team_note', { p_note_id: NOTE_UUID, p_pinned: false })
    expect(res).toEqual({ pinned: false })
  })
})
