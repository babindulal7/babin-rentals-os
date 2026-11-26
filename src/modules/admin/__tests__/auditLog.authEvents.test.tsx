// @vitest-environment jsdom
/**
 * Auth events read as a person names them. A Login or Logout row stores the namespaced code (`auth.login`,
 * `auth.logout`) in `new_values.event`. The audit page shows Login or Logout in its place, and the code stays
 * in the stored record, so no visible text carries it.
 *
 * Environment pragma per `vitest.config.ts`, which keeps the suite on `node`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import type { Viewport } from '../../../lib/device'
import type { AuditEventListRow } from '../../../lib/queries/audit'

let viewport: Viewport = 'desktop'

vi.mock('../../../lib/device', async (orig) => ({
  ...(await orig<typeof import('../../../lib/device')>()),
  useViewport: () => viewport,
  useCapability: () => ({ coarsePointer: false, hasHover: true, standalone: false, reducedMotion: false }),
}))
vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({ user: { id: 'USR-TEST', name: 'Tester', role: 'Owner', isSharedDevice: false } }),
}))

const SESSION_ID = '8788b5fd-3e7f-4832-b14c-bc8298ef1b11'

/** The two rows `authAudit.ts` writes for one session: a Login, then its Logout. */
const AUTH_ROWS: AuditEventListRow[] = [
  {
    id: 'ae-login-1',
    createdAtAd: '2026-11-24T03:29:00.000Z',
    actorId: SESSION_ID,
    actorRole: 'Owner',
    action: 'Login',
    module: 'Authentication',
    category: 'Authentication',
    eventClass: 'session',
    severity: 'Informational',
    status: 'Success',
    tableName: 'auth.sessions',
    recordId: SESSION_ID,
    branchId: null,
    ipAddress: null,
    userAgent: null,
    deviceType: 'Desktop',
    oldValues: null,
    newValues: { event: 'auth.login' },
    diff: null,
    reason: null,
  },
  {
    id: 'ae-logout-1',
    createdAtAd: '2026-11-24T04:10:00.000Z',
    actorId: SESSION_ID,
    actorRole: 'Owner',
    action: 'Logout',
    module: 'Authentication',
    category: 'Authentication',
    eventClass: 'session',
    severity: 'Informational',
    status: 'Success',
    tableName: 'auth.sessions',
    recordId: SESSION_ID,
    branchId: null,
    ipAddress: null,
    userAgent: null,
    deviceType: 'Desktop',
    oldValues: null,
    newValues: { event: 'auth.logout' },
    diff: null,
    reason: null,
  },
]

vi.mock('../../../lib/queries/audit', async (orig) => ({
  ...(await orig<typeof import('../../../lib/queries/audit')>()),
  listAuditEvents: vi.fn(async () => ({ rows: AUTH_ROWS, total: AUTH_ROWS.length })),
}))

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const { default: AuditLog } = await import('../AuditLog')

let container: HTMLDivElement
let root: Root

async function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<MemoryRouter><AuditLog /></MemoryRouter>)
  })
  /* The trail resolves `listAuditEvents` in an effect; let the mocked read land. */
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await Promise.resolve()
    })
  }
}

beforeEach(() => {
  viewport = 'desktop'
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

describe('auth events read as Login and Logout', () => {
  it('shows Login in the before → after cell, never the stored code', async () => {
    await mount()
    expect(container.textContent).toContain('Login')
    expect(container.textContent).not.toContain('auth.login')
    expect(container.textContent).not.toContain('auth.logout')
  })

  it('shows Logout in the expanded detail, never the stored code', async () => {
    await mount()
    /* The row disclosures only; the page header carries its own aria-expanded buttons. */
    const disclosures = [...container.querySelectorAll<HTMLButtonElement>('button[aria-label*="change detail for"]')]
    expect(disclosures.length).toBe(2)
    await act(async () => {
      disclosures[1]?.click()
    })
    expect(disclosures[1]?.getAttribute('aria-expanded')).toBe('true')
    const detail = container.querySelector('dl')
    expect(detail?.textContent).toContain('Logout')
    expect(detail?.textContent).not.toContain('auth.logout')
  })

  it('reads the same on a phone card', async () => {
    viewport = 'phone'
    await mount()
    expect(container.textContent).toContain('Login')
    expect(container.textContent).not.toContain('auth.login')
  })
})
