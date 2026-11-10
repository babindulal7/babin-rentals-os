import { describe, expect, it } from 'vitest'
import { sanitizeTags, setBookingTagsConfig, setBookingTags } from '../setBookingTags'
import { canSetBookingTags } from '../../../lib/rbac'
import type { ActionContext } from '../../core'

describe('setBookingTags', () => {
  describe('sanitizeTags', () => {
    it('trims leading and trailing whitespace', () => {
      expect(sanitizeTags(['  wedding  ', ' festival '])).toEqual(['wedding', 'festival'])
    })

    it('filters out empty and whitespace-only tags', () => {
      expect(sanitizeTags(['wedding', '', '   ', 'festival'])).toEqual(['wedding', 'festival'])
    })

    it('deduplicates tags case-insensitively while preserving first case', () => {
      expect(sanitizeTags(['Wedding', 'wedding', 'WEDDING', 'festival'])).toEqual(['Wedding', 'festival'])
    })

    it('throws error when a tag exceeds 30 characters', () => {
      const longTag = 'a'.repeat(31)
      expect(() => sanitizeTags(['valid', longTag])).toThrow(/exceeds the 30-character limit/)
    })

    it('accepts tags up to 30 characters', () => {
      const exact30 = 'a'.repeat(30)
      expect(sanitizeTags([exact30])).toEqual([exact30])
    })
  })

  describe('setBookingTagsConfig validation', () => {
    it('throws if booking id is missing or blank', () => {
      expect(() => setBookingTagsConfig.validate({ id: '', tags: [] })).toThrow(/booking reference is required/)
      expect(() => setBookingTagsConfig.validate({ id: '   ', tags: [] })).toThrow(/booking reference is required/)
    })

    it('throws if tags is not an array', () => {
      expect(() => setBookingTagsConfig.validate({ id: 'BK-101', tags: null as unknown as string[] })).toThrow(/must be provided as an array/)
    })

    it('throws if clientUuid is present but empty', () => {
      expect(() => setBookingTagsConfig.validate({ id: 'BK-101', clientUuid: '', tags: [] })).toThrow(/idempotency key is present but empty/)
    })
  })

  describe('RBAC: canSetBookingTags', () => {
    it('allows booking desk roles: Owner, Admin, Manager, Coordinator', () => {
      expect(canSetBookingTags('Owner')).toBe(true)
      expect(canSetBookingTags('Admin')).toBe(true)
      expect(canSetBookingTags('Manager')).toBe(true)
      expect(canSetBookingTags('Coordinator')).toBe(true)
    })

    it('denies floor roles and client: Warehouse, Technician, Driver, Client, Accounts', () => {
      expect(canSetBookingTags('Warehouse')).toBe(false)
      expect(canSetBookingTags('Technician')).toBe(false)
      expect(canSetBookingTags('Driver')).toBe(false)
      expect(canSetBookingTags('Client')).toBe(false)
      expect(canSetBookingTags('Accounts')).toBe(false)
    })
  })

  describe('execution via setBookingTags', () => {
    it('refuses execution if caller is Warehouse', async () => {
      const ctx: ActionContext = { userId: 'user-warehouse', role: 'Warehouse' }
      await expect(setBookingTags({ id: 'b0000000-0000-0000-0000-000000000001', tags: ['wedding'] }, ctx)).rejects.toThrow(
        /requires rental\.tag/,
      )
    })
  })
})
