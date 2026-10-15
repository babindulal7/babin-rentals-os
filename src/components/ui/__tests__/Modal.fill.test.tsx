// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Viewport } from '../../../lib/device'

let mockViewport: Viewport = 'phone'

vi.mock('../../../lib/device', () => ({
  useViewport: () => mockViewport,
}))

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const { Modal } = await import('../Modal')

describe('Modal `fill` — edge-to-edge for the floor work surfaces', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
    document.body.innerHTML = ''
  })

  async function open(viewport: Viewport, fill: boolean) {
    mockViewport = viewport
    await act(async () => {
      root.render(
        <Modal isOpen onClose={vi.fn()} title="Operations" size="full" fill={fill} footer={<button type="button">Confirm</button>}>
          <div>body</div>
        </Modal>,
      )
    })
    const dialog = host.querySelector<HTMLDivElement>('[role="dialog"]')!
    const outer = host.querySelector<HTMLDivElement>('.app-modal')!
    return { dialog, outer }
  }

  it.each(['phone', 'tablet'] as const)('takes the whole dynamic viewport on a %s: no margin, no radius, no border', async (viewport) => {
    const { dialog, outer } = await open(viewport, true)
    expect(dialog.style.height).toBe('100dvh')
    expect(dialog.style.maxHeight).toBe('100dvh')
    expect(dialog.style.maxWidth).toBe('100%')
    expect(dialog.style.borderRadius).toBe('0px')
    expect(dialog.style.borderStyle).toBe('none')
    expect(outer.style.padding).toBe('0px')
  })

  it('leaves the desktop dialog exactly as it was', async () => {
    const { dialog, outer } = await open('desktop', true)
    expect(dialog.style.maxHeight).toBe('92dvh')
    expect(dialog.style.height).toBe('')
    expect(dialog.style.borderRadius).toBe('16px')
    expect(outer.style.padding).not.toBe('0px')
  })

  it('changes nothing for callers that do not ask for it', async () => {
    const { dialog } = await open('phone', false)
    expect(dialog.style.maxHeight).toBe('85dvh')
    expect(dialog.style.height).toBe('')
  })
})
