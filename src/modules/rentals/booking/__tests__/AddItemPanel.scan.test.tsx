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

  it('displays truthful conflict error message when onScan rejects with error', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const onScan = vi.fn().mockRejectedValue(new Error('Unit FX3-SN-001 is already reserved by BK-2026-0042'))
    try {
      await act(async () => root.render(
        <AddItemPanel inline window={NO_WINDOW} days={1} existingLineIds={[]} equipment={[]} bundles={[]} onAdd={vi.fn()} onScan={onScan} />,
      ))
      const toggle = host.querySelector<HTMLButtonElement>('[aria-label="Scan barcode or serial"]')!
      await act(async () => toggle.click())
      const input = host.querySelector<HTMLInputElement>('[aria-label="Barcode, serial, or asset tag"]')!
      const change = (value: string) => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
        input.dispatchEvent(new Event('input', { bubbles: true }))
      }
      await act(async () => change('FX3-SN-001'))
      await act(async () => host.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))

      expect(onScan).toHaveBeenCalledWith('FX3-SN-001', NO_WINDOW, 1)
      const alert = host.querySelector('[role="alert"]')
      expect(alert?.textContent).toContain('BK-2026-0042')
    } finally {
      await act(async () => root.unmount())
      host.remove()
    }
  })

  it('keeps manual search and catalog selection usable without blocking scanner', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const onScan = vi.fn().mockResolvedValue('eq-1')
    const onAdd = vi.fn()
    try {
      await act(async () => root.render(
        <AddItemPanel inline window={NO_WINDOW} days={1} existingLineIds={[]} equipment={[]} bundles={[]} onAdd={onAdd} onScan={onScan} />,
      ))
      // Open scanner
      const toggle = host.querySelector<HTMLButtonElement>('[aria-label="Scan barcode or serial"]')!
      await act(async () => toggle.click())
      expect(toggle.getAttribute('aria-expanded')).toBe('true')

      // Main manual search input is still present and interactive
      const searchInput = host.querySelector<HTMLInputElement>('input[role="combobox"]')
      expect(searchInput).not.toBeNull()
      expect(searchInput?.disabled).toBe(false)
    } finally {
      await act(async () => root.unmount())
      host.remove()
    }
  })
})
