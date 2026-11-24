import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (file: string) => readFileSync(join(process.cwd(), file), 'utf8')

describe('Day X Launch Execution Runbook documentation (31 December 2026)', () => {
  it('documents Day X minute-by-minute cutover sequence, backup, DNS, smoke test, and fallback SLA', () => {
    const doc = read('docs/live/DAY_X_LAUNCH_EXECUTION_RUNBOOK_2026-12-31.md')
    expect(doc).toContain('Day X Launch Execution Runbook — 31 December 2026')
    expect(doc).toContain('06:00 NPT')
    expect(doc).toContain('Option A Tabular Backup Export')
    expect(doc).toContain('Disable Online Store Checkout')
    expect(doc).toContain('book.babinrentals.com')
    expect(doc).toContain('Card T1-11 Live Smoke Test Execution')
    expect(doc).toContain('Booqable Zero-Order Verification')
    expect(doc).toContain('Emergency 15-Minute Fallback Trigger')
  })
})
