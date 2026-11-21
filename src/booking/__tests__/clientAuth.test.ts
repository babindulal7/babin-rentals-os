import { describe, it, expect, beforeEach } from 'vitest'
import {
  getCurrentClientUser,
  requestClientOtp,
  verifyClientOtp,
  signOutClient,
  fetchOnlineProfile,
  saveOnlineProfile,
  uploadKycDocument,
} from '../lib/clientAuthApi'

describe('Client Portal Authentication & Profile API (T7-03)', () => {
  beforeEach(async () => {
    await signOutClient()
  })

  it('validates email format before requesting OTP', async () => {
    await expect(requestClientOtp('')).rejects.toThrow(/valid email/)
    await expect(requestClientOtp('not-an-email')).rejects.toThrow(/valid email/)

    const res = await requestClientOtp('client@cinema.np')
    expect(res.success).toBe(true)
    expect(res.message).toMatch(/verification code|sent/i)
  })

  it('verifies OTP token and persists client session', async () => {
    await expect(verifyClientOtp('client@cinema.np', '')).rejects.toThrow(/verification code/)

    const user = await verifyClientOtp('client@cinema.np', '123456')
    expect(user.id).toBeTruthy()
    expect(user.email).toBe('client@cinema.np')

    const current = await getCurrentClientUser()
    expect(current?.id).toBe(user.id)
    expect(current?.email).toBe('client@cinema.np')
  })

  it('refuses profile saving when unauthenticated', async () => {
    await expect(
      saveOnlineProfile({
        name: 'Tester',
        phone: '9800000000',
      }),
    ).rejects.toThrow(/must be signed in/i)
  })

  it('validates required fields for online profile saving', async () => {
    await verifyClientOtp('client@cinema.np', '123456')

    await expect(
      saveOnlineProfile({
        name: '',
        phone: '9800000000',
      }),
    ).rejects.toThrow(/name is required/i)

    await expect(
      saveOnlineProfile({
        name: 'Aayush Shrestha',
        phone: '9800',
      }),
    ).rejects.toThrow(/minimum 10 digits/i)

    const saved = await saveOnlineProfile({
      name: 'Aayush Shrestha',
      phone: '9801234567',
      company: 'Himalaya Films',
      pan: '109876543',
    })

    expect(saved.name).toBe('Aayush Shrestha')
    expect(saved.phone).toBe('9801234567')
    expect(saved.company).toBe('Himalaya Films')
    expect(saved.pan).toBe('109876543')

    const fetched = await fetchOnlineProfile()
    expect(fetched?.name).toBe('Aayush Shrestha')
    expect(fetched?.phone).toBe('9801234567')
  })

  it('validates KYC document format and size', async () => {
    await verifyClientOtp('client@cinema.np', '123456')

    // Invalid mime type
    const txtFile = new File(['dummy content'], 'document.txt', { type: 'text/plain' })
    await expect(
      uploadKycDocument(txtFile, 'Citizenship', '27-01-78-00001'),
    ).rejects.toThrow(/PNG, JPG, WEBP, or PDF/)

    // Valid PNG file upload
    const pngBlob = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
    const validFile = new File([pngBlob], 'citizenship_front.png', { type: 'image/png' })

    const { path, profile } = await uploadKycDocument(validFile, 'Citizenship', '27-01-78-12345')
    expect(path).toContain('citizenship')
    expect(profile.id_doc_type).toBe('Citizenship')
    expect(profile.id_doc_number).toBe('••••-••••-2345')
    expect(profile.id_doc_path).toBe(path)
  })

  it('signs out client cleanly', async () => {
    await verifyClientOtp('client@cinema.np', '123456')
    expect(await getCurrentClientUser()).not.toBeNull()

    await signOutClient()
    expect(await getCurrentClientUser()).toBeNull()
    expect(await fetchOnlineProfile()).toBeNull()
  })

  it('enforces bot challenge verification and rate limits on OTP requests (T7-09)', async () => {
    // 1. Invalid Turnstile token is rejected
    await expect(
      requestClientOtp('bot@cinema.np', 'invalid_turnstile_token')
    ).rejects.toThrow(/Verification token could not be validated/i)

    // 2. Valid token succeeds
    const ok = await requestClientOtp('realuser@cinema.np', 'cf_valid_token_1')
    expect(ok.success).toBe(true)

    // 3. Repeated attempts trigger target rate limiting
    await requestClientOtp('realuser@cinema.np', 'cf_valid_token_2')
    await requestClientOtp('realuser@cinema.np', 'cf_valid_token_3')

    // 4th attempt in same hour hits rate limit
    await expect(
      requestClientOtp('realuser@cinema.np', 'cf_valid_token_4')
    ).rejects.toThrow(/Too many verification attempts/i)
  })
})
