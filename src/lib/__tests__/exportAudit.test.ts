import { describe, it, expect, vi, beforeEach } from 'vitest'

const { logAuditEventMock, getSessionMock } = vi.hoisted(() => ({
  logAuditEventMock: vi.fn(),
  getSessionMock: vi.fn(),
}))

vi.mock('../audit', () => ({
  logAuditEvent: logAuditEventMock,
}))

vi.mock('../supabase', () => ({
  supabase: {
    auth: {
      getSession: getSessionMock,
    },
  },
}))

import { recordExport } from '../exportAudit'

describe('exportAudit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    logAuditEventMock.mockResolvedValue({ ok: true })
    getSessionMock.mockResolvedValue({ data: { session: { user: { id: 'usr-42' } } } })
  })

  it('records export.created with Medium severity when includesPii is true', async () => {
    recordExport({
      list: 'clients',
      module: 'Clients',
      rowCount: 15,
      columns: ['name', 'phone'],
      filter: 'active',
      includesPii: true,
      scope: 'current_page',
    })

    await vi.waitFor(() => {
      expect(logAuditEventMock).toHaveBeenCalledTimes(1)
    })

    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'Export',
        module: 'Clients',
        severity: 'Medium',
        tableName: 'export:clients',
        actorId: 'usr-42',
        newValues: expect.objectContaining({
          event: 'export.created',
          list: 'clients',
          rowCount: 15,
          columns: ['name', 'phone'],
          includesPii: true,
          scope: 'current_page',
        }),
      }),
    )
  })

  it('falls back to null actorId when getSession throws and uses Informational severity without PII', async () => {
    getSessionMock.mockRejectedValueOnce(new Error('no session'))

    recordExport({
      list: 'inventory',
      module: 'Inventory',
      rowCount: 4,
    })

    await vi.waitFor(() => {
      expect(logAuditEventMock).toHaveBeenCalledTimes(1)
    })

    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'Informational',
        tableName: 'export:inventory',
        actorId: null,
      }),
    )
  })
})
