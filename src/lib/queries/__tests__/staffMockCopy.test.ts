import { describe, it, expect, vi } from 'vitest'

vi.hoisted(() => { vi.stubEnv('VITE_DATA_SOURCE', 'mock') })

import { IS_MOCK } from '../../supabase'
import { fetchStaffDirectory, revokeStaffPinFor, setStaffActive, setStaffRole } from '../staff'

/** Developer text: the view and table names, the environment variable and the mock corpus. */
const DEVELOPER_TEXT = /staff_directory_v|VITE_|supabase|mock corpus|\btable\b|\bview\b|_v\b/i

describe('Staff directory — mock-only messages are plain staff copy', () => {
  it('runs in the mock data source', () => {
    expect(IS_MOCK).toBe(true)
  })

  it('refuses the directory in plain words, naming no table, view or variable', async () => {
    const result = await fetchStaffDirectory()
    expect(result.kind).toBe('unavailable')
    if (result.kind !== 'unavailable') return
    expect(result.message).toBe('The staff list is not available in this preview. It loads only from the live system.')
    expect(result.message).not.toMatch(DEVELOPER_TEXT)
  })

  it('refuses each staff write in plain words', async () => {
    const messages = [
      (await revokeStaffPinFor('u-1')).error,
      (await setStaffRole('u-1', 'Manager')).error,
      (await setStaffActive('u-1', false)).error,
    ]
    expect(messages).toEqual([
      'Revoking a PIN is not available in this preview.',
      'Assigning a role is not available in this preview.',
      "Changing a staff account's status is not available in this preview.",
    ])
    for (const message of messages) expect(message).not.toMatch(DEVELOPER_TEXT)
  })
})
