// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  generateRiderRawToken,
  hashRiderToken,
  canIssueRiderLink,
  createRiderLink,
  revokeRiderLink,
  getJobRiderLinks,
  fetchRiderJobByToken,
  riderMarkJobPickedUp,
  riderCompleteJobDelivery,
} from '../riderLink'

describe('riderLink query & mutation layer (T4-08, W49)', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear()
    }
    vi.restoreAllMocks()
  })

  describe('token generation and hashing', () => {
    it('generates a 128-bit (32 hex char) raw token', () => {
      const token1 = generateRiderRawToken()
      const token2 = generateRiderRawToken()
      expect(token1).toHaveLength(32)
      expect(token2).toHaveLength(32)
      expect(token1).not.toBe(token2)
      expect(/^[0-9a-f]{32}$/i.test(token1)).toBe(true)
    })

    it('hashes token with SHA-256 to 64 hex chars', async () => {
      const rawToken = 'a1b2c3d4e5f60718293a4b5c6d7e8f90'
      const hash = await hashRiderToken(rawToken)
      expect(hash).toHaveLength(64)
      expect(/^[0-9a-f]{64}$/i.test(hash)).toBe(true)

      // Identical inputs yield identical hashes
      const hash2 = await hashRiderToken(rawToken)
      expect(hash2).toBe(hash)
    })
  })

  describe('role permission gating (canIssueRiderLink)', () => {
    it('allows privileged roles (Owner, Admin, Manager, Coordinator, Warehouse)', () => {
      expect(canIssueRiderLink('Owner')).toBe(true)
      expect(canIssueRiderLink('Admin')).toBe(true)
      expect(canIssueRiderLink('Manager')).toBe(true)
      expect(canIssueRiderLink('Coordinator')).toBe(true)
      expect(canIssueRiderLink('Warehouse')).toBe(true)
    })

    it('denies non-staff or money-blind/floor-only roles from minting rider links', () => {
      expect(canIssueRiderLink('Client')).toBe(false)
      expect(canIssueRiderLink('Driver')).toBe(false)
      expect(canIssueRiderLink('Technician')).toBe(false)
      expect(canIssueRiderLink(null)).toBe(false)
      expect(canIssueRiderLink(undefined)).toBe(false)
    })
  })

  describe('mock lifecycle: create, list, revoke, and rider actions', () => {
    it('rejects unauthorized role attempting to create rider link', async () => {
      await expect(
        createRiderLink('job-1', 'Bikash Rider', '9841000000', 'Client'),
      ).rejects.toThrow('Your role is not authorized to create rider links.')
    })

    it('creates, lists, and revokes rider links', async () => {
      const created = await createRiderLink('job-101', 'Hari Bahadur', '9851122334', 'Coordinator')
      expect(created.linkId).toBeDefined()
      expect(created.rawToken).toHaveLength(32)
      expect(created.linkUrl).toContain(`/rider/${created.rawToken}`)

      const links = await getJobRiderLinks('job-101')
      expect(links.length).toBeGreaterThanOrEqual(1)
      const found = links.find((l) => l.id === created.linkId)
      expect(found).toBeDefined()
      expect(found?.rider_name).toBe('Hari Bahadur')
      expect(found?.is_active).toBe(true)

      // Revoke the link
      await revokeRiderLink(created.linkId, 'Coordinator')
      const afterRevoke = await getJobRiderLinks('job-101')
      const revoked = afterRevoke.find((l) => l.id === created.linkId)
      expect(revoked?.revoked_at).not.toBeNull()
      expect(revoked?.is_active).toBe(false)
    })

    it('enforces client_uuid idempotency: replaying same key returns alreadyIssued: true', async () => {
      const key = 'test-client-uuid-1234'
      const first = await createRiderLink('job-707', 'Rohan', '9841234567', 'Coordinator', key)
      expect(first.alreadyIssued).toBe(false)
      expect(first.rawToken).toBeDefined()

      const replay = await createRiderLink('job-707', 'Rohan', '9841234567', 'Coordinator', key)
      expect(replay.alreadyIssued).toBe(true)
      expect(replay.linkId).toBe(first.linkId)
      expect(replay.rawToken).toBeUndefined()
    })

    it('fetches rider job data without any money fields (Law 6)', async () => {
      const created = await createRiderLink('job-202', 'Bipin Thapa', '9800000000', 'Coordinator')
      const job = await fetchRiderJobByToken(created.rawToken!)

      expect(job.rider_name).toBe('Bipin Thapa')
      expect(job.pickup_address).toBeDefined()
      expect(job.delivery_address).toBeDefined()
      expect(job.items.length).toBeGreaterThan(0)

      // Strict money blindness assertion: no price/fee/total/money properties
      const jobKeys = Object.keys(job)
      expect(jobKeys).not.toContain('price')
      expect(jobKeys).not.toContain('total')
      expect(jobKeys).not.toContain('fee')
      expect(jobKeys).not.toContain('rate')
      expect(jobKeys).not.toContain('amount')
    })

    it('updates status to In Transit on rider pickup', async () => {
      const created = await createRiderLink('job-303', 'Kiran KC', '9811111111', 'Coordinator')
      await riderMarkJobPickedUp(created.rawToken!)
      const job = await fetchRiderJobByToken(created.rawToken!)
      expect(job.status).toBe('In Transit')
    })

    it('completes delivery with receiver name and signature', async () => {
      const created = await createRiderLink('job-404', 'Manoj Joshi', '9822222222', 'Coordinator')
      await riderCompleteJobDelivery(
        created.rawToken!,
        'Nabin Director',
        'data:image/svg+xml;base64,mockSignature',
        'https://example.com/mock-evidence.jpg',
      )

      // Once delivered, accessing by token throws because the link is completed
      await expect(fetchRiderJobByToken(created.rawToken!)).rejects.toThrow(
        /completed/i,
      )
    })

    it('refuses to complete delivery without receiver name', async () => {
      const created = await createRiderLink('job-505', 'Ramesh', '9833333333', 'Coordinator')
      await expect(
        riderCompleteJobDelivery(created.rawToken!, '', 'mockSignature'),
      ).rejects.toThrow('Receiver name is required (minimum 2 characters).')
    })
  })
})
