import { describe, it, expect, vi, beforeEach } from 'vitest'

const { rpcMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
}))

vi.mock('../../../lib/supabase', () => ({
  supabase: { rpc: rpcMock },
}))

import { archiveTeamNote } from '../archiveTeamNote'

const ctx = { userId: 'usr-1', role: 'Coordinator' as const }
const NOTE_UUID = '11111111-1111-4111-8111-111111111111'

describe('archiveTeamNote', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects empty or non-UUID noteId', async () => {
    await expect(archiveTeamNote({ noteId: '' }, ctx)).rejects.toThrow(/Note ID is required/i)
    await expect(archiveTeamNote({ noteId: 'not-a-uuid' }, ctx)).rejects.toThrow(/Invalid note ID format/i)
  })

  it('calls archive_team_note RPC and returns archived boolean', async () => {
    rpcMock.mockResolvedValueOnce({ data: true, error: null })
    const res = await archiveTeamNote({ noteId: NOTE_UUID, archived: true }, ctx)
    expect(rpcMock).toHaveBeenCalledWith('archive_team_note', { p_note_id: NOTE_UUID, p_archived: true })
    expect(res).toEqual({ archived: true })
  })
})
