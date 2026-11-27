import { describe, it, expect, vi, beforeEach } from 'vitest'

const { fromMock, insertMock, updateMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  insertMock: vi.fn(),
  updateMock: vi.fn(),
}))

vi.mock('../supabase', () => ({
  supabase: {
    from: fromMock,
  },
}))

vi.mock('../offlineQueue', () => ({
  enqueueMutation: vi.fn(async () => {}),
}))

import { generateClientUuid, NON_MONEY_RETURNING_COLUMNS, safeUpdate } from '../dataAccess'

describe('dataAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('generates valid v4 UUIDs and locks non-money returning columns for Law 6 tables', () => {
    const uuid = generateClientUuid()
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    expect(NON_MONEY_RETURNING_COLUMNS.bookings).toBeDefined()
    expect(NON_MONEY_RETURNING_COLUMNS.products).toBeDefined()
    expect(NON_MONEY_RETURNING_COLUMNS.bookings).not.toContain('total_amount')
  })

  it('refuses safeUpdate on immutable append-only tables (Law 3/4)', async () => {
    await expect(
      safeUpdate('payments', 'pay-1', {} as never, 'uuid-1'),
    ).rejects.toThrow(/immutable/i)
    await expect(
      safeUpdate('audit_events', 'aud-1', {} as never, 'uuid-2'),
    ).rejects.toThrow(/immutable/i)
    expect(fromMock).not.toHaveBeenCalled()
    expect(insertMock).not.toHaveBeenCalled()
    expect(updateMock).not.toHaveBeenCalled()
  })
})
