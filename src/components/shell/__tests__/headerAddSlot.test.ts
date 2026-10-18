import { describe, it, expect } from 'vitest'
// `?inline`, not node:fs (no @types/node); vitest.config.ts includes shell.css so it is not stubbed.
import shellCss from '../shell.css?inline'

/**
 * Zoom audit, 16 Oct 2026. The Add slot had a fixed width (156px desktop, 106px tablet)
 * and nothing clipping it, so Inventory's 185px New Equipment split button spilled across
 * the More slot and covered it at 911px — Refresh, Export and Warranty became unreachable.
 * The width is now a floor: a wider Add grows leftwards, and More/Save stay right-anchored.
 */
/** Every `.app-global-header__action-slot--add { … }` rule, in file order: desktop, tablet, phone. */
const addRules = [...shellCss.matchAll(/\.app-global-header__action-slot--add\s*\{([^}]*)\}/g)].map((m) => m[1] ?? '')
const addRule = (band: 'desktop' | 'tablet') => addRules[band === 'desktop' ? 0 : 1] ?? ''

describe('header Add slot', () => {
  it('has a minimum width on desktop, never a fixed one', () => {
    const decl = addRule('desktop')
    expect(decl).toMatch(/min-width:\s*156px/)
    expect(decl).not.toMatch(/(^|[;\s])width:\s*156px/)
    expect(decl).not.toMatch(/flex-basis:\s*156px/)
  })

  it('keeps only a floor in the tablet band', () => {
    const decl = addRule('tablet')
    expect(decl).toMatch(/min-width:\s*106px/)
    expect(decl).not.toMatch(/(^|[;\s])width:\s*106px/)
    expect(decl).not.toMatch(/flex-basis:\s*106px/)
  })
})
