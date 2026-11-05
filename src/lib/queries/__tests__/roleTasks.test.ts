// =============================================================================
// src/lib/queries/__tests__/roleTasks.test.ts — Unit tests for Role Tasks (T5-11, W61, W79, W31)
// =============================================================================

import { describe, expect, it } from 'vitest'
import {
  fetchRoleTaskMetrics,
  isBeforeSixAmNpt,
} from '../roleTasks'
import { defaultNavTarget } from '../../../data/nav'
import { canViewMoney } from '../../rbac'

describe('Role Tasks Engine (T5-11, W61, W79, W31)', () => {
  it('correctly detects early morning times before 06:00 NPT (W31)', () => {
    // HH:MM format
    expect(isBeforeSixAmNpt('05:00')).toBe(true)
    expect(isBeforeSixAmNpt('05:45')).toBe(true)
    expect(isBeforeSixAmNpt('06:00')).toBe(false)
    expect(isBeforeSixAmNpt('10:30')).toBe(false)

    // ISO instant with NPT offset (+05:45)
    expect(isBeforeSixAmNpt('2026-10-31T05:15:00+05:45')).toBe(true)
    expect(isBeforeSixAmNpt('2026-10-31T05:55:00+05:45')).toBe(true)
    expect(isBeforeSixAmNpt('2026-10-31T06:00:00+05:45')).toBe(false)
    expect(isBeforeSixAmNpt('2026-10-31T10:00:00+05:45')).toBe(false)

    // Empty/invalid string -> false
    expect(isBeforeSixAmNpt('')).toBe(false)
  })

  it('routes Client to /rentals and staff to /today via defaultNavTarget (W61)', () => {
    expect(defaultNavTarget('Client')).toBe('/rentals')
    expect(defaultNavTarget('Warehouse')).toBe('/today')
    expect(defaultNavTarget('Technician')).toBe('/today')
    expect(defaultNavTarget('Coordinator')).toBe('/today')
    expect(defaultNavTarget('Accounts')).toBe('/today')
    expect(defaultNavTarget('Manager')).toBe('/today')
    expect(defaultNavTarget('Owner')).toBe('/today')
    expect(defaultNavTarget('Admin')).toBe('/today')
    expect(defaultNavTarget('Driver')).toBe('/today')
    expect(defaultNavTarget(undefined)).toBe('/today')
  })

  it('provides Warehouse floor tasks with zero money figures (Law 6, W31)', async () => {
    const metrics = await fetchRoleTaskMetrics('Warehouse')
    expect(metrics.role).toBe('Warehouse')
    expect(metrics.warehouse).toBeDefined()
    expect(metrics.warehouse?.packCount).toBeGreaterThan(0)
    expect(metrics.warehouse?.handoverCount).toBeGreaterThan(0)
    expect(metrics.warehouse?.returnCount).toBeGreaterThan(0)
    expect(metrics.warehouse?.earlyMorningReturnCount).toBeGreaterThan(0)
    expect(metrics.warehouse?.resetCount).toBeGreaterThan(0)

    // Floor roles must have no financial figures
    expect(canViewMoney(metrics.role)).toBe(false)
    expect((metrics as unknown as Record<string, unknown>).accounts).toBeUndefined()
    expect((metrics as unknown as Record<string, unknown>).owner).toBeUndefined()
  })

  it('provides Technician floor tasks with zero money figures (Law 6, W31)', async () => {
    const metrics = await fetchRoleTaskMetrics('Technician')
    expect(metrics.role).toBe('Technician')
    expect(metrics.warehouse).toBeDefined()
    expect(canViewMoney(metrics.role)).toBe(false)
  })

  it('provides Coordinator tasks with online requests and quotes (W61)', async () => {
    const metrics = await fetchRoleTaskMetrics('Coordinator')
    expect(metrics.role).toBe('Coordinator')
    expect(metrics.coordinator).toBeDefined()
    expect(metrics.coordinator?.onlineRequestsCount).toBeGreaterThan(0)
    expect(metrics.coordinator?.quotesWaitingCount).toBeGreaterThan(0)
    expect(metrics.coordinator?.todayPickupsCount).toBeGreaterThan(0)
    expect(metrics.coordinator?.todayReturnsCount).toBeGreaterThan(0)
  })

  it('provides Accounts tasks with rupee amounts and closing status (W61, Law 6 allowed)', async () => {
    const metrics = await fetchRoleTaskMetrics('Accounts')
    expect(metrics.role).toBe('Accounts')
    expect(metrics.accounts).toBeDefined()
    expect(metrics.accounts?.paymentsDueCount).toBeGreaterThan(0)
    expect(metrics.accounts?.paymentsDuePaisa).toBeGreaterThan(0)
    expect(metrics.accounts?.whoOwesCount).toBeGreaterThan(0)
    expect(metrics.accounts?.totalOwedPaisa).toBeGreaterThan(0)
    expect(typeof metrics.accounts?.isDailyClosingSigned).toBe('boolean')
  })

  it('provides Manager tasks with approvals waiting and movements (W57, W61)', async () => {
    const metrics = await fetchRoleTaskMetrics('Manager')
    expect(metrics.role).toBe('Manager')
    expect(metrics.manager).toBeDefined()
    expect(metrics.manager?.approvalsWaitingCount).toBeGreaterThan(0)
    expect(metrics.manager?.lateCount).toBeGreaterThanOrEqual(0)
    expect(metrics.manager?.blockedGearCount).toBeGreaterThanOrEqual(0)
  })

  it('provides Owner tasks with all four W79 blocks (approvals, money, exceptions, pulse)', async () => {
    const metrics = await fetchRoleTaskMetrics('Owner')
    expect(metrics.role).toBe('Owner')
    expect(metrics.owner).toBeDefined()
    // 1. Approvals waiting
    expect(metrics.owner?.approvalsWaitingCount).toBeGreaterThan(0)
    // 2. Today's money (collected, owed, deposits held)
    expect(metrics.owner?.todayMoney.collectedPaisa).toBeGreaterThan(0)
    expect(metrics.owner?.todayMoney.owedPaisa).toBeGreaterThan(0)
    expect(metrics.owner?.todayMoney.depositsHeldPaisa).toBeGreaterThan(0)
    // 3. Late / blocked / damaged
    expect(metrics.owner?.lateCount).toBeGreaterThanOrEqual(0)
    expect(metrics.owner?.blockedCount).toBeGreaterThanOrEqual(0)
    expect(metrics.owner?.damagedCount).toBeGreaterThanOrEqual(0)
    // 4. Business pulse
    expect(metrics.owner?.businessPulse.revenueTodayPaisa).toBeGreaterThan(0)
    expect(metrics.owner?.businessPulse.fleetUtilizationPct).toBeGreaterThan(0)
  })

  it('provides Driver tasks with deliveries and pickups (W61, Law 6)', async () => {
    const metrics = await fetchRoleTaskMetrics('Driver')
    expect(metrics.role).toBe('Driver')
    expect(metrics.driver).toBeDefined()
    expect(metrics.driver?.scheduledDeliveriesCount).toBeGreaterThan(0)
    expect(metrics.driver?.pendingPickupsCount).toBeGreaterThan(0)
    expect(canViewMoney(metrics.role)).toBe(false)
  })

  it('provides Client tasks for external portal (W61, Law 6, Law 14)', async () => {
    const metrics = await fetchRoleTaskMetrics('Client')
    expect(metrics.role).toBe('Client')
    expect(metrics.client).toBeDefined()
    expect(metrics.client?.activeRentalsCount).toBeGreaterThan(0)
    expect(canViewMoney(metrics.role)).toBe(false)
  })
})
