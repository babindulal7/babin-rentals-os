import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveDamage, resolveDamageConfig } from '../resolveDamage'
import { ActionPermissionError } from '../../core'
import { rupees } from '../../../lib/money'

vi.mock('../../../lib/supabase', () => {
  return {
    IS_MOCK: false,
    supabase: {
      from: vi.fn(() => ({
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: 'DMG-2026-0041',
                  approval_state: 'Approved',
                  disposition: 'Charge Client',
                  approved_at: '2026-09-25T01:00:00.000Z',
                  approved_by: '00000000-0000-0000-0000-000000000001',
                },
                error: null,
              }),
            })),
          })),
        })),
      })),
    },
  }
})

describe('resolveDamage action (44th action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('navigator', { onLine: true })
  })

  it('validates input parameters correctly', async () => {
    // Missing findingId
    expect(() =>
      resolveDamageConfig.validate({
        findingId: '',
        disposition: 'Charge Client',
        chargePaisa: rupees(5000),
      }),
    ).toThrow(/findingId is required/)

    // Missing disposition
    expect(() =>
      resolveDamageConfig.validate({
        findingId: 'DMG-1',
        disposition: undefined as never,
        chargePaisa: rupees(5000),
      }),
    ).toThrow(/disposition is required/)

    // Negative chargePaisa
    expect(() =>
      resolveDamageConfig.validate({
        findingId: 'DMG-1',
        disposition: 'Charge Client',
        chargePaisa: -100 as never,
      }),
    ).toThrow(/chargePaisa must be a non-negative finite number/)

    // Invalid clientUuid format
    expect(() =>
      resolveDamageConfig.validate({
        findingId: 'DMG-1',
        disposition: 'Charge Client',
        chargePaisa: rupees(5000),
        clientUuid: 'not-a-valid-uuid',
      }),
    ).toThrow(/clientUuid must be a valid RFC 4122 UUID/)
  })

  it('executes damage resolution and emits CASE_RESOLVED', async () => {
    const ctx = { userId: 'u-owner', role: 'Owner' as const }
    const res = await resolveDamage(
      {
        findingId: 'DMG-2026-0041',
        disposition: 'Charge Client',
        chargePaisa: rupees(5000),
        clientUuid: '00000000-0000-0000-0000-000000000001',
      },
      ctx,
    )

    expect(res.success).toBe(true)
    expect(res.findingId).toBe('DMG-2026-0041')
    expect(res.chargeRupees).toBe(5000)
    expect(res.disposition).toBe('Charge Client')
  })

  it('permits Manager role to resolve damage below Rs 25,000 threshold', async () => {
    const ctx = { userId: 'u-mgr', role: 'Manager' as const }
    const res = await resolveDamage(
      {
        findingId: 'DMG-2026-0041',
        disposition: 'Absorb',
        chargePaisa: rupees(8000),
        clientUuid: '00000000-0000-0000-0000-000000000002',
      },
      ctx,
    )

    expect(res.success).toBe(true)
  })

  it('refuses Manager role when damage charge is at or above Rs 25,000 threshold', async () => {
    const ctx = { userId: 'u-mgr', role: 'Manager' as const }
    await expect(
      resolveDamage(
        {
          findingId: 'DMG-2026-0041',
          disposition: 'Charge Client',
          chargePaisa: rupees(25000),
          clientUuid: '00000000-0000-0000-0000-000000000003',
        },
        ctx,
      ),
    ).rejects.toThrow(/requires Owner approval\. Role Manager is not permitted/)
  })

  it('permits Owner role to resolve damage at or above Rs 25,000 threshold', async () => {
    const ctx = { userId: 'u-owner', role: 'Owner' as const }
    const res = await resolveDamage(
      {
        findingId: 'DMG-2026-0041',
        disposition: 'Charge Client',
        chargePaisa: rupees(65000),
        clientUuid: '00000000-0000-0000-0000-000000000004',
      },
      ctx,
    )

    expect(res.success).toBe(true)
    expect(res.chargeRupees).toBe(65000)
  })

  it('denies Warehouse role per R-25 / canApproveDamage', async () => {
    const ctx = { userId: 'u-wh', role: 'Warehouse' as const }
    await expect(
      resolveDamage(
        {
          findingId: 'DMG-2026-0041',
          disposition: 'Charge Client',
          chargePaisa: rupees(5000),
          clientUuid: '00000000-0000-0000-0000-000000000005',
        },
        ctx,
      ),
    ).rejects.toBeInstanceOf(ActionPermissionError)
  })

  it('refuses execution when device is offline', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    const ctx = { userId: 'u-owner', role: 'Owner' as const, isOnline: false }
    await expect(
      resolveDamage(
        {
          findingId: 'DMG-2026-0041',
          disposition: 'Charge Client',
          chargePaisa: rupees(5000),
          clientUuid: '00000000-0000-0000-0000-000000000006',
        },
        ctx,
      ),
    ).rejects.toThrow(/device is offline/)
  })
})
