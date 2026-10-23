// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  Drawer,
  DrawerPopup,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerPanel,
  DrawerFooter,
  DrawerClose,
} from '../cossDrawer'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

describe('cossDrawer Primitive & Geometry', () => {
  let host: HTMLDivElement | null = null
  let root: Root | null = null

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    if (root) {
      act(() => {
        root!.unmount()
      })
    }
    if (host && host.parentNode) {
      host.parentNode.removeChild(host)
    }
    root = null
    host = null
  })

  it('renders side drawer (right position default) with header, panel, footer, and close action', () => {
    act(() => {
      root!.render(
        <Drawer defaultOpen position="right">
          <DrawerPopup>
            <DrawerHeader>
              <DrawerTitle>Crew Roster</DrawerTitle>
              <DrawerDescription>Staff assignments for today</DrawerDescription>
            </DrawerHeader>
            <DrawerPanel>
              <p>Roster details and assignments</p>
            </DrawerPanel>
            <DrawerFooter>
              <DrawerClose>Dismiss</DrawerClose>
            </DrawerFooter>
          </DrawerPopup>
        </Drawer>
      )
    })

    expect(document.body.textContent).toContain('Crew Roster')
    expect(document.body.textContent).toContain('Staff assignments for today')
    expect(document.body.textContent).toContain('Roster details and assignments')
    expect(document.body.textContent).toContain('Dismiss')

    const popup = document.querySelector('[data-slot="drawer-popup"]') as HTMLDivElement
    expect(popup).not.toBeNull()
    expect(popup.style.maxWidth).toBe('480px')
  })

  it('renders bottom drawer position with top-rounded border-radius and 85dvh cap', () => {
    act(() => {
      root!.render(
        <Drawer defaultOpen position="bottom">
          <DrawerPopup showBar>
            <DrawerHeader>
              <DrawerTitle>Vehicle Dispatch</DrawerTitle>
            </DrawerHeader>
            <DrawerPanel>
              <p>Fleet allocation info</p>
            </DrawerPanel>
          </DrawerPopup>
        </Drawer>
      )
    })

    expect(document.body.textContent).toContain('Vehicle Dispatch')
    const popup = document.querySelector('[data-slot="drawer-popup"]') as HTMLDivElement
    expect(popup).not.toBeNull()
    expect(popup.style.borderRadius).toBe('16px 16px 0 0')
    expect(popup.style.maxHeight).toBe('85dvh')
  })
})
