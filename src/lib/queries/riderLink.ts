/**
 * src/lib/queries/riderLink.ts
 *
 * Query and mutation layer for One-Time Rider Links (T4-08, W49).
 *
 * Rulings:
 *   - W49: One-time, job-scoped delivery link for hired riders without login.
 *   - Law 6: Strictly money-blind. Zero monetary figures exposed to rider.
 *   - Token hashing: Raw 128-bit random token never touches database storage; only SHA-256 hash is persisted.
 *   - 24-hour expiration ceiling with on-demand staff revocation.
 */

import { supabase, IS_MOCK, newClientUuid } from '../supabase'
import type { Role } from '../rbac'

export interface RiderJobData {
  link_id: string
  job_id: string
  booking_no: string
  leg: 'Outbound' | 'Return'
  status: 'Scheduled' | 'Ready' | 'In Transit' | 'Delivered' | 'Failed'
  scheduled_at: string
  dispatched_at?: string | null
  rider_name: string
  rider_phone: string
  pickup_address: string
  delivery_address: string
  contact_name: string
  contact_phone: string
  item_count: number
  items: Array<{
    product_name: string
    quantity: number
  }>
  last_note?: string | null
  expires_at: string
}

export interface DeliveryJobLinkRecord {
  id: string
  job_id: string
  rider_name: string
  rider_phone: string
  created_at: string
  expires_at: string
  revoked_at: string | null
  completed_at: string | null
  is_active: boolean
}

export interface CreateRiderLinkResult {
  linkId: string
  rawToken?: string | null
  linkUrl?: string | null
  expiresAt: string
  alreadyIssued: boolean
}

const MOCK_LINKS_KEY = 'babin_mock_rider_links'

interface MockLinkEntry {
  id: string
  clientUuid?: string
  jobId: string
  rawToken: string
  tokenHash: string
  riderName: string
  riderPhone: string
  createdAt: string
  expiresAt: string
  revokedAt: string | null
  completedAt: string | null
  status?: 'Scheduled' | 'Ready' | 'In Transit' | 'Delivered'
}

function getMockLinks(): MockLinkEntry[] {
  try {
    const raw = localStorage.getItem(MOCK_LINKS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveMockLinks(links: MockLinkEntry[]) {
  try {
    localStorage.setItem(MOCK_LINKS_KEY, JSON.stringify(links))
  } catch {
    // Ignore storage errors in restricted test environments
  }
}

/**
 * Generate a 128-bit cryptographically secure raw token (mock fallback only).
 */
export function generateRiderRawToken(): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  }
  // Fallback for non-crypto environments
  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`.padEnd(32, '0').slice(0, 32)
}

/**
 * Calculate SHA-256 hex string for a token (mock fallback only).
 */
export async function hashRiderToken(rawToken: string): Promise<string> {
  const trimmed = rawToken.trim()
  if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
    const encoder = new TextEncoder()
    const data = encoder.encode(trimmed)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  }

  // Node.js environment fallback
  try {
    const nodeCrypto = await import('node:crypto')
    return nodeCrypto.createHash('sha256').update(trimmed).digest('hex')
  } catch {
    // In-memory simple hash simulation for mock-only edge runs
    let hash = 0
    for (let i = 0; i < trimmed.length; i++) {
      hash = (hash << 5) - hash + trimmed.charCodeAt(i)
      hash |= 0
    }
    return Math.abs(hash).toString(16).padStart(64, '0').slice(0, 64)
  }
}

/**
 * Staff permission check: who can generate rider links?
 * PERMISSIONS.md: Owner, Admin, Manager, Coordinator, Warehouse.
 */
export function canIssueRiderLink(role: Role | null | undefined): boolean {
  if (!role) return false
  return ['Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse'].includes(role)
}

/**
 * Create a new rider link for a delivery job.
 * R2: Law 8 client_uuid idempotency.
 * R3: Server mints token and returns rawToken once.
 */
export async function createRiderLink(
  jobId: string,
  riderName: string,
  riderPhone: string,
  role: Role | null | undefined,
  clientUuid?: string
): Promise<CreateRiderLinkResult> {
  if (!canIssueRiderLink(role)) {
    throw new Error('Your role is not authorized to create rider links.')
  }

  const cleanName = riderName.trim()
  const cleanPhone = riderPhone.trim()

  if (cleanName.length < 2) {
    throw new Error('Rider name must be at least 2 characters.')
  }
  if (cleanPhone.length < 7) {
    throw new Error('Rider phone must be at least 7 characters.')
  }

  const key = clientUuid || newClientUuid()
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://app.babinrentals.com'
  const now = new Date()
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()

  if (IS_MOCK) {
    const mockLinks = getMockLinks()
    const existing = mockLinks.find((l) => l.clientUuid === key && l.jobId === jobId)
    if (existing) {
      return {
        linkId: existing.id,
        expiresAt: existing.expiresAt,
        alreadyIssued: true,
      }
    }

    const linkId = `mock-link-${Date.now()}`
    const rawToken = generateRiderRawToken()
    const tokenHash = await hashRiderToken(rawToken)
    mockLinks.push({
      id: linkId,
      clientUuid: key,
      jobId,
      rawToken,
      tokenHash,
      riderName: cleanName,
      riderPhone: cleanPhone,
      createdAt: now.toISOString(),
      expiresAt,
      revokedAt: null,
      completedAt: null,
    })
    saveMockLinks(mockLinks)
    return {
      linkId,
      rawToken,
      linkUrl: `${origin}/rider/${rawToken}`,
      expiresAt,
      alreadyIssued: false,
    }
  }

  const { data, error } = await supabase.rpc('create_rider_link', {
    p_client_uuid: key,
    p_job_id: jobId,
    p_rider_name: cleanName,
    p_rider_phone: cleanPhone,
  })

  if (error || !data) {
    throw new Error(error?.message || 'Failed to create rider link on database.')
  }

  // New contract returns jsonb {link_id, raw_token, already_issued}
  const res = data as {
    link_id: string
    raw_token: string | null
    already_issued: boolean
  }

  if (res.already_issued) {
    return {
      linkId: res.link_id,
      rawToken: null,
      linkUrl: null,
      expiresAt: '',
      alreadyIssued: true,
    }
  }

  const rawToken = res.raw_token || ''
  return {
    linkId: res.link_id,
    rawToken,
    linkUrl: `${origin}/rider/${rawToken}`,
    expiresAt,
    alreadyIssued: false,
  }
}

/**
 * Revoke an active rider link.
 */
export async function revokeRiderLink(
  linkId: string,
  role: Role | null | undefined
): Promise<void> {
  if (!canIssueRiderLink(role)) {
    throw new Error('Your role is not authorized to revoke rider links.')
  }

  if (IS_MOCK) {
    const links = getMockLinks()
    const match = links.find((l) => l.id === linkId)
    if (match) {
      match.revokedAt = new Date().toISOString()
      saveMockLinks(links)
    }
    return
  }

  const { error } = await supabase.rpc('revoke_rider_link', {
    p_link_id: linkId,
  })

  if (error) {
    throw new Error(error.message || 'Failed to revoke rider link.')
  }
}

/**
 * List active and historical rider links for a delivery job.
 */
export async function getJobRiderLinks(jobId: string): Promise<DeliveryJobLinkRecord[]> {
  if (IS_MOCK) {
    const links = getMockLinks().filter((l) => l.jobId === jobId)
    const now = new Date().getTime()
    return links.map((l) => {
      const isExpired = new Date(l.expiresAt).getTime() <= now
      const isRevoked = !!l.revokedAt
      const isCompleted = !!l.completedAt
      return {
        id: l.id,
        job_id: l.jobId,
        rider_name: l.riderName,
        rider_phone: l.riderPhone,
        created_at: l.createdAt,
        expires_at: l.expiresAt,
        revoked_at: l.revokedAt,
        completed_at: l.completedAt,
        is_active: !isExpired && !isRevoked && !isCompleted,
      }
    })
  }

  const { data, error } = await supabase
    .from('delivery_job_links')
    .select('id, job_id, rider_name, rider_phone, created_at, expires_at, revoked_at, completed_at')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false })

  if (error || !data) {
    return []
  }

  const now = new Date().getTime()
  return data.map((row) => {
    const isExpired = new Date(row.expires_at).getTime() <= now
    const isRevoked = !!row.revoked_at
    const isCompleted = !!row.completed_at
    return {
      ...row,
      is_active: !isExpired && !isRevoked && !isCompleted,
    }
  })
}

/**
 * Rider API: Retrieve job details by raw token (no login).
 */
export async function fetchRiderJobByToken(rawToken: string): Promise<RiderJobData> {
  const token = rawToken.trim()
  if (!token) {
    throw new Error('A valid rider delivery token is required.')
  }

  if (IS_MOCK) {
    const links = getMockLinks()
    const match = links.find((l) => l.rawToken === token)
    if (!match) {
      throw new Error('Delivery link does not exist or has expired.')
    }
    if (match.revokedAt) {
      throw new Error('This delivery link has been revoked by shop staff.')
    }
    if (new Date(match.expiresAt).getTime() <= Date.now()) {
      throw new Error('This delivery link has expired (24-hour limit).')
    }
    if (match.completedAt) {
      throw new Error('This delivery has already been completed.')
    }

    return {
      link_id: match.id,
      job_id: match.jobId,
      booking_no: 'BK-2026-0842',
      leg: 'Outbound',
      status: match.status ?? 'Scheduled',
      scheduled_at: match.createdAt,
      dispatched_at: null,
      rider_name: match.riderName,
      rider_phone: match.riderPhone,
      pickup_address: 'Babin Rentals Main Branch, Putalisadak, Kathmandu',
      delivery_address: 'Horizon Studios, Sanepa, Lalitpur (Gate 2)',
      contact_name: 'Prajwal Shrestha',
      contact_phone: '9841234567',
      item_count: 3,
      items: [
        { product_name: 'Sony FX3 Cinema Camera Kit', quantity: 1 },
        { product_name: 'Sony FE 24-70mm f/2.8 GM II', quantity: 1 },
        { product_name: 'Sachtler Flowtech 75 MS Tripod', quantity: 1 },
      ],
      last_note: 'Call Prajwal upon arrival at Sanepa gate',
      expires_at: match.expiresAt,
    }
  }

  // R1 + R3: Access mediated exclusively through Edge Function (service role)
  const { data: edgeData, error: edgeError } = await supabase.functions.invoke('rider-link', {
    body: { action: 'get_job', token },
  })

  if (edgeError) {
    let msg = 'Delivery link is invalid, expired, or completed.'
    try {
      if ('context' in edgeError && typeof (edgeError as { context?: { json?: () => Promise<{ error?: string }> } }).context?.json === 'function') {
        const body = await (edgeError as { context: { json: () => Promise<{ error?: string }> } }).context.json()
        if (body?.error) msg = body.error
      }
    } catch {
      // ignore
    }
    throw new Error(msg)
  }

  if (!edgeData?.data) {
    throw new Error('Delivery link is invalid, expired, or completed.')
  }

  return edgeData.data as unknown as RiderJobData
}

/**
 * Rider API: Mark picked up from shop.
 */
export async function riderMarkJobPickedUp(rawToken: string): Promise<void> {
  const token = rawToken.trim()
  if (IS_MOCK) {
    const links = getMockLinks()
    const match = links.find((l) => l.rawToken === token)
    if (match) {
      match.status = 'In Transit'
      saveMockLinks(links)
    }
    return
  }

  const { error: edgeError } = await supabase.functions.invoke('rider-link', {
    body: { action: 'pickup', token },
  })

  if (edgeError) {
    let msg = 'Failed to update delivery status.'
    try {
      if ('context' in edgeError && typeof (edgeError as { context?: { json?: () => Promise<{ error?: string }> } }).context?.json === 'function') {
        const body = await (edgeError as { context: { json: () => Promise<{ error?: string }> } }).context.json()
        if (body?.error) msg = body.error
      }
    } catch {
      // ignore
    }
    throw new Error(msg)
  }
}

/**
 * Rider API: Complete delivery with receiver name, signature, and optional photo.
 */
export async function riderCompleteJobDelivery(
  rawToken: string,
  receiverName: string,
  signatureSvg?: string,
  photoUrl?: string
): Promise<void> {
  const token = rawToken.trim()
  const cleanReceiver = receiverName.trim()

  if (cleanReceiver.length < 2) {
    throw new Error('Receiver name is required (minimum 2 characters).')
  }

  if (IS_MOCK) {
    const links = getMockLinks()
    const match = links.find((l) => l.rawToken === token)
    if (match) {
      match.completedAt = new Date().toISOString()
      match.status = 'Delivered'
      saveMockLinks(links)
    }
    return
  }

  const { error: edgeError } = await supabase.functions.invoke('rider-link', {
    body: {
      action: 'deliver',
      token,
      receiver_name: cleanReceiver,
      signature_svg: signatureSvg || null,
      photo_url: photoUrl || null,
    },
  })

  if (edgeError) {
    let msg = 'Failed to complete delivery.'
    try {
      if ('context' in edgeError && typeof (edgeError as { context?: { json?: () => Promise<{ error?: string }> } }).context?.json === 'function') {
        const body = await (edgeError as { context: { json: () => Promise<{ error?: string }> } }).context.json()
        if (body?.error) msg = body.error
      }
    } catch {
      // ignore
    }
    throw new Error(msg)
  }
}
