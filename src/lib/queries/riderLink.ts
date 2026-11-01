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

import { supabase, IS_MOCK } from '../supabase'
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

const MOCK_LINKS_KEY = 'babin_mock_rider_links'

interface MockLinkEntry {
  id: string
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
 * Generate a 128-bit cryptographically secure raw token.
 */
export function generateRiderRawToken(): string {
  // A rider URL is a bearer credential: NEVER downgrade to a clock or
  // Math.random() token. Refuse rather than issue a guessable link.
  if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') {
    throw new Error('Secure random generation is unavailable; rider links require a secure browser context.')
  }
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Calculate SHA-256 hex string for a token.
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

  // Node is permitted only for mock/test runs; production never substitutes
  // a weak, non-cryptographic hash for SHA-256.
  if (IS_MOCK) {
    try {
      const nodeCrypto = await import('node:crypto')
      return nodeCrypto.createHash('sha256').update(trimmed).digest('hex')
    } catch {
      throw new Error('Secure SHA-256 hashing is unavailable; rider link actions are blocked.')
    }
  }
  throw new Error('Secure SHA-256 hashing is unavailable; rider links require a secure browser context.')
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
 */
export async function createRiderLink(
  jobId: string,
  riderName: string,
  riderPhone: string,
  role: Role | null | undefined
): Promise<{ linkId: string; rawToken: string; linkUrl: string; expiresAt: string }> {
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

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://app.babinrentals.com'
  if (IS_MOCK) {
    // Offline prototype remains self-contained; production never mints tokens
    // or supplies a token hash to a browser-callable database function.
    const rawToken = generateRiderRawToken()
    const tokenHash = await hashRiderToken(rawToken)
    const now = new Date()
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()
    const linkId = `mock-link-${Date.now()}`
    const mockLinks = getMockLinks()
    mockLinks.push({
      id: linkId,
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
    return { linkId, rawToken, linkUrl: `${origin}/rider/${rawToken}`, expiresAt }
  }

  // The public rider Edge endpoint is also the *only* production issuer.
  // crypto.randomUUID() supplies a per-request idempotency key, not a token.
  // The Edge handler separately validates the user's JWT and generates a
  // cryptographically secure bearer token with Web Crypto.
  if (typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') {
    throw new Error('Secure request identity is unavailable; rider link issuance is blocked.')
  }
  const requestKey = crypto.randomUUID()
  let response: Awaited<ReturnType<typeof supabase.functions.invoke>>
  try {
    response = await supabase.functions.invoke('rider-link', {
      body: {
        action: 'issue',
        job_id: jobId,
        rider_name: cleanName,
        rider_phone: cleanPhone,
        request_key: requestKey,
      },
    })
  } catch {
    throw new Error('Could not issue a rider link. Check your connection and existing links.')
  }

  const issued = (response.data as {
    data?: { linkId?: string; rawToken?: string; expiresAt?: string }
    error?: string
  } | null)?.data
  if (response.error || !issued?.linkId ||
      !issued?.rawToken || !/^[0-9a-f]{32}$/.test(issued.rawToken) ||
      !issued.expiresAt) {
    throw new Error('Could not issue a rider link. Check your permissions and existing links.')
  }

  return {
    linkId: issued.linkId,
    rawToken: issued.rawToken,
    linkUrl: `${origin}/rider/${issued.rawToken}`,
    expiresAt: issued.expiresAt,
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
 * Rider actions are exclusively mediated by the Edge Function's service-role
 * caller. Migration 0191 deliberately revokes direct token-RPC execution from
 * browser sessions. Never retry via a SECURITY DEFINER RPC on failure.
 */
type RiderEdgeAction = 'get_job' | 'pickup' | 'deliver'
interface RiderEdgeResponse {
  data?: RiderJobData
  success?: boolean
  error?: string
}

async function invokeRiderEdge(
  body: {
    action: RiderEdgeAction
    token: string
    receiver_name?: string
    signature_svg?: string | null
    photo_url?: string | null
  },
): Promise<RiderEdgeResponse> {
  let result: Awaited<ReturnType<typeof supabase.functions.invoke>>
  try {
    result = await supabase.functions.invoke('rider-link', { body })
  } catch {
    throw new Error('Unable to verify the rider link. Please try again or contact shop staff.')
  }

  const response = result.data as RiderEdgeResponse | null
  if (result.error || !response || response.error) {
    throw new Error('Unable to verify the rider link. Please try again or contact shop staff.')
  }
  return response
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

  const response = await invokeRiderEdge({ action: 'get_job', token })
  if (!response.data) {
    throw new Error('Unable to verify the rider link. Please try again or contact shop staff.')
  }
  return response.data
}

/**
 * Rider API: Mark picked up from shop.
 */
export async function riderMarkJobPickedUp(rawToken: string): Promise<void> {
  const token = rawToken.trim()
  if (!token) {
    throw new Error('A valid rider delivery token is required.')
  }
  if (IS_MOCK) {
    const links = getMockLinks()
    const match = links.find((l) => l.rawToken === token)
    if (match) {
      match.status = 'In Transit'
      saveMockLinks(links)
    }
    return
  }

  const response = await invokeRiderEdge({ action: 'pickup', token })
  if (response.success !== true) {
    throw new Error('Unable to verify the rider link. Please try again or contact shop staff.')
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
  if (!token) {
    throw new Error('A valid rider delivery token is required.')
  }
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

  const response = await invokeRiderEdge({
    action: 'deliver',
    token,
    receiver_name: cleanReceiver,
    signature_svg: signatureSvg || null,
    photo_url: photoUrl || null,
  })
  if (response.success !== true) {
    throw new Error('Unable to verify the rider link. Please try again or contact shop staff.')
  }
}
