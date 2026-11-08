// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ShiftBriefModal } from '../ShiftBriefModal'
import type { InternalNote } from '../../../lib/queries/internalNotes'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const mockNotes: InternalNote[] = [
  {
    id: 'n-1',
    author: 'Sunil',
    authorRole: 'Technician',
    at: '10:00 AM',
    timestamp: Date.now(),
    category: 'Shift Handover',
    priority: 'normal',
    text: 'Client requested early pickup at 06:00',
  },
]

describe('ShiftBriefModal — clipboard truthfulness (UX-25)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.restoreAllMocks()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it('renders inline error when clipboard write fails', async () => {
    const originalClipboard = navigator.clipboard
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockRejectedValue(new Error('Permission denied')),
      },
      configurable: true,
    })

    await act(async () => {
      root.render(
        <ShiftBriefModal
          isOpen={true}
          onClose={() => {}}
          notes={mockNotes}
        />,
      )
    })

    const copyBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Copy Shift Brief'),
    )
    expect(copyBtn).toBeDefined()

    await act(async () => {
      copyBtn!.click()
    })

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Could not copy automatically',
    )

    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      configurable: true,
    })
  })
})
