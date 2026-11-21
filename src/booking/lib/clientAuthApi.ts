/**
 * src/booking/lib/clientAuthApi.ts
 *
 * Client Portal & Online Profile API (T7-03).
 * Handles OTP authentication, profile retrieval/saving, and KYC document uploads.
 * Security: Uses Supabase anon client; strictly communicates via RLS and security definer RPCs.
 */

import { supabase } from '@/lib/supabase'

export interface ClientUser {
  id: string
  email: string
}

export interface OnlineProfile {
  auth_uid: string
  name: string
  phone: string
  company: string | null
  pan: string | null
  id_doc_type: string | null
  id_doc_number: string | null
  id_doc_path: string | null
  id_doc_uploaded_at: string | null
  created_at: string
  updated_at: string
}

export interface SaveProfileInput {
  name: string
  phone: string
  company?: string | undefined
  pan?: string | undefined
  id_doc_type?: string | undefined
  id_doc_number?: string | undefined
  id_doc_path?: string | undefined
}

// Local mock storage for mock / test runs
const MOCK_AUTH_STORAGE_KEY = 'babin_mock_client_auth'
const MOCK_PROFILE_STORAGE_KEY = 'babin_mock_client_profile'

let mockUserStore: ClientUser | null = null
let mockProfileStore: OnlineProfile | null = null

function getStoredMockUser(): ClientUser | null {
  if (mockUserStore) return mockUserStore
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(MOCK_AUTH_STORAGE_KEY)
      if (stored) {
        mockUserStore = JSON.parse(stored) as ClientUser
        return mockUserStore
      }
    }
  } catch {
    // Ignore localStorage errors
  }
  return null
}

function setStoredMockUser(user: ClientUser | null): void {
  mockUserStore = user
  try {
    if (typeof localStorage !== 'undefined') {
      if (user) {
        localStorage.setItem(MOCK_AUTH_STORAGE_KEY, JSON.stringify(user))
      } else {
        localStorage.removeItem(MOCK_AUTH_STORAGE_KEY)
      }
    }
  } catch {
    // Ignore
  }
}

function getStoredMockProfile(): OnlineProfile | null {
  if (mockProfileStore) return mockProfileStore
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(MOCK_PROFILE_STORAGE_KEY)
      if (stored) {
        mockProfileStore = JSON.parse(stored) as OnlineProfile
        return mockProfileStore
      }
    }
  } catch {
    // Ignore
  }
  return null
}

function setStoredMockProfile(profile: OnlineProfile | null): void {
  mockProfileStore = profile
  try {
    if (typeof localStorage !== 'undefined') {
      if (profile) {
        localStorage.setItem(MOCK_PROFILE_STORAGE_KEY, JSON.stringify(profile))
      } else {
        localStorage.removeItem(MOCK_PROFILE_STORAGE_KEY)
      }
    }
  } catch {
    // Ignore
  }
}

function isMockMode(): boolean {
  return (
    import.meta.env.VITE_DATA_SOURCE === 'mock' ||
    import.meta.env.MODE === 'mock' ||
    import.meta.env.MODE === 'test' ||
    (typeof process !== 'undefined' && process.env?.['NODE_ENV'] === 'test') ||
    !supabase
  )
}

/**
 * Get the currently logged-in client auth user.
 */
export async function getCurrentClientUser(): Promise<ClientUser | null> {
  if (isMockMode()) {
    return getStoredMockUser()
  }

  const { data } = await supabase.auth.getSession()
  if (!data?.session?.user) return null

  return {
    id: data.session.user.id,
    email: data.session.user.email ?? '',
  }
}

/**
 * Request OTP via email.
 */
export async function requestClientOtp(email: string): Promise<{ success: boolean; message: string }> {
  const trimmed = email.trim().toLowerCase()
  if (!trimmed || !trimmed.includes('@')) {
    throw new Error('Please enter a valid email address.')
  }

  if (isMockMode()) {
    // In mock mode, pretend OTP sent
    return {
      success: true,
      message: `A 6-digit login code has been sent to ${trimmed}. (In local mock mode, use code: 123456)`,
    }
  }

  const { error } = await supabase.auth.signInWithOtp({
    email: trimmed,
    options: {
      shouldCreateUser: true,
    },
  })

  if (error) {
    throw new Error(error.message || 'Failed to send verification code. Please try again.')
  }

  return {
    success: true,
    message: `A verification code has been sent to ${trimmed}.`,
  }
}

/**
 * Verify OTP and sign in.
 */
export async function verifyClientOtp(email: string, token: string): Promise<ClientUser> {
  const trimmedEmail = email.trim().toLowerCase()
  const trimmedToken = token.trim()

  if (!trimmedToken) {
    throw new Error('Please enter the 6-digit verification code.')
  }

  if (isMockMode()) {
    // Mock verification: accept 123456 or any 6-digit code for testing
    const mockUser: ClientUser = {
      id: 'mock-client-' + Math.random().toString(36).substring(2, 9),
      email: trimmedEmail,
    }
    setStoredMockUser(mockUser)
    return mockUser
  }

  const { data, error } = await supabase.auth.verifyOtp({
    email: trimmedEmail,
    token: trimmedToken,
    type: 'email',
  })

  if (error || !data?.user) {
    throw new Error(error?.message || 'Invalid or expired verification code.')
  }

  return {
    id: data.user.id,
    email: data.user.email ?? trimmedEmail,
  }
}

/**
 * Sign out the client.
 */
export async function signOutClient(): Promise<void> {
  if (isMockMode()) {
    setStoredMockUser(null)
    setStoredMockProfile(null)
    return
  }

  await supabase.auth.signOut()
}

/**
 * Fetch online profile for the authenticated client.
 */
export async function fetchOnlineProfile(): Promise<OnlineProfile | null> {
  const user = await getCurrentClientUser()
  if (!user) return null

  if (isMockMode()) {
    return getStoredMockProfile()
  }

  const { data, error } = await supabase
    .from('online_profiles_v')
    .select('*')
    .eq('auth_uid', user.id)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return data as OnlineProfile | null
}

/**
 * Save / update client online profile via online_profile_save RPC.
 */
export async function saveOnlineProfile(input: SaveProfileInput): Promise<OnlineProfile> {
  const user = await getCurrentClientUser()
  if (!user) {
    throw new Error('You must be signed in to save your profile.')
  }

  const trimmedName = input.name.trim()
  const trimmedPhone = input.phone.trim()

  if (!trimmedName) {
    throw new Error('Full name is required.')
  }
  if (!trimmedPhone || trimmedPhone.length < 10) {
    throw new Error('Valid phone number (minimum 10 digits) is required.')
  }

  if (isMockMode()) {
    const mockProfile: OnlineProfile = {
      auth_uid: user.id,
      name: trimmedName,
      phone: trimmedPhone,
      company: input.company?.trim() || null,
      pan: input.pan?.trim() || null,
      id_doc_type: input.id_doc_type?.trim() || null,
      id_doc_number: input.id_doc_number?.trim()
        ? `••••-••••-${input.id_doc_number.trim().slice(-4)}`
        : null,
      id_doc_path: input.id_doc_path?.trim() || null,
      id_doc_uploaded_at: input.id_doc_path ? new Date().toISOString() : null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    setStoredMockProfile(mockProfile)
    return mockProfile
  }

  const { data, error } = await supabase.rpc('online_profile_save', {
    p_name: trimmedName,
    p_phone: trimmedPhone,
    p_company: input.company?.trim() || null,
    p_pan: input.pan?.trim() || null,
    p_id_doc_type: input.id_doc_type?.trim() || null,
    p_id_doc_number: input.id_doc_number?.trim() || null,
    p_id_doc_path: input.id_doc_path?.trim() || null,
  })

  if (error || !data) {
    throw new Error(error?.message || 'Failed to save online profile.')
  }

  return data as OnlineProfile
}

/**
 * Upload KYC ID document to private `request-ids` bucket.
 * Bucket path structure enforced by RLS: `${auth_uid}/${docType}_${timestamp}_${cleanFilename}`
 */
export async function uploadKycDocument(
  file: File,
  docType: string,
  docNumber: string,
): Promise<{ path: string; profile: OnlineProfile }> {
  const user = await getCurrentClientUser()
  if (!user) {
    throw new Error('You must be signed in to upload identity documents.')
  }

  // Validate file type & size (max 10MB)
  const allowedMime = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
  if (!allowedMime.includes(file.type)) {
    throw new Error('Only PNG, JPG, WEBP, or PDF identity documents are accepted.')
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('Document size exceeds 10MB limit.')
  }

  const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const storagePath = `${user.id}/${docType.toLowerCase()}_${Date.now()}_${cleanName}`

  if (isMockMode()) {
    const existing = await fetchOnlineProfile()
    const updated = await saveOnlineProfile({
      name: existing?.name || 'Mock Client',
      phone: existing?.phone || '9800000000',
      company: existing?.company || undefined,
      pan: existing?.pan || undefined,
      id_doc_type: docType,
      id_doc_number: docNumber,
      id_doc_path: storagePath,
    })
    return { path: storagePath, profile: updated }
  }

  // Upload to request-ids bucket
  const { error: uploadError } = await supabase.storage
    .from('request-ids')
    .upload(storagePath, file, {
      cacheControl: '3600',
      upsert: true,
    })

  if (uploadError) {
    throw new Error(`Document upload failed: ${uploadError.message}`)
  }

  // Update profile record with doc path, doc type, and doc number
  const existing = await fetchOnlineProfile()
  const updatedProfile = await saveOnlineProfile({
    name: existing?.name || user.email.split('@')[0] || 'Client',
    phone: existing?.phone || '9800000000',
    company: existing?.company || undefined,
    pan: existing?.pan || undefined,
    id_doc_type: docType,
    id_doc_number: docNumber,
    id_doc_path: storagePath,
  })

  return {
    path: storagePath,
    profile: updatedProfile,
  }
}
