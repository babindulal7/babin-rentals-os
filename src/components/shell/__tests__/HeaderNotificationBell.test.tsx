// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import Header from '../Header'
import { WorkspaceProvider } from '../../../lib/workspaceContext'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

let mockUnreadCount = 0

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: '00000000-0000-4000-8000-00000000e001', name: 'Babin Dulal', role: 'Owner' },
    logout: vi.fn(),
    lockNow: vi.fn(),
    hasPin: false,
  }),
}))

vi.mock('../../../lib/device', () => ({
  useViewport: () => 'desktop',
}))

vi.mock('../../../lib/headerRoom', () => ({
  useCompactHeader: () => false,
}))

vi.mock('../../../lib/syncContext', () => ({
  useSync: () => ({ status: 'synced', pendingCount: 0 }),
}))

vi.mock('../../../lib/queries/notifications', () => ({
  getUnreadNotificationCount: vi.fn(() => Promise.resolve(mockUnreadCount)),
  fetchNotifications: vi.fn(() => Promise.resolve([])),
  getMockNotifications: vi.fn(() => []),
  markNotificationAsRead: vi.fn(),
  markAllNotificationsAsRead: vi.fn(() => Promise.resolve(0)),
  subscribeToNotificationChanges: vi.fn(() => () => {}),
  _resetMockNotifications: vi.fn(),
}))

let root: Root | null = null

function renderHeader(): HTMLDivElement {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root?.render(
      <MemoryRouter>
        <WorkspaceProvider>
          <Header crumbs={[{ label: 'Today' }]} />
        </WorkspaceProvider>
      </MemoryRouter>,
    )
  })
  return container
}

describe('HeaderNotificationBell (T5-02)', () => {
  beforeEach(() => {
    mockUnreadCount = 0
  })

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount()
      })
      root = null
    }
    document.body.innerHTML = ''
  })

  it('renders notification bell button in header with 44px min target', async () => {
    mockUnreadCount = 0
    const container = renderHeader()
    await act(async () => {
      await new Promise((r) => setTimeout(r, 40))
    })

    const bellBtn = container.querySelector<HTMLButtonElement>('button[aria-label="Notifications"]')
    expect(bellBtn).not.toBeNull()
    expect(bellBtn?.style.minWidth).toBe('44px')
    expect(bellBtn?.style.minHeight).toBe('44px')
    expect(container.querySelector('.header-notification-badge')).toBeNull()
  })

  it('renders numeric badge when unread notifications exist, never colour alone', async () => {
    mockUnreadCount = 5
    const container = renderHeader()
    await act(async () => {
      await new Promise((r) => setTimeout(r, 40))
    })

    const bellBtn = container.querySelector<HTMLButtonElement>('button[aria-label="Notifications (5 unread)"]')
    expect(bellBtn).not.toBeNull()
    const badge = container.querySelector('.header-notification-badge')
    expect(badge).not.toBeNull()
    expect(badge?.textContent).toBe('5')
  })

  it('displays 99+ when unread count exceeds 99', async () => {
    mockUnreadCount = 142
    const container = renderHeader()
    await act(async () => {
      await new Promise((r) => setTimeout(r, 40))
    })

    const bellBtn = container.querySelector<HTMLButtonElement>('button[aria-label="Notifications (142 unread)"]')
    expect(bellBtn).not.toBeNull()
    const badge = container.querySelector('.header-notification-badge')
    expect(badge?.textContent).toBe('99+')
  })

  it('opens notification centre drawer when bell button is clicked', async () => {
    await import('../NotificationsDrawer')
    mockUnreadCount = 2
    const container = renderHeader()
    await act(async () => {
      await new Promise((r) => setTimeout(r, 40))
    })

    const bellBtn = container.querySelector<HTMLButtonElement>('button[aria-label="Notifications (2 unread)"]')
    expect(bellBtn).not.toBeNull()

    await act(async () => {
      bellBtn?.click()
    })

    // Allow React.lazy dynamic import to resolve
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100))
    })

    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
  })
})
