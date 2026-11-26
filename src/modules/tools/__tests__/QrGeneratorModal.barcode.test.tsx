// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import QrGenerator from '../QrGeneratorModal'
import { generateCode128Svg } from '../../../lib/labelPrinter'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | undefined
let container: HTMLDivElement | undefined

afterEach(() => {
  if (root) act(() => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
})

function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root?.render(<QrGenerator />))
}

const tagInput = () => container!.querySelector<HTMLInputElement>('#qr-tag-text')!
const formatButton = (label: string) => [...container!.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)!
const printButton = () => [...container!.querySelectorAll('button')].find((b) => b.textContent?.includes('Print Tag Label'))!
const preview = () => container!.querySelector('[role="img"]')
const alert = () => container!.querySelector('[role="alert"]')

function typeTag(value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(tagInput(), value)
    tagInput().dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('1D Barcode validator in the tag generator', () => {
  it('accepts a hyphenated serial and renders a Code 128 label', () => {
    mount()
    act(() => formatButton('1D Barcode').click())

    typeTag('FX6-2004')

    expect(alert()).toBeNull()
    expect(preview()?.getAttribute('aria-label')).toBe('Code 128 barcode for FX6-2004')
    expect(printButton().disabled).toBe(false)
  })

  it('accepts a lowercase serial with no hyphen', () => {
    mount()
    act(() => formatButton('1D Barcode').click())

    typeTag('fx69941')

    expect(alert()).toBeNull()
    expect(preview()?.getAttribute('aria-label')).toBe('Code 128 barcode for fx69941')
    expect(printButton().disabled).toBe(false)
  })

  it('refuses a non-ASCII serial with a plain inline message and no label', () => {
    mount()
    act(() => formatButton('1D Barcode').click())

    typeTag('FX-é01')

    expect(preview()).toBeNull()
    expect(alert()?.textContent).toBe('Cannot encode this tag in the selected format.')
    expect(printButton().disabled).toBe(true)
  })

  it('the Code 128 encoder produces distinct symbols for hyphen and lowercase input', () => {
    let printable = ''
    for (let code = 0x20; code <= 0x7e; code++) printable += String.fromCharCode(code)

    expect(generateCode128Svg(printable)).toContain('<rect')
    expect(generateCode128Svg('fx69941')).not.toBe(generateCode128Svg('FX69941'))
    expect(generateCode128Svg('FX6-2004')).not.toBe(generateCode128Svg('FX62004'))
  })
})
