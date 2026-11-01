// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Modal } from '../Modal'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

describe('Modal nested scroll lock (UI-04)', () => {
  let container: HTMLDivElement | null = null
  let root: Root | null = null

  beforeEach(() => {
    document.body.style.overflow = ''
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    if (root && container) {
      act(() => {
        root!.unmount()
      })
      container.remove()
      container = null
      root = null
    }
    document.body.style.overflow = ''
  })

  it('keeps outer modal scroll locked when nested modal opens and closes', async () => {
    function NestedTestComponent({ innerOpen }: { innerOpen: boolean }) {
      return (
        <div>
          <Modal isOpen={true} onClose={() => {}} title="Outer Modal">
            <div>Outer content</div>
            <Modal isOpen={innerOpen} onClose={() => {}} title="Inner Modal">
              <div>Inner content</div>
            </Modal>
          </Modal>
        </div>
      )
    }

    await act(async () => {
      root!.render(<NestedTestComponent innerOpen={false} />)
    })
    expect(document.body.style.overflow).toBe('hidden')

    await act(async () => {
      root!.render(<NestedTestComponent innerOpen={true} />)
    })
    expect(document.body.style.overflow).toBe('hidden')

    await act(async () => {
      root!.render(<NestedTestComponent innerOpen={false} />)
    })
    expect(document.body.style.overflow).toBe('hidden')

    await act(async () => {
      root!.render(<Modal isOpen={false} onClose={() => {}} title="Outer Modal"><div>Closed</div></Modal>)
    })
    expect(document.body.style.overflow).toBe('')
  })
})