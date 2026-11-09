import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { safeWeight, wouldSynthesise, FONT_STACK } from '../i18n'
import { BP } from '../breakpoints'

describe('T6-08 · Nepali layout pass & typography invariants', () => {
  it('safeWeight() unconditionally clamps all heading weights in Nepali to 400 (Asar)', () => {
    const weightsToTest = [100, 300, 400, 500, 600, 700, 800, 900]
    for (const w of weightsToTest) {
      expect(safeWeight(w, 'ne', 'heading')).toBe(400)
      expect(wouldSynthesise(safeWeight(w, 'ne', 'heading'), 'ne', 'heading')).toBe(false)
    }
  })

  it('theme.css clamps Nepali headings to font-weight: 400 and Asar display font', () => {
    const themeCss = fs.readFileSync(path.resolve(process.cwd(), 'src/styles/theme.css'), 'utf-8')
    // Check that :root[lang='ne'] covers heading tags and sets font-weight: 400
    expect(themeCss).toContain(":root[lang='ne'] h1,")
    expect(themeCss).toContain(":root[lang='ne'] h2,")
    expect(themeCss).toContain(":root[lang='ne'] h3,")
    expect(themeCss).toContain(":root[lang='ne'] h4,")
    expect(themeCss).toContain(":root[lang='ne'] .kpi-value")
    expect(themeCss).toContain('font-family: var(--font-ne-display);')
    expect(themeCss).toMatch(/font-weight:\s*400\s*(!important)?;/i)
  })

  it('theme.css applies line-height 1.6 and Hind body font to text, controls, and badges in Nepali', () => {
    const themeCss = fs.readFileSync(path.resolve(process.cwd(), 'src/styles/theme.css'), 'utf-8')
    expect(themeCss).toContain(":root[lang='ne'] body,")
    expect(themeCss).toContain(":root[lang='ne'] td,")
    expect(themeCss).toContain(":root[lang='ne'] button,")
    expect(themeCss).toContain(":root[lang='ne'] label,")
    expect(themeCss).toContain(":root[lang='ne'] .badge,")
    expect(themeCss).toContain('font-family: var(--font-ne-body);')
    expect(themeCss).toContain('line-height: 1.6;')
  })

  it('declares Asar and Hind in both English fallback stacks and Nepali primary stacks (RULINGS-2026-10-23)', () => {
    expect(FONT_STACK.ne.heading).toContain('Asar')
    expect(FONT_STACK.ne.body).toContain('Hind')
    expect(FONT_STACK.ne.mono).toContain('Outfit')

    const themeCss = fs.readFileSync(path.resolve(process.cwd(), 'src/styles/theme.css'), 'utf-8')
    expect(themeCss).toContain("--font-display: 'Outfit', 'Asar', system-ui, sans-serif;")
    expect(themeCss).toContain("--font-body: 'Outfit', 'Hind', system-ui, sans-serif;")
    expect(themeCss).toContain("--font-ne-display: 'Asar', 'Outfit', 'Noto Sans Devanagari', system-ui, sans-serif;")
    expect(themeCss).toContain("--font-ne-body: 'Hind', 'Outfit', 'Noto Sans Devanagari', system-ui, sans-serif;")
  })

  it('every translation catalogue in src/i18n/ne/*.json has zero Devanagari digits (R-21 / Law 6)', () => {
    const neDir = path.resolve(process.cwd(), 'src/i18n/ne')
    const files = fs.readdirSync(neDir).filter((f) => f.endsWith('.json'))
    expect(files.length).toBeGreaterThan(0)

    for (const file of files) {
      const content = JSON.parse(fs.readFileSync(path.join(neDir, file), 'utf-8'))
      for (const [key, value] of Object.entries(content)) {
        if (typeof value === 'string') {
          expect(value, `${file} key "${key}" contains Devanagari digits`).not.toMatch(/[०-९]/)
        }
      }
    }
  })

  it('responsive.css matches breakpoint contract (360 mobile, 820 tablet, 1280 desktop)', () => {
    expect(BP.phone).toBe(768)
    expect(BP.desktop).toBe(1280)
    const responsiveCss = fs.readFileSync(path.resolve(process.cwd(), 'src/styles/responsive.css'), 'utf-8')
    expect(responsiveCss).toContain('@media (max-width: 767px)')
    expect(responsiveCss).toContain('.data-table')
    expect(responsiveCss).toContain('.rsp-table-scroll:not(.no-shrink)')
  })

  it('vite.config.ts precaches .woff2 files for offline font resilience', () => {
    const viteConfig = fs.readFileSync(path.resolve(process.cwd(), 'vite.config.ts'), 'utf-8')
    expect(viteConfig).toContain("globPatterns: ['**/*.{js,wasm,css,html,ico,png,svg,woff2}']")
    expect(viteConfig).toContain("'**/*-cyrillic-*'")
    expect(viteConfig).toContain("'**/*-greek-*'")
  })

  it('FONT_STACK defines Asar and Hind faces for Nepali display and body', () => {
    expect(FONT_STACK.ne.heading).toContain('Asar')
    expect(FONT_STACK.ne.body).toContain('Hind')
  })
})
