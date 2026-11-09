// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SystemRole } from '../../../types/database'
import { GLOSSARY_TERMS, applyGlossaryRevisions, applyGlossaryText } from '../../../lib/glossaryStore'

const state = vi.hoisted(() => ({ role: 'Owner' as SystemRole, read: vi.fn(), approve: vi.fn() }))
vi.mock('../../../lib/auth', () => ({ useAuth: () => ({ user: { id: 'owner', role: state.role, name: 'Owner' } }) }))
vi.mock('../../../lib/glossarySync', () => ({ readGlossaryRevisions: state.read }))
vi.mock('../../../actions/settings/approveGlossaryTerm', () => ({ approveGlossaryTerm: state.approve }))
vi.mock('../../../lib/i18n', async original => ({ ...await original<typeof import('../../../lib/i18n')>(), loadNepaliFonts: async () => {} }))
vi.mock('../../../lib/device', async original => ({ ...await original<typeof import('../../../lib/device')>(), useViewport: () => 'desktop' }))
import { GlossarySettingsControl } from '../GlossarySettingsControl'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true
let root: Root
let container: HTMLDivElement
beforeEach(() => {
  state.role = 'Owner'
  state.read.mockReset().mockResolvedValue([])
  state.approve.mockReset()
  applyGlossaryRevisions([])
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove() })
async function mount() { await act(async () => root.render(<MemoryRouter><GlossarySettingsControl /></MemoryRouter>)) }
async function click(text: string) {
  const button = [...document.querySelectorAll('button')].find(button => button.textContent?.trim() === text)
  if (!button) throw new Error(`Missing button ${text}`)
  await act(async () => button.click())
}
async function type(id: string, value: string) {
  const input = document.getElementById(id) as HTMLInputElement
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
  await act(async () => input.dispatchEvent(new Event('input', { bubbles: true })))
}

describe('Owner glossary editor', () => {
  it('refuses other roles before loading any glossary history', async () => {
    state.role = 'Admin'
    await mount()
    expect(container.textContent).toBe('')
    expect(state.read).not.toHaveBeenCalled()
  })
  it('distinguishes loading, failed reads, empty searches and offline restriction', async () => {
    state.read.mockImplementation(() => new Promise(() => {}))
    await mount()
    expect(container.textContent).toContain('Loading glossary')
    await act(async () => root.unmount())
    root = createRoot(container)
    state.read.mockRejectedValue(new Error('Read unavailable'))
    await mount()
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Read unavailable')
    state.read.mockResolvedValue([])
    await click('Retry glossary')
    await type('glossary-search', 'zz-no-term-zz')
    expect(container.textContent).toContain('No matching glossary terms')
    await type('glossary-search', '')
    await act(async () => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
      window.dispatchEvent(new Event('offline'))
    })
    expect(container.textContent).toContain('You are offline')
    expect([...container.querySelectorAll('button')].filter(button => button.textContent === 'Edit').every(button => button.disabled)).toBe(true)
  })
  it('keeps a refused draft and applies wording only after server approval', async () => {
    await mount()
    await click('Edit')
    const term = GLOSSARY_TERMS[0]!
    const wording = `${term.ne} काम`
    await type('glossary-wording', wording)
    state.approve.mockRejectedValue(new Error('Save refused'))
    await click('Approve and apply')
    expect((document.getElementById('glossary-wording') as HTMLInputElement).value).toBe(wording)
    expect(document.body.textContent).toContain('Save refused')
    expect(applyGlossaryText(term.ne, 'ne')).toBe(term.ne)
    state.approve.mockResolvedValue({ term_key: term.id, original_nepali: term.ne, nepali: wording, revision: 1 })
    await click('Approve and apply')
    expect(applyGlossaryText(term.ne, 'ne')).toBe(wording)
    expect(container.textContent).toContain('Approved and applied')
    expect(state.approve).toHaveBeenLastCalledWith(expect.objectContaining({ termKey: term.id, expectedRevision: 0 }), { userId: 'owner', role: 'Owner', isOnline: true })
  })
})
