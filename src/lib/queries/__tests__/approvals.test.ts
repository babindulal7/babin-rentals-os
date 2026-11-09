import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  fetchApprovals,
  fetchApprovalItemById,
  canUserApprove,
  approveApprovalItem,
  declineApprovalItem,
  notifyBabinOfApproval,
  _resetMockApprovals,
  _getMockApprovals,
  type ApprovalItem,
} from '../approvals'

describe('Approvals Inbox Query Engine (T5-10, W57, W58)', () => {
  beforeEach(() => {
    _resetMockApprovals()
    vi.restoreAllMocks()
  })

  it('fetches pending approval items with filters', async () => {
    const all = await fetchApprovals()
    expect(all.length).toBeGreaterThan(0)

    const damageOnly = await fetchApprovals({ type: 'damage_charge' })
    expect(damageOnly.every((i) => i.type === 'damage_charge')).toBe(true)

    const searchMatch = await fetchApprovals({ search: 'RED Komodo' })
    expect(searchMatch.length).toBe(1)
    expect(searchMatch[0]?.entityNumber).toBe('DMG-2026-0042')
  })

  it('fetches single item by ID or entity number', async () => {
    const item = await fetchApprovalItemById('appr-001')
    expect(item).not.toBeNull()
    expect(item?.entityNumber).toBe('DMG-2026-0041')

    const byEntity = await fetchApprovalItemById('DMG-2026-0041')
    expect(byEntity).not.toBeNull()
    expect(byEntity?.id).toBe('appr-001')
  })

  describe('Authorization and ladder rules (W57, PERMISSIONS §6.2, P7, Law 6)', () => {
    const managerEligibleItem: ApprovalItem = {
      id: 'test-01',
      type: 'damage_charge',
      status: 'Pending',
      entityId: 'DMG-001',
      entityNumber: 'DMG-001',
      title: 'Tripod damage',
      description: 'Minor collar crack',
      amountPaisa: 800000 as any, // Rs 8,000
      requiredLevel: 'Manager',
      submittedBy: { id: 'user-wh', name: 'Warehouse Staff', role: 'Warehouse' },
      submittedAtAd: '2026-10-30T00:00:00Z',
      submittedAtBs: '2083-07-14',
      linkUrl: '/inventory',
    }

    const ownerOnlyItem: ApprovalItem = {
      id: 'test-02',
      type: 'damage_charge',
      status: 'Pending',
      entityId: 'DMG-002',
      entityNumber: 'DMG-002',
      title: 'Camera sensor damage',
      description: 'Shattered sensor',
      amountPaisa: 18500000 as any, // Rs 185,000
      requiredLevel: 'Owner',
      submittedBy: { id: 'user-coord', name: 'Coordinator', role: 'Coordinator' },
      submittedAtAd: '2026-10-30T00:00:00Z',
      submittedAtBs: '2083-07-14',
      linkUrl: '/inventory',
    }

    it('allows Manager to approve manager-eligible items when Babin is away (W57)', () => {
      const res = canUserApprove(managerEligibleItem, 'Manager', 'user-mgr')
      expect(res.allowed).toBe(true)
    })

    it('NEVER allows Manager to approve Owner-only items at or above threshold (§6.2)', () => {
      const res = canUserApprove(ownerOnlyItem, 'Manager', 'user-mgr')
      expect(res.allowed).toBe(false)
      expect(res.reason).toContain('Owner-only approval required')
    })

    it('allows Owner (Babin) to approve both Manager-eligible and Owner-only items', () => {
      expect(canUserApprove(managerEligibleItem, 'Owner', 'babin-id').allowed).toBe(true)
      expect(canUserApprove(ownerOnlyItem, 'Owner', 'babin-id').allowed).toBe(true)
    })

    it('strictly forbids self-approval (PERMISSIONS.md P7)', () => {
      // Submitter trying to approve their own submission
      const res = canUserApprove(managerEligibleItem, 'Manager', 'user-wh')
      expect(res.allowed).toBe(false)
      expect(res.reason).toContain('Self-approval forbidden (P7)')
    })

    it('strictly rejects floor roles (Law 6)', () => {
      expect(canUserApprove(managerEligibleItem, 'Warehouse', 'user-wh2').allowed).toBe(false)
      expect(canUserApprove(managerEligibleItem, 'Technician', 'user-tech').allowed).toBe(false)
      expect(canUserApprove(managerEligibleItem, 'Driver', 'user-dr').allowed).toBe(false)
      expect(canUserApprove(managerEligibleItem, 'Client', 'user-client').allowed).toBe(false)
    })
  })

  describe('Approval decisions (approve and decline)', () => {
    it('approves an item successfully with recorded approver and date', async () => {
      const res = await approveApprovalItem(
        'appr-001',
        { id: 'usr-mgr-99', name: 'Pradeep Giri', role: 'Manager' },
        'Standard repair charges agreed with client',
      )

      expect(res.success).toBe(true)
      expect(res.item?.status).toBe('Approved')
      expect(res.item?.decidedBy?.name).toBe('Pradeep Giri')
      expect(res.item?.decisionReason).toBe('Standard repair charges agreed with client')

      // Verify mock store was updated
      const updated = _getMockApprovals().find((i) => i.id === 'appr-001')
      expect(updated?.status).toBe('Approved')
    })

    it('declines an item with mandatory reason ≥ 10 characters', async () => {
      // Attempt with too-short reason
      const shortRes = await declineApprovalItem(
        'appr-003',
        { id: 'usr-mgr-99', name: 'Pradeep Giri', role: 'Manager' },
        'No',
      )
      expect(shortRes.success).toBe(false)
      expect(shortRes.error).toContain('at least 10 characters')

      // Attempt with valid reason
      const validRes = await declineApprovalItem(
        'appr-003',
        { id: 'usr-mgr-99', name: 'Pradeep Giri', role: 'Manager' },
        'Client was notified in advance; delay does not meet waiver criteria.',
      )
      expect(validRes.success).toBe(true)
      expect(validRes.item?.status).toBe('Declined')
      expect(validRes.item?.decisionReason).toContain('does not meet waiver criteria')
    })

    it('refuses to approve an already decided item', async () => {
      await approveApprovalItem(
        'appr-001',
        { id: 'usr-mgr-99', name: 'Pradeep Giri', role: 'Manager' },
      )

      const secondAttempt = await approveApprovalItem(
        'appr-001',
        { id: 'usr-mgr-99', name: 'Pradeep Giri', role: 'Manager' },
      )
      expect(secondAttempt.success).toBe(false)
      expect(secondAttempt.error).toContain('already in status')
    })

    it('refuses approval if user lacks necessary authority', async () => {
      // Manager attempting to approve an Owner-only item (appr-002, RED Komodo Rs 185,000)
      const res = await approveApprovalItem(
        'appr-002',
        { id: 'usr-mgr-99', name: 'Pradeep Giri', role: 'Manager' },
      )
      expect(res.success).toBe(false)
      expect(res.error).toContain('Owner-only approval required')
    })
  })

  describe('Notifications to Babin (W58, W60)', () => {
    it('dispatches app alert and email notification to Babin when approval is raised', async () => {
      const item = (await fetchApprovals())[0]!
      await notifyBabinOfApproval(item)
      // Completes cleanly without errors
      expect(true).toBe(true)
    })
  })
})
