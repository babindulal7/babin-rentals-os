// @vitest-environment jsdom
import { act, useState, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ActionsOverflowMenu, PageActions } from '../PageActions'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | undefined
let container: HTMLDivElement | undefined

afterEach(() => {
  if (root) act(() => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
})

function renderInDom(node: ReactElement) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root?.render(node))
}

const moreActions = () => container!.querySelector<HTMLButtonElement>('button[aria-label="More actions"]')!
const popover = () => document.querySelector<HTMLElement>('[role="menu"][aria-label="More actions"]')
const nestedLauncher = () => container!.querySelector<HTMLButtonElement>('button[aria-label="More booking actions"]')!
const nestedMenu = () => document.querySelector<HTMLElement>('[role="menu"][aria-label="Secondary rental actions"]')

/** Stands in for RentalMoreActions: an icon-only launcher whose popup is a portal. */
function NestedLauncher({ onAction }: { onAction: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" aria-label="More booking actions" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span aria-hidden="true">more_vert</span>
      </button>
      {open &&
        createPortal(
          <div role="menu" aria-label="Secondary rental actions">
            <button type="button" role="menuitem" onClick={onAction}>Cancel booking</button>
          </div>,
          document.body,
        )}
    </>
  )
}

describe('More actions popover', () => {
  it('opens on one click and gives every item visible text and an accessible name', () => {
    const onExport = vi.fn()
    renderInDom(
      <ActionsOverflowMenu
        actions={[<button key="dup" type="button">Duplicate booking</button>]}
        overflowItems={[{ label: 'Export list', icon: 'download', onClick: onExport }]}
      />,
    )

    act(() => moreActions().click())

    expect(popover()).not.toBeNull()
    expect(moreActions().getAttribute('aria-expanded')).toBe('true')
    const items = [...popover()!.querySelectorAll<HTMLElement>('[role="menuitem"]')]
    expect(items).toHaveLength(2)
    expect(items[0]!.textContent).toContain('Duplicate booking')
    expect(items[1]!.textContent).toContain('Export list')
    for (const item of items) expect((item.getAttribute('aria-label') ?? item.textContent ?? '').trim()).not.toBe('')

    act(() => items[1]!.click())
    expect(onExport).toHaveBeenCalledOnce()
    expect(popover()).toBeNull()
  })

  it('opens a custom launcher in one click while the popover is open, and the popover closes', () => {
    const onCancel = vi.fn()
    renderInDom(
      <ActionsOverflowMenu
        actions={[<button key="dup" type="button">Duplicate booking</button>]}
        customOverflowNode={<NestedLauncher onAction={onCancel} />}
      />,
    )
    act(() => moreActions().click())
    expect(popover()).not.toBeNull()

    act(() => nestedLauncher().dispatchEvent(new Event('pointerdown', { bubbles: true })))
    act(() => nestedLauncher().click())

    expect(nestedMenu()).not.toBeNull()
    expect(popover()).toBeNull()
    act(() => nestedMenu()!.querySelector<HTMLButtonElement>('[role="menuitem"]')!.click())
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('keeps the custom launcher out of the popover so the popover lists only labelled items', () => {
    renderInDom(
      <ActionsOverflowMenu
        actions={[<button key="dup" type="button">Duplicate booking</button>]}
        customOverflowNode={<NestedLauncher onAction={vi.fn()} />}
      />,
    )
    act(() => moreActions().click())
    expect(popover()!.querySelector('[aria-label="More booking actions"]')).toBeNull()
    expect([...popover()!.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent?.trim())).toEqual(['Duplicate booking'])
  })

  it('closes on an outside pointerdown', () => {
    renderInDom(<ActionsOverflowMenu actions={[<button key="dup" type="button">Duplicate booking</button>]} />)
    act(() => moreActions().click())
    expect(popover()).not.toBeNull()

    act(() => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })))

    expect(popover()).toBeNull()
    expect(moreActions().getAttribute('aria-expanded')).toBe('false')
  })

  it('renders a lone custom launcher without an empty More actions trigger', () => {
    renderInDom(<ActionsOverflowMenu actions={[]} customOverflowNode={<NestedLauncher onAction={vi.fn()} />} />)
    expect(container!.querySelector('button[aria-label="More actions"]')).toBeNull()
    expect(nestedLauncher()).not.toBeNull()
  })

  it('PageActions routes excess secondary actions and a custom launcher the same way', () => {
    const onCancel = vi.fn()
    renderInDom(
      <PageActions
        secondary={[
          <button key="1" type="button">First</button>,
          <button key="2" type="button">Second</button>,
          <button key="3" type="button">Third</button>,
        ]}
        overflow={<NestedLauncher onAction={onCancel} />}
      />,
    )
    act(() => moreActions().click())
    expect(popover()!.textContent).toContain('Third')
    act(() => nestedLauncher().click())
    expect(nestedMenu()).not.toBeNull()
  })
})
