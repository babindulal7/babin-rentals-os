// @vitest-environment jsdom
import { act, StrictMode, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceProvider, useWorkspace } from '../../../lib/workspaceContext'
import { PageHeader } from '../../ui/header/PageHeader'
import { WorkspaceHeaderRightActions, WorkspaceHeaderSearch } from '../WorkspacePortal'
import Header from '../Header'

const state = vi.hoisted(() => ({ viewport: 'desktop', syncStatus: 'synced', pendingCount: 0, role: 'Owner' }))
vi.mock('../../../lib/device', () => ({ useViewport: () => state.viewport }))
vi.mock('../../../lib/auth', () => ({ useAuth: () => ({ user: { name: 'Babin', role: state.role }, logout: vi.fn(), lockNow: vi.fn(), hasPin: false }) }))
vi.mock('../../../lib/syncContext', () => ({ useSync: () => ({ status: state.syncStatus, pendingCount: state.pendingCount }) }))
vi.mock('../../ui/creation/GlobalAddMenu', () => ({ GlobalAddMenu: () => <button>Global Add</button> }))

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
let root: Root
let container: HTMLDivElement
beforeEach(() => {
  state.viewport = 'desktop'
  state.syncStatus = 'synced'
  state.pendingCount = 0
  state.role = 'Owner'
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

async function renderPage(page: 'rentals' | 'edit' | 'plain') {
  await act(async () => root.render(
    <StrictMode><MemoryRouter><WorkspaceProvider>
      <Header crumbs={[{ label: 'Rentals' }]} />
      {page !== 'plain' && <WorkspaceHeaderRightActions key={page}>
        <button>{page === 'edit' ? 'Confirm booking' : 'New Rental'}</button>
        {page === 'rentals' && <button aria-label="Toggle rentals search">Search rentals</button>}
      </WorkspaceHeaderRightActions>}
      {page === 'rentals' && <WorkspaceHeaderSearch><input aria-label="Search rentals" /></WorkspaceHeaderSearch>}
    </WorkspaceProvider></MemoryRouter></StrictMode>,
  ))
}

describe('RULING 2026-10-15 — the title zone never shares the squeeze with the search', () => {
  const zone = () => container.querySelector<HTMLElement>('.app-global-header__breadcrumbs')!

  it('holds a module title at its width on desktop, so the search yields first', async () => {
    await act(async () => root.render(<MemoryRouter><WorkspaceProvider><Header crumbs={[{ label: 'Inventory' }]} /></WorkspaceProvider></MemoryRouter>))
    expect(zone().style.flex).toBe('0 0 auto')
  })

  it('lets a record title (a crumb trail of any length) and every tablet title still ellipsize', async () => {
    await act(async () => root.render(<MemoryRouter><WorkspaceProvider>
      <Header crumbs={[{ label: 'Rentals', to: '/rentals' }, { label: '902 · Annapurna Media Pvt. Ltd.' }]} />
    </WorkspaceProvider></MemoryRouter>))
    expect(zone().style.flex).toBe('0 1 auto')
    state.viewport = 'tablet'
    await act(async () => root.render(<MemoryRouter><WorkspaceProvider><Header crumbs={[{ label: 'Inventory' }]} /></WorkspaceProvider></MemoryRouter>))
    expect(zone().style.flex).toBe('0 1 auto')
  })
})

describe('page ownership of the application header', () => {
  it('reclaims healthy sync space on tablets and desktops but keeps every actionable sync state visible', async () => {
    for (const viewport of ['tablet', 'desktop'] as const) {
      state.viewport = viewport
      state.syncStatus = 'synced'
      state.pendingCount = 0
      await renderPage('plain')
      expect(container.querySelector<HTMLElement>('.header-sync-context')?.style.display).toBe('none')
    }
    state.viewport = 'tablet'
    for (const status of ['offline', 'pending', 'syncing', 'error']) {
      state.syncStatus = status
      await renderPage('plain')
      const sync = container.querySelector<HTMLElement>('.header-sync-context')!
      expect(sync.style.display).toBe('flex')
      expect(sync.getAttribute('aria-hidden')).toBeNull()
      expect(sync.querySelector('button')?.tabIndex).toBe(0)
    }
    state.syncStatus = 'synced'
    state.pendingCount = 2
    await renderPage('plain')
    expect(container.querySelector<HTMLElement>('.header-sync-context')?.style.display).toBe('flex')
    expect(container.querySelector('.header-sync-context')?.textContent).toContain('2 Queued')
  })

  it('makes the whole 44px search box focus the field on tablet and desktop', async () => {
    /* Zoom audit, 15 Oct: the input alone measured 22px tall inside its 44px box. */
    function SearchPage() {
      const [query, setQuery] = useState('')
      return <PageHeader title="Inventory" search={{ value: query, onChange: setQuery, ariaLabel: 'Search inventory' }} />
    }
    for (const viewport of ['tablet', 'desktop'] as const) {
      state.viewport = viewport
      await act(async () => root.render(<MemoryRouter><WorkspaceProvider>
        <Header crumbs={[{ label: 'Inventory' }]} /><SearchPage />
      </WorkspaceProvider></MemoryRouter>))
      const input = container.querySelector<HTMLInputElement>('[aria-label="Search inventory"]')!
      const box = input.closest('label')
      expect(box).not.toBeNull()
      expect(box!.style.minHeight).toBe('44px')
      expect(input.style.height).toBe('100%')
      expect(box!.closest('.app-global-header__center')).not.toBeNull()
    }
  })

  it('uses the contextual phone search, preserves its query on Escape and clears without closing', async () => {
    state.viewport = 'phone'
    function SearchPage() {
      const [query, setQuery] = useState('BK-120')
      return <PageHeader title="Today" search={{ value: query, onChange: setQuery, ariaLabel: 'Search movements' }} />
    }
    await act(async () => root.render(<MemoryRouter><WorkspaceProvider>
      <Header crumbs={[{ label: 'Today' }]} /><SearchPage />
    </WorkspaceProvider></MemoryRouter>))
    const trigger = container.querySelector<HTMLButtonElement>('[aria-label="Search Today"]')!
    expect(trigger).not.toBeNull()
    expect(container.querySelector('[aria-label="Search"]')).toBeNull()
    await act(async () => trigger.click())
    const input = container.querySelector<HTMLInputElement>('[aria-label="Search movements"]')!
    expect(document.activeElement).toBe(input)
    expect(input.value).toBe('BK-120')
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(container.querySelector('[role="search"]')).toBeNull()
    expect(document.activeElement).toBe(trigger)
    await act(async () => trigger.click())
    expect(container.querySelector<HTMLInputElement>('input')?.value).toBe('BK-120')
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Clear search query"]')!.click())
    expect(container.querySelector<HTMLInputElement>('input')?.value).toBe('')
    expect(document.activeElement).toBe(container.querySelector('input'))
    await act(async () => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })))
    expect(container.querySelector('[role="search"]')).toBeNull()
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true })))
    expect(document.activeElement).toBe(container.querySelector('input'))
  })

  it('registers page metadata without repeated context updates and releases it on navigation', async () => {
    let renders = 0
    function WorkspaceProbe() {
      const workspace = useWorkspace()
      renders += 1
      if (renders > 15) throw new Error('Header registration did not settle')
      return <output>{workspace.headerData?.title ?? 'No page'}</output>
    }
    const actions = <button>Open Operations</button>
    async function renderMetadata(active: boolean) {
      await act(async () => root.render(<WorkspaceProvider>
        <WorkspaceProbe />
        {active && <PageHeader title="Today" description="Dispatch queues" actions={actions} />}
      </WorkspaceProvider>))
    }
    await renderMetadata(true)
    expect(container.querySelector('output')?.textContent).toBe('Today')
    const settledRenders = renders
    await renderMetadata(true)
    expect(renders - settledRenders).toBeLessThan(3)
    await renderMetadata(false)
    expect(container.querySelector('output')?.textContent).toBe('No page')
  })

  it('replaces fallback creation on list/edit navigation and restores it after release', async () => {
    await renderPage('plain')
    expect(container.textContent).toContain('Global Add')
    await renderPage('rentals')
    expect(container.textContent).toContain('New Rental')
    expect(container.textContent).not.toContain('Global Add')
    expect(container.querySelectorAll('header')).toHaveLength(1)
    await renderPage('edit')
    expect(container.textContent).toContain('Confirm booking')
    expect(container.textContent).not.toContain('New Rental')
    expect(container.textContent).not.toContain('Global Add')
    await renderPage('plain')
    expect(container.textContent).toContain('Global Add')
  })

  it('keeps only the page search on phone and releases ownership on navigation', async () => {
    state.viewport = 'phone'
    await renderPage('rentals')
    expect(container.querySelector('[aria-label="Search"]')).toBeNull()
    expect(container.querySelector('[aria-label="Toggle rentals search"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="Team internal notes"]')).toBeNull()
    await renderPage('plain')
    expect(container.querySelector('[aria-label="Search"]')).not.toBeNull()
  })

  it('places notes in the phone profile and returns focus on Escape', async () => {
    state.viewport = 'phone'
    await renderPage('plain')
    const profile = container.querySelector<HTMLButtonElement>('[title="User profile"]')!
    await act(async () => profile.click())
    const dialog = container.querySelector('[role="dialog"][aria-label="User profile"]')!
    expect(dialog.textContent).toContain('Team internal notes')
    await act(async () => dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(container.querySelector('[role="dialog"][aria-label="User profile"]')).toBeNull()
    expect(document.activeElement).toBe(profile)
  })
  it('applies role, loading and enabled predicates to bulk header actions', async () => {
    const onMoney = vi.fn()
    const onOwner = vi.fn()
    const onPending = vi.fn()
    const onLoading = vi.fn()
    const onClear = vi.fn()
    const bulkSelection = {
      count: 2,
      onClear,
      actions: [
        { id: 'money', label: 'Record Payment', isMoneyAction: true, onClick: onMoney },
        { id: 'owner', label: 'Owner action', permission: (role: string) => role === 'Owner', onClick: onOwner },
        { id: 'pending', label: 'Restricted until ready', enabled: () => false, disabledReason: 'Still needs inspection', onClick: onPending },
        { id: 'loading', label: 'Uploading', loading: true, loadingLabel: 'Uploading…', onClick: onLoading },
      ],
    }
    const page = <MemoryRouter><WorkspaceProvider>
      <Header crumbs={[{ label: 'Rentals' }]} />
      <PageHeader title="Rentals" bulkSelection={bulkSelection} />
    </WorkspaceProvider></MemoryRouter>

    state.role = 'Warehouse'
    await act(async () => root.render(page))
    expect(container.textContent).toContain('2 selected')
    expect(container.textContent).not.toContain('Record Payment')
    expect(container.textContent).not.toContain('Owner action')
    const pending = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Restricted until ready')
    expect(pending?.disabled).toBe(true)
    expect(pending?.title).toBe('Still needs inspection')
    const loading = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Uploading…')
    expect(loading?.disabled).toBe(true)
    await act(async () => { pending?.click(); loading?.click() })
    expect(onPending).not.toHaveBeenCalled()
    expect(onLoading).not.toHaveBeenCalled()

    state.role = 'Owner'
    await act(async () => root.render(<MemoryRouter><WorkspaceProvider>
      <Header crumbs={[{ label: 'Rentals' }]} />
      <PageHeader title="Rentals" bulkSelection={bulkSelection} />
    </WorkspaceProvider></MemoryRouter>))
    expect(container.textContent).toContain('Record Payment')
    expect(container.textContent).toContain('Owner action')
    const ownerAction = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Owner action')
    await act(async () => ownerAction?.click())
    expect(onOwner).toHaveBeenCalledTimes(1)
    const clearButton = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Clear')
    await act(async () => clearButton?.click())
    expect(onClear).toHaveBeenCalledTimes(1)
    expect(container.querySelectorAll('header')).toHaveLength(1)
  })

  it('disables a registered primary action when its dynamic enabled predicate refuses', async () => {
    const onSave = vi.fn()
    const actionsConfig = [
      { id: 'confirm', label: 'Confirm Booking', priority: 'primary' as const,
        enabled: () => false, disabledReason: 'Verify the client first', onClick: onSave },
    ]
    await act(async () => root.render(<MemoryRouter><WorkspaceProvider>
      <Header crumbs={[{ label: 'New Rental' }]} />
      <PageHeader title="New Rental" actionsConfig={actionsConfig} />
    </WorkspaceProvider></MemoryRouter>))
    const confirm = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Confirm Booking')
    expect(confirm?.disabled).toBe(true)
    expect(confirm?.title).toBe('Verify the client first')
    await act(async () => confirm?.click())
    expect(onSave).not.toHaveBeenCalled()
  })

  it('protects bulk actions in the standalone PageHeader too', async () => {
    state.role = 'Warehouse'
    const onRestricted = vi.fn()
    const selection = { count: 1, onClear: vi.fn(), actions: [
      { id: 'payment', label: 'Record Payment', isMoneyAction: true, onClick: onRestricted },
      { id: 'hold', label: 'Mark reviewed', enabled: () => false, disabledReason: 'Check units first', onClick: onRestricted },
    ] }
    await act(async () => root.render(<MemoryRouter>
      <PageHeader title="Inventory" bulkSelection={selection} />
    </MemoryRouter>))
    expect(container.textContent).not.toContain('Record Payment')
    const review = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Mark reviewed')
    expect(review?.disabled).toBe(true)
    expect(review?.title).toBe('Check units first')
    await act(async () => review?.click())
    expect(onRestricted).not.toHaveBeenCalled()
  })

})
