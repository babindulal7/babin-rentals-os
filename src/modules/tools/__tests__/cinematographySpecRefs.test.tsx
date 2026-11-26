// @vitest-environment jsdom
/**
 * The cinematography suite is shown to staff, so its visible text carries no
 * section-sign spec references. Those references stay in code comments. The
 * two decision cards are the exception: they record logged decisions and keep
 * their wording.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Viewport } from '../../../lib/device'
import CinematographyTools from '../../settings/Tools'

let viewport: Viewport = 'desktop'
let money = true

vi.mock('../../../lib/device', async (orig) => ({
  ...(await orig<typeof import('../../../lib/device')>()),
  useViewport: () => viewport,
}))
vi.mock('../../../lib/moneyVisibility', () => ({ useCanViewMoney: () => money }))

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const DECISION_CARDS = ['Where the render’s fifteen categories went', 'Open — needs Babin']

let container: HTMLDivElement
let root: Root

async function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter>
        <CinematographyTools embedded />
      </MemoryRouter>,
    )
  })
}

/** The rendered page's text with the two decision cards taken out. */
function textOutsideDecisionCards(): string {
  const copy = container.cloneNode(true) as HTMLElement
  for (const heading of copy.querySelectorAll('h2')) {
    if (DECISION_CARDS.includes(heading.textContent ?? '')) heading.closest('section')?.remove()
  }
  return copy.textContent ?? ''
}

beforeEach(() => {
  viewport = 'desktop'
  money = true
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

describe('Cinematography suite — spec references in staff copy', () => {
  it('keeps both decision cards on the page as logged', async () => {
    await mount()
    const headings = [...container.querySelectorAll('h2')].map((h) => h.textContent)
    expect(headings).toEqual(expect.arrayContaining(DECISION_CARDS))
  })

  it('shows no section-sign spec reference anywhere outside the two decision cards', async () => {
    await mount()
    expect(container.textContent).toContain('§')
    expect(textOutsideDecisionCards()).toContain('Tool Summary')
    expect(textOutsideDecisionCards()).not.toContain('§')
  })
})
