// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ContextDrawer } from '../ContextDrawer'
import { InspectorNavigator } from '../InspectorNavigator'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | undefined
let container: HTMLDivElement | undefined

function drawer(open = true, onClose = () => {}, options: { docked?: boolean; navigation?: boolean } = {}) {
  return (
    <ContextDrawer
      id="rental-context"
      open={open}
      onClose={onClose}
      title="BR-2083-0142"
      subtitle="Himalayan Films"
      /* exactOptionalPropertyTypes: an absent option must be an absent prop,
         never an explicit undefined. */
      {...(options.docked !== undefined ? { docked: options.docked } : {})}
      {...(options.navigation ? {
        navigation: (
          <InspectorNavigator
            active={open}
            position={open ? 2 : 0}
            index={open ? 1 : -1}
            total={25}
            canPrevious={open}
            canNext={open}
            onPrevious={() => {}}
            onNext={() => {}}
          />
        ),
      } : {})}
    >
      <button type="button">First action</button>
      <button type="button">Last action</button>
    </ContextDrawer>
  )
}

function mount(open = true, onClose = () => {}, options: { docked?: boolean; navigation?: boolean } = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root?.render(drawer(open, onClose, options)))
}

/** Advance past the drawer's requestAnimationFrame focus step deterministically. */
async function flushFrame() {
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
  })
}

function setWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
}

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
  document.body.style.overflow = ''
  document.documentElement.style.removeProperty('--context-drawer-w')
})

describe('ContextDrawer', () => {
  it('does not render when closed', () => {
    mount(false)
    expect(container?.innerHTML).toBe('')
  })

  it('exposes a labelled non-modal desktop inspector', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 })
    mount()
    const drawer = container?.querySelector('[role="dialog"]')
    expect(drawer?.getAttribute('aria-labelledby')).toBe('rental-context-title')
    expect(drawer?.getAttribute('aria-modal')).toBeNull()
    expect(container?.textContent).toContain('First action')
  })

  it('closes on Escape', () => {
    let closes = 0
    mount(true, () => { closes += 1 })
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    expect(closes).toBe(1)
  })

  it('traps Tab within the panel on phone', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    mount()
    const panel = container?.querySelector<HTMLElement>('[role="dialog"]')
    const buttons = panel?.querySelectorAll<HTMLButtonElement>('button')
    const first = buttons?.[0]
    const last = buttons?.[buttons.length - 1]
    last?.focus()
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })))
    expect(document.activeElement).toBe(first)
    expect(panel?.getAttribute('aria-modal')).toBe('true')
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('keeps the closing panel mounted for its exit animation', () => {
    mount()
    act(() => root?.render(drawer(false)))
    expect(container?.querySelector('.context-drawer--closing')).not.toBeNull()
    expect(container?.querySelector('[role="dialog"]')?.closest('[aria-hidden="true"]')).not.toBeNull()
  })
})

describe('ContextDrawer docked (Premium Workbench v1)', () => {
  it('docks at desktop: applies the dock class, reserves the workspace strip, renders the navigation toolbar', () => {
    setWidth(1440)
    mount(true, () => {}, { docked: true, navigation: true })
    expect(container?.querySelector('.context-drawer--docked')).not.toBeNull()
    expect(document.documentElement.style.getPropertyValue('--context-drawer-w')).toBe('clamp(320px, 27vw, 420px)')
    const nav = container?.querySelector('.premium-inspector-nav')
    expect(nav).not.toBeNull()
    expect(nav?.textContent).toContain('2 of 25 on this page')
    // Navigation sits between the header and the scrollable body, so the
    // traversal control is visible while the record facts scroll.
    const panel = container?.querySelector('.context-drawer__panel')
    const children = panel ? Array.from(panel.children) : []
    expect(children.findIndex((el) => el.classList.contains('context-drawer__header'))).toBeLessThan(
      children.findIndex((el) => el.classList.contains('premium-inspector-nav')),
    )
    expect(children.findIndex((el) => el.classList.contains('premium-inspector-nav'))).toBeLessThan(
      children.findIndex((el) => el.classList.contains('context-drawer__body')),
    )
  })

  it('does not steal focus from the list when docked at desktop', async () => {
    setWidth(1440)
    const outside = document.createElement('button')
    outside.type = 'button'
    outside.textContent = 'A list row'
    document.body.appendChild(outside)
    outside.focus()
    try {
      mount(true, () => {}, { docked: true })
      await flushFrame()
      expect(document.activeElement).toBe(outside)
    } finally {
      outside.remove()
    }
  })

  it('still moves focus into the panel when docked below desktop (overlay stays)', async () => {
    setWidth(1194)
    mount(true, () => {}, { docked: true })
    expect(container?.querySelector('.context-drawer--docked')).toBeNull()
    expect(document.documentElement.style.getPropertyValue('--context-drawer-w')).toBe('')
    await flushFrame()
    expect(document.activeElement).toBe(container?.querySelector('[role="dialog"]'))
  })

  it('never docks on phone — the modal sheet presentation is untouched', async () => {
    setWidth(390)
    mount(true, () => {}, { docked: true })
    expect(container?.querySelector('.context-drawer--docked')).toBeNull()
    expect(document.documentElement.style.getPropertyValue('--context-drawer-w')).toBe('')
    await flushFrame()
    expect(document.activeElement).toBe(container?.querySelector('[role="dialog"]'))
  })

  it('keeps the dock class through the exit animation but releases the reserved strip immediately', () => {
    setWidth(1440)
    mount(true, () => {}, { docked: true })
    act(() => root?.render(drawer(false, () => {}, { docked: true })))
    expect(container?.querySelector('.context-drawer--closing')).not.toBeNull()
    expect(container?.querySelector('.context-drawer--docked')).not.toBeNull()
    expect(document.documentElement.style.getPropertyValue('--context-drawer-w')).toBe('')
  })

  it('announces itself on the side-drawer protocol so an open information drawer yields the right edge', () => {
    setWidth(1440)
    const seen: Array<{ id: string; side: string } | undefined> = []
    const capture = (event: Event) => {
      seen.push((event as CustomEvent<{ id: string; side: string }>).detail)
    }
    window.addEventListener('babin:side-drawer-open', capture)
    try {
      mount(true, () => {}, { docked: true })
      expect(seen).toContainEqual({ id: 'rental-context', side: 'right' })
    } finally {
      window.removeEventListener('babin:side-drawer-open', capture)
    }
  })

  it('closes when another RIGHT-edge drawer opens at desktop, but ignores a left-edge drawer', () => {
    setWidth(1440)
    let closes = 0
    mount(true, () => { closes += 1 }, { docked: true })
    act(() => window.dispatchEvent(new CustomEvent('babin:side-drawer-open', { detail: { id: 'filters', side: 'left' } })))
    expect(closes).toBe(0)
    act(() => window.dispatchEvent(new CustomEvent('babin:side-drawer-open', { detail: { id: 'information', side: 'right' } })))
    expect(closes).toBe(1)
  })

  it('below desktop any drawer dismisses it — the one-drawer-at-a-time rule on narrow screens', () => {
    setWidth(1194)
    let closes = 0
    mount(true, () => { closes += 1 }, { docked: true })
    act(() => window.dispatchEvent(new CustomEvent('babin:side-drawer-open', { detail: { id: 'filters', side: 'left' } })))
    expect(closes).toBe(1)
  })

  it('a non-docked inspector keeps the legacy behaviour: no protocol, no reservation, focus moves in', async () => {
    setWidth(1440)
    mount()
    expect(container?.querySelector('.context-drawer--docked')).toBeNull()
    expect(document.documentElement.style.getPropertyValue('--context-drawer-w')).toBe('')
    await flushFrame()
    expect(document.activeElement).toBe(container?.querySelector('[role="dialog"]'))
  })
})
