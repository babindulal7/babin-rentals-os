import { describe, expect, it } from 'vitest'
import paletteRaw from '../../styles/theme.css?raw'
import entry from '../../main.tsx?raw'

const palette = paletteRaw.replace(/\r\n/g, '\n')

const LIGHT = ":root,\n:root[data-theme='light']"
const DARK = ":root[data-theme='dark']"

function variables(selector: string): Record<string, string> {
  const start = palette.indexOf(selector + ' {')
  if (start < 0) throw new Error(`Missing palette selector ${selector}`)
  const open = palette.indexOf('{', start)
  const close = palette.indexOf('}', open)
  if (close < 0) throw new Error(`Unclosed theme ${selector}`)
  const vars: Record<string, string> = {}
  for (const match of palette.slice(open + 1, close).matchAll(/^\s*(--[a-z0-9-]+):\s*([^;]+);/gm)) {
    if (match[1] && match[2]) vars[match[1]] = match[2].trim()
  }
  return vars
}

function luminance(hex: string): number {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`Expected opaque hex color: ${hex}`)
  const parts = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255)
  const linear = parts.map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05)
}

describe('Graphite/Paper theme.css palette (G-1, G-2, G-3, G-4)', () => {
  it('loads canonical theme.css before ui-v2.css without preset-black-light.css', () => {
    expect(entry).toMatch(/import '\.\/styles\/theme\.css'[\s\S]*import '\.\/styles\/ui-v2\.css'/)
    expect(entry).not.toContain('preset-black-light.css')
  })

  it('removes [data-style="glass"] blocks while preserving high-contrast', () => {
    expect(palette).not.toContain("data-style='glass'")
    expect(palette).not.toContain('data-style="glass"')
    expect(palette).toContain("data-theme='high-contrast'")
  })

  it('uses Graphite/Paper primary buttons and neutral sidebar active tokens while keeping --primary blue', () => {
    const light = variables(LIGHT)
    const dark = variables(DARK)

    expect(light['--primary']).toBe('#2456d6')
    expect(dark['--primary']).toBe('#386af7')

    expect(light['--btn-primary-bg']).toBe('#181A1F')
    expect(light['--btn-primary-fg']).toBe('#FFFFFF')
    expect(dark['--btn-primary-bg']).toBe('#F3F4F6')
    expect(dark['--btn-primary-fg']).toBe('#111215')

    expect(light['--nav-active-bg']).toBe('#F1F2F4')
    expect(light['--nav-active-accent']).toBe('#17191D')
    expect(dark['--nav-active-bg']).toBe('#23262C')
    expect(dark['--nav-active-accent']).toBe('#F7F8FA')
  })

  for (const mode of [LIGHT, DARK]) {
    it(`meets accessible body contrast in ${mode.replace(/\n/g, ' ')}`, () => {
      const vars = variables(mode)
      for (const surface of ['--bg', '--surface', '--surface-2', '--inset2']) {
        for (const text of ['--text', '--text2', '--muted']) {
          expect(contrast(vars[text]!, vars[surface]!), `${mode} ${text} on ${surface}`).toBeGreaterThanOrEqual(4.5)
        }
      }
      if (mode === LIGHT) {
        for (const surface of ['--bg', '--surface', '--surface-2', '--inset2']) {
          expect(contrast(vars['--input-border']!, vars[surface]!)).toBeGreaterThanOrEqual(3)
        }
      }
    })
  }

  it('makes the dark canvas near-black and the light canvas visibly light', () => {
    expect(luminance(variables(DARK)['--bg']!)).toBeLessThan(0.01)
    expect(luminance(variables(LIGHT)['--bg']!)).toBeGreaterThan(0.85)
  })
})
