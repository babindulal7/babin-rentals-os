import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getDamageFindings } from '../damage'
import { supabase } from '../../supabase'

vi.mock('../../supabase', () => {
  return {
    supabase: {
      from: vi.fn(),
    },
  }
})

describe('damage query module', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getDamageFindings returns empty array when empty or error', async () => {
    const mockOrder = vi.fn().mockResolvedValue({
      data: [],
      error: null,
    })
    const mockIs = vi.fn().mockReturnValue({ order: mockOrder })
    const mockSelect = vi.fn().mockReturnValue({ is: mockIs })

    ;(supabase.from as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      select: mockSelect,
    })

    const result = await getDamageFindings()
    expect(result).toEqual([])
  })

  it('getDamageFindings returns mapped cases when damage cases exist', async () => {
    ;(supabase.from as unknown as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
      if (table === 'damage_findings_v') {
        return {
          select: () => ({
            is: () => ({
              order: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'DMG-2026-0001',
                    description: 'Cracked filter thread',
                    estimated_cost: 15000,
                    approval_state: 'Pending',
                    created_at: '2026-08-01T10:00:00Z',
                    created_by: 'user-1',
                    approved_by: null,
                    unit_id: 'unit-1',
                    return_line_id: 'rl-1',
                    cleaning_queue_entry_id: null,
                  },
                ],
                error: null,
              }),
            }),
          }),
        }
      }

      if (table === 'product_units') {
        return {
          select: () => ({
            in: vi.fn().mockResolvedValue({
              data: [{ id: 'unit-1', serial_no: 'SN-001', product_id: 'prod-1' }],
              error: null,
            }),
          }),
        }
      }

      if (table === 'products_v') {
        return {
          select: () => ({
            in: vi.fn().mockResolvedValue({
              data: [{ id: 'prod-1', name: 'Sony FX3', replacement_value: 450000 }],
              error: null,
            }),
          }),
        }
      }

      if (table === 'users') {
        return {
          select: () => ({
            in: vi.fn().mockResolvedValue({
              data: [{ id: 'user-1', full_name: 'Staff Member' }],
              error: null,
            }),
          }),
        }
      }

      if (table === 'return_lines') {
        return {
          select: () => ({
            in: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'rl-1',
                  booking_lines: {
                    bookings: {
                      booking_no: 'B-2026-001',
                      clients: { name: 'Apex Studios' },
                    },
                  },
                },
              ],
              error: null,
            }),
          }),
        }
      }

      return {
        select: () => ({
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }
    })

    const result = await getDamageFindings()
    expect(result.length).toBe(1)
    expect(result[0]?.id).toBe('DMG-2026-0001')
    expect(result[0]?.client).toBe('Apex Studios')
    expect(result[0]?.unitName).toBe('Sony FX3')
    expect(result[0]?.serial).toBe('SN-001')
    expect(result[0]?.state).toBe('Awaiting Approval')
  })
})
