// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { TeamNotesPanel } from '../TeamNotesPanel'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const staffRoles = [
  'Owner', 'Admin', 'Manager', 'Coordinator',
  'Warehouse', 'Technician', 'Accounts', 'Driver',
] as const

let currentUser: { id: string; role: (typeof staffRoles)[number] | 'Client' } = {
  id: 'staff-1',
  role: 'Warehouse',
}

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({ user: currentUser }),
}))

vi.mock('../../../actions/notes', () => ({
  listTeamNotes: vi.fn(async () => ({ notes: [] })),
  createTeamNote: vi.fn(async () => ({ noteId: 'new-note-1' })),
  acknowledgeTeamNote: vi.fn(async () => ({ acknowledged: true })),
}))

describe('TeamNotesPanel — owner-approved all-staff create permission', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => { root.unmount() })
    container.remove()
    vi.clearAllMocks()
  })

  it.each(staffRoles)('shows the New Note action for authenticated %s staff', async (role) => {
    currentUser = { id: `user-${role}`, role }
    await act(async () => {
      root.render(<TeamNotesPanel autoRefresh={false} />)
    })

    const newNoteButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('New Note'),
    )
    expect(newNoteButton).toBeDefined()
    expect(container.textContent).toContain('Notes are seen by all staff.')
  })

  it('does not render a Team Notes composer/action for Client', async () => {
    currentUser = { id: 'client-1', role: 'Client' }
    await act(async () => {
      root.render(<TeamNotesPanel autoRefresh={false} />)
    })

    expect(container.textContent).toContain('Team notes are available to staff members only.')
    expect(container.textContent).not.toContain('New Note')
    expect(container.querySelector('form')).toBeNull()
  })
})
