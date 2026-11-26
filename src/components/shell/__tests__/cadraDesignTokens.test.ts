import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { fontFamilies, lightColors, darkColors, radii, iconStroke } from '../../../../packages/design-tokens/src/index'

const theme = fs.readFileSync(path.resolve('src/styles/theme.css'), 'utf8').replace(/\r\n/g, '\n')
function themeBlock(selector: string): string {
  const start = theme.indexOf(selector)
  expect(start).toBeGreaterThanOrEqual(0)
  return theme.slice(start, theme.indexOf('\n}', start))
}
function token(block: string, name: string): string | undefined {
  return [...block.matchAll(new RegExp(`${name}:\\s*([^;]+);`, 'g'))].at(-1)?.[1]?.trim()
}

describe('Cadra token ownership', () => {
  it.each([
    [":root,\n:root[data-theme='light'] {", lightColors],
    [":root[data-theme='dark'] {", darkColors],
  ] as const)('keeps the shipped neutral palette aligned with its token source: %s', (selector, colors) => {
    const block = themeBlock(selector)
    for (const [cssName, key] of [['--app', 'app'], ['--card', 'card'], ['--text', 'text'], ['--muted', 'muted'], ['--input-border', 'inputBorder']] as const) {
      expect(token(block, cssName)).toBe(colors[key])
    }
  })
  it('uses the authorized self-hosted family for each role', () => {
    expect(fontFamilies.display[0]).toBe('Outfit')
    expect(fontFamilies.body[0]).toBe('Source Sans 3')
    expect(fontFamilies.id[0]).toBe('JetBrains Mono Variable')
    expect(fontFamilies.mono[0]).toBe('JetBrains Mono Variable')
    expect(fontFamilies.neDisplay[0]).toBe('Asar')
    expect(fontFamilies.neBody[0]).toBe('Hind')
    expect(theme).toContain("--font-body: 'Source Sans 3'")
    expect(theme).toContain("--font-num: 'JetBrains Mono Variable'")
    expect(theme).toContain(`--r-card: ${radii.lg}`)
    expect(iconStroke.regular).toBe(2)
  })
  it('loads only the canonical visual owners and the scoped pilot', () => {
    const entry = fs.readFileSync(path.resolve('src/main.tsx'), 'utf8')
    expect(entry).toContain("import './styles/theme.css'")
    expect(entry).toContain("import './styles/ui-v2.css'")
    expect(entry).toContain("import './styles/shadcn-preset-pilot.css'")
    expect(entry).not.toMatch(/import ['"]\.\/styles\/(preset-black-light|shadcn-luma-ui|shadcn-rhea-ui)\.css/)
  })
})
