// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

const getStatus = vi.fn()
const createToken = vi.fn()
const revokeToken = vi.fn()
const success = vi.fn()
let role = 'Owner'
vi.mock('../../../../lib/auth', () => ({
  useAuth: () => ({ user: { id: 'owner-1', role } }),
}))
vi.mock('../../../../components/ui/Toast', () => ({
  useToast: () => ({ showSuccessToast: success }),
}))
vi.mock('../../../../actions/delivery', () => ({
  getCalendarFeedTokenStatus: (...args: unknown[]) => getStatus(...args),
  createCalendarFeedToken: (...args: unknown[]) => createToken(...args),
  revokeCalendarFeedToken: (...args: unknown[]) => revokeToken(...args),
}))
vi.mock('../../../../lib/rbac', () => ({
  canCreateCalendarFeedToken: (r: string) => r === 'Owner',
  canRevokeCalendarFeedToken: (r: string) => r === 'Owner',
  canViewCalendarFeedTokenStatus: (r: string) => r !== 'Driver',
}))
vi.mock('../../../../components/ui/Page', () => ({
  Card: ({ title, children }: { title: string; children: React.ReactNode }) => <section aria-label={title}>{children}</section>,
  Button: ({ children, onClick, loading }: { children: React.ReactNode; onClick: () => void; loading?: boolean }) => <button disabled={loading} onClick={onClick}>{children}</button>,
}))
vi.mock('../../../../components/ui/Icon', () => ({ default: () => <span aria-hidden="true" /> }))
;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
const { CalendarFeedControl } = await import('../CalendarFeedControl')
let container: HTMLDivElement
let root: Root
async function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => { root.render(<CalendarFeedControl />) })
}
async function unmount() {
  if (root) await act(async () => { root.unmount() })
  container?.remove()
}
async function click(label: string) {
  const btn = [...container.querySelectorAll('button')].find(x => x.textContent?.includes(label))
  expect(btn, 'Expected button: ' + label).toBeTruthy()
  await act(async () => { btn!.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
}
describe('Calendar feed link recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    role = 'Owner'
    getStatus.mockResolvedValue({ hasToken: true, createdAt: '2026-11-01T00:00:00Z', revokedAt: null })
    createToken.mockResolvedValue({ rawToken: 'private-test-token' })
    revokeToken.mockResolvedValue({ revoked: true })
  })
  afterEach(async () => { await unmount() })
  it('explains an active but unrecoverable link without empty copy/open controls', async () => {
    await mount()
    expect(container.querySelector('[role="status"]')?.textContent).toContain('cannot be recovered')
    expect(container.querySelector('input')).toBeNull()
    expect(container.querySelector('a[href]')).toBeNull()
    expect(container.textContent).not.toContain('Show')
    expect(container.textContent).toContain('Revoke link')
  })
  it('shows a new URL after creation and hides it again after remount', async () => {
    getStatus.mockResolvedValue({ hasToken: false, createdAt: null, revokedAt: null })
    await mount()
    await click('Create calendar feed link')
    expect(container.querySelector('input')?.value).toContain('private-test-token')
    expect(container.querySelector('a[href]')?.getAttribute('href')).toContain('private-test-token')
    await unmount()
    getStatus.mockResolvedValue({ hasToken: true, createdAt: null, revokedAt: null })
    await mount()
    expect(container.querySelector('input')).toBeNull()
  })
  it('allows authorized revocation but does not expose it to a read-only role', async () => {
    await mount()
    await click('Revoke link')
    expect(revokeToken).toHaveBeenCalledTimes(1)
    await unmount()
    role = 'Billing'
    getStatus.mockResolvedValue({ hasToken: true, createdAt: null, revokedAt: null })
    await mount()
    expect(container.textContent).not.toContain('Revoke link')
    expect(container.querySelector('[role="status"]')?.textContent).toContain('authorized administrator')
  })
  it('does not expose feed controls to Driver', async () => {
    role = 'Driver'
    await mount()
    expect(getStatus).not.toHaveBeenCalled()
    expect(container.textContent).toContain('cannot view')
    expect(container.querySelector('input')).toBeNull()
  })
})
