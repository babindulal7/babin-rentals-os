// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InformationDrawer } from '../InformationDrawer'
import { FilterDrawer } from '../FilterDrawer'
import { WorkspaceProvider, useWorkspace } from '../../../lib/workspaceContext'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true
let container: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.useFakeTimers()
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 })
  window.matchMedia = vi.fn((media: string) => ({ matches: false, media, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }))
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.useRealTimers()
})
function Note() {
  const [value, setValue] = useState('')
  return <button onClick={() => setValue('Draft note')}>{value || 'Start note'}</button>
}
function HeaderSlot() {
  const workspace = useWorkspace()
  return <header><span ref={workspace.setHeaderInformationElement} /></header>
}
function mount() {
  act(() => root.render(<WorkspaceProvider><HeaderSlot /><main><InformationDrawer><Note /></InformationDrawer></main></WorkspaceProvider>))
}
function click(selector: string) {
  const button = container.querySelector<HTMLButtonElement>(selector)
  expect(button).not.toBeNull()
  act(() => button?.click())
}
describe('right-side quick information', () => {
  it('has a header toggle, preserves a draft through close/reopen, and clears workspace space', () => {
    mount()
    expect(container.querySelector('header [aria-controls]')).not.toBeNull()
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    click('[aria-label="Quick information"]')
    expect(document.documentElement.style.getPropertyValue('--information-drawer-w')).toBe('320px')
    expect(container.querySelector('[role="dialog"]')?.textContent).not.toContain('Counting…')
    click('aside button')
    click('[aria-label="Close quick information"]')
    act(() => vi.advanceTimersByTime(250))
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(document.documentElement.style.getPropertyValue('--information-drawer-w')).toBe('')
    click('[aria-label="Quick information"]')
    expect(container.querySelector('aside button')?.textContent).toBe('Draft note')
  })
  it('keeps left and right drawer widths independent and cleans both on unmount', () => {
    act(() => root.render(<><FilterDrawer id="filters" open onClose={() => {}} width={256}>Filters</FilterDrawer><InformationDrawer>Details</InformationDrawer></>))
    click('[aria-label="Quick information"]')
    expect(document.documentElement.style.getPropertyValue('--filter-drawer-w')).toBe('256px')
    expect(document.documentElement.style.getPropertyValue('--information-drawer-w')).toBe('320px')
    act(() => root.render(null))
    expect(document.documentElement.style.getPropertyValue('--filter-drawer-w')).toBe('')
    expect(document.documentElement.style.getPropertyValue('--information-drawer-w')).toBe('')
  })
  it('hands the right edge to another panel without losing its workspace width', () => {
    function Panels() {
      const [notes, setNotes] = useState(false)
      return <><InformationDrawer>Details</InformationDrawer>
        <button aria-label="Open notes" onClick={() => setNotes(true)}>Notes</button>
        <FilterDrawer id="notes" side="right" width={360} open={notes} onClose={() => setNotes(false)}>Notes</FilterDrawer>
      </>
    }
    act(() => root.render(<Panels />))
    click('[aria-label="Quick information"]')
    click('[aria-label="Open notes"]')
    expect(container.querySelector('[aria-label="Quick information"]')?.getAttribute('aria-expanded')).toBe('false')
    expect(document.documentElement.style.getPropertyValue('--information-drawer-w')).toBe('360px')
  })
  it('keeps only one side drawer open on a tablet to preserve working space', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 })
    function Panels() {
      const [filters, setFilters] = useState(true)
      return <><FilterDrawer id="filters" open={filters} onClose={() => setFilters(false)}>Filters</FilterDrawer>
        <InformationDrawer>Details</InformationDrawer></>
    }
    act(() => root.render(<Panels />))
    click('[aria-label="Quick information"]')
    act(() => vi.advanceTimersByTime(250))
    expect(container.querySelector('#filters')).toBeNull()
    expect(document.documentElement.style.getPropertyValue('--filter-drawer-w')).toBe('')
    expect(document.documentElement.style.getPropertyValue('--information-drawer-w')).toBe('320px')
  })
  it('opens a modal sheet on phone, locks scrolling, and closes with Escape', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    mount()
    click('[aria-label="Quick information"]')
    expect(container.querySelector('[role="dialog"]')?.getAttribute('aria-modal')).toBe('true')
    expect(document.body.style.overflow).toBe('hidden')
    expect(document.documentElement.style.getPropertyValue('--information-drawer-w')).toBe('')
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    act(() => vi.advanceTimersByTime(250))
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(document.body.style.overflow).toBe('')
  })
})
