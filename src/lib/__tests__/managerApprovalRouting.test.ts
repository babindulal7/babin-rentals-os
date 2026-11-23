// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  readManagerApprovalRouting,
  writeSettings,
  resetSettings,
  applyRemoteSettingPatch,
  clearRemoteSettings,
} from '../settingsStore'
import {
  canDecideManagerApproval,
  canDecideExtensionClash,
} from '../rbac'
import { approverFor } from '../damage'
import { canApproveLateFeeWaiver } from '../lateFee'
import { canUserApprove, type ApprovalItem } from '../queries/approvals'
import { rupees } from '../money'

describe('Manager -> Owner Approval Routing (R-22.1 / R-22.8 / O-33)', () => {
  beforeEach(() => {
    resetSettings()
  })

  it('defaults managerApprovalRouting to standard mode', () => {
    expect(readManagerApprovalRouting()).toBe('standard')
  })

  it('updates and persists owner_only routing mode in settingsStore', () => {
    writeSettings({ managerApprovalRouting: 'owner_only' })
    expect(readManagerApprovalRouting()).toBe('owner_only')

    resetSettings()
    expect(readManagerApprovalRouting()).toBe('standard')
  })

  it('evaluates RBAC manager approval authority under both modes', () => {
    // Standard mode: Owner, Admin, Manager all have decision authority
    expect(canDecideManagerApproval('Owner', 'standard')).toBe(true)
    expect(canDecideManagerApproval('Admin', 'standard')).toBe(true)
    expect(canDecideManagerApproval('Manager', 'standard')).toBe(true)
    expect(canDecideManagerApproval('Coordinator', 'standard')).toBe(false)
    expect(canDecideManagerApproval('Warehouse', 'standard')).toBe(false)

    // Owner-only mode (R-22.1): Strictly Owner
    expect(canDecideManagerApproval('Owner', 'owner_only')).toBe(true)
    expect(canDecideManagerApproval('Admin', 'owner_only')).toBe(false)
    expect(canDecideManagerApproval('Manager', 'owner_only')).toBe(false)
    expect(canDecideManagerApproval('Coordinator', 'owner_only')).toBe(false)
  })

  it('evaluates extension clash authority under R-22.8 category 3', () => {
    expect(canDecideExtensionClash('Manager', 'standard')).toBe(true)
    expect(canDecideExtensionClash('Admin', 'standard')).toBe(true)
    expect(canDecideExtensionClash('Owner', 'standard')).toBe(true)

    // Routed to owner
    expect(canDecideExtensionClash('Manager', 'owner_only')).toBe(false)
    expect(canDecideExtensionClash('Admin', 'owner_only')).toBe(false)
    expect(canDecideExtensionClash('Owner', 'owner_only')).toBe(true)
  })

  it('routes damage findings (< Rs 25k) to Owner under owner_only mode (R-22.8 category 1)', () => {
    const smallDamage = rupees(8000)
    const largeDamage = rupees(30000)

    // Standard mode: small damage goes to Manager, large to Owner
    expect(approverFor(smallDamage, 'standard')).toBe('Manager')
    expect(approverFor(largeDamage, 'standard')).toBe('Owner')

    // Owner-only mode: even small damage routes to Owner
    expect(approverFor(smallDamage, 'owner_only')).toBe('Owner')
    expect(approverFor(largeDamage, 'owner_only')).toBe('Owner')
  })

  it('routes late fee waivers strictly to Owner under owner_only mode (R-22.8 category 2)', () => {
    expect(canApproveLateFeeWaiver('Manager', 'standard')).toBe(true)
    expect(canApproveLateFeeWaiver('Owner', 'standard')).toBe(true)

    expect(canApproveLateFeeWaiver('Manager', 'owner_only')).toBe(false)
    expect(canApproveLateFeeWaiver('Owner', 'owner_only')).toBe(true)
  })

  it('enforces approvals inbox decision level under owner_only mode (R-22.8 category 4)', () => {
    const managerItem: ApprovalItem = {
      id: 'appr-test-1',
      type: 'damage_charge',
      status: 'Pending',
      entityId: 'DMG-001',
      entityNumber: 'DMG-001',
      title: 'Small Scuff',
      description: 'Minor scuff on lens body',
      amountPaisa: rupees(5000),
      requiredLevel: 'Manager',
      submittedBy: {
        id: 'usr-sub-1',
        name: 'Staff Member',
        role: 'Warehouse',
      },
      submittedAtAd: '2026-11-23T10:00:00Z',
      submittedAtBs: '2083-08-08',
      linkUrl: '/test',
    }

    // Under standard routing: Manager can approve
    const standardCheck = canUserApprove(managerItem, 'Manager', 'usr-mgr-1', 'standard')
    expect(standardCheck.allowed).toBe(true)

    // Under owner_only routing: Manager cannot approve
    const ownerOnlyCheck = canUserApprove(managerItem, 'Manager', 'usr-mgr-1', 'owner_only')
    expect(ownerOnlyCheck.allowed).toBe(false)
    expect(ownerOnlyCheck.reason).toContain('routed directly to the Owner')

    // Owner can always approve
    const ownerCheck = canUserApprove(managerItem, 'Owner', 'usr-owner-1', 'owner_only')
    expect(ownerCheck.allowed).toBe(true)
  })
})
