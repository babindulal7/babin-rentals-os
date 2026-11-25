import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync('src/components/ui/module-shell/module-shell.css', 'utf8')
const tones = ['emerald', 'amber', 'red', 'slate', 'blue', 'neutral'] as const
const luminance = (hex: string) => {
  const channels = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722
}

describe('shared compact status pill contrast', () => {
  for (const tone of tones) {
    it(tone + ' has an opaque background and AA text contrast', () => {
      const rule = css.split('.module-status-pill--' + tone + ' {')[1]?.split('}')[0] ?? ''
      const background = rule.match(/background:\s*(#[0-9a-f]{6});/i)?.[1]
      const foreground = rule.match(/(?:^|\n)\s*color:\s*(#[0-9a-f]{6});/i)?.[1]
      expect(background).toBeDefined()
      expect(foreground).toBeDefined()
      const a = luminance(background!)
      const b = luminance(foreground!)
      expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toBeGreaterThanOrEqual(4.5)
      if (tone === 'amber') expect(background).toBe('#facc15')
    })
  }
})
