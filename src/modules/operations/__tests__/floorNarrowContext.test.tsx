// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

vi.mock('../../../lib/device', () => ({ useViewport: () => 'desktop' }))

const { FloorNarrowContext, useFloorViewport } = await import('../floorPanelContext')

function Probe() {
  return <span data-vp={useFloorViewport()} />
}

async function band(inPanel: boolean) {
  const el = document.createElement('div')
  const root = createRoot(el)
  await act(async () => {
    root.render(<FloorNarrowContext.Provider value={inPanel}><Probe /></FloorNarrowContext.Provider>)
  })
  const v = el.querySelector('span')?.getAttribute('data-vp')
  await act(async () => root.unmount())
  return v
}

describe('floor workspaces inside the queue dock', () => {
  it('take the one-column layout in the dock, and follow the window elsewhere', async () => {
    expect(await band(true)).toBe('phone')
    expect(await band(false)).toBe('desktop')
  })
})
