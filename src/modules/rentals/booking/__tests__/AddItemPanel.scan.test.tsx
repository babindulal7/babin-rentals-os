// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { AddItemPanel } from '../AddItemPanel'
import { NO_WINDOW } from '../itemCatalogue'

vi.mock('../../../../lib/device', () => ({ useViewport: () => 'desktop' }))

describe('AddItemPanel scanner', () => {
  it('opens the scanner, adds a matched code, and keeps failures inline', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const onScan = vi.fn().mockResolvedValueOnce('equipment-1').mockResolvedValueOnce(null)
    try {
      await act(async () => root.render(
        <AddItemPanel inline window={NO_WINDOW} days={1} existingLineIds={[]} equipment={[]} bundles={[]} onAdd={vi.fn()} onScan={onScan} />,
      ))
      const toggle = host.querySelector<HTMLButtonElement>('[aria-label="Scan barcode or serial"]')!
      await act(async () => toggle.click())
      expect(toggle.getAttribute('aria-expanded')).toBe('true')
      const input = host.querySelector<HTMLInputElement>('[aria-label="Barcode, serial, or asset tag"]')!
      const change = (value: string) => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
        input.dispatchEvent(new Event('input', { bubbles: true }))
      }
      await act(async () => change('UNIT-1'))
      await act(async () => host.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
      expect(onScan).toHaveBeenCalledWith('UNIT-1', NO_WINDOW, 1)
      expect(host.querySelector('[role="status"]')?.textContent).toContain('added')
      await act(async () => change('UNKNOWN'))
      await act(async () => host.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
      expect(host.querySelector('[role="alert"]')?.textContent).toContain('Could not add')
    } finally {
      await act(async () => root.unmount())
      host.remove()
    }
  })
  it('shows the engine message inline and ignores the same code scanned twice within 1.5 s', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const onScan = vi
      .fn()
      .mockResolvedValue({ status: 'blocked', reason: 'unavailable', message: 'Alexa Mini is with Sunrise Films on BK-204 (on rent). It is not free for these dates.' })
    try {
      await act(async () => root.render(
        <AddItemPanel inline window={NO_WINDOW} days={1} existingLineIds={[]} equipment={[]} bundles={[]} onAdd={vi.fn()} onScan={onScan} />,
      ))
      await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Scan barcode or serial"]')!.click())
      const input = host.querySelector<HTMLInputElement>('[aria-label="Barcode, serial, or asset tag"]')!
      const scan = async (value: string) => {
        await act(async () => {
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
          input.dispatchEvent(new Event('input', { bubbles: true }))
        })
        await act(async () => host.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
      }
      await scan('AX-1')
      expect(host.querySelector('[role="alert"]')?.textContent).toContain('Sunrise Films')
      expect(host.querySelector('[role="alert"]')?.textContent).toContain('BK-204')
      await scan('AX-1')
      expect(onScan).toHaveBeenCalledTimes(1)
      await scan('AX-2')
      expect(onScan).toHaveBeenCalledTimes(2)
    } finally {
      await act(async () => root.unmount())
      host.remove()
    }
  })
})
