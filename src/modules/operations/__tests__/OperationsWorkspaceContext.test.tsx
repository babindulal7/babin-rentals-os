// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OperationsWorkspaceProvider, useOperationsWorkspace } from '../OperationsWorkspaceContext'
import type { OperationsShellProps } from '../OperationsShell'

vi.mock('../OperationsShell', () => ({ default: ({ bookingNo, initialJob, onClose, onDirtyChange, onBusyChange }: OperationsShellProps) => <section aria-label="Workspace"><p>{bookingNo} {initialJob}</p><button onClick={() => onDirtyChange?.(true)}>Mark dirty</button><button onClick={() => onBusyChange?.(true)}>Begin save</button><button onClick={() => onBusyChange?.(false)}>Finish save</button><button onClick={onClose}>Shell close</button></section> }))
;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
function Controls() {
  const { openOperations, closeOperations } = useOperationsWorkspace()
  return <><button onClick={() => openOperations('BK-A', 'Booked')}>Open A</button><button onClick={() => openOperations('BK-B', 'On Rent')}>Open B</button><button onClick={closeOperations}>External close</button></>
}
let root: Root
let container: HTMLDivElement
async function click(label: string) { await act(async () => { [...document.querySelectorAll('button')].find(button => button.textContent === label)?.click() }) }
async function mount() {
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
  await act(async () => root.render(<OperationsWorkspaceProvider><Controls /></OperationsWorkspaceProvider>))
}
afterEach(async () => { await act(async () => root.unmount()); container.remove() })
describe('canonical Operations host', () => {
  it('defaults to the eligible stage and never mutates a booking', async () => {
    await mount(); await click('Open B'); expect(container.textContent).toContain('BK-B Return')
  })
  it('keeps dirty marks when a booking switch is cancelled', async () => {
    await mount(); await click('Open A'); await click('Mark dirty'); await click('Open B')
    expect(container.textContent).toContain('Discard unsaved operations work?')
    await click('Keep editing'); expect(container.querySelector('section')?.textContent).toContain('BK-A Pack')
  })
  it('switches only the intended booking after explicit discard', async () => {
    await mount(); await click('Open A'); await click('Mark dirty'); await click('Open B'); await click('Discard changes')
    expect(container.querySelector('section')?.textContent).toContain('BK-B Return')
  })
  it('guards an external close while dirty', async () => {
    await mount(); await click('Open A'); await click('Mark dirty'); await click('External close')
    expect(container.querySelector('section')).not.toBeNull(); await click('Discard changes'); expect(container.querySelector('section')).toBeNull()
  })
  it('refuses booking switches during an in-flight operation', async () => {
    await mount(); await click('Open A'); await click('Begin save'); await click('Open B')
    expect(container.querySelector('section')?.textContent).toContain('BK-A'); expect(container.querySelector('[role="status"]')?.textContent).toContain('being saved')
    await click('Finish save'); await click('Open B'); expect(container.querySelector('section')?.textContent).toContain('BK-B')
  })
})
