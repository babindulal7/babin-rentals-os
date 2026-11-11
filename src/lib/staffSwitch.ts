/**
 * T1-15: target credentials are refreshed and PIN-checked away from the shared
 * Supabase client. No global session, UI role, or business data is activated here.
 *
 * A refresh token is single-use. Persist the rotated target token immediately
 * after confirming its identity, including when the PIN is wrong, so a staff
 * member can make another attempt without an invalid/stale refresh token.
 */
export interface StaffSwitchSession {
  access_token: string
  refresh_token: string
  user: { id: string; email?: string | undefined }
  expires_at?: number | undefined
}

export interface StaffSwitchPinResult {
  ok?: unknown
  reason?: unknown
  message?: unknown
  locked_until?: unknown
}

export interface StaffSwitchDependencies {
  refreshTarget: (refreshToken: string) => Promise<{
    session: StaffSwitchSession | null
    userId: string | null
  }>
  saveRotatedToken: (userId: string, refreshToken: string) => Promise<void>
  verifyTargetPin: (pin: string) => Promise<StaffSwitchPinResult>
}

export type StaffSwitchDecision =
  | { status: 'approved'; session: StaffSwitchSession }
  | { status: 'denied'; reason: string; message: string; lockedUntil: string | null }

/**
 * Never accepts a truthy string as a PIN success, a mismatched user, an empty
 * access/refresh pair, an expired session, or a stale target refresh token.
 * Throws for unavailable/invalid credentials so the caller must remain locked.
 */
export async function verifyStaffSwitchCandidate(
  targetUserId: string,
  pin: string,
  refreshToken: string,
  deps: StaffSwitchDependencies,
): Promise<StaffSwitchDecision> {
  if (!targetUserId || !refreshToken) throw new Error('Stored staff session is unavailable. Sign in with your password.')
  if (!/^\d{4}$/.test(pin)) {
    return { status: 'denied', reason: 'malformed', message: 'Enter your four-digit PIN.', lockedUntil: null }
  }

  const refreshed = await deps.refreshTarget(refreshToken)
  const session = refreshed.session
  if (
    !session ||
    !session.access_token ||
    !session.refresh_token ||
    refreshed.userId !== targetUserId ||
    session.user?.id !== targetUserId ||
    (typeof session.expires_at === 'number' && session.expires_at <= Date.now() / 1000)
  ) {
    throw new Error('Stored session does not match the selected staff member. Sign in with your password.')
  }

  // Rotated tokens cannot be reused. If persistence fails, deny the PIN check
  // and do not adopt a session that would not survive another failed attempt.
  await deps.saveRotatedToken(targetUserId, session.refresh_token)

  const result = await deps.verifyTargetPin(pin)
  if (result?.ok === true) return { status: 'approved', session }
  const reason = typeof result?.reason === 'string' ? result.reason : 'incorrect'
  const message = typeof result?.message === 'string' ? result.message : 'Incorrect PIN.'
  const lockedUntil = typeof result?.locked_until === 'string' ? result.locked_until : null
  return { status: 'denied', reason, message, lockedUntil }
}
