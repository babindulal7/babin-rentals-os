// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SystemRole } from '../../../types/database'
import { permittedNav } from '../../../data/nav'
import DesktopDock from '../DesktopDock'

let role: SystemRole = 'Owner'
vi.mock('../../../lib/auth', () => ({ useAuth: () => ({ user: { role } }) }))
;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  role = 'Owner'
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})
function show(active: string) {
  act(() => root.render(<MemoryRouter><DesktopDock active={active} /></MemoryRouter>))
}

describe('Desktop dock', () => {
  it('preserves every permitted destination in the canonical order', () => {
    show('/today')
    const links = [...host.querySelectorAll<HTMLAnchorElement>('nav[aria-label="Main"] a')]
    expect(links.map(link => link.getAttribute('href'))).toEqual(permittedNav('Owner').map(entry => entry.to))
    expect(links.map(link => link.textContent)).toEqual(permittedNav('Owner').map(entry => entry.label))
    expect(links).toHaveLength(11)
    expect(host.querySelectorAll('nav[aria-label="Main"]')).toHaveLength(1)
  })
  it.each<SystemRole>(['Warehouse', 'Technician', 'Driver', 'Client'])('does not restore money routes for %s', restrictedRole => {
    role = restrictedRole
    show('/inventory')
    expect([...host.querySelectorAll<HTMLAnchorElement>('a')].map(link => link.getAttribute('href'))).toEqual(permittedNav(restrictedRole).map(entry => entry.to))
    expect(host.querySelector('a[href="/finance"]')).toBeNull()
  })
  it.each([
    ['/rentals?action=new', '/rentals/new'],
    ['/rentals/BK-2026-0001', '/rentals'],
    ['/inventory/bundles/example', '/inventory'],
    ['/dashboard', '/today'],
  ])('marks only the owning route for %s', (path, target) => {
    show(path)
    const selected = [...host.querySelectorAll('a[aria-current="page"]')]
    expect(selected).toHaveLength(1)
    expect(selected[0]?.getAttribute('href')).toBe(target)
  })
})
