import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (file: string) => readFileSync(join(process.cwd(), file), 'utf8')

describe('Day X Launch Execution Runbook documentation (31 December 2026)', () => {
  const doc = read('docs/live/DAY_X_LAUNCH_EXECUTION_RUNBOOK_2026-12-31.md')

  it('documents Day X minute-by-minute cutover sequence, backup, DNS, smoke test, and fallback SLA', () => {
    expect(doc).toContain('Day X Launch Execution Runbook — 31 December 2026')
    expect(doc).toContain('06:00 NPT')
    expect(doc).toContain('Option A Tabular Backup Export')
    expect(doc).toContain('Disable Online Store Checkout')
    expect(doc).toContain('book.babinrentals.com')
    expect(doc).toContain('Card T1-11 Live Smoke Test Execution')
    expect(doc).toContain('Booqable Zero-Order Verification')
    expect(doc).toContain('Emergency Fallback Procedure (15-Minute Target SLA)')
  })

  it('enforces that all T-24h readiness checks remain pending with timestamp, owner, and evidence requirements', () => {
    const preconditionsSection = doc.split('## 2. Minute-by-Minute Cutover Schedule')[0] ?? ''
    
    // Must contain explicit pending banner and table
    expect(preconditionsSection).toContain('All T-24h readiness checks remain **PENDING**')
    expect(preconditionsSection).toContain('Future work is never certified in advance')
    expect(preconditionsSection).toContain('Execution Timestamp')
    expect(preconditionsSection).toContain('Sign-Off Owner')
    expect(preconditionsSection).toContain('Required Evidence / Artifact')

    // Every checklist item in T-24h section must be an unchecked pending box
    const checkItems = preconditionsSection
      .split('\n')
      .filter((line) => line.trim().startsWith('- ['))
    
    expect(checkItems.length).toBeGreaterThanOrEqual(5)
    for (const item of checkItems) {
      expect(item).toMatch(/^- \[ \] /)
      expect(item).not.toMatch(/^- \[x\] /i)
      expect(item.toLowerCase()).toContain('pending')
    }
  })

  it('enforces strict rollback ordering: freeze -> capture delta -> reconcile -> verify parity -> reopen with owner authorization', () => {
    const fallbackSection = doc.split('## 3. Emergency Fallback Procedure')[1] ?? ''
    expect(fallbackSection).toBeTruthy()

    // Find indices of key recovery steps to assert strict order
    const idxFreeze = fallbackSection.indexOf('Freeze Both Intake Paths Immediately')
    const idxCapture = fallbackSection.indexOf('Capture Delta Snapshot')
    const idxReconcile = fallbackSection.indexOf('Reconcile Bookings, Stock, Invoices, and Payments')
    const idxParity = fallbackSection.indexOf('Verify State Parity')
    const idxReopen = fallbackSection.indexOf('Reopen Single System with Owner Authorization')

    expect(idxFreeze).toBeGreaterThan(-1)
    expect(idxCapture).toBeGreaterThan(idxFreeze)
    expect(idxReconcile).toBeGreaterThan(idxCapture)
    expect(idxParity).toBeGreaterThan(idxReconcile)
    expect(idxReopen).toBeGreaterThan(idxParity)

    // Detailed verification points
    expect(fallbackSection).toContain('Zero new bookings accepted in either system during freeze')
    expect(fallbackSection).toContain('Reconcile all cash received, Fonepay QR transfers, and security deposits collected')
    expect(fallbackSection).toContain('Validate 0 paisa variance')
    expect(fallbackSection).toContain('Only after parity is verified and signed off, Babin Dulal authorizes reopening')
  })

  it('enforces fail-closed behavior when reconciliation exceeds 15-minute target without speculative recovery promises', () => {
    const fallbackSection = doc.split('## 3. Emergency Fallback Procedure')[1] ?? ''
    
    // Fail-closed SLA enforcement
    expect(fallbackSection).toContain('Fail-Closed Target SLA Guard')
    expect(fallbackSection).toContain('FAILS CLOSED')
    expect(fallbackSection).toContain('both intake paths remain completely frozen')
    expect(fallbackSection).toContain('never promised without exact-head verification evidence')

    // Negative assertions against unproven assumptions
    expect(fallbackSection).not.toContain('Re-Enable Booqable (3 mins)')
    expect(fallbackSection).not.toContain('Revert DNS (5 mins)')
    expect(fallbackSection).not.toContain('Data Sync (7 mins)')
  })

  it('negative cases: rejects certified future checkboxes and premature traffic reopening in fallback', () => {
    // 1. T-24h section must not contain certified checkboxes [x]
    const preconditionsSection = doc.split('## 2. Minute-by-Minute Cutover Schedule')[0] ?? ''
    expect(preconditionsSection).not.toMatch(/- \[x\]/i)

    // 2. Fallback must never reopen Booqable or DNS prior to intake freeze
    const fallbackSection = doc.split('## 3. Emergency Fallback Procedure')[1] ?? ''
    const idxReopenBooqable = fallbackSection.indexOf('Enable Booqable counter intake')
    const idxFreezeIntake = fallbackSection.indexOf('Freeze Both Intake Paths Immediately')
    expect(idxFreezeIntake).toBeGreaterThan(-1)
    expect(idxReopenBooqable).toBeGreaterThan(idxFreezeIntake)
  })
})
