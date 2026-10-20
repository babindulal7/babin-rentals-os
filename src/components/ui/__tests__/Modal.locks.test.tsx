// @vitest-environment jsdom
import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Modal } from '../Modal'

vi.mock('../../../lib/device', () => ({ useViewport: () => 'phone' }))
;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

let host: HTMLDivElement
let root: Root
const close = vi.fn()
beforeEach(() => {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  document.body.style.overflow = 'auto'
  close.mockClear()
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); document.body.style.overflow = '' })
async function render(inner: boolean, outer = true, dormant = true) {
  await act(async () => root.render(<StrictMode>
    <Modal isOpen={outer} onClose={close} title="Outer"><button>Outer action</button></Modal>
    <Modal isOpen={inner} onClose={close} title="Inner"><button>Inner action</button></Modal>
    {dormant && <Modal isOpen={false} onClose={close} title="Dormant">Closed sibling</Modal>}
  </StrictMode>))
}

describe('UI-04 modal scroll lock ownership', () => {
  it('keeps the outer lock after the inner closes and its closed effect later cleans up', async () => {
    await render(true)
    await render(false)
    await render(false, true, false)
    expect(document.body.style.overflow).toBe('hidden')
  })
  it('closed sibling cleanup never releases an open modal lock in StrictMode', async () => {
    await render(false)
    await render(false, true, false)
    expect(document.body.style.overflow).toBe('hidden')
  })
  it('restores the original overflow only after the last owner closes', async () => {
    await render(true)
    await render(false)
    expect(document.body.style.overflow).toBe('hidden')
    await render(false, false)
    expect(document.body.style.overflow).toBe('auto')
  })
  it('only the top open dialog handles Escape', async () => {
    await render(true)
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    expect(close).toHaveBeenCalledTimes(1)
  })
})
