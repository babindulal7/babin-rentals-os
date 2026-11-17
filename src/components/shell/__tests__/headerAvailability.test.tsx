// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceProvider } from '../../../lib/workspaceContext'
import Header, { openAvailabilityModal } from '../Header'

const mock = vi.hoisted(() => ({ viewport: 'desktop', narrow: false }))
vi.mock('../../../lib/device', () => ({ useViewport: () => mock.viewport }))
vi.mock('../../../lib/headerRoom', () => ({ useCompactHeader: () => mock.viewport !== 'desktop' || mock.narrow }))
vi.mock('../../../lib/auth', () => ({ useAuth: () => ({ user: { name: 'Operator', role: 'Owner' }, logout: vi.fn(), lockNow: vi.fn(), hasPin: false }) }))
vi.mock('../../../lib/syncContext', () => ({ useSync: () => ({ status: 'synced', pendingCount: 0 }) }))
vi.mock('../../ui/CheckAvailabilityModal', () => ({
  CheckAvailabilityModal: ({ open, onClose }: { open: boolean; onClose: () => void }) => (
    open ? (
      <div data-testid="check-availability-modal">
        <span>Check availability modal mock</span>
        <button onClick={onClose}>Close modal</button>
      </div>
    ) : null
  ),
}))

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
let container: HTMLDivElement
let root: Root

beforeEach(() => {
  mock.viewport = 'desktop'
  mock.narrow = false
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

describe('Header — Availability in two taps (T3-22, W91)', () => {
  it('renders Availability button in desktop header and opens modal on click', async () => {
    mock.viewport = 'desktop'
    await act(async () => {
      root.render(
        <MemoryRouter>
          <WorkspaceProvider>
            <Header crumbs={[{ label: 'Dashboard' }]} />
          </WorkspaceProvider>
        </MemoryRouter>
      )
    })

    const availBtn = container.querySelector<HTMLButtonElement>('button[aria-label="Check Availability"]')
    expect(availBtn).not.toBeNull()
    expect(availBtn!.textContent).toContain('Availability')
    expect(availBtn!.title).toContain('Alt+A')

    // Click Availability button
    await act(async () => {
      availBtn!.click()
    })

    // Modal should be open
    expect(document.body.querySelector('[data-testid="check-availability-modal"]')).not.toBeNull()
  })

  it('opens modal on Alt+A keyboard shortcut', async () => {
    mock.viewport = 'desktop'
    await act(async () => {
      root.render(
        <MemoryRouter>
          <WorkspaceProvider>
            <Header crumbs={[{ label: 'Dashboard' }]} />
          </WorkspaceProvider>
        </MemoryRouter>
      )
    })

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', altKey: true }))
    })

    expect(document.body.querySelector('[data-testid="check-availability-modal"]')).not.toBeNull()
  })

  it('opens modal via openAvailabilityModal helper', async () => {
    mock.viewport = 'desktop'
    await act(async () => {
      root.render(
        <MemoryRouter>
          <WorkspaceProvider>
            <Header crumbs={[{ label: 'Dashboard' }]} />
          </WorkspaceProvider>
        </MemoryRouter>
      )
    })

    await act(async () => {
      openAvailabilityModal()
    })

    expect(document.body.querySelector('[data-testid="check-availability-modal"]')).not.toBeNull()
  })
})
