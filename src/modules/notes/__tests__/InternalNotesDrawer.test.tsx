// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import InternalNotesDrawer from '../InternalNotesDrawer'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

vi.mock('../../../lib/supabase', () => ({
  IS_MOCK: true,
  supabase: {},
}))

// A real SystemRole, switchable per test. Coordinator is the lowest role that may post (R-0111-1).
const authState = vi.hoisted(() => ({ role: 'Coordinator' as string }))
vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({ user: { id: 'usr-1', name: 'Babin Dulal', role: authState.role } }),
}))

vi.mock('../../../components/ui/Toast', () => ({
  useOptionalToast: () => ({
    showSuccessToast: vi.fn(),
    showErrorToast: vi.fn(),
  }),
}))

let root: Root | null = null

function render(ui: React.ReactNode) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root?.render(ui)
  })
  return container
}

describe('InternalNotesDrawer', () => {
  beforeEach(() => {
    localStorage.clear()
    authState.role = 'Coordinator'
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

  it.each(['Warehouse', 'Technician', 'Driver', 'Accounts'])(
    'shows a read-and-acknowledge notice instead of the composer for %s (R-0111-1)',
    (role) => {
      authState.role = role
      render(
        <MemoryRouter>
          <InternalNotesDrawer isOpen={true} onClose={vi.fn()} />
        </MemoryRouter>,
      )
      expect(document.querySelector('[data-testid="note-composer-restricted"]')).not.toBeNull()
      expect(document.body.textContent).toContain('Read and acknowledge only.')
      expect(document.querySelector('textarea')).toBeNull()
    },
  )

  it.each(['Coordinator', 'Manager', 'Admin', 'Owner'])('shows the composer for %s', (role) => {
    authState.role = role
    render(
      <MemoryRouter>
        <InternalNotesDrawer isOpen={true} onClose={vi.fn()} />
      </MemoryRouter>,
    )
    expect(document.querySelector('[data-testid="note-composer-restricted"]')).toBeNull()
    expect(document.querySelector('textarea')).not.toBeNull()
  })

  it('keeps its draft mounted but hidden when isOpen is false', () => {
    const container = render(
      <MemoryRouter>
        <InternalNotesDrawer isOpen={false} onClose={vi.fn()} />
      </MemoryRouter>,
    )
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(container.querySelector('[hidden]')).not.toBeNull()
  })

  it('renders the drawer dialog, header, and notes feed when isOpen is true', () => {
    const container = render(
      <MemoryRouter>
        <InternalNotesDrawer isOpen={true} onClose={vi.fn()} />
      </MemoryRouter>,
    )
    expect(container.textContent).toContain('Team Internal Notes')
    expect(container.textContent).toContain('Open Team Notes page')
    expect(container.textContent).toContain('Shift Handover')
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    const container = render(
      <MemoryRouter>
        <InternalNotesDrawer isOpen={true} onClose={onClose} />
      </MemoryRouter>,
    )

    const closeBtn = container.querySelector('button[aria-label="Close team internal notes"]') as HTMLButtonElement
    expect(closeBtn).toBeDefined()
    act(() => {
      closeBtn.click()
    })
    expect(onClose).toHaveBeenCalled()
  })
})
