import { describe, it, expect, vi, beforeEach } from 'vitest'

const logAuditEvent = vi.fn(async (_params: unknown) => ({ ok: true, error: null }))
vi.mock('../audit', () => ({
  logAuditEvent: (params: unknown) => logAuditEvent(params),
}))

const maybeSingle = vi.fn()
vi.mock('../supabase', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => maybeSingle() }) }) }),
  },
}))

const { recordLogin, recordLogout, authEventLabel } = await import('../authAudit')

/** Lets the fire-and-forget role read and the audit write settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('login and logout audit rows name the actor role', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('writes the Login row with the signed-in role read from the staff row', async () => {
    maybeSingle.mockResolvedValue({ data: { primary_role: 'Owner' }, error: null })
    recordLogin('owner-1', 'stamp-login-1')
    await settle()
    expect(logAuditEvent).toHaveBeenCalledTimes(1)
    expect(logAuditEvent.mock.calls[0]?.[0]).toMatchObject({
      action: 'Login',
      actorId: 'owner-1',
      recordId: 'owner-1',
      actorRole: 'Owner',
      newValues: { event: 'auth.login' },
    })
  })

  it('writes the Logout row with the signed-in role read from the staff row when no role is passed', async () => {
    maybeSingle.mockResolvedValue({ data: { primary_role: 'Admin' }, error: null })
    await recordLogout('admin-1')
    expect(maybeSingle).toHaveBeenCalledTimes(1)
    expect(logAuditEvent.mock.calls[0]?.[0]).toMatchObject({
      action: 'Logout',
      actorId: 'admin-1',
      actorRole: 'Admin',
      newValues: { event: 'auth.logout' },
    })
  })

  it('still writes the row, with a null role, when the role cannot be read', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: 'read refused' } })
    await recordLogout('owner-2')
    expect(logAuditEvent).toHaveBeenCalledTimes(1)
    expect(logAuditEvent.mock.calls[0]?.[0]).toMatchObject({ action: 'Logout', actorId: 'owner-2', actorRole: null })
  })

  it('does not write a row for a logout with no signed-in user', async () => {
    await recordLogout(null)
    expect(logAuditEvent).not.toHaveBeenCalled()
  })
})

describe('the Logout insert is not held behind a staff-row read', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('issues the insert at once when the leaving role is passed, while a read would still be pending', async () => {
    maybeSingle.mockReturnValue(new Promise(() => {})) // a staff-row read that never settles
    const done = recordLogout('owner-3', 'Owner')
    /* Synchronous: the insert is already issued before recordLogout returns, and no read was made. */
    expect(logAuditEvent).toHaveBeenCalledTimes(1)
    expect(maybeSingle).not.toHaveBeenCalled()
    expect(logAuditEvent.mock.calls[0]?.[0]).toMatchObject({ action: 'Logout', actorId: 'owner-3', actorRole: 'Owner' })
    await expect(done).resolves.toBeUndefined()
  })

  it('treats a null role as not passed, so the staff row is read', async () => {
    maybeSingle.mockResolvedValue({ data: { primary_role: 'Owner' }, error: null })
    await recordLogout('owner-4', null)
    expect(maybeSingle).toHaveBeenCalledTimes(1)
    expect(logAuditEvent.mock.calls[0]?.[0]).toMatchObject({ actorRole: 'Owner' })
  })

  it('stays bounded when the fallback read hangs, so sign-out is never held', async () => {
    maybeSingle.mockReturnValue(new Promise(() => {}))
    await expect(recordLogout('owner-5', undefined, 5)).resolves.toBeUndefined()
  })
})

describe('auth event codes have a staff-facing label', () => {
  it('labels login and logout, and nothing else', () => {
    expect(authEventLabel('auth.login')).toBe('Login')
    expect(authEventLabel('auth.logout')).toBe('Logout')
    expect(authEventLabel('auth.something-else')).toBeNull()
    expect(authEventLabel(undefined)).toBeNull()
  })

  it('labels every event code the writers store', async () => {
    maybeSingle.mockResolvedValue({ data: { primary_role: 'Owner' }, error: null })
    recordLogin('owner-6', 'stamp-label-1')
    await recordLogout('owner-6', 'Owner')
    await settle()
    const codes = logAuditEvent.mock.calls.map((c) => (c[0] as { newValues: { event: string } }).newValues.event)
    expect(codes.sort()).toEqual(['auth.login', 'auth.logout'])
    for (const code of codes) expect(authEventLabel(code)).not.toBeNull()
  })
})
