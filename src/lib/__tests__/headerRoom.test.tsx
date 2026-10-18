// @vitest-environment jsdom
/**
 * `useCompactHeader` — zoom audit, 15 Oct 2026.
 *
 * Measured in the mock build: a 1920px laptop at 150% scaling is a 1280px desktop, and
 * with the sidebar open by default its header is 1024px wide, narrower than a 1094px
 * tablet's 1030px. Four page titles truncated there. The compact header now follows the
 * header's own width, with the widest tablet header (1279 − 64 = 1215px) as the line.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

const state = vi.hoisted(() => ({ viewport: 'desktop' as 'desktop' | 'tablet' | 'phone' }))
vi.mock('../device', () => ({ useViewport: () => state.viewport }))

const { useCompactHeader, DESKTOP_HEADER_MIN } = await import('../headerRoom')

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement | null = null
let root: Root | null = null
let header: HTMLElement | null = null
let headerWidth = 0
let observed: (() => void) | null = null
let seen: boolean[] = []

class FakeResizeObserver {
  constructor(private cb: () => void) {}
  observe() { observed = this.cb }
  disconnect() { observed = null }
  unobserve() {}
}

function Probe() {
  seen.push(useCompactHeader())
  return null
}

function addHeader(width: number) {
  headerWidth = width
  header = document.createElement('header')
  header.className = 'app-global-header'
  header.getBoundingClientRect = () => ({ width: headerWidth, height: 64, top: 0, left: 0, right: headerWidth, bottom: 64, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
  document.body.appendChild(header)
}

async function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const r = root
  await act(async () => r.render(<Probe />))
}

const last = () => seen[seen.length - 1]

beforeEach(() => {
  state.viewport = 'desktop'
  seen = []
  observed = null
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
})

afterEach(async () => {
  if (root) { const r = root; await act(async () => r.unmount()) }
  container?.remove()
  root = null
  container = null
  header?.remove()
  header = null
  vi.unstubAllGlobals()
})

describe('useCompactHeader', () => {
  it('draws the line at the widest tablet header', () => {
    expect(DESKTOP_HEADER_MIN).toBe(1216)
  })

  it('is compact on every tablet and phone, whatever the header measures', async () => {
    addHeader(1215)
    for (const viewport of ['tablet', 'phone'] as const) {
      state.viewport = viewport
      await mount()
      expect(last()).toBe(true)
      const r = root!
      await act(async () => r.unmount())
      container!.remove()
      root = null
    }
    state.viewport = 'desktop'
    await mount()
  })

  it('is compact on a desktop whose open sidebar leaves a 1024px header (1280px window)', async () => {
    addHeader(1024)
    await mount()
    expect(last()).toBe(true)
  })

  it('keeps the full header on a desktop with a 1216px or wider header', async () => {
    addHeader(1216)
    await mount()
    expect(last()).toBe(false)
  })

  it('treats a header that is not laid out (0px, jsdom) as roomy', async () => {
    addHeader(0)
    await mount()
    expect(last()).toBe(false)
  })

  it('follows the header when the sidebar opens or closes', async () => {
    addHeader(1280)
    await mount()
    expect(last()).toBe(false)
    expect(observed).not.toBeNull()
    headerWidth = 1024
    await act(async () => observed?.())
    expect(last()).toBe(true)
    headerWidth = 1472
    await act(async () => observed?.())
    expect(last()).toBe(false)
  })
})
