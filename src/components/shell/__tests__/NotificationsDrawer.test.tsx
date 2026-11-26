// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import NotificationsDrawer from '../NotificationsDrawer'
import { _resetMockNotifications } from '../../../lib/queries/notifications'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

let mockCurrentUser: { id: string; name: string; role: string } | null = {
  id: '00000000-0000-4000-8000-00000000e001',
  name: 'Babin Dulal',
  role: 'Owner',
}

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({ user: mockCurrentUser }),
}))

vi.mock('../../../components/ui/Toast', () => ({
  useOptionalToast: () => ({
    showSuccessToast: vi.fn(),
    showErrorToast: vi.fn(),
  }),
}))

let root: Root | null = null

function render(ui: React.ReactNode): HTMLDivElement {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root?.render(ui)
  })
  return container
}

describe('NotificationsDrawer (T5-02)', () => {
  beforeEach(() => {
    _resetMockNotifications()
    mockCurrentUser = {
      id: '00000000-0000-4000-8000-00000000e001',
      name: 'Babin Dulal',
      role: 'Owner',
    }
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

  it('keeps its markup hidden when isOpen is false', () => {
    const container = render(
      <MemoryRouter>
        <NotificationsDrawer isOpen={false} onClose={vi.fn()} />
      </MemoryRouter>,
    )
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(container.querySelector('[hidden]')).not.toBeNull()
  })

  it('renders the drawer header, title, and notifications feed when isOpen is true', async () => {
    const container = render(
      <MemoryRouter>
        <NotificationsDrawer isOpen={true} onClose={vi.fn()} />
      </MemoryRouter>,
    )
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60))
    })

    expect(container.textContent).toContain('Notifications')
    expect(container.textContent).toContain('Mark all read')
    expect(container.textContent).toContain('All')
    expect(container.textContent).toContain('Unread')
  })

  it('restricts client seat with Client Portal message and email delivery notice', async () => {
    mockCurrentUser = {
      id: '00000000-0000-4000-8000-00000000c001',
      name: 'Client Contact',
      role: 'Client',
    }

    const container = render(
      <MemoryRouter>
        <NotificationsDrawer isOpen={true} onClose={vi.fn()} />
      </MemoryRouter>,
    )
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60))
    })

    expect(container.textContent).toContain('Client Portal')
    expect(container.textContent).toContain('Booking updates will be sent to your confirmed email address.')
  })

  it('calls onClose when close button is clicked', async () => {
    const onClose = vi.fn()
    const container = render(
      <MemoryRouter>
        <NotificationsDrawer isOpen={true} onClose={onClose} />
      </MemoryRouter>,
    )
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60))
    })

    const closeBtn = container.querySelector<HTMLButtonElement>('button[aria-label="Close notifications"]')
    expect(closeBtn).toBeDefined()
    act(() => {
      closeBtn?.click()
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('allows clicking Mark all read to clear unread notifications and disable the button', async () => {
    const container = render(
      <MemoryRouter>
        <NotificationsDrawer isOpen={true} onClose={vi.fn()} />
      </MemoryRouter>,
    )
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60))
    })

    const markAllBtn = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
      b.textContent?.includes('Mark all read'),
    )
    expect(markAllBtn).toBeDefined()
    expect(markAllBtn?.hasAttribute('disabled')).toBe(false)

    await act(async () => {
      markAllBtn?.click()
      await new Promise((r) => setTimeout(r, 60))
    })

    // After mark all read, unread count is 0 and button is disabled
    expect(container.textContent).toContain('Unread0')
    expect(markAllBtn?.hasAttribute('disabled')).toBe(true)
  })
})
