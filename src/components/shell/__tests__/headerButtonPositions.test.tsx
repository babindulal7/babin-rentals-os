// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceProvider } from '../../../lib/workspaceContext'
import { PageHeader } from '../../ui/header/PageHeader'
import { PageActions } from '../../ui/PageActions'
import { GlobalAddMenu } from '../../ui/creation/GlobalAddMenu'
import { FilterButton } from '../../ui/FilterDrawer'
import { WorkspaceHeaderAddActions, WorkspaceHeaderMoreActions, WorkspaceHeaderRightActions, WorkspaceHeaderSecondaryActions } from '../WorkspacePortal'
import Header from '../Header'

const mock = vi.hoisted(() => ({ viewport: 'desktop' }))
vi.mock('../../../lib/device', () => ({ useViewport: () => mock.viewport }))
vi.mock('../../../lib/auth', () => ({ useAuth: () => ({ user: { name: 'Operator', role: 'Owner' }, logout: vi.fn(), lockNow: vi.fn(), hasPin: false }) }))
vi.mock('../../../lib/syncContext', () => ({ useSync: () => ({ status: 'synced', pendingCount: 0 }) }))
vi.mock('../../ui/creation/GlobalAddMenu', () => ({ GlobalAddMenu: () => <button>Global Add</button> }))

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
let container: HTMLDivElement
let root: Root
beforeEach(() => {
  mock.viewport = 'desktop'
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

const slot = (name: string) => container.querySelector<HTMLElement>(`[data-header-slot="${name}"]`)
const displayedSlots = () => Array.from(container.querySelectorAll('[data-header-slot]')).map((node) => node.getAttribute('data-header-slot'))

describe('Babin Rentals OS — fixed button locations', () => {
  it('places Filters, Add, More and legacy Save in one canonical row rather than beside the title', async () => {
    await act(async () => root.render(<MemoryRouter><WorkspaceProvider>
      <Header crumbs={[{ label: 'Rentals' }]} />
      <PageHeader title="Rentals"
        leading={<FilterButton onClick={vi.fn()} activeCount={2} controls="rental-filters" expanded={false} />}
        actions={<PageActions
          primary={<button type="button">Confirm booking</button>}
          secondary={[<button key="export" type="button">Export CSV</button>]}
          overflow={[{ label: 'Audit history', icon: 'checklist', onClick: vi.fn() }]}
        />}
      />
    </WorkspaceProvider></MemoryRouter>))
    expect(container.querySelectorAll('header')).toHaveLength(1)
    expect(displayedSlots()).toEqual(['filters', 'secondary', 'add', 'more', 'primary', 'information'])
    expect(slot('filters')?.querySelector('button[aria-controls="rental-filters"]')).not.toBeNull()
    expect(slot('secondary')?.textContent).toContain('Export CSV')
    expect(slot('more')?.querySelector('button[aria-label="More actions"]')).not.toBeNull()
    expect(slot('primary')?.textContent).toContain('Confirm booking')
    expect(slot('add')?.textContent).not.toContain('Confirm booking')
  })

  it('puts Inventory and Clients GlobalAddMenu in Add, not in the primary Save slot', async () => {
    await act(async () => root.render(<MemoryRouter><WorkspaceProvider>
      <Header crumbs={[{ label: 'Inventory' }]} />
      <PageHeader title="Inventory" actions={<PageActions primary={<GlobalAddMenu module="inventory" />} />} />
    </WorkspaceProvider></MemoryRouter>))
    expect(slot('add')?.textContent).toContain('Global Add')
    expect(slot('primary')?.textContent).not.toContain('Global Add')
    expect(container.querySelectorAll('header')).toHaveLength(1)
  })

  it('keeps page-owned New Rental actions in their individual stable slots', async () => {
    await act(async () => root.render(<MemoryRouter><WorkspaceProvider>
      <Header crumbs={[{ label: 'New Rental' }]} />
      <WorkspaceHeaderSecondaryActions><button type="button">Save draft</button></WorkspaceHeaderSecondaryActions>
      <WorkspaceHeaderMoreActions><button type="button" aria-label="More rental actions">More</button></WorkspaceHeaderMoreActions>
      <WorkspaceHeaderRightActions><button type="button">Confirm Booking</button></WorkspaceHeaderRightActions>
    </WorkspaceProvider></MemoryRouter>))
    expect(slot('secondary')?.textContent).toContain('Save draft')
    expect(slot('more')?.querySelector('[aria-label="More rental actions"]')).not.toBeNull()
    expect(slot('primary')?.textContent).toContain('Confirm Booking')
    expect(container.querySelectorAll('header')).toHaveLength(1)
  })

  it('anchors page-owned New Rental creation to Add without duplicating Global Add', async () => {
    await act(async () => root.render(<MemoryRouter><WorkspaceProvider>
      <Header crumbs={[{ label: 'Rentals' }]} />
      <WorkspaceHeaderAddActions><button type="button" aria-label="New Rental">New Rental</button></WorkspaceHeaderAddActions>
    </WorkspaceProvider></MemoryRouter>))
    expect(slot('add')?.textContent).toContain('New Rental')
    expect(slot('add')?.textContent).not.toContain('Global Add')
    expect(slot('primary')?.textContent).not.toContain('New Rental')
    expect(container.querySelectorAll('header')).toHaveLength(1)
  })

  it('anchors contextual search in the same phone slot, not before Filters', async () => {
    mock.viewport = 'phone'
    await act(async () => root.render(<MemoryRouter><WorkspaceProvider>
      <Header crumbs={[{ label: 'Today' }]} />
      <PageHeader title="Today" search={{ value: '', onChange: vi.fn(), ariaLabel: 'Search rentals' }} />
    </WorkspaceProvider></MemoryRouter>))
    const search = slot('search')
    expect(search).not.toBeNull()
    expect(search?.querySelector('button[aria-label="Search Today"]')).not.toBeNull()
    expect(displayedSlots()).toEqual(['filters', 'secondary', 'add', 'more', 'primary', 'information', 'search'])
  })
})
