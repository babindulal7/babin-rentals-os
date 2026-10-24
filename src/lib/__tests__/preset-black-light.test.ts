import { describe, expect, it } from 'vitest'
import palette from '../../styles/preset-black-light.css?inline'
import entry from '../../main.tsx?raw'

const LIGHT = ":root[data-theme='light']:not([data-style='glass'])"
const DARK = ":root[data-theme='dark']:not([data-style='glass'])"

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

describe('shadcn b1avaxO6a black/light local adaptation', () => {
  it('loads after canonical tokens, before component styles', () => {
    expect(entry).toMatch(/import '\.\/styles\/theme\.css'[\s\S]*import '\.\/styles\/preset-black-light\.css'[\s\S]*import '\.\/styles\/ui-v2\.css'/)
  })

  it('preserves semantic, role, touch target, high contrast and glass contracts', () => {
    expect(palette).not.toMatch(/^\s*--(?:primary|success|danger|warn|ready|neutral|on-primary|st-[a-z-]+|r-[a-z-]+|font-[a-z-]+|control-height|tap):/m)
    expect(palette).not.toContain('@media')
    expect(palette).not.toContain("data-theme='high-contrast'")
    expect(palette).toContain(":not([data-style='glass'])")
    expect(palette).not.toContain('!important')
  })

  for (const mode of [LIGHT, DARK]) {
    it(`meets accessible body contrast in ${mode}`, () => {
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

  it('makes the dark canvas black and the light canvas visibly light', () => {
    expect(luminance(variables(DARK)['--bg']!)).toBeLessThan(0.01)
    expect(luminance(variables(LIGHT)['--bg']!)).toBeGreaterThan(0.85)
  })
})
