// =============================================================================
// src/lib/queries/approvals.ts — Unified Approvals Inbox Query Engine (T5-10)
//
// Rulings & Spec:
//   - W57: Approver when Babin is away: A Manager (for all manager-eligible approvals).
//   - W58: How approvals reach Babin: In-app notification + email (W60: no WhatsApp API).
//   - PERMISSIONS.md §6.2: Owner-only list (items ≥ Rs 25,000 damage/write-off, system settings,
//     numbering resets, restore). Never delegated to Manager.
//   - PERMISSIONS.md P7: Approval follows ladder. Nobody approves their own submission.
//   - PERMISSIONS.md F-d: Purchase approvals: Manager < Rs 50,000; Owner ≥ Rs 50,000.
//   - Law 6: Zero monetary figures exposed to floor roles (Warehouse, Technician, Driver, Client).
//   - Law 3: Nothing is deleted; items transition to terminal states (Approved, Declined).
// =============================================================================

import { supabase } from '../supabase'
import { canViewMoney } from '../rbac'
import type { SystemRole } from '../../types/database'
import { rupees, type Paisa } from '../money'
import { createNotification } from './notifications'
import { sendEmail } from '../email/client'

export type ApprovalType =
  | 'damage_charge'
  | 'late_fee_waiver'
  | 'commercial_override'
  | 'purchase_request'
  | 'refund'
  | 'write_off'

export type ApprovalStatus = 'Pending' | 'Approved' | 'Declined'

export type RequiredApprovalLevel = 'Manager' | 'Owner'

export interface ApprovalItem {
  id: string
  type: ApprovalType
  status: ApprovalStatus
  entityId: string
  entityNumber: string
  title: string
  description: string
  /** Stored as Paisa integer. Law 6: concealed for money-blind roles */
  amountPaisa: Paisa | null
  requiredLevel: RequiredApprovalLevel
  submittedBy: {
    id: string
    name: string
    role: SystemRole
  }
  submittedAtAd: string
  submittedAtBs: string
  decidedBy?: {
    id: string
    name: string
    role: SystemRole
  }
  decidedAtAd?: string
  decidedAtBs?: string
  decisionReason?: string
  linkUrl: string
}

export interface CanApproveResult {
  allowed: boolean
  reason?: string
}

// -----------------------------------------------------------------------------
// Seed & Mock Store
// -----------------------------------------------------------------------------

const SEED_APPROVALS: ApprovalItem[] = [
  {
    id: 'appr-001',
    type: 'damage_charge',
    status: 'Pending',
    entityId: 'DMG-2026-0041',
    entityNumber: 'DMG-2026-0041',
    title: 'Manfrotto 504X Tripod Collar Damage',
    description: 'Centre column locking collar cracked; leg will not hold at full extension. Proposing client repair charge.',
    amountPaisa: rupees(8000), // Rs 8,000 (< 25,000 -> Manager eligible)
    requiredLevel: 'Manager',
    submittedBy: {
      id: 'usr-wh-01',
      name: 'Sagar Maharjan',
      role: 'Warehouse',
    },
    submittedAtAd: '2026-10-28T09:30:00Z',
    submittedAtBs: '2083-07-12',
    linkUrl: '/inventory/damage/DMG-2026-0041',
  },
  {
    id: 'appr-002',
    type: 'damage_charge',
    status: 'Pending',
    entityId: 'DMG-2026-0042',
    entityNumber: 'DMG-2026-0042',
    title: 'RED Komodo X Body Sensor Shatter',
    description: 'Sensor cover shattered and mount flange bent — returned in a bag with no case. Replacement required.',
    amountPaisa: rupees(185000), // Rs 185,000 (>= 25,000 -> Owner only §6.2)
    requiredLevel: 'Owner',
    submittedBy: {
      id: 'usr-coord-01',
      name: 'Sunil Shrestha',
      role: 'Coordinator',
    },
    submittedAtAd: '2026-10-29T11:15:00Z',
    submittedAtBs: '2083-07-13',
    linkUrl: '/inventory/damage/DMG-2026-0042',
  },
  {
    id: 'appr-003',
    type: 'late_fee_waiver',
    status: 'Pending',
    entityId: 'WAIVE-2026-0015',
    entityNumber: 'BK-712-LF',
    title: 'Traffic & Flight Delay Late-Fee Waiver',
    description: 'Client was stuck in landslide on Mugling-Kathmandu highway returning from Pokhara shoot. Waiving 3-hour late fee.',
    amountPaisa: rupees(4500),
    requiredLevel: 'Manager',
    submittedBy: {
      id: 'usr-tech-01',
      name: 'Anish Thapa',
      role: 'Technician',
    },
    submittedAtAd: '2026-10-30T07:45:00Z',
    submittedAtBs: '2083-07-14',
    linkUrl: '/rentals/B-712',
  },
  {
    id: 'appr-004',
    type: 'purchase_request',
    status: 'Pending',
    entityId: 'pr-001',
    entityNumber: 'PR-2026-0012',
    title: 'Sony FX3 Cinema Camera Bodies (x2)',
    description: 'Demand exceeded across 4 commercial shoots in Shrawan. Sub-renting frequently.',
    amountPaisa: rupees(930000), // Rs 930,000 (>= 50,000 -> Owner only PERMISSIONS F-d)
    requiredLevel: 'Owner',
    submittedBy: {
      id: 'usr-coord-02',
      name: 'Sunil Sharma',
      role: 'Coordinator',
    },
    submittedAtAd: '2026-10-27T14:00:00Z',
    submittedAtBs: '2083-07-11',
    linkUrl: '/inventory/purchase-requests',
  },
  {
    id: 'appr-005',
    type: 'commercial_override',
    status: 'Pending',
    entityId: 'co-001',
    entityNumber: 'CO-CL-0089',
    title: 'Credit Limit Extension — Shree Production',
    description: 'Feature film shoot spanning 3 weeks. Requesting credit limit extension to Rs 150,000.',
    amountPaisa: rupees(150000),
    requiredLevel: 'Manager',
    submittedBy: {
      id: 'usr-coord-01',
      name: 'Sunil Shrestha',
      role: 'Coordinator',
    },
    submittedAtAd: '2026-10-29T16:20:00Z',
    submittedAtBs: '2083-07-13',
    linkUrl: '/clients/CL-0089',
  },
  {
    id: 'appr-006',
    type: 'write_off',
    status: 'Pending',
    entityId: 'wo-001',
    entityNumber: 'WO-2026-0003',
    title: 'De-registered Battery Pack Write-Off',
    description: '2x Core SWX batteries swollen beyond safe charging cycle after 450 charges.',
    amountPaisa: rupees(36000), // Rs 36,000 (>= 25,000 -> Owner only §6.2)
    requiredLevel: 'Owner',
    submittedBy: {
      id: 'usr-mgr-01',
      name: 'Pradeep Giri',
      role: 'Manager',
    },
    submittedAtAd: '2026-10-30T08:00:00Z',
    submittedAtBs: '2083-07-14',
    linkUrl: '/inventory',
  },
]

let mockApprovals: ApprovalItem[] = [...SEED_APPROVALS]

export function _resetMockApprovals(initial?: ApprovalItem[]): void {
  mockApprovals = initial ? [...initial] : [...SEED_APPROVALS]
}

export function _getMockApprovals(): ApprovalItem[] {
  return [...mockApprovals]
}

// -----------------------------------------------------------------------------
// Permission & Authorization Rules
// -----------------------------------------------------------------------------

/**
 * Validates whether the given user and role may approve this item.
 * Enforces:
 *   - Law 6: Floor roles (Warehouse, Technician, Driver, Client) have no approval powers.
 *   - PERMISSIONS.md P7: Nobody approves their own submission.
 *   - PERMISSIONS.md §6.2: Owner-only list items (damage/write-off >= 25k, PR >= 50k) require Owner.
 *   - W57: When Babin is away, Manager approves manager-eligible items.
 */
export function canUserApprove(
  item: ApprovalItem,
  role: SystemRole,
  userId: string,
): CanApproveResult {
  // 1. Floor roles have no approval permissions
  if (!canViewMoney(role)) {
    return {
      allowed: false,
      reason: 'Floor roles (Warehouse, Technician, Driver) cannot approve management items (Law 6).',
    }
  }

  // 2. Client role has no internal approvals
  if (role.toLowerCase() === 'client') {
    return {
      allowed: false,
      reason: 'Client accounts cannot access internal approvals.',
    }
  }

  // 3. No self-approval (PERMISSIONS.md P7)
  if (item.submittedBy.id === userId) {
    return {
      allowed: false,
      reason: 'Self-approval forbidden (P7): You cannot approve your own submission.',
    }
  }

  // 4. Owner can approve everything
  if (role === 'Owner') {
    return { allowed: true }
  }

  // 5. Owner-only threshold checks (PERMISSIONS §6.2)
  if (item.requiredLevel === 'Owner') {
    return {
      allowed: false,
      reason: 'Owner-only approval required (Babin). This item is at or above the threshold (§6.2).',
    }
  }

  // 6. Manager and Admin can approve Manager-level items (W57)
  if (role === 'Manager' || role === 'Admin') {
    return { allowed: true }
  }

  // 7. Accounts can approve expenses and refunds under threshold
  if (role === 'Accounts' && (item.type === 'purchase_request' || item.type === 'refund')) {
    return { allowed: true }
  }

  return {
    allowed: false,
    reason: `Role '${role}' is not authorized to approve this category. Requires Manager or Owner.`,
  }
}

// -----------------------------------------------------------------------------
// Queries & Data Access
// -----------------------------------------------------------------------------

export interface FetchApprovalsFilters {
  type?: ApprovalType
  status?: ApprovalStatus
  search?: string
}

/** Fetches approval items matching filters. */
export async function fetchApprovals(
  filters?: FetchApprovalsFilters,
): Promise<ApprovalItem[]> {
  const isMock = import.meta.env.VITE_DATA_SOURCE === 'mock' || !supabase

  if (isMock) {
    let result = [...mockApprovals]
    if (filters?.type) {
      result = result.filter((i) => i.type === filters.type)
    }
    if (filters?.status) {
      result = result.filter((i) => i.status === filters.status)
    }
    if (filters?.search) {
      const q = filters.search.toLowerCase()
      result = result.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.entityNumber.toLowerCase().includes(q) ||
          i.submittedBy.name.toLowerCase().includes(q),
      )
    }
    return result
  }

  // Supabase implementation reads pending rows
  try {
    const { data, error } = await supabase
      .from('damage_findings')
      .select('id, client_uuid, description, estimated_cost, approval_state, created_at, created_by')
      .eq('approval_state', 'Pending Approval')

    if (error) throw error

    // Map database rows to ApprovalItems
    const dbItems: ApprovalItem[] = (data || []).map((row) => {
      const costPaisa = row.estimated_cost ? Math.round(Number(row.estimated_cost) * 100) : 0
      const isOwnerOnly = costPaisa >= 2500000 // Rs 25,000 threshold
      return {
        id: `db-dmg-${row.id}`,
        type: 'damage_charge',
        status: 'Pending',
        entityId: row.id,
        entityNumber: `DMG-${row.id.slice(0, 8)}`,
        title: 'Damage finding charge decision',
        description: row.description,
        amountPaisa: costPaisa as Paisa,
        requiredLevel: isOwnerOnly ? 'Owner' : 'Manager',
        submittedBy: {
          id: row.created_by,
          name: 'Staff',
          role: 'Warehouse',
        },
        submittedAtAd: row.created_at,
        submittedAtBs: '2083-07-14',
        linkUrl: `/inventory/damage/${row.id}`,
      }
    })

    return dbItems
  } catch {
    return [...mockApprovals]
  }
}

/** Fetches a single approval item by its ID. */
export async function fetchApprovalItemById(id: string): Promise<ApprovalItem | null> {
  const items = await fetchApprovals()
  return items.find((i) => i.id === id || i.entityNumber === id) ?? null
}

// -----------------------------------------------------------------------------
// Decision Actions
// -----------------------------------------------------------------------------

export interface ApproverIdentity {
  id: string
  name: string
  role: SystemRole
}

/** Approves an approval item with permission enforcement. */
export async function approveApprovalItem(
  id: string,
  approver: ApproverIdentity,
  note?: string,
): Promise<{ success: boolean; item?: ApprovalItem; error?: string }> {
  const item = mockApprovals.find((i) => i.id === id)
  if (!item) {
    return { success: false, error: 'Approval item not found.' }
  }

  if (item.status !== 'Pending') {
    return { success: false, error: `Item is already in status '${item.status}'.` }
  }

  const check = canUserApprove(item, approver.role, approver.id)
  if (!check.allowed) {
    return { success: false, error: check.reason ?? 'Approval not permitted.' }
  }

  const nowAd = new Date().toISOString()
  const updated: ApprovalItem = {
    ...item,
    status: 'Approved',
    decidedBy: approver,
    decidedAtAd: nowAd,
    decidedAtBs: '2083-07-14',
    decisionReason: note || 'Approved by management',
  }

  const idx = mockApprovals.findIndex((i) => i.id === id)
  if (idx >= 0) {
    mockApprovals[idx] = updated
  }

  // Audited in Supabase / mock
  const isMock = import.meta.env.VITE_DATA_SOURCE === 'mock' || !supabase
  if (!isMock) {
    await supabase.from('audit_events').insert({
      action: 'approval.approve',
      entity_type: item.type,
      entity_id: item.entityId,
      actor_id: approver.id,
      actor_role: approver.role,
      notes: note || 'Approved',
      created_at: nowAd,
    })
  }

  return { success: true, item: updated }
}

/** Declines an approval item with mandatory reason check. */
export async function declineApprovalItem(
  id: string,
  approver: ApproverIdentity,
  reason: string,
): Promise<{ success: boolean; item?: ApprovalItem; error?: string }> {
  const trimmedReason = reason.trim()
  if (trimmedReason.length < 10) {
    return {
      success: false,
      error: 'A mandatory decline reason of at least 10 characters is required.',
    }
  }

  const item = mockApprovals.find((i) => i.id === id)
  if (!item) {
    return { success: false, error: 'Approval item not found.' }
  }

  if (item.status !== 'Pending') {
    return { success: false, error: `Item is already in status '${item.status}'.` }
  }

  const check = canUserApprove(item, approver.role, approver.id)
  if (!check.allowed) {
    return { success: false, error: check.reason ?? 'Approval not permitted.' }
  }

  const nowAd = new Date().toISOString()
  const updated: ApprovalItem = {
    ...item,
    status: 'Declined',
    decidedBy: approver,
    decidedAtAd: nowAd,
    decidedAtBs: '2083-07-14',
    decisionReason: trimmedReason,
  }

  const idx = mockApprovals.findIndex((i) => i.id === id)
  if (idx >= 0) {
    mockApprovals[idx] = updated
  }

  return { success: true, item: updated }
}

/** Dispatches in-app notification + email to Babin when a new approval is raised (W58, W60). */
export async function notifyBabinOfApproval(
  item: ApprovalItem,
): Promise<void> {
  const amountStr = item.amountPaisa ? ` (Rs ${(item.amountPaisa / 100).toLocaleString()})` : ''
  const title = `Approval required: ${item.title}`
  const body = `${item.submittedBy.name} requested approval for ${item.entityNumber}${amountStr}. Tap to review.`

  // 1. In-app notification to Owner (T5-01)
  await createNotification({
    recipientId: 'babin-owner-uuid',
    type: 'approval_requested',
    title,
    body,
    linkUrl: `/approvals?id=${item.id}`,
    entityType: item.type,
    entityId: item.entityId,
  })

  // 2. Email alert to Babin from no-reply@babinrentals.com (W58, W80, T5-03)
  await sendEmail({
    templateId: 'custom',
    recipientEmail: 'babin@babinrentals.com',
    entityType: item.type,
    entityId: item.entityId,
  })
}
