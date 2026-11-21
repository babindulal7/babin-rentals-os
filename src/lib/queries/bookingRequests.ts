/**
 * src/lib/queries/bookingRequests.ts
 *
 * Query online booking requests for staff queue (T7-04).
 * Reads public.booking_requests_v with Law 6 money blindness.
 */

import { supabase } from '@/lib/supabase'

export interface BookingRequestRow {
  id: string
  request_number: string
  client_name: string
  client_email: string
  client_phone: string
  project_name: string | null
  shoot_location: string | null
  start_date: string
  end_date: string
  fulfillment_type: 'pickup' | 'delivery'
  delivery_zone_id: string | null
  delivery_address: string | null
  status: 'pending' | 'confirmed' | 'declined' | 'cancelled'
  decline_reason: string | null
  booking_id: string | null
  total_paisa: number | null
  vat_paisa: number | null
  advance_due_paisa: number | null
  created_at: string
  updated_at: string
  isOverdue45Min?: boolean
}

export interface BookingRequestWithLines extends BookingRequestRow {
  lines: Array<{
    id: string
    product_id: string | null
    bundle_id: string | null
    quantity: number
    daily_rate_paisa: number | null
    line_total_paisa: number | null
    product_name?: string
  }>
}

export async function fetchBookingRequests(): Promise<BookingRequestRow[]> {
  const isMock = import.meta.env.VITE_DATA_SOURCE === 'mock' || !supabase

  if (isMock) {
    const mockNow = Date.now()
    return [
      {
        id: 'req-mock-1',
        request_number: 'REQ-20261119-1001',
        client_name: 'Prajwol Shrestha',
        client_email: 'prajwol@example.com',
        client_phone: '+977-9841234567',
        project_name: 'Documentary - Solukhumbu',
        shoot_location: 'Lukla / Namche',
        start_date: '2026-11-25',
        end_date: '2026-11-30',
        fulfillment_type: 'pickup',
        delivery_zone_id: null,
        delivery_address: null,
        status: 'pending',
        decline_reason: null,
        booking_id: null,
        total_paisa: 3200000,
        vat_paisa: 416000,
        advance_due_paisa: 1808000,
        created_at: new Date(mockNow - 52 * 60 * 1000).toISOString(), // 52 minutes ago (overdue)
        updated_at: new Date(mockNow - 52 * 60 * 1000).toISOString(),
        isOverdue45Min: true,
      },
      {
        id: 'req-mock-2',
        request_number: 'REQ-20261119-1002',
        client_name: 'Kripa Joshi',
        client_email: 'kripa@example.com',
        client_phone: '+977-9801234567',
        project_name: 'Fashion Lookbook',
        shoot_location: 'Patan Durbar Square',
        start_date: '2026-11-22',
        end_date: '2026-11-23',
        fulfillment_type: 'delivery',
        delivery_zone_id: 'ring_road',
        delivery_address: 'Patan, Mangal Bazaar',
        status: 'pending',
        decline_reason: null,
        booking_id: null,
        total_paisa: 1250000,
        vat_paisa: 162500,
        advance_due_paisa: 706250,
        created_at: new Date(mockNow - 20 * 60 * 1000).toISOString(), // 20 minutes ago
        updated_at: new Date(mockNow - 20 * 60 * 1000).toISOString(),
        isOverdue45Min: false,
      },
    ]
  }

  const { data, error } = await supabase
    .from('booking_requests_v')
    .select('*')
    .order('created_at', { ascending: false })

  if (error || !data) {
    return []
  }

  const now = Date.now()
  return (data as BookingRequestRow[]).map((r) => {
    const ageMs = now - new Date(r.created_at).getTime()
    return {
      ...r,
      isOverdue45Min: r.status === 'pending' && ageMs >= 45 * 60 * 1000,
    }
  })
}

export async function fetchBookingRequestDetails(requestId: string): Promise<BookingRequestWithLines | null> {
  const isMock = import.meta.env.VITE_DATA_SOURCE === 'mock' || !supabase

  if (isMock) {
    return {
      id: requestId,
      request_number: 'REQ-20261119-1001',
      client_name: 'Prajwol Shrestha',
      client_email: 'prajwol@example.com',
      client_phone: '+977-9841234567',
      project_name: 'Documentary - Solukhumbu',
      shoot_location: 'Lukla / Namche',
      start_date: '2026-11-25',
      end_date: '2026-11-30',
      fulfillment_type: 'pickup',
      delivery_zone_id: null,
      delivery_address: null,
      status: 'pending',
      decline_reason: null,
      booking_id: null,
      total_paisa: 3200000,
      vat_paisa: 416000,
      advance_due_paisa: 1808000,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      lines: [
        {
          id: 'line-1',
          product_id: '11111111-1111-4111-8111-111111111111',
          bundle_id: null,
          quantity: 1,
          daily_rate_paisa: 450000,
          line_total_paisa: 2700000,
          product_name: 'Sony FX3 Cinema Line Camera',
        },
      ],
    }
  }

  const { data: req, error: reqErr } = await supabase
    .from('booking_requests_v')
    .select('*')
    .eq('id', requestId)
    .single()

  if (reqErr || !req) return null

  const { data: lines } = await supabase
    .from('booking_request_lines')
    .select('*')
    .eq('request_id', requestId)

  return {
    ...(req as BookingRequestRow),
    lines: (lines || []).map((l: Record<string, unknown>) => ({
      id: String(l.id),
      product_id: (l.product_id as string) || null,
      bundle_id: (l.bundle_id as string) || null,
      quantity: Number(l.quantity),
      daily_rate_paisa: l.daily_rate_paisa != null ? Number(l.daily_rate_paisa) : null,
      line_total_paisa: l.line_total_paisa != null ? Number(l.line_total_paisa) : null,
    })),
  }
}
