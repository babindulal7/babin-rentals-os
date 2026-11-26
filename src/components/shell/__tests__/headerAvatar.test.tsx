// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceProvider } from '../../../lib/workspaceContext'
import Header from '../Header'

const state = vi.hoisted(() => ({ name: 'Babin Dulal' }))
vi.mock('../../../lib/device', () => ({ useViewport: () => 'desktop' }))
vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({ user: { name: state.name, role: 'Owner' }, logout: vi.fn(), lockNow: vi.fn(), hasPin: false }),
}))
vi.mock('../../../lib/syncContext', () => ({ useSync: () => ({ status: 'synced', pendingCount: 0 }) }))
vi.mock('../../ui/creation/GlobalAddMenu', () => ({ GlobalAddMenu: () => <button>Global Add</button> }))

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
let root: Root
let container: HTMLDivElement

beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

async function avatarFor(name: string): Promise<string> {
  state.name = name
  await act(async () => root.render(
    <MemoryRouter><WorkspaceProvider><Header crumbs={[{ label: 'Today' }]} /></WorkspaceProvider></MemoryRouter>,
  ))
  const profile = container.querySelector<HTMLButtonElement>('button[aria-label*="user profile"]')
  return profile?.getAttribute('aria-label')?.split(' — ')[0] ?? ''
}

describe('header avatar initials', () => {
  it('uses the first letter of the first and the last name', async () => {
    expect(await avatarFor('Babin Dulal')).toBe('BD')
  })

  it('uses the first and the last name when there are more than two', async () => {
    expect(await avatarFor('Sita Maya Shrestha')).toBe('SS')
  })

  it('keeps the first two letters of a single name', async () => {
    expect(await avatarFor('Babin')).toBe('BA')
  })
})
