import { describe, it, expect } from 'vitest'
// Vite `?raw` import, as breakpoints.test.ts reads this same file. No node:fs: this project ships no @types/node.
import indexHtml from '../../index.html?raw'

/**
 * The boot screen paints a fallback into #root when the app cannot start. That painted markup is the only
 * thing a client reads, so it must be plain client-facing copy: no user agent, no raw error text, no developer
 * detail. Those go to the console. No ordinary test reaches this script, because it runs only when the app has
 * already failed, so this guard reads the source directly.
 */

/** The expression the fallback assigns to #root's innerHTML: the painted markup, and nothing else. */
function paintedExpression(): string {
  const match = indexHtml.match(/root\.innerHTML\s*=([\s\S]*?)\}\s*catch/)
  if (!match) throw new Error('the painted markup was not found in index.html')
  return match[1] ?? ''
}

const expression = paintedExpression()
/* Each quoted literal in the expression, joined: the text a client would see. */
const markup = [...expression.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1] ?? '').join('')

describe('boot fallback — the painted markup is client-facing copy only', () => {
  it('is built from string literals alone, so no error object or user agent can be interpolated into it', () => {
    const leftover = expression.replace(/'(?:[^'\\]|\\.)*'/g, '').replace(/[\s+]/g, '')
    expect(leftover, 'the painted markup references a variable').toBe('')
  })

  it('says This page could not open', () => {
    expect(markup).toContain('This page could not open')
  })

  it('carries no user agent or browser detail', () => {
    expect(markup).not.toMatch(/user ?agent|mozilla|navigator|claude|windows nt/i)
  })

  it('carries no raw error text or developer copy', () => {
    expect(markup).not.toMatch(/error|exception|stack|unhandled|did not start|no error was reported|\.tsx|\.js\b|https?:/i)
  })

  it('sends the details and the user agent to the console instead', () => {
    expect(indexHtml).toMatch(/console\.error\([^)]*navigator\.userAgent/)
  })

  it('uses the same client copy for the last-resort document title', () => {
    expect(indexHtml).toContain("document.title = 'This page could not open'")
  })
})
