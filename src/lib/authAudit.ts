import { logAuditEvent } from './audit'
import { supabase } from './supabase'
import type { SystemRole } from '../types/database'

/**
 * Login and logout leave a trace (Booqable adoption spec G6 — Booqable logs neither).
 *
 * **Failed logins are NOT recorded here, and cannot be from the browser.** At that moment there is no
 * session, `audit_events_insert` refuses anonymous writes (0091, the SEC-02 forgery), and loosening it so a
 * stranger can write rows would be a worse hole than the missing row. The honest source is GoTrue's own
 * auth log; recording it in `audit_events` needs a server-side hook. Listed under Remaining in PROGRESS.
 *
 * RULING 2026-10-07: action `Login` / `Logout`, module `Authentication`, `new_values.event` carries the
 * namespaced name (`auth.login`, `auth.logout`). Fire-and-forget — an audit outage never blocks signing in
 * or out (PLAN.md §4.36).
 */
const MARK = 'br.auth.login-audited:'

/**
 * The role of the person the row is about, read from the same staff row the session resolves from
 * (`users.primary_role`, never JWT metadata). A sign-in fires before that row is loaded, so the role is
 * read here. Null when it cannot be read; the row is still written, with the actor's id as before.
 */
async function signedInRole(userId: string): Promise<SystemRole | null> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('primary_role')
      .eq('id', userId)
      .maybeSingle()
    if (error || !data?.primary_role) return null
    return data.primary_role as SystemRole
  } catch {
    return null
  }
}

export function recordLogin(userId: string, signInStamp: string | null | undefined): void {
  /* supabase-js emits SIGNED_IN again when a tab regains focus. One row per actual sign-in, not per focus. */
  const key = `${MARK}${userId}:${signInStamp ?? 'unknown'}`
  try {
    if (globalThis.sessionStorage?.getItem(key) === '1') return
    globalThis.sessionStorage?.setItem(key, '1')
  } catch {
    /* storage refused — a duplicate row is better than none */
  }
  void signedInRole(userId).then((actorRole) =>
    logAuditEvent({
      eventClass: 'session',
      category: 'Authentication',
      module: 'Authentication',
      action: 'Login',
      tableName: 'auth.sessions',
      recordId: userId,
      actorId: userId,
      actorRole,
      newValues: { event: 'auth.login' },
    }),
  )
}

/**
 * The label staff see for a namespaced event code in `new_values.event`. Only the audit detail shows it; the
 * stored row keeps the code. Null for any code this file does not write.
 */
export function authEventLabel(code: unknown): string | null {
  if (code === 'auth.login') return 'Login'
  if (code === 'auth.logout') return 'Logout'
  return null
}

function logLogout(userId: string, actorRole: SystemRole | null) {
  return logAuditEvent({
    eventClass: 'session',
    category: 'Authentication',
    module: 'Authentication',
    action: 'Logout',
    tableName: 'auth.sessions',
    recordId: userId,
    actorId: userId,
    actorRole,
    newValues: { event: 'auth.logout' },
  })
}

/**
 * Resolves when the row is written or after `timeoutMs`, so sign-out is never held hostage by the network.
 *
 * The sign-out caller holds the leaving person's role and passes it, so the insert is issued at once, while the
 * session is still valid. A staff-row read in front of the insert is the race this removes: sign-out proceeds
 * after `timeoutMs`, and an insert still waiting on that read would run without a session and be lost. The read
 * stays only as the fallback for a caller that passes no role.
 */
export function recordLogout(userId: string | null, leavingRole?: SystemRole | null, timeoutMs = 1500): Promise<void> {
  if (!userId) return Promise.resolve()
  const write = (leavingRole
    ? logLogout(userId, leavingRole)
    : signedInRole(userId).then((actorRole) => logLogout(userId, actorRole))
  ).then(() => undefined)
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))
  return Promise.race([write, timeout])
}
