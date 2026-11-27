import { describe, it, expect, vi, beforeEach } from 'vitest'

const { logAuditEventMock } = vi.hoisted(() => ({
  logAuditEventMock: vi.fn(),
}))

vi.mock('../audit', () => ({
  logAuditEvent: logAuditEventMock,
}))

import { recordLogin, recordLogout } from '../authAudit'

describe('authAudit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    logAuditEventMock.mockResolvedValue({ ok: true })
  })

  it('recordLogin emits auth.login audit event', () => {
    recordLogin('usr-1', '2026-11-26T00:00:00Z')
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventClass: 'session',
        category: 'Authentication',
        module: 'Authentication',
        action: 'Login',
        tableName: 'auth.sessions',
        recordId: 'usr-1',
        actorId: 'usr-1',
        newValues: { event: 'auth.login' },
      }),
    )
  })

  it('recordLogout is a no-op when userId is null and resolves when audit completes', async () => {
    await recordLogout(null)
    expect(logAuditEventMock).not.toHaveBeenCalled()

    await recordLogout('usr-1', 500)
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'Logout',
        recordId: 'usr-1',
        newValues: { event: 'auth.logout' },
      }),
    )
  })
})
