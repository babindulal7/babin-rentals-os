/**
 * Handover Workspace visible copy names no internal ruling code (audit
 * sweep-D-reports-2-clients-17, reviewer issue 10).
 *
 * The codes stay in code comments. `code()` strips comments, so what is tested
 * is what staff read.
 *
 * `?raw` rather than `node:fs`: this project ships no `@types/node`, so
 * `readFileSync` fails the typecheck gate. Same technique as
 * `modules/clients/__tests__/clientsCopy.test.ts`.
 */
import { describe, it, expect } from 'vitest'
import handoverSrc from '../HandoverWorkspace.tsx?raw'

/** A source file minus its comments, so only the rendered text is checked. */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '')
}

const RULING_CODE = /\bW(?:18|28|34|50|51)[ab]?\b|\bRulings?\s+[WD]\d|\bRuling [WD]\d/

describe('HandoverWorkspace visible copy carries no ruling code', () => {
  it('the government ID label reads without its codes', () => {
    const body = code(handoverSrc)
    expect(body).toContain('Client Government ID')
    expect(body).not.toContain('Client Government ID (W50, W51)')
  })

  it('the first-time client warning reads without its code', () => {
    const body = code(handoverSrc)
    expect(body).toContain('one government ID must be recorded on file before handover.')
    expect(body).not.toContain('(Ruling W50)')
  })

  it('the collector label reads without its codes', () => {
    const body = code(handoverSrc)
    expect(body).toContain('Receiver / Collector (1 Tap)')
    expect(body).not.toContain('W28/W34')
  })

  it('no ruling code appears anywhere the file renders', () => {
    expect(code(handoverSrc)).not.toMatch(RULING_CODE)
  })
})
